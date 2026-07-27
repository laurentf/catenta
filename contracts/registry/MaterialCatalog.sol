// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {CatentaRoles} from "../access/CatentaRoles.sol";
import {RoleAware} from "../access/RoleAware.sol";

/// @title MaterialCatalog - the reference sheet of every material a lot is made of
/// @author Catenta
/// @notice What a lot is MADE OF, said once: commercial name and unit of
///         measure, declared by the manufacturer that produces it.
/// @dev PERMANENT STORE. Deployed once, never replaced, like the token stores.
///
///      Why on-chain at all, when the actors' identities deliberately are not:
///      a product reference is not personal data, so the GDPR doctrine that
///      keeps a practitioner's name off the chain (docs/SPEC.md section 9.4)
///      simply does not apply here. And the UNIT is not decoration - it decides
///      how an on-chain quantity is READ. Left in an off-chain file it could be
///      changed after the fact, which would make an immutable number
///      reinterpretable. That is the argument for putting it here.
///
///      Why a separate contract rather than a field on the lot: a manufacturer
///      declares many lots of the same material. Storing the name on every lot
///      would duplicate the same string N times and make a correction
///      impossible, lots being immutable records. Here the material is the
///      entity and the lot merely points at it (MaterialLots.LotInfo.materialId,
///      a uint32 that packs into a slot the lot already pays for - so the link
///      itself costs nothing).
///
///      What is NOT here: composition, production date, standards. Those live in
///      the material certificate, whose fingerprint is already anchored on the
///      lot. Repeating them on-chain would create a second source of truth that
///      can drift from the document that makes authority.
contract MaterialCatalog is RoleAware {
    /// @notice A material reference, as declared by its manufacturer.
    /// @dev Slot 0 packs manufacturer (20) + active (1); the two strings take
    ///      one slot each.
    struct Material {
        address manufacturer;
        bool active;
        string name;
        string unit;
    }

    /// @dev Next material id. Ids start at 1 so 0 stays a "no material"
    ///      sentinel, exactly like lot and passport ids.
    uint32 private _nextMaterialId = 1;

    /// @dev materialId => the reference sheet. Never deleted: a discontinued
    ///      material is deactivated, because lots keep pointing at it forever.
    mapping(uint32 materialId => Material) private _materials;

    /// @notice Emitted when a manufacturer registers a material.
    /// @param materialId The id assigned to the material.
    /// @param manufacturer The manufacturer that produces it.
    /// @param name The commercial name.
    /// @param unit The unit its quantities are counted in.
    event MaterialRegistered(
        uint32 indexed materialId,
        address indexed manufacturer,
        string name,
        string unit
    );

    /// @notice Emitted when a manufacturer discontinues or reinstates a material.
    /// @param materialId The material concerned.
    /// @param active Whether new lots may be declared from it.
    event MaterialActiveUpdated(uint32 indexed materialId, bool active);

    /// @notice A material must carry a name and a unit.
    error EmptyField();
    /// @notice The material id does not exist.
    error UnknownMaterial(uint32 materialId);
    /// @notice Only the manufacturer that registered a material can change it.
    error NotMaterialOwner(uint32 materialId, address caller);

    /// @notice Deploys the catalogue bound to the shared authority.
    /// @param _roles The shared access authority.
    constructor(CatentaRoles _roles) RoleAware(_roles) {}

    /// @notice Registers a material this manufacturer produces.
    /// @dev Open to any approved manufacturer, for its own products only: the
    ///      caller becomes the owner of the entry and nobody else can edit it.
    ///      No credit is charged - the catalogue is written once per product,
    ///      not per action, and a manufacturer unable to describe its material
    ///      could not declare a single lot.
    /// @param _name The commercial name, e.g. "Zircone Y-TZP A2".
    /// @param _unit The unit quantities are counted in, e.g. "g" or "ingots".
    /// @return materialId The id assigned to the material.
    function registerMaterial(string calldata _name, string calldata _unit)
        external
        onlyRole(ROLES.MANUFACTURER_ROLE())
        returns (uint32 materialId)
    {
        require(bytes(_name).length > 0 && bytes(_unit).length > 0, EmptyField());

        materialId = _nextMaterialId;
        ++_nextMaterialId;
        _materials[materialId] = Material({
            manufacturer: msg.sender,
            active: true,
            name: _name,
            unit: _unit
        });

        emit MaterialRegistered(materialId, msg.sender, _name, _unit);
    }

    /// @notice Discontinues a material, or puts it back in production.
    /// @dev Deactivating never rewrites history: the lots already declared keep
    ///      pointing at the entry and stay perfectly readable. It only stops NEW
    ///      lots from being declared from it.
    /// @param _materialId The material concerned.
    /// @param _active Whether new lots may be declared from it.
    function setMaterialActive(uint32 _materialId, bool _active) external {
        Material storage material = _materials[_materialId];
        require(material.manufacturer != address(0), UnknownMaterial(_materialId));
        require(
            material.manufacturer == msg.sender,
            NotMaterialOwner(_materialId, msg.sender)
        );

        material.active = _active;

        emit MaterialActiveUpdated(_materialId, _active);
    }

    /// @notice The reference sheet of a material.
    /// @param _materialId The material to read.
    /// @return The stored material.
    function materialOf(uint32 _materialId) external view returns (Material memory) {
        Material memory material = _materials[_materialId];
        require(material.manufacturer != address(0), UnknownMaterial(_materialId));
        return material;
    }

    /// @notice Whether a material has been registered.
    /// @param _materialId The material to check.
    /// @return True when the material exists.
    function materialExists(uint32 _materialId) external view returns (bool) {
        return _materials[_materialId].manufacturer != address(0);
    }

    /// @notice Number of materials registered so far.
    /// @return The number of materials registered since deployment.
    function materialCount() external view returns (uint32) {
        return _nextMaterialId - 1;
    }
}
