// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IIdentityRegistry - Minimal self-authored ERC-3643 identity registry.
///        In the full T-REX stack the identity registry delegates to a
///        trusted-issuer registry, claim-topics registry, and ONCHAINID claim
///        verification. Here we collapse all of that into an owner- and
///        agent-managed whitelist: an identity is "verified" iff an agent
///        explicitly registered it. That is enough for a simple project
///        financing platform, while staying interface-compatible with ERC-3643.
interface IIdentityRegistry {
    event IdentityRegistered(address indexed userAddress, address indexed identity, uint16 country);
    event IdentityRemoved(address indexed userAddress, address indexed identity);
    event IdentityUpdated(address indexed userAddress, address indexed oldIdentity, address indexed newIdentity);
    event CountryUpdated(address indexed userAddress, uint16 indexed country);
    event AgentAdded(address indexed agent);
    event AgentRemoved(address indexed agent);

    function isVerified(address userAddress) external view returns (bool);
    function contains(address userAddress) external view returns (bool);
    function identity(address userAddress) external view returns (address);
    function investorCountry(address userAddress) external view returns (uint16);

    function registerIdentity(address userAddress, address onchainID, uint16 country) external;
    function deleteIdentity(address userAddress) external;
    function updateIdentity(address userAddress, address newIdentity) external;
    function updateCountry(address userAddress, uint16 country) external;

    function addAgent(address agent) external;
    function removeAgent(address agent) external;
    function isAgent(address agent) external view returns (bool);
}
