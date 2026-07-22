// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from
    "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {CatentaRoles} from "../access/CatentaRoles.sol";
import {RoleAware} from "../access/RoleAware.sol";

/// @title PassportNFT - the soulbound passport of a custom-made dental device
/// @author Catenta
/// @notice One token = one prosthesis. The token is not transferable: a medical
///         device is bound to a patient, it is not a tradable asset. The only
///         two ways a token can move are the initial mint and a two-step
///         handoff explicitly authorized by a controller module.
/// @dev PERMANENT STORE. This contract is meant to be deployed once and never
///      replaced: it holds the passports themselves and the traits fixed at
///      manufacturing. It therefore carries no lifecycle logic and no knowledge
///      of any specific module - it only checks roles against CatentaRoles.
///      Swapping the lifecycle module later is a matter of moving a role.
///
///      Mutable lifecycle state (status, patient commitment) lives in the
///      module, not here: what is immutable belongs to the permanent store,
///      what changes belongs to the replaceable part.
contract PassportNFT is ERC721, ERC721Enumerable, RoleAware {
    /// @notice The traits of a device, fixed at manufacturing and never edited.
    /// @dev Packed into a single slot: lotId (8) + mintedAt (5) = 13 bytes,
    ///      plus one slot for the fingerprint.
    struct Traits {
        uint64 lotId;
        uint40 mintedAt;
        bytes32 conformityHash;
    }

    /// @dev Next token id to be minted. Ids start at 1 so that 0 stays a
    ///      reliable "no passport" sentinel for callers.
    uint256 private _nextTokenId = 1;

    /// @dev tokenId => the traits fixed at mint.
    mapping(uint256 tokenId => Traits) private _traits;

    /// @dev tokenId => the single address allowed to receive it on the next
    ///      transfer. Consumed inside _update, in the same transaction.
    mapping(uint256 tokenId => address recipient) private _pendingHandoff;

    /// @notice Emitted when a passport is issued and its traits are frozen.
    /// @dev Carries the conformity fingerprint, which no other event does: it
    ///      is the piece of evidence the whole registry exists to anchor, and
    ///      an indexer must never have to make a call to obtain it. The ERC721
    ///      Transfer event already states that the token was created, so this
    ///      one deliberately adds only what Transfer cannot carry.
    /// @param tokenId The id assigned to the passport.
    /// @param lab The laboratory that manufactured the device.
    /// @param lotId The material lot the device was made from.
    /// @param conformityHash Fingerprint of the off-chain conformity file.
    event PassportIssued(
        uint256 indexed tokenId,
        address indexed lab,
        uint64 indexed lotId,
        bytes32 conformityHash
    );

    /// @notice Emitted when a controller arms a handoff for a token.
    /// @dev Emitted by the store rather than by the module on purpose: this is
    ///      a change of THIS contract's state, and the store is permanent while
    ///      modules are replaceable. An indexer that follows the store keeps
    ///      working across a module swap.
    /// @param tokenId The passport being handed off.
    /// @param from The current holder.
    /// @param to The one address allowed to receive it.
    event HandoffArmed(uint256 indexed tokenId, address indexed from, address indexed to);

    /// @notice The token is soulbound: this transfer is not authorized.
    error Soulbound(uint256 tokenId);

    /// @notice Deploys the passport store bound to the shared authority.
    /// @param _roles The shared access authority.
    constructor(CatentaRoles _roles)
        ERC721("Catenta Dental Passport", "CDP")
        RoleAware(_roles)
    {}

    /// @notice Mints a new passport and freezes its manufacturing traits.
    /// @dev Business checks (approved lab, lot ownership, quantity) belong to
    ///      the calling module; this store only enforces the role.
    /// @param _to The laboratory that manufactured the device.
    /// @param _lotId The material lot the device was made from.
    /// @param _conformityHash Fingerprint of the off-chain conformity file.
    /// @return tokenId The id of the freshly minted passport.
    function mint(address _to, uint64 _lotId, bytes32 _conformityHash)
        external
        onlyRole(ROLES.PASSPORT_MINTER_ROLE())
        returns (uint256 tokenId)
    {
        tokenId = _nextTokenId;
        ++_nextTokenId;
        _traits[tokenId] = Traits({
            lotId: _lotId,
            mintedAt: uint40(block.timestamp),
            conformityHash: _conformityHash
        });
        _safeMint(_to, tokenId);

        emit PassportIssued(tokenId, _to, _lotId, _conformityHash);
    }

    /// @notice Arms a one-shot handoff: `_to` becomes the only address able to
    ///         receive `_tokenId`, until the transfer happens.
    /// @dev Step 1 of the two-step handoff. The authorization is deliberately
    ///      NOT a plain boolean: a boolean that nobody resets leaves the token
    ///      transferable forever, silently disabling the soulbound property.
    ///      Here the recipient is pinned, and _update consumes the slot.
    /// @param _tokenId The passport being handed off.
    /// @param _to The one address allowed to receive it.
    function armHandoff(uint256 _tokenId, address _to)
        external
        onlyRole(ROLES.PASSPORT_CONTROLLER_ROLE())
    {
        address from = _requireOwned(_tokenId);
        _pendingHandoff[_tokenId] = _to;

        emit HandoffArmed(_tokenId, from, _to);
    }

    /// @notice Executes an armed handoff towards `_to`.
    /// @dev Step 2 of the two-step handoff. Uses _transfer and not
    ///      _safeTransfer on purpose: the recipient has already been checked
    ///      against the role allowlist by the module, so the ERC721Receiver
    ///      probe adds no safety here while it would reject legitimate contract
    ///      wallets (multisigs) that do not implement the callback.
    /// @param _tokenId The passport being handed off.
    /// @param _to The recipient, which must match the armed authorization.
    function executeHandoff(uint256 _tokenId, address _to)
        external
        onlyRole(ROLES.PASSPORT_CONTROLLER_ROLE())
    {
        _transfer(_requireOwned(_tokenId), _to, _tokenId);
    }

    /// @notice The manufacturing traits of a passport.
    /// @param _tokenId The passport to read.
    /// @return The traits frozen at mint.
    function traitsOf(uint256 _tokenId) external view returns (Traits memory) {
        return _traits[_tokenId];
    }

    /// @notice The address currently allowed to receive `_tokenId`, or the zero
    ///         address when no handoff is armed.
    /// @param _tokenId The passport to read.
    /// @return The armed recipient, or the zero address.
    function pendingHandoff(uint256 _tokenId) external view returns (address) {
        return _pendingHandoff[_tokenId];
    }

    /// @notice Total number of passports minted since deployment.
    /// @return The number of passports ever minted.
    function mintedCount() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @inheritdoc ERC721
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @dev The soulbound rule, and the reason it lives here: every transfer
    ///      path in ERC721 - transferFrom, safeTransferFrom and the internal
    ///      ones - funnels through _update. Overriding the public entry points
    ///      would leave the internal ones wide open.
    ///      Mint (from == 0) is allowed; burning (to == 0) is not, because a
    ///      device that was removed stays a historical fact worth keeping.
    ///      Any other move must match the armed recipient exactly, and the
    ///      authorization is deleted before the transfer completes, which makes
    ///      it strictly single-use.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0)) {
            require(
                to != address(0) && _pendingHandoff[tokenId] == to,
                Soulbound(tokenId)
            );
            delete _pendingHandoff[tokenId];
        }
        return super._update(to, tokenId, auth);
    }

    /// @dev Required by Solidity: ERC721 and ERC721Enumerable both define it.
    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }
}
