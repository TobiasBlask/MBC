// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC3643} from "../interfaces/IERC3643.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {ICompliance} from "../interfaces/ICompliance.sol";

/// @title ProjectToken - Minimal ERC-3643 (T-REX) compliant project token.
///
/// Every holder must be verified in the linked IdentityRegistry, and every
/// transfer must also pass the linked Compliance module. Agents (typically the
/// factory marketplace and the project creator) can mint, burn, freeze, pause
/// and perform forced transfers for recovery / regulatory scenarios.
///
/// This implementation is written from scratch (no OpenZeppelin, no T-REX
/// library). It implements the subset of the ERC-3643 interface that a simple
/// fixed-price primary issuance marketplace actually needs.
contract ProjectToken is IERC3643 {
    // ---------------------------------------------------------------------
    // ERC-20 state
    // ---------------------------------------------------------------------
    string private _name;
    string private _symbol;
    uint8 public constant override decimals = 18;
    uint256 private _totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    // ---------------------------------------------------------------------
    // ERC-3643 state
    // ---------------------------------------------------------------------
    string private constant _VERSION = "ERC-3643-minimal-0.1";
    address public onchainID;
    IIdentityRegistry private _identityRegistry;
    ICompliance private _compliance;

    bool private _paused;
    mapping(address => bool) private _frozen;
    mapping(address => uint256) private _frozenTokens;

    // ---------------------------------------------------------------------
    // Roles
    // ---------------------------------------------------------------------
    address public owner;
    mapping(address => bool) private _agents;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AgentAdded(address indexed agent);
    event AgentRemoved(address indexed agent);

    modifier onlyOwner() {
        require(msg.sender == owner, "ProjectToken: not owner");
        _;
    }

    modifier onlyAgent() {
        require(_agents[msg.sender] || msg.sender == owner, "ProjectToken: not agent");
        _;
    }

    modifier whenNotPaused() {
        require(!_paused, "ProjectToken: paused");
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------
    constructor(
        string memory name_,
        string memory symbol_,
        address _owner,
        address identityRegistry_,
        address compliance_,
        address _onchainID
    ) {
        require(_owner != address(0), "ProjectToken: owner=0");
        require(identityRegistry_ != address(0), "ProjectToken: registry=0");
        require(compliance_ != address(0), "ProjectToken: compliance=0");

        _name = name_;
        _symbol = symbol_;
        owner = _owner;
        _identityRegistry = IIdentityRegistry(identityRegistry_);
        _compliance = ICompliance(compliance_);
        onchainID = _onchainID;

        emit OwnershipTransferred(address(0), _owner);
        emit IdentityRegistryAdded(identityRegistry_);
        emit ComplianceAdded(compliance_);
    }

    // ---------------------------------------------------------------------
    // Ownership / agents
    // ---------------------------------------------------------------------
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ProjectToken: newOwner=0");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function addAgent(address agent) external onlyOwner {
        require(agent != address(0), "ProjectToken: agent=0");
        require(!_agents[agent], "ProjectToken: already agent");
        _agents[agent] = true;
        emit AgentAdded(agent);
    }

    function removeAgent(address agent) external onlyOwner {
        require(_agents[agent], "ProjectToken: not an agent");
        _agents[agent] = false;
        emit AgentRemoved(agent);
    }

    function isAgent(address agent) external view returns (bool) {
        return _agents[agent];
    }

    // ---------------------------------------------------------------------
    // ERC-3643 views
    // ---------------------------------------------------------------------
    function name() external view returns (string memory) { return _name; }
    function symbol() external view returns (string memory) { return _symbol; }
    function totalSupply() external view returns (uint256) { return _totalSupply; }
    function balanceOf(address account) external view returns (uint256) { return _balances[account]; }
    function allowance(address owner_, address spender) external view returns (uint256) {
        return _allowances[owner_][spender];
    }

    function version() external pure returns (string memory) { return _VERSION; }
    function identityRegistry() external view returns (IIdentityRegistry) { return _identityRegistry; }
    function compliance() external view returns (ICompliance) { return _compliance; }
    function paused() external view returns (bool) { return _paused; }
    function isFrozen(address userAddress) external view returns (bool) { return _frozen[userAddress]; }
    function getFrozenTokens(address userAddress) external view returns (uint256) { return _frozenTokens[userAddress]; }

    // ---------------------------------------------------------------------
    // Pause / freeze admin
    // ---------------------------------------------------------------------
    function pause() external onlyAgent {
        require(!_paused, "ProjectToken: already paused");
        _paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyAgent {
        require(_paused, "ProjectToken: not paused");
        _paused = false;
        emit Unpaused(msg.sender);
    }

    function setAddressFrozen(address userAddress, bool freeze) external onlyAgent {
        _frozen[userAddress] = freeze;
        emit AddressFrozen(userAddress, freeze, msg.sender);
    }

    function freezePartialTokens(address userAddress, uint256 amount) external onlyAgent {
        uint256 free = _balances[userAddress] - _frozenTokens[userAddress];
        require(free >= amount, "ProjectToken: not enough free balance");
        _frozenTokens[userAddress] += amount;
        emit TokensFrozen(userAddress, amount);
    }

    function unfreezePartialTokens(address userAddress, uint256 amount) external onlyAgent {
        require(_frozenTokens[userAddress] >= amount, "ProjectToken: not enough frozen");
        _frozenTokens[userAddress] -= amount;
        emit TokensUnfrozen(userAddress, amount);
    }

    function setIdentityRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "ProjectToken: registry=0");
        _identityRegistry = IIdentityRegistry(_registry);
        emit IdentityRegistryAdded(_registry);
    }

    function setCompliance(address _comp) external onlyOwner {
        require(_comp != address(0), "ProjectToken: compliance=0");
        _compliance = ICompliance(_comp);
        emit ComplianceAdded(_comp);
    }

    // ---------------------------------------------------------------------
    // Mint / burn
    // ---------------------------------------------------------------------
    function mint(address to, uint256 amount) external onlyAgent whenNotPaused {
        require(to != address(0), "ProjectToken: mint to 0");
        require(_identityRegistry.isVerified(to), "ProjectToken: receiver not verified");

        _totalSupply += amount;
        unchecked { _balances[to] += amount; }
        emit Transfer(address(0), to, amount);

        _compliance.created(to, amount);
    }

    function burn(address userAddress, uint256 amount) external onlyAgent {
        uint256 bal = _balances[userAddress];
        require(bal >= amount, "ProjectToken: burn > balance");

        // If the account holds frozen tokens, auto-unfreeze the minimum needed
        // so the burn can succeed; this matches the T-REX reference behavior.
        uint256 free = bal - _frozenTokens[userAddress];
        if (amount > free) {
            uint256 toUnfreeze = amount - free;
            _frozenTokens[userAddress] -= toUnfreeze;
            emit TokensUnfrozen(userAddress, toUnfreeze);
        }

        unchecked {
            _balances[userAddress] = bal - amount;
            _totalSupply -= amount;
        }
        emit Transfer(userAddress, address(0), amount);

        _compliance.destroyed(userAddress, amount);
    }

    // ---------------------------------------------------------------------
    // ERC-20 transfers (with ERC-3643 checks)
    // ---------------------------------------------------------------------
    function approve(address spender, uint256 value) external returns (bool) {
        _allowances[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external whenNotPaused returns (bool) {
        _checkedTransfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external whenNotPaused returns (bool) {
        uint256 allowed = _allowances[from][msg.sender];
        require(allowed >= value, "ProjectToken: insufficient allowance");
        if (allowed != type(uint256).max) {
            unchecked { _allowances[from][msg.sender] = allowed - value; }
        }
        _checkedTransfer(from, to, value);
        return true;
    }

    function _checkedTransfer(address from, address to, uint256 value) internal {
        require(to != address(0), "ProjectToken: to=0");
        require(!_frozen[from], "ProjectToken: sender frozen");
        require(!_frozen[to], "ProjectToken: receiver frozen");

        uint256 bal = _balances[from];
        uint256 free = bal - _frozenTokens[from];
        require(free >= value, "ProjectToken: insufficient free balance");

        require(_identityRegistry.isVerified(to), "ProjectToken: receiver not verified");
        require(_compliance.canTransfer(from, to, value), "ProjectToken: compliance denied");

        unchecked {
            _balances[from] = bal - value;
            _balances[to] += value;
        }
        emit Transfer(from, to, value);

        _compliance.transferred(from, to, value);
    }

    // ---------------------------------------------------------------------
    // Forced transfer / recovery
    // ---------------------------------------------------------------------
    /// @notice Agent-triggered transfer that bypasses pause and the sender's
    ///         frozen state, auto-unfreezing as many tokens as necessary.
    ///         Recipient must still be a verified identity.
    function forcedTransfer(address from, address to, uint256 value) external onlyAgent returns (bool) {
        require(to != address(0), "ProjectToken: to=0");
        require(_identityRegistry.isVerified(to), "ProjectToken: receiver not verified");

        uint256 bal = _balances[from];
        require(bal >= value, "ProjectToken: insufficient balance");

        uint256 free = bal - _frozenTokens[from];
        if (value > free) {
            uint256 toUnfreeze = value - free;
            _frozenTokens[from] -= toUnfreeze;
            emit TokensUnfrozen(from, toUnfreeze);
        }

        unchecked {
            _balances[from] = bal - value;
            _balances[to] += value;
        }
        emit Transfer(from, to, value);

        _compliance.transferred(from, to, value);
        return true;
    }

    /// @notice Move the entire balance of a lost wallet to a new wallet after
    ///         the new wallet's identity has been (re-)registered. The lost
    ///         wallet is frozen afterwards to prevent any residual activity.
    function recoveryAddress(
        address lostWallet,
        address newWallet,
        address investorOnchainID
    ) external onlyAgent returns (bool) {
        require(_balances[lostWallet] > 0, "ProjectToken: nothing to recover");
        require(_identityRegistry.isVerified(newWallet), "ProjectToken: new wallet not verified");

        uint256 frozenAmt = _frozenTokens[lostWallet];
        uint256 bal = _balances[lostWallet];

        // Move full balance
        unchecked {
            _balances[lostWallet] = 0;
            _balances[newWallet] += bal;
        }
        if (frozenAmt > 0) {
            _frozenTokens[lostWallet] = 0;
            _frozenTokens[newWallet] += frozenAmt;
            emit TokensFrozen(newWallet, frozenAmt);
        }
        _frozen[lostWallet] = true;
        emit AddressFrozen(lostWallet, true, msg.sender);

        emit Transfer(lostWallet, newWallet, bal);
        emit RecoverySuccess(lostWallet, newWallet, investorOnchainID);
        return true;
    }
}
