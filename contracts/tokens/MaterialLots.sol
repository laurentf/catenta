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
    /// @dev Slot 0 holds lab (20) + declaredAt (5); the certificate
    ///      fingerprint takes the next one.
    struct LotInfo {
        address lab;
        uint40 declaredAt;
        bytes32 certHash;
    }

    /// @dev Next lot id. Ids start at 1 so 0 stays a "no lot" sentinel.
    uint64 private _nextLotId = 1;

    /// @dev lotId => administrative record. Never deleted.
    mapping(uint64 lotId => LotInfo) private _lots;

    /// @notice Emitted when a laboratory declares a material lot.
    /// @param lotId The id assigned to the lot.
    /// @param lab The laboratory declaring it.
    /// @param certHash Fingerprint of the off-chain material certificate.
    /// @param quantity Quantity minted at declaration.
    event LotDeclared(
        uint64 indexed lotId,
        address indexed lab,
        bytes32 certHash,
        uint256 quantity
    );

    /// @notice A lot belongs to the laboratory that declared it and cannot be
    ///         moved to another holder.
    error LotNotTransferable();
    /// @notice The lot id does not exist.
    error UnknownLot(uint64 lotId);

    /// @notice Deploys the lot store bound to the shared authority.
    /// @param _roles The shared access authority.
    /// @dev The metadata URI is left empty here; IPFS wiring lands with the
    ///      document storage milestone and needs no change to this store.
    constructor(CatentaRoles _roles) ERC1155("") RoleAware(_roles) {}

    /// @notice Declares a lot and credits its quantity to the laboratory.
    /// @dev Business checks (approved lab) belong to the calling module.
    /// @param _lab The laboratory the lot belongs to.
    /// @param _certHash Fingerprint of the off-chain material certificate.
    /// @param _quantity Quantity available in the lot, in the lab's own unit.
    /// @return lotId The id of the declared lot.
    function declareLot(address _lab, bytes32 _certHash, uint256 _quantity)
        external
        onlyRole(ROLES.LOT_MINTER_ROLE())
        returns (uint64 lotId)
    {
        lotId = _nextLotId;
        ++_nextLotId;
        _lots[lotId] = LotInfo({
            lab: _lab,
            declaredAt: uint40(block.timestamp),
            certHash: _certHash
        });
        _mint(_lab, lotId, _quantity, "");

        emit LotDeclared(lotId, _lab, _certHash, _quantity);
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
        require(info.lab != address(0), UnknownLot(_lotId));
        return info;
    }

    /// @notice Whether a lot has been declared.
    /// @param _lotId The lot to check.
    /// @return True when the lot exists.
    function lotExists(uint64 _lotId) external view returns (bool) {
        return _lots[_lotId].lab != address(0);
    }

    /// @notice Number of lots declared so far.
    /// @return The number of lots declared since deployment.
    function lotCount() external view returns (uint64) {
        return _nextLotId - 1;
    }

    /// @dev Lots are non-transferable: a lot belongs to the laboratory that
    ///      declared it. Allowing a transfer would break the matter-to-lab
    ///      attribution the whole traceability rests on - and a multi-lab lot
    ///      needs a custody model this version deliberately does not have.
    ///      Mint (from == 0) and burn (to == 0) stay open.
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Supply) {
        require(from == address(0) || to == address(0), LotNotTransferable());
        super._update(from, to, ids, values);
    }
}
