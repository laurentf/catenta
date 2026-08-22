// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from
    "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC1155Burnable} from
    "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import {CatentaRoles} from "../access/CatentaRoles.sol";
import {RoleAware} from "../access/RoleAware.sol";

/// @title MaterialLots - the material lots consumed to manufacture devices
/// @author Catenta
/// @notice One id per lot, one balance per quantity of matter. The quantity
///         used to manufacture a device is burned in the very transaction that
///         mints its passport, which is what ties matter to prosthesis.
/// @dev PERMANENT STORE, like PassportNFT: deployed once, never replaced.
///      ERC-1155 rather than ERC-721 or ERC-20 because a lot IS a semi-fungible
///      quantity - "X grams of zirconia from lot N". ERC-721 would need one
///      token per gram, ERC-20 one contract per lot.
///
///      ERC1155Supply is not decoration: totalSupply(lotId) IS the quantity of
///      material left, for free, instead of a counter to maintain by hand.
contract MaterialLots is ERC1155, ERC1155Supply, ERC1155Burnable, RoleAware {
    /// @notice The administrative record of a lot.
    /// @dev Slot 0 holds manufacturer (20) + declaredAt (5); the certificate
    ///      fingerprint takes the next one, then the two short strings - each
    ///      31 bytes or less, so each fits a single slot.
    ///
    ///      `manufacturer` is the ORIGIN, not the current holder. Custody moves
    ///      along the chain (manufacturer -> distributor -> laboratory) and is
    ///      read from the ERC-1155 balances; the origin never changes, which is
    ///      what a recall needs to walk back to.
    ///
    ///      A LOT DESCRIBES ITSELF. It carries the material it is made of and
    ///      the unit its quantity is counted in, rather than pointing at a
    ///      catalogue. Two consequences, both wanted: a quantity is readable
    ///      forever without any side file - "10" alone means nothing, "10
    ///      lingotins" means something - and no catalogue can be republished in
    ///      a way that changes what a past lot was made of.
    ///
    ///      The picker the manufacturer chooses from lives off-chain. It is
    ///      convenience only: nothing here references it, and losing it costs
    ///      typing comfort, not readability.
    struct LotInfo {
        address manufacturer;
        uint40 declaredAt;
        bytes32 certHash;
        string material;
        string unit;
    }

    /// @dev Next lot id. Ids start at 1 so 0 stays a "no lot" sentinel.
    uint64 private _nextLotId = 1;

    /// @dev lotId => administrative record. Never deleted.
    mapping(uint64 lotId => LotInfo) private _lots;

    /// @notice Emitted when a manufacturer declares a material lot.
    /// @param lotId The id assigned to the lot.
    /// @param manufacturer The manufacturer declaring it.
    /// @param material What the lot is made of.
    /// @param unit The unit its quantity is counted in.
    /// @param certHash Fingerprint of the off-chain material certificate.
    /// @param quantity Quantity minted at declaration.
    event LotDeclared(
        uint64 indexed lotId,
        address indexed manufacturer,
        string material,
        string unit,
        bytes32 certHash,
        uint256 quantity
    );

    /// @notice Material never moves on its holder's sole decision: custody is
    ///         transferred by a module holding LOT_CUSTODIAN_ROLE, at the end of
    ///         a shipment the recipient accepted.
    error LotNotTransferable();
    /// @notice The lot id does not exist.
    error UnknownLot(uint64 lotId);
    /// @notice Custody moves between two real holders, never from or to the
    ///         zero address — ERC-1155 reads those as a mint and a burn.
    error NotACustodyTransfer();

    /// @notice Deploys the lot store bound to the shared authority.
    /// @param _roles The shared access authority.
    /// @dev The metadata URI is left empty here; IPFS wiring lands with the
    ///      document storage milestone and needs no change to this store.
    constructor(CatentaRoles _roles) ERC1155("") RoleAware(_roles) {}

    /// @notice Declares a lot and credits its quantity to the manufacturer.
    /// @dev Business checks (approved manufacturer) belong to the calling module.
    /// @param _manufacturer The manufacturer that produced the lot.
    /// @param _material What the lot is made of, e.g. "Zircone Y-TZP A2".
    /// @param _unit The unit its quantity is counted in, e.g. "g".
    /// @param _certHash Fingerprint of the off-chain material certificate.
    /// @param _quantity Quantity produced, in that unit.
    /// @return lotId The id of the declared lot.
    function declareLot(
        address _manufacturer,
        string calldata _material,
        string calldata _unit,
        bytes32 _certHash,
        uint256 _quantity
    ) external onlyRole(ROLES.LOT_MINTER_ROLE()) returns (uint64 lotId) {
        lotId = _nextLotId;
        ++_nextLotId;
        _lots[lotId] = LotInfo({
            manufacturer: _manufacturer,
            declaredAt: uint40(block.timestamp),
            certHash: _certHash,
            material: _material,
            unit: _unit
        });
        _mint(_manufacturer, lotId, _quantity, "");

        emit LotDeclared(lotId, _manufacturer, _material, _unit, _certHash, _quantity);
    }

    /// @notice Moves the custody of a quantity of material along the chain.
    /// @dev Role-gated, and deliberately the ONLY way material changes hands:
    ///      the store refuses any direct transfer (see _update), so custody only
    ///      moves through a module that made the recipient accept it first. That
    ///      is what keeps "nobody can be handed material they did not ask for"
    ///      true for lots, exactly as the two-step handoff does for passports.
    ///
    ///      Goes through _update rather than _safeTransferFrom on purpose: the
    ///      recipient has already been checked against the role allowlist by the
    ///      module, so the ERC1155Receiver probe adds no safety while it would
    ///      reject legitimate contract wallets (multisigs).
    ///      Les deux extrémités sont vérifiées non nulles, et ce n'est pas une
    ///      précaution de style : `_update` est le point d'entrée BRUT d'ERC-1155,
    ///      où `from == 0` vaut frappe et `to == 0` vaut destruction. Sans ce
    ///      garde, un module ne portant QUE `LOT_CUSTODIAN_ROLE` créait de la
    ///      matière sans `LOT_MINTER_ROLE` — y compris sur un lot jamais déclaré.
    ///      La séparation des rôles modules n'aurait alors rien séparé, ce qui
    ///      vide de son sens la promesse « un nouveau module ne reçoit que les
    ///      pouvoirs qu'on lui accorde ».
    /// @param _from The current holder.
    /// @param _to The new holder.
    /// @param _lotId The lot being moved.
    /// @param _quantity The quantity moved.
    function transferCustody(address _from, address _to, uint64 _lotId, uint256 _quantity)
        external
        onlyRole(ROLES.LOT_CUSTODIAN_ROLE())
    {
        require(_from != address(0) && _to != address(0), NotACustodyTransfer());

        uint256[] memory ids = new uint256[](1);
        uint256[] memory values = new uint256[](1);
        ids[0] = _lotId;
        values[0] = _quantity;

        _update(_from, _to, ids, values);
    }

    /// @notice Burns the quantity of material consumed by manufacturing.
    /// @dev Role-gated rather than allowance-gated: the module must be able to
    ///      burn in the same transaction as the passport mint, without asking
    ///      every laboratory for a setApprovalForAll first. The inherited
    ///      ERC1155Burnable path stays available so a lab can write off its own
    ///      spoiled material.
    /// @param _from The laboratory whose material is consumed.
    /// @param _lotId The lot being consumed.
    /// @param _quantity The quantity consumed.
    function burnForManufacturing(address _from, uint64 _lotId, uint256 _quantity)
        external
        onlyRole(ROLES.LOT_BURNER_ROLE())
    {
        _burn(_from, _lotId, _quantity);
    }

    /// @notice The administrative record of a lot.
    /// @param _lotId The lot to read.
    /// @return The stored lot record.
    function lotOf(uint64 _lotId) external view returns (LotInfo memory) {
        LotInfo memory info = _lots[_lotId];
        require(info.manufacturer != address(0), UnknownLot(_lotId));
        return info;
    }

    /// @notice Whether a lot has been declared.
    /// @param _lotId The lot to check.
    /// @return True when the lot exists.
    function lotExists(uint64 _lotId) external view returns (bool) {
        return _lots[_lotId].manufacturer != address(0);
    }

    /// @notice Number of lots declared so far.
    /// @return The number of lots declared since deployment.
    function lotCount() external view returns (uint64) {
        return _nextLotId - 1;
    }

    /// @dev Material moves along the chain, but never on its holder's sole
    ///      decision. A direct `safeTransferFrom` reverts: shipping material to
    ///      an actor who never accepted it would break the custody trail the
    ///      whole traceability rests on, and would let anyone dump a recalled
    ///      lot on someone else. Only a module holding LOT_CUSTODIAN_ROLE moves
    ///      custody, and only once the recipient has accepted the shipment.
    ///
    ///      Mint (from == 0) and burn (to == 0) stay open to their own roles.
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Supply) {
        require(
            from == address(0) || to == address(0)
                || ROLES.hasRole(ROLES.LOT_CUSTODIAN_ROLE(), msg.sender),
            LotNotTransferable()
        );
        super._update(from, to, ids, values);
    }
}
