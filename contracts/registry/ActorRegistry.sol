// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {CatentaRoles} from "../access/CatentaRoles.sol";
import {RoleAware} from "../access/RoleAware.sol";

/// @title ActorRegistry - who is behind an address, for the actors that accept it
/// @author Catenta
/// @notice The trade name and SIREN of an approved actor, written by the same
///         authority that approves it.
/// @dev PERMANENT STORE. Deployed once, never replaced.
///
///      Two rules are enforced here rather than left to the interface, because
///      an interface convention is not a guarantee.
///
///      1. MANUFACTURERS ARE NEVER LABELLED. A material manufacturer competes
///         on who supplies whom; publishing the mapping address -> company
///         would hand its customer base to its competitors. The contract
///         refuses the write, so the claim holds without trusting an operator.
///         Note the honest limit: this is pseudonymity, not anonymity. Lots,
///         recipients and timestamps stay public, so a manufacturer remains
///         identifiable by correlation. What is removed is the shortcut.
///
///      2. TRADE NAME ONLY, NEVER A PERSON. A laboratory or a distributor is a
///         legal entity: its name and SIREN are public records, and inscribing
///         them raises no GDPR question. A practitioner, however, is often a
///         natural person - so the label MUST be the practice's trade name
///         ("Cabinet dentaire des Lilas"), never a civil name. The contract
///         cannot tell the two apart; the registrar carries that duty, and
///         `clearLabel` exists so a mistake can be undone.
///
///      Deliberately NOT here: RPPS, addresses, any contact detail. The link of
///      responsibility is the on-chain role, granted after the registrar
///      checked the papers off-chain (docs/SPEC.md section 9.4).
contract ActorRegistry is RoleAware {
    /// @notice The public identity of an approved actor.
    struct Actor {
        string label;
        string siren;
    }

    /// @dev Bounds: a trade name is short, and unbounded strings are a storage
    ///      hazard on a contract anyone approved can write to.
    uint256 private constant MAX_LABEL = 64;
    /// @dev A French SIREN is exactly nine digits.
    uint256 private constant SIREN_LENGTH = 9;

    /// @dev address => public identity. Empty label means "not registered".
    mapping(address account => Actor) private _actors;

    /// @notice Emitted when a registrar sets or updates an actor's identity.
    /// @param account The actor concerned.
    /// @param label The trade name.
    /// @param siren The SIREN, possibly empty for a foreign actor.
    event ActorLabelled(address indexed account, string label, string siren);

    /// @notice Emitted when a registrar removes an actor's identity.
    /// @param account The actor concerned.
    event ActorLabelCleared(address indexed account);

    /// @notice A label is required and must stay short.
    error InvalidLabel();
    /// @notice A SIREN, when provided, is exactly nine characters.
    error InvalidSiren();
    /// @notice Manufacturers are deliberately never labelled.
    error ManufacturerNotLabelled(address account);

    /// @notice Deploys the registry bound to the shared authority.
    /// @param _roles The shared access authority.
    constructor(CatentaRoles _roles) RoleAware(_roles) {}

    /// @notice Sets the public identity of an approved actor.
    /// @dev Reserved to REGISTRAR_ROLE — the very role that grants LAB /
    ///      PRACTITIONER / DISTRIBUTOR. Naming and approving are then the same
    ///      administrative act, which is what keeps the registry from drifting
    ///      away from the roles it describes.
    /// @param _account The actor to label.
    /// @param _label The trade name. Never a natural person's name.
    /// @param _siren The SIREN, or an empty string.
    function setLabel(address _account, string calldata _label, string calldata _siren)
        external
        onlyRole(ROLES.REGISTRAR_ROLE())
    {
        require(
            !ROLES.hasRole(ROLES.MANUFACTURER_ROLE(), _account),
            ManufacturerNotLabelled(_account)
        );
        uint256 labelLength = bytes(_label).length;
        require(labelLength > 0 && labelLength <= MAX_LABEL, InvalidLabel());
        uint256 sirenLength = bytes(_siren).length;
        require(sirenLength == 0 || sirenLength == SIREN_LENGTH, InvalidSiren());

        _actors[_account] = Actor({label: _label, siren: _siren});

        emit ActorLabelled(_account, _label, _siren);
    }

    /// @notice Removes an actor's public identity.
    /// @dev Storage is cleared, but the past events remain — a public chain
    ///      does not forget. It is the reason the label must never carry a
    ///      natural person's name in the first place.
    /// @param _account The actor to unlabel.
    function clearLabel(address _account) external onlyRole(ROLES.REGISTRAR_ROLE()) {
        delete _actors[_account];

        emit ActorLabelCleared(_account);
    }

    /// @notice The public identity of an actor.
    /// @param _account The address to read.
    /// @return The stored identity; an empty label means the address is not
    ///         registered — which is always the case for a manufacturer.
    function actorOf(address _account) external view returns (Actor memory) {
        return _actors[_account];
    }
}
