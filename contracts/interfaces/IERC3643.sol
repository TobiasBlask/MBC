// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IIdentityRegistry} from "./IIdentityRegistry.sol";
import {ICompliance} from "./ICompliance.sol";

/// @title IERC3643 - Minimal self-authored interface for the ERC-3643 (T-REX)
///        permissioned-token standard. Only the subset used by this marketplace
///        is exposed; the standard defines more functions, but for a simple
///        regulated project-financing platform these are enough.
interface IERC3643 {
    // -------- ERC-20 subset (required by ERC-3643) --------
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);

    // -------- ERC-3643 additions --------
    event IdentityRegistryAdded(address indexed identityRegistry);
    event ComplianceAdded(address indexed compliance);
    event Paused(address account);
    event Unpaused(address account);
    event AddressFrozen(address indexed userAddress, bool indexed isFrozen, address indexed owner);
    event TokensFrozen(address indexed userAddress, uint256 amount);
    event TokensUnfrozen(address indexed userAddress, uint256 amount);
    event RecoverySuccess(address indexed lostWallet, address indexed newWallet, address indexed investorOnchainID);

    function version() external pure returns (string memory);
    function identityRegistry() external view returns (IIdentityRegistry);
    function compliance() external view returns (ICompliance);
    function paused() external view returns (bool);
    function isFrozen(address userAddress) external view returns (bool);
    function getFrozenTokens(address userAddress) external view returns (uint256);

    // admin actions (agent-gated in the implementation)
    function pause() external;
    function unpause() external;
    function setAddressFrozen(address userAddress, bool freeze) external;
    function freezePartialTokens(address userAddress, uint256 amount) external;
    function unfreezePartialTokens(address userAddress, uint256 amount) external;
    function setIdentityRegistry(address _identityRegistry) external;
    function setCompliance(address _compliance) external;

    // forced transfers & supply management (agent-gated)
    function forcedTransfer(address from, address to, uint256 amount) external returns (bool);
    function mint(address to, uint256 amount) external;
    function burn(address userAddress, uint256 amount) external;
    function recoveryAddress(address lostWallet, address newWallet, address investorOnchainID) external returns (bool);
}
