// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {CatentaRoles} from "./CatentaRoles.sol";

/// @title RoleAware - base contract for anything governed by CatentaRoles
/// @author Catenta
/// @notice Gives a contract access to the shared role authority.
/// @dev Every store and every module inherits this instead of holding a
///      hard-coded address of its peers. That single indirection is what makes
///      the system extensible: a new module is deployed, granted a role, and it
///      can write - nothing else is touched, nothing is redeployed.
///
///      The authority itself is immutable per contract on purpose: being able
///      to repoint a store at a different authority would let a compromised
///      admin silently reassign every permission at once.
abstract contract RoleAware {
    /// @notice The shared access authority of the application.
    CatentaRoles public immutable ROLES;

    /// @notice The caller does not hold the required role.
    error UnauthorizedRole(bytes32 role, address account);
    /// @notice The role authority address cannot be zero.
    error ZeroAuthority();

    /// @notice Restricts a function to holders of `_role` in CatentaRoles.
    modifier onlyRole(bytes32 _role) {
        require(ROLES.hasRole(_role, msg.sender), UnauthorizedRole(_role, msg.sender));
        _;
    }

    /// @notice Binds this contract to the shared access authority.
    /// @param _roles The shared access authority.
    constructor(CatentaRoles _roles) {
        require(address(_roles) != address(0), ZeroAuthority());
        ROLES = _roles;
    }
}
