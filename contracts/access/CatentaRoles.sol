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
///      - actor roles (MANUFACTURER, LAB, PRACTITIONER, DISTRIBUTOR, REGULATOR)
///        are granted to humans and organizations on an approval allowlist;
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
    // ---------- operational role ----------

    /// @notice Onboards day-to-day actors (labs, practitioners, distributors).
    /// @dev THE way to have several administrators without multiplying the
    ///      super-root. REGISTRAR_ROLE is the admin-role of LAB / PRACTITIONER
    ///      / DISTRIBUTOR (set in the constructor), so a registrar can approve
    ///      those actors without holding DEFAULT_ADMIN_ROLE — separation of
    ///      "operate" from "govern".
    ///      REGISTRAR_ROLE is itself administered by DEFAULT_ADMIN_ROLE: only
    ///      the root appoints or removes registrars. The sensitive roles
    ///      (REGULATOR, module roles, credit roles) stay under the root too.
    ///      This is also the design that survives AccessControlDefaultAdminRules
    ///      later, which forces DEFAULT_ADMIN_ROLE to a single holder.
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    // ---------- actor roles ----------

    /// @notice Manufacturer: produces the raw material and declares its lots.
    /// @dev The first link of the chain. It declares the lot and ships it; it
    ///      never manufactures a device, which is what separates it from a
    ///      laboratory (docs/Catenta Parcours Prothese Tracabilite, p.3).
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    /// @notice Laboratory: consumes material and mints prosthesis passports.
    bytes32 public constant LAB_ROLE = keccak256("LAB_ROLE");
    /// @notice Practitioner: attests conformity, records placement.
    bytes32 public constant PRACTITIONER_ROLE = keccak256("PRACTITIONER_ROLE");
    /// @notice Dental depot: buys lots from manufacturers and resells them to
    ///         laboratories or practitioners; relays and acknowledges recalls.
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
    /// @notice Allowed to move the custody of material between approved actors.
    /// @dev Material is not freely transferable: only a module holding this role
    ///      can move it, and only at the end of the two-step shipment the
    ///      recipient has accepted. Same shape as PASSPORT_CONTROLLER_ROLE for
    ///      passports — the store enforces "nobody moves this on their own".
    bytes32 public constant LOT_CUSTODIAN_ROLE = keccak256("LOT_CUSTODIAN_ROLE");
    /// @notice Allowed to mint usage credits (against an off-chain payment).
    /// @dev Held by the admin / an onboarding module — the fiat-to-credit
    ///      bridge lives off-chain, so minting is a deliberate, gated act.
    bytes32 public constant CREDIT_MINTER_ROLE = keccak256("CREDIT_MINTER_ROLE");
    /// @notice Allowed to spend (burn) a caller's usage credits on an action.
    /// @dev Held by the modules that charge per action (LifecycleModule…), so
    ///      they can burn the caller's credit in the same transaction without
    ///      an ERC-20 allowance round-trip.
    bytes32 public constant CREDIT_SPENDER_ROLE = keccak256("CREDIT_SPENDER_ROLE");

    /// @notice Deploys the authority and hands administration to `_admin`.
    /// @dev The admin is an explicit parameter rather than msg.sender so a
    ///      deployment script or factory gets no power over the registry.
    ///      The admin is also seeded as a registrar so onboarding works out of
    ///      the box; additional registrars are appointed at runtime by the root.
    ///      Actor onboarding is delegated to REGISTRAR_ROLE via _setRoleAdmin;
    ///      everything else keeps its default admin (DEFAULT_ADMIN_ROLE).
    /// @param _admin The consortium administrator, holder of DEFAULT_ADMIN_ROLE.
    constructor(address _admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(REGISTRAR_ROLE, _admin);

        _setRoleAdmin(MANUFACTURER_ROLE, REGISTRAR_ROLE);
        _setRoleAdmin(LAB_ROLE, REGISTRAR_ROLE);
        _setRoleAdmin(PRACTITIONER_ROLE, REGISTRAR_ROLE);
        _setRoleAdmin(DISTRIBUTOR_ROLE, REGISTRAR_ROLE);
    }
}
