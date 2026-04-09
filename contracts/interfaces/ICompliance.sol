// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICompliance - Minimal ERC-3643 compliance interface.
///        In the full T-REX stack this is a modular rules engine (max holders,
///        country restrictions, accredited-investor caps, etc.). Here the
///        implementation is intentionally trivial: it only checks that both
///        sides of a transfer are verified by the bound IdentityRegistry.
interface ICompliance {
    event TokenBound(address indexed token);
    event TokenUnbound(address indexed token);

    function bindToken(address token) external;
    function unbindToken(address token) external;
    function boundToken() external view returns (address);

    /// @notice Pure pre-flight check. Returns false if the transfer would
    ///         violate compliance rules; the token contract MUST revert in that
    ///         case before touching balances.
    function canTransfer(address from, address to, uint256 amount) external view returns (bool);

    /// @notice Hooks called by the token AFTER state changes so compliance
    ///         modules can update any internal accounting.
    function transferred(address from, address to, uint256 amount) external;
    function created(address to, uint256 amount) external;
    function destroyed(address from, uint256 amount) external;
}
