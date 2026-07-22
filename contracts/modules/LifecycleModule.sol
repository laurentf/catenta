// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {CatentaRoles} from "../access/CatentaRoles.sol";
import {RoleAware} from "../access/RoleAware.sol";
import {MaterialLots} from "../tokens/MaterialLots.sol";
import {PassportNFT} from "../tokens/PassportNFT.sol";

/// @title LifecycleModule - the device lifecycle, from manufacturing to placement
/// @author Catenta
/// @notice Orchestrates the business flow: a laboratory declares a lot and mints
///         a passport by consuming material, a practitioner takes custody,
///         attests conformity and records the placement.
/// @dev REPLACEABLE MODULE. Unlike the token stores, this contract is expected
///      to be superseded: the lifecycle rules are the part of the system most
///      likely to evolve with regulation. Replacing it means deploying the new
///      module, granting it the module roles and revoking them from this one -
///      the passports, the lots and the roles all survive untouched.
///
///      Consequence on state: only what this module owns lives here (the
///      status and the patient commitment). Everything meant to outlive the
///      module - the passports, their manufacturing traits, the lots and their
///      balances - lives in the permanent stores.
///
///      Scope of this version: recall (with the derived status), the quality
///      bond and the recall acknowledgements land in their own modules, which
///      is precisely why they need no change here.
contract LifecycleModule is RoleAware {
    /// @notice The lifecycle stages of a passport.
    /// @dev Declaration order IS the process order. `Recalled` is deliberately
    ///      absent: a recall is a property of the LOT and is derived at read
    ///      time by the recall module. Storing it here as well would create two
    ///      sources of truth that can drift apart.
    enum Status {
        Manufactured,
        Certified,
        Placed
    }

    /// @notice The passport store driven by this module.
    PassportNFT public immutable PASSPORTS;
    /// @notice The material lot store driven by this module.
    MaterialLots public immutable LOTS;

    /// @dev tokenId => current stage.
    mapping(uint256 tokenId => Status) private _status;

    /// @dev tokenId => salted commitment to the patient identity, set at
    ///      placement. Never a raw identity, never an unsalted hash.
    mapping(uint256 tokenId => bytes32) private _commitment;

    /// @notice Emitted when material is consumed to manufacture a device.
    /// @dev The business fact this module owns: it binds the ERC-1155 burn and
    ///      the ERC-721 mint of the same transaction together. The issuance
    ///      itself is announced by the passport store (PassportIssued), and the
    ///      burn by the ERC-1155 TransferSingle - neither is repeated here.
    /// @param tokenId The passport the material went into.
    /// @param lotId The lot that was consumed.
    /// @param quantity The quantity of material consumed.
    event MaterialConsumed(
        uint256 indexed tokenId,
        uint64 indexed lotId,
        uint256 quantity
    );

    /// @notice Emitted when a practitioner validates the conformity check.
    /// @param tokenId The passport being attested.
    /// @param practitioner The practitioner who signed the check.
    event ConformityAttested(uint256 indexed tokenId, address indexed practitioner);

    /// @notice Emitted when the device is placed in the patient's mouth.
    /// @dev Carries the commitment: it is written to storage, so it is public
    ///      anyway, and emitting it spares an indexer one call per device.
    ///      Publishing it is safe precisely because it is salted (see below).
    /// @param tokenId The passport being placed.
    /// @param practitioner The practitioner who placed the device.
    /// @param patientCommitment Salted commitment to the patient's identity.
    event PlacedInMouth(
        uint256 indexed tokenId,
        address indexed practitioner,
        bytes32 patientCommitment
    );

    /// @notice The action is not allowed at the current stage of the passport.
    error WrongStatus(uint256 tokenId, Status expected, Status current);
    /// @notice The lot id does not exist.
    error UnknownLot(uint64 lotId);
    /// @notice Only the laboratory that declared the lot can consume it.
    error NotLotOwner(uint64 lotId, address caller);
    /// @notice A quantity of zero would record a consumption that never happened.
    error ZeroQuantity();
    /// @notice A document fingerprint is required and cannot be empty.
    error EmptyHash();
    /// @notice The caller does not hold the passport.
    error NotPassportHolder(uint256 tokenId, address caller);
    /// @notice The recipient of a handoff must be an approved actor.
    error RecipientNotEligible(address to);
    /// @notice A handoff to oneself is a no-op and is rejected.
    error SelfHandoff();
    /// @notice The caller is not the armed recipient of this handoff.
    error NotPendingRecipient(uint256 tokenId, address caller);
    /// @notice A placed device is locked; a post-placement handoff needs the
    ///         regulator, which lands with the transfer-of-record module.
    error PassportLocked(uint256 tokenId);

    /// @notice Restricts a function to the current holder of the passport.
    /// @dev Holding the token is the on-chain proof of physical custody: it is
    ///      what ties the handoff to the rest of the lifecycle.
    modifier onlyHolder(uint256 _tokenId) {
        require(
            PASSPORTS.ownerOf(_tokenId) == msg.sender,
            NotPassportHolder(_tokenId, msg.sender)
        );
        _;
    }

    /// @notice Restricts a function to a specific stage of the passport.
    modifier onlyStatus(uint256 _tokenId, Status _expected) {
        Status current = _status[_tokenId];
        require(current == _expected, WrongStatus(_tokenId, _expected, current));
        _;
    }

    /// @notice Wires the module to the authority and the permanent stores.
    /// @param _roles The shared access authority.
    /// @param _passports The passport store.
    /// @param _lots The material lot store.
    constructor(CatentaRoles _roles, PassportNFT _passports, MaterialLots _lots)
        RoleAware(_roles)
    {
        PASSPORTS = _passports;
        LOTS = _lots;
    }

    // ==================================================
    //                    LAB FUNCTIONS
    // ==================================================

    /// @notice Declares a material lot with the fingerprint of its conformity
    ///         certificate (CE / ISO), kept off-chain.
    /// @param _certHash Fingerprint of the off-chain material certificate.
    /// @param _quantity Quantity available in the lot, in the lab's own unit.
    /// @return lotId The id of the declared lot.
    function declareLot(bytes32 _certHash, uint256 _quantity)
        external
        onlyRole(ROLES.LAB_ROLE())
        returns (uint64 lotId)
    {
        require(_quantity > 0, ZeroQuantity());
        require(_certHash != bytes32(0), EmptyHash());

        lotId = LOTS.declareLot(msg.sender, _certHash, _quantity);
    }

    /// @notice Mints the passport of a manufactured device and consumes the
    ///         material it was made of.
    /// @dev The matter-to-device link is established in the very transaction
    ///      that creates the passport, so it can never be reconstructed after
    ///      the fact. The burn runs before the mint (checks-effects-
    ///      interactions on the material side) and reverts on insufficient
    ///      balance through the ERC-1155 store itself.
    /// @param _lotId The lot the device was made from.
    /// @param _quantity The quantity of material consumed.
    /// @param _conformityHash Fingerprint of the off-chain conformity file.
    /// @return tokenId The id of the minted passport.
    function mintPassport(uint64 _lotId, uint256 _quantity, bytes32 _conformityHash)
        external
        onlyRole(ROLES.LAB_ROLE())
        returns (uint256 tokenId)
    {
        require(LOTS.lotExists(_lotId), UnknownLot(_lotId));
        require(LOTS.lotOf(_lotId).lab == msg.sender, NotLotOwner(_lotId, msg.sender));
        require(_quantity > 0, ZeroQuantity());
        require(_conformityHash != bytes32(0), EmptyHash());

        LOTS.burnForManufacturing(msg.sender, _lotId, _quantity);
        tokenId = PASSPORTS.mint(msg.sender, _lotId, _conformityHash);

        emit MaterialConsumed(tokenId, _lotId, _quantity);
    }

    // ==================================================
    //                PRACTITIONER FUNCTIONS
    // ==================================================

    /// @notice Records that the practitioner validated the conformity check.
    /// @param _tokenId The passport being attested.
    function attestConformity(uint256 _tokenId)
        external
        onlyRole(ROLES.PRACTITIONER_ROLE())
        onlyHolder(_tokenId)
        onlyStatus(_tokenId, Status.Manufactured)
    {
        _status[_tokenId] = Status.Certified;

        emit ConformityAttested(_tokenId, msg.sender);
    }

    /// @notice Records the placement of the device and binds it to a patient.
    /// @dev The commitment MUST be salted off-chain: keccak256(salt || identity),
    ///      with a 32-byte random salt stored next to the erasable record. A raw
    ///      hash of civil status is brute-forceable, hence still personal data;
    ///      erasing the off-chain record destroys the salt and makes the
    ///      on-chain commitment permanently unusable (docs/SPEC.md section 9.2).
    /// @param _tokenId The passport being placed.
    /// @param _patientCommitment Salted commitment to the patient's identity.
    function markPlaced(uint256 _tokenId, bytes32 _patientCommitment)
        external
        onlyRole(ROLES.PRACTITIONER_ROLE())
        onlyHolder(_tokenId)
        onlyStatus(_tokenId, Status.Certified)
    {
        require(_patientCommitment != bytes32(0), EmptyHash());

        _status[_tokenId] = Status.Placed;
        _commitment[_tokenId] = _patientCommitment;

        emit PlacedInMouth(_tokenId, msg.sender, _patientCommitment);
    }

    // ==================================================
    //                   HANDOFF (2 STEPS)
    // ==================================================

    /// @notice Step 1: the holder designates the single actor allowed to take
    ///         custody of the device.
    /// @dev Two steps rather than one so that the authorization is atomic and
    ///      single-use, and so that a passport can never be pushed onto an
    ///      actor who did not ask for it.
    /// @param _tokenId The passport being handed off.
    /// @param _to The designated recipient, which must be an approved actor.
    function initiateHandoff(uint256 _tokenId, address _to) external onlyHolder(_tokenId) {
        require(_to != msg.sender, SelfHandoff());
        require(
            ROLES.hasRole(ROLES.LAB_ROLE(), _to)
                || ROLES.hasRole(ROLES.PRACTITIONER_ROLE(), _to),
            RecipientNotEligible(_to)
        );
        require(_status[_tokenId] != Status.Placed, PassportLocked(_tokenId));

        // No event here: arming is a change of the passport store's state and
        // the store announces it (HandoffArmed). Emitting a twin from the
        // module would put the same fact twice in the same transaction.
        PASSPORTS.armHandoff(_tokenId, _to);
    }

    /// @notice Step 2: the designated recipient accepts and takes custody.
    /// @param _tokenId The passport being accepted.
    function acceptHandoff(uint256 _tokenId) external {
        require(
            PASSPORTS.pendingHandoff(_tokenId) == msg.sender,
            NotPendingRecipient(_tokenId, msg.sender)
        );

        // No event here either: the ERC-721 Transfer emitted by the store
        // already states who now holds the device, which is the whole fact.
        PASSPORTS.executeHandoff(_tokenId, msg.sender);
    }

    // ==================================================
    //                        VIEWS
    // ==================================================

    /// @notice The lifecycle stage of a passport, as recorded by this module.
    /// @dev Deliberately NOT recall-aware: a recall belongs to the lot and to
    ///      the recall module. Composing the two is the job of the read layer,
    ///      which keeps the modules independent of each other.
    /// @param _tokenId The passport to read.
    /// @return The current stage.
    function statusOf(uint256 _tokenId) external view returns (Status) {
        return _status[_tokenId];
    }

    /// @notice The salted commitment binding a device to a patient.
    /// @param _tokenId The passport to read.
    /// @return The commitment, or zero before placement.
    function patientCommitmentOf(uint256 _tokenId) external view returns (bytes32) {
        return _commitment[_tokenId];
    }
}
