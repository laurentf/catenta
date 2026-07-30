// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {LifecycleModule} from "../modules/LifecycleModule.sol";

/// @title ReentrantLab - a laboratory that tries to re-enter during the mint
/// @author Catenta
/// @notice TEST ONLY. Never deployed by the Ignition module.
/// @dev PassportNFT.mint goes through _safeMint, which calls onERC721Received
///      on the laboratory. If the module marked a prosthesis request fulfilled
///      only AFTER the mint, this contract would re-enter through that callback
///      and obtain several passports for a single prescription.
///
///      Keeping this attacker in the suite is what makes the fix a regression
///      test rather than a comment: reorder the module the wrong way again and
///      this test fails.
contract ReentrantLab is IERC721Receiver {
    LifecycleModule public immutable MODULE;

    uint256 private _requestId;
    uint64 private _lotId;
    uint256 private _quantity;
    bytes32 private _conformityHash;
    bool private _armed;

    /// @notice Number of times the callback managed to re-enter successfully.
    uint256 public reenteredOk;

    constructor(LifecycleModule _module) {
        MODULE = _module;
    }

    /// @notice Takes custody of material shipped to this contract.
    function acceptShipment(uint256 _shipmentId) external {
        MODULE.acceptShipment(_shipmentId);
    }

    /// @notice Accepts a prescription addressed to this contract.
    function acceptRequest(uint256 _id) external {
        MODULE.acceptProsthesisRequest(_id);
    }

    /// @notice Mints once, and tries to mint again from inside the callback.
    function attack(
        uint256 _id,
        uint64 _lot,
        uint256 _qty,
        bytes32 _hash
    ) external returns (uint256) {
        _requestId = _id;
        _lotId = _lot;
        _quantity = _qty;
        _conformityHash = _hash;
        _armed = true;

        return MODULE.mintPassport(_id, _lot, _qty, _hash);
    }

    /// @inheritdoc IERC721Receiver
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        override
        returns (bytes4)
    {
        if (_armed) {
            _armed = false;
            // Une seconde émission contre la MÊME prescription. Elle doit
            // révoquer : la demande a déjà été consommée avant le mint.
            try MODULE.mintPassport(_requestId, _lotId, _quantity, _conformityHash) {
                ++reenteredOk;
            } catch {
                // comportement attendu
            }
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}
