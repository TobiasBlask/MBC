// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/// @title IdentityRegistry - Minimal ERC-3643-style whitelist.
///
/// Design notes:
/// - Ownership and agent roles are kept deliberately simple (no Ownable lib,
///   no AccessControl). The factory wires up the roles at deployment time.
/// - "Verified" simply means "was registered by an agent and not deleted".
///   In a production system the registry would verify ONCHAINID claims from
///   trusted issuers; we skip that complexity without breaking the interface.
contract IdentityRegistry is IIdentityRegistry {
    struct Identity {
        address onchainID; // optional ONCHAINID contract, may be address(0)
        uint16 country;    // ISO 3166-1 numeric country code, 0 if unknown
        bool exists;
    }

    address public owner;
    mapping(address => Identity) private _identities;
    mapping(address => bool) private _agents;

    modifier onlyOwner() {
        require(msg.sender == owner, "IdentityRegistry: not owner");
        _;
    }

    modifier onlyAgent() {
        require(_agents[msg.sender] || msg.sender == owner, "IdentityRegistry: not agent");
        _;
    }

    constructor(address _owner) {
        require(_owner != address(0), "IdentityRegistry: owner=0");
        owner = _owner;
    }

    // -------- agent management --------

    function addAgent(address agent) external onlyOwner {
        require(agent != address(0), "IdentityRegistry: agent=0");
        require(!_agents[agent], "IdentityRegistry: already agent");
        _agents[agent] = true;
        emit AgentAdded(agent);
    }

    function removeAgent(address agent) external onlyOwner {
        require(_agents[agent], "IdentityRegistry: not an agent");
        _agents[agent] = false;
        emit AgentRemoved(agent);
    }

    function isAgent(address agent) external view returns (bool) {
        return _agents[agent];
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "IdentityRegistry: newOwner=0");
        owner = newOwner;
    }

    // -------- identity management --------

    function registerIdentity(address userAddress, address onchainID, uint16 country) external onlyAgent {
        require(userAddress != address(0), "IdentityRegistry: user=0");
        require(!_identities[userAddress].exists, "IdentityRegistry: already registered");
        _identities[userAddress] = Identity({onchainID: onchainID, country: country, exists: true});
        emit IdentityRegistered(userAddress, onchainID, country);
    }

    function deleteIdentity(address userAddress) external onlyAgent {
        require(_identities[userAddress].exists, "IdentityRegistry: not registered");
        address old = _identities[userAddress].onchainID;
        delete _identities[userAddress];
        emit IdentityRemoved(userAddress, old);
    }

    function updateIdentity(address userAddress, address newIdentity) external onlyAgent {
        Identity storage id = _identities[userAddress];
        require(id.exists, "IdentityRegistry: not registered");
        address old = id.onchainID;
        id.onchainID = newIdentity;
        emit IdentityUpdated(userAddress, old, newIdentity);
    }

    function updateCountry(address userAddress, uint16 country) external onlyAgent {
        Identity storage id = _identities[userAddress];
        require(id.exists, "IdentityRegistry: not registered");
        id.country = country;
        emit CountryUpdated(userAddress, country);
    }

    // -------- views --------

    function isVerified(address userAddress) external view returns (bool) {
        return _identities[userAddress].exists;
    }

    function contains(address userAddress) external view returns (bool) {
        return _identities[userAddress].exists;
    }

    function identity(address userAddress) external view returns (address) {
        return _identities[userAddress].onchainID;
    }

    function investorCountry(address userAddress) external view returns (uint16) {
        return _identities[userAddress].country;
    }
}
