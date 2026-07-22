// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {AccessControlEnumerable} from
    "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";

/// @title CatentaRoles - the single access authority of the Catenta registry
/// @author Catenta
/// @notice Holds every role of the application: who is an approved actor, and
///         which contracts are allowed to write into the permanent stores.
/// @dev This contract is THE decoupling point of the architecture. Every other
///      contract reads its permissions here instead of hard-coding a peer
///      address, which means a new module is added by granting it a role - no
///      redeployment of the token contracts, no passport lost.
///
///      Two families of roles, deliberately kept apart:
///      - actor roles (LAB, PRACTITIONER, DISTRIBUTOR, REGULATOR) are granted
///        to humans and organizations on an approval allowlist;
///      - module roles (*_MINTER, *_CONTROLLER, *_BURNER) are granted to
///        contracts only. Granting one to an externally owned account would
///        bypass the business logic entirely, so it is an admin-level mistake
///        the deployment checklist must guard against.
///
///      Alternative studied and set aside: OpenZeppelin AccessManager. It
///      offers per-function targeting and built-in delays, which fits a modular
///      system well, but it moves the access rules out of the contracts and
///      into numeric role ids - the code stops documenting its own rules. The
///      semantic roles below are kept for auditability; AccessManager stays the
///      escape hatch if timelocked permissions become a requirement.
contract CatentaRoles is AccessControlEnumerable {
    // ---------- actor roles ----------

    /// @notice Laboratory: declares material lots, mints passports, stakes.
    bytes32 public constant LAB_ROLE = keccak256("LAB_ROLE");
    /// @notice Practitioner: attests conformity, records placement.
    bytes32 public constant PRACTITIONER_ROLE = keccak256("PRACTITIONER_ROLE");
    /// @notice Dental depot: relays and acknowledges recalls.
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    /// @notice Ordre / ARS: full read, declares recalls, slashes bonds.
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    // ---------- module roles (contracts only) ----------

    /// @notice Allowed to mint passports.
    bytes32 public constant PASSPORT_MINTER_ROLE = keccak256("PASSPORT_MINTER_ROLE");
    /// @notice Allowed to arm and execute passport handoffs.
    bytes32 public constant PASSPORT_CONTROLLER_ROLE = keccak256("PASSPORT_CONTROLLER_ROLE");
    /// @notice Allowed to declare (mint) material lots.
    bytes32 public constant LOT_MINTER_ROLE = keccak256("LOT_MINTER_ROLE");
    /// @notice Allowed to burn material consumed by manufacturing.
    bytes32 public constant LOT_BURNER_ROLE = keccak256("LOT_BURNER_ROLE");

    /// @notice Deploys the authority and hands administration to `_admin`.
    /// @dev The admin is an explicit parameter rather than msg.sender so a
    ///      deployment script or factory gets no power over the registry.
    /// @param _admin The consortium administrator, holder of DEFAULT_ADMIN_ROLE.
    constructor(address _admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }
}
