// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {CatentaRoles} from "../access/CatentaRoles.sol";
import {RoleAware} from "../access/RoleAware.sol";
import {CatentaCredit} from "../tokens/CatentaCredit.sol";
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
    /// @notice The usage credit spent on each useful action.
    CatentaCredit public immutable CREDIT;

    /// @notice Credits burned per useful action. Default 1; the admin can set
    ///         it (0 disables charging entirely — e.g. a free pilot phase).
    /// @dev Uniform across actions in this version. A per-action price map is a
    ///      later refinement and does not change the stores.
    uint256 public actionCost = 1;

    /// @notice What became of a shipment.
    /// @dev An enum rather than a "settled" boolean: accepted and cancelled are
    ///      two very different facts, and a boolean conflates them. Storing the
    ///      difference is what makes the custody history of a lot readable from
    ///      storage alone - no event scan, no indexer.
    enum ShipmentStatus {
        Pending,
        Accepted,
        Cancelled
    }

    /// @notice A quantity of material on its way from one actor to the next.
    /// @dev Slot 0 packs from (20) + status (1); slot 1 packs to (20) +
    ///      lotId (8). The quantity takes the third.
    struct Shipment {
        address from;
        ShipmentStatus status;
        address to;
        uint64 lotId;
        uint256 quantity;
    }

    /// @notice Number of shipments declared since deployment.
    uint256 public shipmentCount;

    /// @dev shipmentId => the shipment record. Ids start at 1.
    mapping(uint256 shipmentId => Shipment) private _shipments;

    /// @notice What became of an order.
    /// @dev A refusal and a cancellation are kept apart: one is the supplier
    ///      declining, the other the buyer changing its mind. Both carry a
    ///      reason in clear - a traceability registry that records "cancelled"
    ///      without saying why records half a fact.
    enum OrderStatus {
        Pending,
        Fulfilled,
        Refused,
        Cancelled
    }

    /// @notice A request for material, from a buyer to a supplier.
    /// @dev The cascade of the functional doc - a distributor out of stock
    ///      orders from the manufacturer - is NOT automated. A contract
    ///      deciding on its own to buy upstream would need supplier
    ///      relationships, prices and thresholds it has no business knowing.
    ///      Instead the distributor places its own order and `parentOrderId`
    ///      records what motivated it: the chain is traced, not decided.
    struct MaterialOrder {
        address buyer;
        OrderStatus status;
        address supplier;
        uint256 quantity;
        string material;
        uint256 parentOrderId;
        uint256 shipmentId;
        string reason;
    }

    /// @notice Number of material orders placed since deployment.
    uint256 public materialOrderCount;

    /// @dev orderId => the order record. Ids start at 1.
    mapping(uint256 orderId => MaterialOrder) private _materialOrders;

    /// @notice What became of a prosthesis request.
    /// @dev One more stage than an order: a laboratory ACCEPTS before it
    ///      manufactures, and the two are days apart. Collapsing them would
    ///      leave a practitioner unable to tell "not seen yet" from "under way".
    enum RequestStatus {
        Pending,
        Accepted,
        Fulfilled,
        Refused,
        Cancelled
    }

    /// @notice A practitioner asking a laboratory for a prosthesis.
    /// @dev Step 0 of the functional doc. The shade and the short description
    ///      are stored in clear rather than hashed: they are what the
    ///      laboratory needs to act on, and a fingerprint nobody can read would
    ///      force the prescription back into e-mail. Both are length-bounded.
    struct ProsthesisRequest {
        address practitioner;
        RequestStatus status;
        address lab;
        uint8 tooth;
        uint256 tokenId;
        string material;
        string shade;
        string description;
        string reason;
    }

    /// @notice Number of prosthesis requests placed since deployment.
    uint256 public prosthesisRequestCount;

    /// @dev requestId => the request record. Ids start at 1.
    mapping(uint256 requestId => ProsthesisRequest) private _requests;

    /// @dev tokenId => current stage.
    mapping(uint256 tokenId => Status) private _status;

    /// @dev tokenId => salted commitment to the patient identity, set at
    ///      placement. Never a raw identity, never an unsalted hash.
    mapping(uint256 tokenId => bytes32) private _commitment;

    /// @notice The clinical act itself: who placed the device, when, and where.
    /// @dev Slot-packed: practitioner (20) + placedAt (5) + tooth (1) = 26
    ///      bytes, one slot. Stored rather than left to the event, because a
    ///      practitioner reading the passport must get "placed on DD/MM, tooth
    ///      N, by whom" in a plain call - not by scanning logs a public RPC may
    ///      refuse to serve.
    struct Placement {
        address practitioner;
        uint40 placedAt;
        uint8 tooth;
    }

    /// @dev tokenId => the clinical act. Zeroed until placement.
    mapping(uint256 tokenId => Placement) private _placement;

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
    /// @param tooth The tooth it was placed on, in FDI notation.
    /// @param patientCommitment Salted commitment to the patient's identity.
    event PlacedInMouth(
        uint256 indexed tokenId,
        address indexed practitioner,
        uint8 tooth,
        bytes32 patientCommitment
    );

    /// @notice Emitted when a holder declares material shipped to an actor.
    /// @param shipmentId The id of the shipment.
    /// @param lotId The lot being shipped.
    /// @param from The sender, who still holds the material until acceptance.
    /// @param to The designated recipient.
    /// @param quantity The quantity shipped.
    event ShipmentDeclared(
        uint256 indexed shipmentId,
        uint64 indexed lotId,
        address indexed from,
        address to,
        uint256 quantity
    );

    /// @notice Emitted when the recipient confirms reception and takes custody.
    /// @dev The custody move itself is announced by the ERC-1155 store
    ///      (TransferSingle) — only the business fact is repeated here.
    /// @param shipmentId The id of the shipment.
    /// @param lotId The lot received.
    /// @param to The recipient that now holds the material.
    event ShipmentAccepted(uint256 indexed shipmentId, uint64 indexed lotId, address indexed to);

    /// @notice Emitted when the sender cancels a shipment nobody accepted.
    /// @param shipmentId The id of the shipment.
    /// @param lotId The lot that stays with the sender.
    /// @param from The sender that cancelled it.
    event ShipmentCancelled(uint256 indexed shipmentId, uint64 indexed lotId, address indexed from);

    /// @notice Emitted when a buyer orders material from a supplier.
    /// @param orderId The id of the order.
    /// @param buyer The actor ordering.
    /// @param supplier The distributor or manufacturer asked to supply.
    /// @param material The material ordered.
    /// @param quantity The quantity ordered.
    /// @param parentOrderId The order this one was placed to satisfy, 0 if none.
    event MaterialOrdered(
        uint256 indexed orderId,
        address indexed buyer,
        address indexed supplier,
        string material,
        uint256 quantity,
        uint256 parentOrderId
    );

    /// @notice Emitted when an order is settled, whichever way.
    /// @param orderId The id of the order.
    /// @param status What became of it.
    /// @param reason The reason, on a refusal or a cancellation.
    event MaterialOrderSettled(uint256 indexed orderId, OrderStatus status, string reason);

    /// @notice Emitted when a practitioner asks a laboratory for a prosthesis.
    /// @param requestId The id of the request.
    /// @param practitioner The practitioner asking.
    /// @param lab The laboratory asked.
    /// @param material The material requested.
    /// @param tooth The tooth it is meant for, in FDI notation.
    event ProsthesisRequested(
        uint256 indexed requestId,
        address indexed practitioner,
        address indexed lab,
        string material,
        uint8 tooth
    );

    /// @notice Emitted when a prosthesis request changes stage.
    /// @param requestId The id of the request.
    /// @param status The new stage.
    /// @param reason The reason, on a refusal or a cancellation.
    event ProsthesisRequestUpdated(uint256 indexed requestId, RequestStatus status, string reason);

    /// @notice Emitted when the admin changes the per-action credit cost.
    /// @param previousCost The cost before the change.
    /// @param newCost The cost from now on (0 disables charging).
    event ActionCostUpdated(uint256 previousCost, uint256 newCost);

    /// @notice The action is not allowed at the current stage of the passport.
    error WrongStatus(uint256 tokenId, Status expected, Status current);
    /// @notice The lot id does not exist.
    error UnknownLot(uint64 lotId);
    /// @notice The caller does not hold enough of this lot to ship it.
    error InsufficientMaterial(address holder, uint64 lotId, uint256 needed);
    /// @notice A shipment to oneself is a no-op and is rejected.
    error SelfShipment();
    /// @notice The caller is not the designated recipient of this shipment.
    error NotShipmentRecipient(uint256 shipmentId, address caller);
    /// @notice The caller did not declare this shipment.
    error NotShipmentSender(uint256 shipmentId, address caller);
    /// @notice The shipment has already been accepted or cancelled.
    error ShipmentSettled(uint256 shipmentId);
    /// @notice A required text is empty or longer than what the registry stores.
    error InvalidText();
    /// @notice The lot offered is not made of the material that was ordered.
    error MaterialMismatch(uint256 orderId, string ordered, string offered);
    /// @notice Only an approved supplier can be asked for material.
    error SupplierNotEligible(address supplier);
    /// @notice The caller is not the supplier of this order.
    error NotOrderSupplier(uint256 orderId, address caller);
    /// @notice The caller is not the buyer of this order.
    error NotOrderBuyer(uint256 orderId, address caller);
    /// @notice The order is no longer pending.
    error OrderSettled(uint256 orderId);
    /// @notice The caller is not the laboratory this request was sent to.
    error NotRequestLab(uint256 requestId, address caller);
    /// @notice The caller is not the practitioner who placed this request.
    error NotRequestPractitioner(uint256 requestId, address caller);
    /// @notice The request is not at the stage this action expects.
    error WrongRequestStatus(uint256 requestId, RequestStatus expected, RequestStatus current);
    /// @notice A quantity of zero would record a consumption that never happened.
    error ZeroQuantity();
    /// @notice The quantity does not fit the passport's frozen traits.
    error QuantityTooLarge(uint256 quantity);
    /// @notice A document fingerprint is required and cannot be empty.
    error EmptyHash();
    /// @notice The tooth number is not valid FDI notation (ISO 3950).
    error InvalidTooth(uint8 tooth);
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

    /// @notice Spends the per-action usage credit from the caller.
    /// @dev Placed after the role and status guards on each function, so a
    ///      credit is only ever burned for an action that would otherwise
    ///      succeed; and since the whole transaction is atomic, a later revert
    ///      in the body rolls the burn back. When actionCost is 0, charging is
    ///      off and the modifier is a no-op.
    modifier costsCredit() {
        if (actionCost > 0) {
            CREDIT.spend(msg.sender, actionCost);
        }
        _;
    }

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
    /// @param _credit The usage credit token spent per action.
    constructor(
        CatentaRoles _roles,
        PassportNFT _passports,
        MaterialLots _lots,
        CatentaCredit _credit
    ) RoleAware(_roles) {
        PASSPORTS = _passports;
        LOTS = _lots;
        CREDIT = _credit;
    }

    /// @notice Sets the number of credits burned per useful action.
    /// @dev Admin-only. 0 disables charging (free pilot). Uniform across
    ///      actions in this version.
    /// @param _cost The new per-action cost.
    function setActionCost(uint256 _cost) external onlyRole(ROLES.DEFAULT_ADMIN_ROLE()) {
        emit ActionCostUpdated(actionCost, _cost);
        actionCost = _cost;
    }

    // ==================================================
    //                MANUFACTURER FUNCTIONS
    // ==================================================

    /// @notice Declares a material lot with the fingerprint of its conformity
    ///         certificate (CE / ISO), kept off-chain.
    /// @dev The manufacturer is the first link of the chain: it produces the
    ///      raw material (blanks, discs, ingots) and is the only actor that can
    ///      bring a lot into existence. A laboratory never declares a lot — it
    ///      receives one and consumes it.
    ///      The lot carries its own material and unit rather than pointing at a
    ///      catalogue: a quantity stays readable forever without any side file,
    ///      and nothing published later can change what a past lot was made of.
    ///      The picker the manufacturer chooses from is an interface
    ///      convenience, with no authority here.
    /// @param _material What the lot is made of, e.g. "Zircone Y-TZP A2".
    /// @param _unit The unit its quantity is counted in, e.g. "g".
    /// @param _certHash Fingerprint of the off-chain material certificate.
    /// @param _quantity Quantity produced, in that unit.
    /// @return lotId The id of the declared lot.
    function declareLot(
        string calldata _material,
        string calldata _unit,
        bytes32 _certHash,
        uint256 _quantity
    ) external onlyRole(ROLES.MANUFACTURER_ROLE()) costsCredit returns (uint64 lotId) {
        require(_quantity > 0, ZeroQuantity());
        require(_certHash != bytes32(0), EmptyHash());
        _checkText(_material, MAX_SHORT);
        _checkText(_unit, MAX_SHORT);

        lotId = LOTS.declareLot(msg.sender, _material, _unit, _certHash, _quantity);
    }

    // ==================================================
    //               SHIPMENT (2 STEPS)
    // ==================================================

    /// @notice Step 1: the holder declares a quantity of material shipped to an
    ///         approved actor. Responsibility starts moving here.
    /// @dev Two steps for the same reason the passport handoff has two: nobody
    ///      can be handed material they never accepted — which matters most for
    ///      a lot that turns out to be recalled. The quantity is NOT escrowed:
    ///      it stays with the sender until acceptance, and the transfer simply
    ///      reverts if it is gone by then. Escrowing would strand material in a
    ///      module that is meant to be replaceable.
    /// @param _lotId The lot being shipped.
    /// @param _quantity The quantity shipped.
    /// @param _to The recipient, which must be an approved actor.
    /// @return shipmentId The id of the declared shipment.
    function declareShipment(uint64 _lotId, uint256 _quantity, address _to)
        external
        costsCredit
        returns (uint256 shipmentId)
    {
        shipmentId = _declareShipment(_lotId, _quantity, _to);
    }

    /// @dev Shared by the free-standing shipment and by the fulfilment of an
    ///      order, so both go through exactly the same guards.
    function _declareShipment(uint64 _lotId, uint256 _quantity, address _to)
        private
        returns (uint256 shipmentId)
    {
        require(LOTS.lotExists(_lotId), UnknownLot(_lotId));
        require(_quantity > 0, ZeroQuantity());
        require(_to != msg.sender, SelfShipment());
        require(_holdsMaterialRole(_to), RecipientNotEligible(_to));
        require(
            LOTS.balanceOf(msg.sender, _lotId) >= _quantity,
            InsufficientMaterial(msg.sender, _lotId, _quantity)
        );

        shipmentId = ++shipmentCount;
        _shipments[shipmentId] = Shipment({
            from: msg.sender,
            to: _to,
            lotId: _lotId,
            quantity: _quantity,
            status: ShipmentStatus.Pending
        });

        emit ShipmentDeclared(shipmentId, _lotId, msg.sender, _to, _quantity);
    }

    /// @notice Step 2: the recipient confirms reception and takes custody.
    /// @dev Free of charge: the sender already paid for the shipment, exactly
    ///      like the passport handoff.
    /// @param _shipmentId The shipment being accepted.
    function acceptShipment(uint256 _shipmentId) external {
        Shipment storage shipment = _shipments[_shipmentId];
        require(shipment.to == msg.sender, NotShipmentRecipient(_shipmentId, msg.sender));
        require(shipment.status == ShipmentStatus.Pending, ShipmentSettled(_shipmentId));

        shipment.status = ShipmentStatus.Accepted;
        LOTS.transferCustody(shipment.from, msg.sender, shipment.lotId, shipment.quantity);

        emit ShipmentAccepted(_shipmentId, shipment.lotId, msg.sender);
    }

    /// @notice Cancels a shipment that was never accepted.
    /// @dev Open to the sender only. Without it a mistyped recipient would pin
    ///      a quantity to a shipment nobody will ever accept.
    /// @param _shipmentId The shipment being cancelled.
    function cancelShipment(uint256 _shipmentId) external {
        Shipment storage shipment = _shipments[_shipmentId];
        require(shipment.from == msg.sender, NotShipmentSender(_shipmentId, msg.sender));
        require(shipment.status == ShipmentStatus.Pending, ShipmentSettled(_shipmentId));

        shipment.status = ShipmentStatus.Cancelled;

        emit ShipmentCancelled(_shipmentId, shipment.lotId, msg.sender);
    }

    // ==================================================
    //                  MATERIAL ORDERS
    // ==================================================

    /// @notice Orders material from a distributor, or from a manufacturer.
    /// @dev Open to anyone allowed to hold material: a laboratory or a practice
    ///      orders from its distributor, and a distributor short on stock
    ///      orders upstream through `escalateMaterialOrder`.
    /// @param _supplier The distributor or manufacturer asked to supply.
    /// @param _material The material ordered, as named in the shared picker.
    /// @param _quantity The quantity ordered.
    /// @return orderId The id of the order.
    function placeMaterialOrder(
        address _supplier,
        string calldata _material,
        uint256 _quantity
    ) external costsCredit returns (uint256 orderId) {
        orderId = _placeMaterialOrder(_supplier, _material, _quantity, 0);
    }

    /// @notice Orders upstream to satisfy an order one cannot fulfil.
    /// @dev The traced half of the cascade: the supplier of `_parentOrderId`
    ///      becomes the buyer of a new order, and the link between the two is
    ///      recorded. The parent stays pending — nothing is promised to the
    ///      original buyer until the material actually arrives.
    /// @param _parentOrderId The order that motivated this one.
    /// @param _supplier The upstream supplier.
    /// @param _quantity The quantity ordered upstream.
    /// @return orderId The id of the new order.
    function escalateMaterialOrder(
        uint256 _parentOrderId,
        address _supplier,
        uint256 _quantity
    ) external costsCredit returns (uint256 orderId) {
        MaterialOrder storage parent = _materialOrders[_parentOrderId];
        require(parent.supplier == msg.sender, NotOrderSupplier(_parentOrderId, msg.sender));
        require(parent.status == OrderStatus.Pending, OrderSettled(_parentOrderId));

        orderId = _placeMaterialOrder(_supplier, parent.material, _quantity, _parentOrderId);
    }

    function _placeMaterialOrder(
        address _supplier,
        string memory _material,
        uint256 _quantity,
        uint256 _parentOrderId
    ) private returns (uint256 orderId) {
        require(_holdsMaterialRole(msg.sender), RecipientNotEligible(msg.sender));
        require(_quantity > 0, ZeroQuantity());
        require(_supplier != msg.sender, SelfShipment());
        require(
            ROLES.hasRole(ROLES.DISTRIBUTOR_ROLE(), _supplier)
                || ROLES.hasRole(ROLES.MANUFACTURER_ROLE(), _supplier),
            SupplierNotEligible(_supplier)
        );
        _checkMemoryText(_material, MAX_SHORT);

        orderId = ++materialOrderCount;
        _materialOrders[orderId] = MaterialOrder({
            buyer: msg.sender,
            status: OrderStatus.Pending,
            supplier: _supplier,
            quantity: _quantity,
            material: _material,
            parentOrderId: _parentOrderId,
            shipmentId: 0,
            reason: ""
        });

        emit MaterialOrdered(
            orderId, msg.sender, _supplier, _material, _quantity, _parentOrderId
        );
    }

    /// @notice Fulfils an order by shipping the material from one of your lots.
    /// @dev The order produces a shipment, which the buyer still has to accept:
    ///      ordering never forces custody on anyone. The lot must be made of
    ///      the material that was ordered — otherwise "I ordered zirconia and
    ///      received cobalt-chrome" would be a valid state of the registry.
    /// @param _orderId The order being fulfilled.
    /// @param _lotId The lot the material is taken from.
    /// @return shipmentId The shipment created.
    function fulfilMaterialOrder(uint256 _orderId, uint64 _lotId)
        external
        costsCredit
        returns (uint256 shipmentId)
    {
        MaterialOrder storage order = _materialOrders[_orderId];
        require(order.supplier == msg.sender, NotOrderSupplier(_orderId, msg.sender));
        require(order.status == OrderStatus.Pending, OrderSettled(_orderId));
        string memory offered = LOTS.lotOf(_lotId).material;
        require(
            keccak256(bytes(offered)) == keccak256(bytes(order.material)),
            MaterialMismatch(_orderId, order.material, offered)
        );

        shipmentId = _declareShipment(_lotId, order.quantity, order.buyer);
        order.status = OrderStatus.Fulfilled;
        order.shipmentId = shipmentId;

        emit MaterialOrderSettled(_orderId, OrderStatus.Fulfilled, "");
    }

    /// @notice Declines an order, with a reason the buyer can read.
    /// @param _orderId The order being refused.
    /// @param _reason Why — out of stock, material discontinued, unknown buyer…
    function refuseMaterialOrder(uint256 _orderId, string calldata _reason) external {
        MaterialOrder storage order = _materialOrders[_orderId];
        require(order.supplier == msg.sender, NotOrderSupplier(_orderId, msg.sender));
        require(order.status == OrderStatus.Pending, OrderSettled(_orderId));
        _checkText(_reason, MAX_TEXT);

        order.status = OrderStatus.Refused;
        order.reason = _reason;

        emit MaterialOrderSettled(_orderId, OrderStatus.Refused, _reason);
    }

    /// @notice Withdraws an order, with a reason the supplier can read.
    /// @param _orderId The order being cancelled.
    /// @param _reason Why — sourced elsewhere, quantity mistake…
    function cancelMaterialOrder(uint256 _orderId, string calldata _reason) external {
        MaterialOrder storage order = _materialOrders[_orderId];
        require(order.buyer == msg.sender, NotOrderBuyer(_orderId, msg.sender));
        require(order.status == OrderStatus.Pending, OrderSettled(_orderId));
        _checkText(_reason, MAX_TEXT);

        order.status = OrderStatus.Cancelled;
        order.reason = _reason;

        emit MaterialOrderSettled(_orderId, OrderStatus.Cancelled, _reason);
    }

    // ==================================================
    //                PROSTHESIS REQUESTS
    // ==================================================

    /// @notice Asks a laboratory for a prosthesis. Step 0 of the flow.
    /// @dev A practitioner who is also a laboratory may address itself — the
    ///      chairside case — so no self-check here: the request is a record of
    ///      the prescription, not a transfer.
    /// @param _lab The laboratory asked to manufacture.
    /// @param _material The material wanted, as named in the shared picker.
    /// @param _tooth The tooth it is meant for, in FDI notation.
    /// @param _shade The shade, e.g. "A2".
    /// @param _description The short prescription, readable by the laboratory.
    /// @return requestId The id of the request.
    function requestProsthesis(
        address _lab,
        string calldata _material,
        uint8 _tooth,
        string calldata _shade,
        string calldata _description
    ) external onlyRole(ROLES.PRACTITIONER_ROLE()) costsCredit returns (uint256 requestId) {
        require(ROLES.hasRole(ROLES.LAB_ROLE(), _lab), RecipientNotEligible(_lab));
        _checkText(_material, MAX_SHORT);
        _requireValidTooth(_tooth);
        _checkText(_shade, MAX_SHADE);
        _checkText(_description, MAX_TEXT);

        requestId = ++prosthesisRequestCount;
        _requests[requestId] = ProsthesisRequest({
            practitioner: msg.sender,
            status: RequestStatus.Pending,
            lab: _lab,
            tooth: _tooth,
            tokenId: 0,
            material: _material,
            shade: _shade,
            description: _description,
            reason: ""
        });

        emit ProsthesisRequested(requestId, msg.sender, _lab, _material, _tooth);
    }

    /// @notice The laboratory takes the request on.
    /// @param _requestId The request being accepted.
    function acceptProsthesisRequest(uint256 _requestId) external {
        ProsthesisRequest storage request = _requests[_requestId];
        require(request.lab == msg.sender, NotRequestLab(_requestId, msg.sender));
        require(
            request.status == RequestStatus.Pending,
            WrongRequestStatus(_requestId, RequestStatus.Pending, request.status)
        );

        request.status = RequestStatus.Accepted;

        emit ProsthesisRequestUpdated(_requestId, RequestStatus.Accepted, "");
    }

    /// @notice The laboratory declines, with a reason.
    /// @param _requestId The request being refused.
    /// @param _reason Why — material unavailable, prescription incomplete…
    function refuseProsthesisRequest(uint256 _requestId, string calldata _reason) external {
        ProsthesisRequest storage request = _requests[_requestId];
        require(request.lab == msg.sender, NotRequestLab(_requestId, msg.sender));
        require(
            request.status == RequestStatus.Pending,
            WrongRequestStatus(_requestId, RequestStatus.Pending, request.status)
        );
        _checkText(_reason, MAX_TEXT);

        request.status = RequestStatus.Refused;
        request.reason = _reason;

        emit ProsthesisRequestUpdated(_requestId, RequestStatus.Refused, _reason);
    }

    /// @notice The practitioner withdraws the request, with a reason.
    /// @dev Possible while the laboratory has not manufactured yet — including
    ///      after acceptance, because a patient cancels an appointment.
    /// @param _requestId The request being cancelled.
    /// @param _reason Why — patient withdrew, plan changed…
    function cancelProsthesisRequest(uint256 _requestId, string calldata _reason) external {
        ProsthesisRequest storage request = _requests[_requestId];
        require(
            request.practitioner == msg.sender,
            NotRequestPractitioner(_requestId, msg.sender)
        );
        require(
            request.status == RequestStatus.Pending || request.status == RequestStatus.Accepted,
            WrongRequestStatus(_requestId, RequestStatus.Pending, request.status)
        );
        _checkText(_reason, MAX_TEXT);

        request.status = RequestStatus.Cancelled;
        request.reason = _reason;

        emit ProsthesisRequestUpdated(_requestId, RequestStatus.Cancelled, _reason);
    }

    /// @dev Bounds on the free text the registry stores. Short on purpose: a
    ///      shade is three characters, a prescription line is a sentence. What
    ///      does not fit belongs in the conformity file, whose fingerprint is
    ///      already anchored.
    uint256 private constant MAX_TEXT = 200;
    uint256 private constant MAX_SHADE = 16;
    /// @dev 31 octets : la limite au-delà de laquelle une chaîne Solidity cesse
    ///      de tenir dans un seul slot. Une matière et une unité restent donc
    ///      aussi économiques qu'un identifiant numérique.
    uint256 private constant MAX_SHORT = 31;

    function _checkText(string calldata _text, uint256 _max) private pure {
        uint256 length = bytes(_text).length;
        require(length > 0 && length <= _max, InvalidText());
    }

    function _checkMemoryText(string memory _text, uint256 _max) private pure {
        uint256 length = bytes(_text).length;
        require(length > 0 && length <= _max, InvalidText());
    }

    /// @dev FDI notation (ISO 3950): first digit the quadrant, second the
    ///      position. Shared by the request and the placement.
    function _requireValidTooth(uint8 _tooth) private pure {
        uint8 quadrant = _tooth / 10;
        uint8 position = _tooth % 10;
        require(
            quadrant >= 1 && quadrant <= 8 && position >= 1 && position <= 8,
            InvalidTooth(_tooth)
        );
    }

    /// @dev The actors allowed to hold material. The regulator is not one of
    ///      them: it reads and recalls, it never takes custody.
    function _holdsMaterialRole(address _account) private view returns (bool) {
        return ROLES.hasRole(ROLES.MANUFACTURER_ROLE(), _account)
            || ROLES.hasRole(ROLES.DISTRIBUTOR_ROLE(), _account)
            || ROLES.hasRole(ROLES.LAB_ROLE(), _account)
            || ROLES.hasRole(ROLES.PRACTITIONER_ROLE(), _account);
    }

    // ==================================================
    //                    LAB FUNCTIONS
    // ==================================================

    /// @notice Mints the passport of a manufactured device and consumes the
    ///         material it was made of.
    /// @dev The matter-to-device link is established in the very transaction
    ///      that creates the passport, so it can never be reconstructed after
    ///      the fact. The burn runs before the mint (checks-effects-
    ///      interactions on the material side) and reverts on insufficient
    ///      balance through the ERC-1155 store itself.
    ///
    ///      What matters is HOLDING the material, not having produced it: the
    ///      laboratory consumes a lot it received from a distributor, and the
    ///      lot keeps pointing at the manufacturer that made it.
    ///      `_requestId` binds the prosthesis to the prescription it answers.
    ///      Zero is allowed: a laboratory may manufacture without a request on
    ///      the registry — but then nothing links the device to a practitioner,
    ///      and the traceability starts one step later.
    /// @param _requestId The request being fulfilled, or 0 for none.
    /// @param _lotId The lot the device was made from.
    /// @param _quantity The quantity of material consumed.
    /// @param _conformityHash Fingerprint of the off-chain conformity file.
    /// @return tokenId The id of the minted passport.
    function mintPassport(
        uint256 _requestId,
        uint64 _lotId,
        uint256 _quantity,
        bytes32 _conformityHash
    ) external onlyRole(ROLES.LAB_ROLE()) costsCredit returns (uint256 tokenId) {
        if (_requestId != 0) {
            ProsthesisRequest storage request = _requests[_requestId];
            require(request.lab == msg.sender, NotRequestLab(_requestId, msg.sender));
            require(
                request.status == RequestStatus.Accepted,
                WrongRequestStatus(_requestId, RequestStatus.Accepted, request.status)
            );
        }
        require(LOTS.lotExists(_lotId), UnknownLot(_lotId));
        require(_quantity > 0, ZeroQuantity());
        require(_quantity <= type(uint128).max, QuantityTooLarge(_quantity));
        require(_conformityHash != bytes32(0), EmptyHash());

        LOTS.burnForManufacturing(msg.sender, _lotId, _quantity);
        tokenId = PASSPORTS.mint(msg.sender, _lotId, uint128(_quantity), _conformityHash);

        emit MaterialConsumed(tokenId, _lotId, _quantity);

        if (_requestId != 0) {
            ProsthesisRequest storage request = _requests[_requestId];
            request.status = RequestStatus.Fulfilled;
            request.tokenId = tokenId;

            emit ProsthesisRequestUpdated(_requestId, RequestStatus.Fulfilled, "");
        }
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
        costsCredit
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
    ///      The tooth is in FDI notation (ISO 3950), the international standard
    ///      a dentist already uses: first digit the quadrant, second the
    ///      position - 11 to 18, 21 to 28, and so on. It is clinical data about
    ///      a device, not about a person: on its own it identifies nobody.
    /// @param _tokenId The passport being placed.
    /// @param _tooth The tooth it is placed on, in FDI notation.
    /// @param _patientCommitment Salted commitment to the patient's identity.
    function markPlaced(uint256 _tokenId, uint8 _tooth, bytes32 _patientCommitment)
        external
        onlyRole(ROLES.PRACTITIONER_ROLE())
        onlyHolder(_tokenId)
        onlyStatus(_tokenId, Status.Certified)
        costsCredit
    {
        require(_patientCommitment != bytes32(0), EmptyHash());
        _requireValidTooth(_tooth);

        _status[_tokenId] = Status.Placed;
        _commitment[_tokenId] = _patientCommitment;
        _placement[_tokenId] = Placement({
            practitioner: msg.sender,
            placedAt: uint40(block.timestamp),
            tooth: _tooth
        });

        emit PlacedInMouth(_tokenId, msg.sender, _tooth, _patientCommitment);
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
    function initiateHandoff(uint256 _tokenId, address _to)
        external
        onlyHolder(_tokenId)
        costsCredit
    {
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

    /// @notice A shipment record.
    /// @param _shipmentId The shipment to read.
    /// @return The stored shipment.
    function shipmentOf(uint256 _shipmentId) external view returns (Shipment memory) {
        return _shipments[_shipmentId];
    }

    /// @notice A material order record.
    /// @param _orderId The order to read.
    /// @return The stored order.
    function materialOrderOf(uint256 _orderId) external view returns (MaterialOrder memory) {
        return _materialOrders[_orderId];
    }

    /// @notice A prosthesis request record.
    /// @param _requestId The request to read.
    /// @return The stored request.
    function prosthesisRequestOf(uint256 _requestId)
        external
        view
        returns (ProsthesisRequest memory)
    {
        return _requests[_requestId];
    }

    /// @notice The salted commitment binding a device to a patient.
    /// @param _tokenId The passport to read.
    /// @return The commitment, or zero before placement.
    function patientCommitmentOf(uint256 _tokenId) external view returns (bytes32) {
        return _commitment[_tokenId];
    }

    /// @notice The clinical act: who placed the device, when, and on which tooth.
    /// @dev A single call, no log scan: this is what a practitioner scanning a
    ///      patient's passport needs to read on the spot.
    /// @param _tokenId The passport to read.
    /// @return The placement record, zeroed before placement.
    function placementOf(uint256 _tokenId) external view returns (Placement memory) {
        return _placement[_tokenId];
    }
}
