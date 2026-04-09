// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICompliance} from "../interfaces/ICompliance.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/// @title Compliance - Minimal ERC-3643 compliance module.
///
/// Rules enforced:
///  1. The transfer is not from or to the zero address (mint/burn go through
///     the dedicated `created` / `destroyed` hooks).
///  2. Both `from` and `to` are verified in the bound IdentityRegistry.
///
/// That is intentionally the smallest set of rules that still makes the token
/// genuinely permissioned. Real deployments would plug in additional modules
/// (max holders, country caps, lockups, etc.) behind this same interface.
contract Compliance is ICompliance {
    address public owner;
    address public override boundToken;
    IIdentityRegistry public immutable identityRegistry;

    modifier onlyOwner() {
        require(msg.sender == owner, "Compliance: not owner");
        _;
    }

    modifier onlyToken() {
        require(msg.sender == boundToken, "Compliance: not token");
        _;
    }

    constructor(address _owner, address _identityRegistry) {
        require(_owner != address(0), "Compliance: owner=0");
        require(_identityRegistry != address(0), "Compliance: registry=0");
        owner = _owner;
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Compliance: newOwner=0");
        owner = newOwner;
    }

    function bindToken(address token) external onlyOwner {
        require(token != address(0), "Compliance: token=0");
        require(boundToken == address(0), "Compliance: already bound");
        boundToken = token;
        emit TokenBound(token);
    }

    function unbindToken(address token) external onlyOwner {
        require(token == boundToken, "Compliance: not bound");
        boundToken = address(0);
        emit TokenUnbound(token);
    }

    function canTransfer(address from, address to, uint256 /*amount*/) external view returns (bool) {
        if (from == address(0) || to == address(0)) return false;
        if (!identityRegistry.isVerified(from)) return false;
        if (!identityRegistry.isVerified(to)) return false;
        return true;
    }

    // Hooks: no-ops in this minimal module, but kept so future modules can
    // accumulate per-holder / per-country statistics.
    function transferred(address from, address to, uint256 amount) external onlyToken {
        // no-op
        (from, to, amount);
    }

    function created(address to, uint256 amount) external onlyToken {
        // no-op
        (to, amount);
    }

    function destroyed(address from, uint256 amount) external onlyToken {
        // no-op
        (from, amount);
    }
}
