// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {CatentaRoles} from "../access/CatentaRoles.sol";
import {RoleAware} from "../access/RoleAware.sol";

/// @title CatentaCredit ($CATENTA) - prepaid usage credit for on-chain actions
/// @author Catenta
/// @notice A closed-loop usage credit, NOT a financial asset. One credit is
///         spent (burned) per useful on-chain action. Actors receive credits
///         against an off-chain subscription; when they run out, they renew.
/// @dev PERMANENT STORE. Holds balances, so it is deployed once and never
///      replaced, like PassportNFT and MaterialLots.
///
///      Three properties make it a credit and not a currency, and keep it
///      clearly outside the scope of a tradable/speculative token:
///
///      1. NON-TRANSFERABLE. Only mint (from == 0) and burn (to == 0) are
///         allowed; actor-to-actor transfers revert. There is therefore no
///         order book, no market, no price discovery — it cannot be listed or
///         traded, by construction.
///      2. MINT-CONTROLLED, NO CAP. Only CREDIT_MINTER_ROLE creates credits,
///         against an off-chain payment. No hard cap, because credits are
///         continuously burned and must be re-issued at each renewal — a cap
///         would eventually freeze the system. Circulating supply at any time
///         equals the credits prepaid but not yet used.
///      3. BURNED ON USE, NOT RECYCLED. A spent credit is destroyed, not moved
///         to a treasury. The money already changed hands off-chain at mint
///         time; recycling would turn the credit into a circulating currency
///         and reopen the regulatory questions this design avoids. Rewarding
///         actors, when introduced, will MINT bonus credits (a discount on
///         future usage), never recycle spent ones.
///
///      Decimals = 0: a credit is a whole unit. Balances read "100", "99"…,
///      and "1 credit" is literally 1.
contract CatentaCredit is ERC20, RoleAware {
    /// @notice Credits granted once to a freshly onboarded actor.
    uint256 public constant INITIAL_CREDITS = 100;

    /// @dev Tracks the one-time initial grant, so it cannot be claimed twice.
    mapping(address account => bool) private _initialGranted;

    /// @notice Emitted on the one-time initial allocation to an actor.
    /// @param account The onboarded actor.
    /// @param amount The number of credits granted (INITIAL_CREDITS).
    event InitialCreditsGranted(address indexed account, uint256 amount);

    /// @notice Emitted when credits are minted against a paid subscription.
    /// @param account The actor credited.
    /// @param amount The number of credits minted.
    event CreditsMinted(address indexed account, uint256 amount);

    /// @notice Emitted when credits are spent (burned) on an action.
    /// @param account The actor whose credits were spent.
    /// @param amount The number of credits burned.
    event CreditsSpent(address indexed account, uint256 amount);

    /// @notice Credits cannot be transferred between accounts.
    error CreditsNotTransferable();
    /// @notice The initial allocation has already been granted to this account.
    error InitialAlreadyGranted(address account);
    /// @notice The account does not hold enough credits for this action.
    error InsufficientCredits(address account, uint256 balance, uint256 needed);

    /// @notice Deploys the credit token bound to the shared authority.
    /// @param _roles The shared access authority.
    constructor(CatentaRoles _roles)
        ERC20("Catenta Usage Credit", "CATENTA")
        RoleAware(_roles)
    {}

    /// @notice Grants the one-time initial allocation to a freshly onboarded actor.
    /// @dev Idempotent per address: guarded so it cannot be farmed. Ongoing
    ///      top-ups go through mintCredits.
    /// @param _to The actor to credit.
    function grantInitialCredits(address _to)
        external
        onlyRole(ROLES.CREDIT_MINTER_ROLE())
    {
        require(!_initialGranted[_to], InitialAlreadyGranted(_to));
        _initialGranted[_to] = true;
        _mint(_to, INITIAL_CREDITS);

        emit InitialCreditsGranted(_to, INITIAL_CREDITS);
    }

    /// @notice Mints credits against an off-chain payment (subscription renewal).
    /// @dev The fiat-to-credit bridge is off-chain; this is its on-chain side.
    /// @param _to The actor to credit.
    /// @param _amount The number of credits to mint.
    function mintCredits(address _to, uint256 _amount)
        external
        onlyRole(ROLES.CREDIT_MINTER_ROLE())
    {
        _mint(_to, _amount);

        emit CreditsMinted(_to, _amount);
    }

    /// @notice Spends (burns) an actor's credits on an action.
    /// @dev Role-gated rather than allowance-gated: the charging module burns
    ///      the caller's credit in the same transaction, without asking every
    ///      actor for an approve first. Reverts with a clear error rather than
    ///      the raw ERC-20 one so the front can explain "out of credits".
    /// @param _from The actor paying for the action.
    /// @param _amount The number of credits to burn.
    function spend(address _from, uint256 _amount)
        external
        onlyRole(ROLES.CREDIT_SPENDER_ROLE())
    {
        uint256 balance = balanceOf(_from);
        require(balance >= _amount, InsufficientCredits(_from, balance, _amount));
        _burn(_from, _amount);

        emit CreditsSpent(_from, _amount);
    }

    /// @notice Whether an account has already received its initial allocation.
    /// @param _account The account to check.
    /// @return True once grantInitialCredits has run for it.
    function hasReceivedInitial(address _account) external view returns (bool) {
        return _initialGranted[_account];
    }

    /// @notice A credit is a whole, countable unit.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /// @dev Non-transferable: only mint (from == 0) and burn (to == 0) pass.
    ///      This is what removes any market for the token — there is no path
    ///      for a credit to move from one holder to another.
    function _update(address from, address to, uint256 value) internal override {
        require(from == address(0) || to == address(0), CreditsNotTransferable());
        super._update(from, to, value);
    }
}
