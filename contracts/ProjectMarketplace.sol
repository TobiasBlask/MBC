// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProjectToken} from "./token/ProjectToken.sol";
import {IdentityRegistry} from "./token/IdentityRegistry.sol";
import {Compliance} from "./token/Compliance.sol";

interface IERC20Payment {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// @title ProjectMarketplace - Factory + primary-issuance marketplace for
///        ERC-3643 project tokens, paid in USDC, with on-chain KYC whitelist.
///
/// One call to `createProject` deploys three linked contracts:
///   1. IdentityRegistry - project-local KYC whitelist
///   2. Compliance       - minimal rules module (both sides verified)
///   3. ProjectToken     - ERC-3643 security token
///
/// The marketplace itself is pre-registered as a verified identity so it can
/// hold the initial supply and sell tokens to verified buyers at a fixed USDC
/// price. The project creator is granted agent rights on all three contracts
/// so they can whitelist new investors (KYC), pause trading, freeze accounts,
/// and recover lost wallets - exactly as an issuer of a regulated security
/// would need.
contract ProjectMarketplace {
    struct Project {
        address creator;
        address token;
        address identityRegistry;
        address compliance;
        string name;
        string description;
        uint256 pricePerToken;   // USDC base units (6dp) per 1 whole token (1e18 base units)
        uint256 tokensForSale;   // base units (1e18)
        uint256 tokensSold;      // base units
        uint256 usdcRaised;      // cumulative USDC received
        uint256 usdcWithdrawn;   // cumulative USDC withdrawn by creator
    }

    IERC20Payment public immutable usdc;
    uint256 public projectCount;
    mapping(uint256 => Project) private _projects;

    event ProjectCreated(
        uint256 indexed projectId,
        address indexed creator,
        address indexed token,
        address identityRegistry,
        address compliance,
        string name,
        uint256 totalSupply,
        uint256 pricePerToken
    );

    event InvestorWhitelisted(
        uint256 indexed projectId,
        address indexed investor,
        address indexed by,
        uint16 country
    );

    event InvestorRemoved(
        uint256 indexed projectId,
        address indexed investor,
        address indexed by
    );

    event TokensPurchased(
        uint256 indexed projectId,
        address indexed buyer,
        uint256 tokenAmount,
        uint256 usdcAmount
    );

    event FundsWithdrawn(
        uint256 indexed projectId,
        address indexed creator,
        uint256 amount
    );

    constructor(address _usdc) {
        require(_usdc != address(0), "Marketplace: usdc=0");
        usdc = IERC20Payment(_usdc);
    }

    // ---------------------------------------------------------------------
    // Project creation
    // ---------------------------------------------------------------------
    /// @notice Deploy a new project with its own token + identity registry +
    ///         compliance module, and mint the full supply to the marketplace
    ///         so it can sell at the fixed USDC price.
    /// @param name_          Human-readable name of the token
    /// @param symbol_        Ticker symbol
    /// @param description    Free-form description stored on-chain
    /// @param totalSupply    Total supply in WHOLE tokens (scaled by 1e18 internally)
    /// @param pricePerToken  Price for 1 whole token, in USDC base units (6dp)
    function createProject(
        string calldata name_,
        string calldata symbol_,
        string calldata description,
        uint256 totalSupply,
        uint256 pricePerToken
    ) external returns (uint256 projectId) {
        require(totalSupply > 0, "Marketplace: supply=0");
        require(pricePerToken > 0, "Marketplace: price=0");
        require(bytes(name_).length > 0, "Marketplace: name empty");
        require(bytes(symbol_).length > 0, "Marketplace: symbol empty");

        // 1. Deploy IdentityRegistry with the marketplace as owner so we can
        //    add agents immediately in the same tx.
        IdentityRegistry registry = new IdentityRegistry(address(this));

        // 2. Both the marketplace and the creator are agents. The creator
        //    performs KYC for investors, the marketplace is used as a sales
        //    relay and must itself be a verified holder.
        registry.addAgent(address(this));
        registry.addAgent(msg.sender);

        // 3. Pre-register the marketplace as a verified identity so it can
        //    legally hold the initial supply.
        registry.registerIdentity(address(this), address(0), 0);

        // 4. Deploy Compliance bound to this registry.
        Compliance comp = new Compliance(address(this), address(registry));

        // 5. Deploy the token, owned by the marketplace initially so the
        //    marketplace can add itself and the creator as agents in one tx.
        ProjectToken token = new ProjectToken(
            name_,
            symbol_,
            address(this),
            address(registry),
            address(comp),
            address(0) // onchainID: none for the token entity itself
        );

        token.addAgent(address(this));
        token.addAgent(msg.sender);

        // 6. Bind the compliance module to the token; from now on the
        //    compliance contract will only accept hook calls from the token.
        comp.bindToken(address(token));

        // 7. Mint the full supply to the marketplace. This succeeds because
        //    the marketplace is verified in the registry.
        uint256 scaledSupply = totalSupply * 1e18;
        token.mint(address(this), scaledSupply);

        // 8. Hand ownership of all three contracts to the creator. The
        //    marketplace retains its agent role so buyTokens keeps working.
        token.transferOwnership(msg.sender);
        registry.transferOwnership(msg.sender);
        comp.transferOwnership(msg.sender);

        // 9. Record the project.
        projectId = projectCount++;
        _projects[projectId] = Project({
            creator: msg.sender,
            token: address(token),
            identityRegistry: address(registry),
            compliance: address(comp),
            name: name_,
            description: description,
            pricePerToken: pricePerToken,
            tokensForSale: scaledSupply,
            tokensSold: 0,
            usdcRaised: 0,
            usdcWithdrawn: 0
        });

        emit ProjectCreated(
            projectId,
            msg.sender,
            address(token),
            address(registry),
            address(comp),
            name_,
            scaledSupply,
            pricePerToken
        );
    }

    // ---------------------------------------------------------------------
    // KYC whitelist management (creator-only convenience wrapper)
    // ---------------------------------------------------------------------
    /// @notice Whitelist an investor for a given project. Callable by the
    ///         project creator, who is an agent on the underlying registry.
    ///         The call is proxied to the registry so that (a) the event shows
    ///         the project context and (b) the frontend only needs the
    ///         marketplace ABI.
    function whitelistInvestor(
        uint256 projectId,
        address investor,
        uint16 country
    ) external {
        Project storage p = _projects[projectId];
        require(p.creator != address(0), "Marketplace: unknown project");
        require(msg.sender == p.creator, "Marketplace: not creator");

        IdentityRegistry(p.identityRegistry).registerIdentity(investor, address(0), country);
        emit InvestorWhitelisted(projectId, investor, msg.sender, country);
    }

    function removeInvestor(uint256 projectId, address investor) external {
        Project storage p = _projects[projectId];
        require(p.creator != address(0), "Marketplace: unknown project");
        require(msg.sender == p.creator, "Marketplace: not creator");

        IdentityRegistry(p.identityRegistry).deleteIdentity(investor);
        emit InvestorRemoved(projectId, investor, msg.sender);
    }

    function isInvestorWhitelisted(uint256 projectId, address investor) external view returns (bool) {
        Project storage p = _projects[projectId];
        if (p.creator == address(0)) return false;
        return IdentityRegistry(p.identityRegistry).isVerified(investor);
    }

    // ---------------------------------------------------------------------
    // Primary sale
    // ---------------------------------------------------------------------
    /// @notice Buy `tokenAmount` whole tokens of a project at the fixed price.
    ///         Caller must have approved this marketplace for the USDC cost
    ///         and must already be whitelisted in the project's identity
    ///         registry (via the creator calling `whitelistInvestor`).
    function buyTokens(uint256 projectId, uint256 tokenAmount) external {
        Project storage p = _projects[projectId];
        require(p.creator != address(0), "Marketplace: unknown project");
        require(tokenAmount > 0, "Marketplace: amount=0");

        uint256 scaledAmount = tokenAmount * 1e18;
        require(p.tokensSold + scaledAmount <= p.tokensForSale, "Marketplace: insufficient supply");

        uint256 cost = tokenAmount * p.pricePerToken;

        // effects
        p.tokensSold += scaledAmount;
        p.usdcRaised += cost;

        // interactions
        require(usdc.transferFrom(msg.sender, address(this), cost), "Marketplace: USDC transfer failed");

        // The token's own _checkedTransfer will enforce that the buyer is
        // verified in the identity registry and compliance approves.
        require(
            ProjectToken(p.token).transfer(msg.sender, scaledAmount),
            "Marketplace: token transfer failed"
        );

        emit TokensPurchased(projectId, msg.sender, scaledAmount, cost);
    }

    // ---------------------------------------------------------------------
    // Creator withdrawal
    // ---------------------------------------------------------------------
    function withdraw(uint256 projectId) external {
        Project storage p = _projects[projectId];
        require(p.creator != address(0), "Marketplace: unknown project");
        require(msg.sender == p.creator, "Marketplace: not creator");

        uint256 available = p.usdcRaised - p.usdcWithdrawn;
        require(available > 0, "Marketplace: nothing to withdraw");

        p.usdcWithdrawn += available;
        require(usdc.transfer(p.creator, available), "Marketplace: withdraw failed");

        emit FundsWithdrawn(projectId, p.creator, available);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------
    function getProject(uint256 projectId) external view returns (Project memory) {
        return _projects[projectId];
    }

    function getProjects(uint256 offset, uint256 limit) external view returns (Project[] memory page) {
        uint256 total = projectCount;
        if (offset >= total) {
            return new Project[](0);
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 size = end - offset;
        page = new Project[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = _projects[offset + i];
        }
    }
}
