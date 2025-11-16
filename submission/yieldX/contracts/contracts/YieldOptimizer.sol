// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";

/**
 * @title YieldOptimizer
 * @notice Optimizes yield by reallocating capital across whitelisted ERC-4626 vaults
 * @dev Uses ERC-4626 standard (BoringVault compatible) for custody and yield generation
 */
contract YieldOptimizer is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // GlueX Vault addresses provided in requirements
    address[] public GLUEX_VAULTS;

    struct Position {
        address vault;          // ERC-4626 vault address
        address asset;          // Underlying asset token address
        uint256 shares;         // Vault shares owned
        uint256 assets;         // Equivalent underlying assets
        bool active;            // Position status
    }

    struct OptimizeParams {
        address[] routers;      // GlueX router addresses
        bytes[] calldatas;      // Swap calldata from GlueX Router API
        address[] inputTokens;  // Tokens to swap from
        address[] outputTokens; // Tokens to swap to
        uint256[] inputAmounts; // Amounts to swap
        address targetVault;    // Target vault to deposit to
        uint256 minSharesOut;   // Minimum shares to receive (slippage protection)
    }

    // Storage
    mapping(address => Position[]) public userPositions; // user => positions[]
    mapping(address => bool) public whitelistedVaults;   // vault => allowed
    mapping(address => bool) public whitelistedRouters;  // router => allowed
    mapping(address => address) public assetToVault;     // asset => preferred vault

    address public treasury;
    uint256 public protocolFeeBps = 0; // Default 0%
    uint256 public constant MAX_FEE_BPS = 100; // Max 1%
    bool public paused;

    // Events
    event PositionOpened(
        address indexed user,
        address indexed vault,
        address indexed asset,
        uint256 assetsDeposited,
        uint256 sharesReceived
    );
    event PositionClosed(
        address indexed user,
        address indexed vault,
        uint256 sharesRedeemed,
        uint256 assetsReceived
    );
    event PositionOptimized(
        address indexed user,
        address indexed fromVault,
        address indexed toVault,
        uint256 assetsReallocated,
        uint256 newShares
    );
    event VaultWhitelisted(address indexed vault, bool enabled);
    event RouterWhitelisted(address indexed router, bool enabled);
    event ProtocolFeeUpdated(uint256 newFeeBps);
    event Paused(bool paused);

    constructor(address _treasury) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;

        // Initialize GlueX vaults (using checksummed addresses)
        // Note: Actual vault addresses will be set during deployment or via whitelistVault
        // Vault addresses from requirements:
        // 0xe25514992597786e07872e6c5517fe1906c0cadd
        // 0xCdc3975df9D1cf054F44ED238Edfb708880292EA
        // 0x8F9291606862eEf771a97e5B71e4B98fd1Fa216a
        // 0x9f75Eac57d1c6F7248bd2AEDe58C95689f3827f7
        // 0x63Cf7EE583d9954FeBF649aD1c40C97a6493b1Be
        
        // For now, initialize empty array - vaults will be whitelisted via constructor or setter
        // Users can whitelist the actual GlueX vault addresses after deployment

        // Initialize empty - vaults will be whitelisted separately
        // GLUEX_VAULTS can be populated via addVault function if needed
    }

    /**
     * @notice Deposit assets into a whitelisted vault
     * @param _vault ERC-4626 vault address
     * @param _amount Amount of assets to deposit
     * @param _minSharesOut Minimum shares to receive (slippage protection)
     */
    function deposit(
        address _vault,
        uint256 _amount,
        uint256 _minSharesOut
    ) external payable nonReentrant returns (uint256 shares) {
        require(!paused, "Contract paused");
        require(whitelistedVaults[_vault], "Vault not whitelisted");
        require(_amount > 0, "Invalid amount");

        IERC4626 vault = IERC4626(_vault);
        address asset = vault.asset();

        // Only ERC-20 tokens are supported (ERC-4626 standard doesn't support native ETH)
        require(msg.value == 0, "ETH not accepted, only ERC-20 tokens supported");
        require(asset != address(0), "Native ETH not supported");
        
        // Transfer and approve tokens
        IERC20(asset).safeTransferFrom(msg.sender, address(this), _amount);
        IERC20(asset).safeIncreaseAllowance(_vault, _amount);

        // Deposit to vault
        shares = vault.deposit(_amount, address(this));

        require(shares >= _minSharesOut, "Insufficient shares");

        // Track position
        Position memory newPosition = Position({
            vault: _vault,
            asset: asset,
            shares: shares,
            assets: _amount,
            active: true
        });
        userPositions[msg.sender].push(newPosition);

        emit PositionOpened(msg.sender, _vault, asset, _amount, shares);
        return shares;
    }

    /**
     * @notice Withdraw assets from a position
     * @param _positionIndex Index of position in user's positions array
     * @param _shares Amount of shares to redeem
     * @param _minAssetsOut Minimum assets to receive
     */
    function withdraw(
        uint256 _positionIndex,
        uint256 _shares,
        uint256 _minAssetsOut
    ) external nonReentrant returns (uint256 assets) {
        require(!paused, "Contract paused");
        require(_positionIndex < userPositions[msg.sender].length, "Invalid position");
        
        Position storage position = userPositions[msg.sender][_positionIndex];
        require(position.active, "Position inactive");
        require(_shares > 0 && _shares <= position.shares, "Invalid shares");

        IERC4626 vault = IERC4626(position.vault);

        // Redeem shares
        assets = vault.redeem(_shares, address(this), msg.sender);

        require(assets >= _minAssetsOut, "Insufficient assets");

        // Update position
        position.shares -= _shares;
        position.assets = vault.convertToAssets(position.shares);
        if (position.shares == 0) {
            position.active = false;
        }

        emit PositionClosed(msg.sender, position.vault, _shares, assets);
        return assets;
    }

    /**
     * @notice Optimize yield by reallocating assets to higher yielding vault
     * @dev Uses GlueX Router API for swaps if asset conversion needed
     * @param _positionIndex Index of position to optimize
     * @param _params Optimization parameters from off-chain service
     */
    function optimizePosition(
        uint256 _positionIndex,
        OptimizeParams calldata _params
    ) external nonReentrant returns (uint256 newShares) {
        require(!paused, "Contract paused");
        require(_positionIndex < userPositions[msg.sender].length, "Invalid position");
        require(whitelistedVaults[_params.targetVault], "Target vault not whitelisted");

        Position storage position = userPositions[msg.sender][_positionIndex];
        require(position.active, "Position inactive");

        IERC4626 fromVault = IERC4626(position.vault);
        IERC4626 toVault = IERC4626(_params.targetVault);

        // Redeem all shares from current vault
        uint256 assetsRedeemed = fromVault.redeem(
            position.shares,
            address(this),
            address(this)
        );

        // If swaps are needed (asset conversion)
        if (_params.routers.length > 0) {
            require(
                _params.routers.length == _params.calldatas.length &&
                _params.routers.length == _params.inputTokens.length &&
                _params.routers.length == _params.outputTokens.length &&
                _params.routers.length == _params.inputAmounts.length,
                "Array length mismatch"
            );

            // Execute swaps via GlueX routers
            for (uint256 i = 0; i < _params.routers.length; i++) {
                require(whitelistedRouters[_params.routers[i]], "Router not whitelisted");
                
                address inputToken = _params.inputTokens[i];
                address outputToken = _params.outputTokens[i];
                uint256 inputAmount = _params.inputAmounts[i];

                // Approve router
                require(inputToken != address(0), "Native ETH not supported");
                IERC20(inputToken).safeIncreaseAllowance(_params.routers[i], inputAmount);

                // Execute swap (no native ETH support)
                (bool success, ) = _params.routers[i].call(_params.calldatas[i]);
                require(success, "Swap failed");
            }
        }

        // Get target asset and balance
        address targetAsset = toVault.asset();
        require(targetAsset != address(0), "Native ETH not supported");
        
        uint256 targetAssetBalance = IERC20(targetAsset).balanceOf(address(this));
        require(targetAssetBalance > 0, "No assets after swap");

        // Approve and deposit to target vault
        IERC20(targetAsset).safeIncreaseAllowance(_params.targetVault, targetAssetBalance);
        newShares = toVault.deposit(targetAssetBalance, address(this));

        require(newShares >= _params.minSharesOut, "Insufficient shares");

        // Update position
        position.vault = _params.targetVault;
        position.asset = targetAsset;
        position.shares = newShares;
        position.assets = targetAssetBalance;

        emit PositionOptimized(
            msg.sender,
            address(fromVault),
            _params.targetVault,
            assetsRedeemed,
            newShares
        );

        return newShares;
    }

    /**
     * @notice Get all positions for a user
     */
    function getUserPositions(address _user) external view returns (Position[] memory) {
        return userPositions[_user];
    }

    /**
     * @notice Get position count for a user
     */
    function getUserPositionCount(address _user) external view returns (uint256) {
        return userPositions[_user].length;
    }

    // Governance functions

    function whitelistVault(address _vault, bool _enabled) external onlyOwner {
        require(_vault != address(0), "Invalid vault");
        whitelistedVaults[_vault] = _enabled;
        emit VaultWhitelisted(_vault, _enabled);
    }

    /**
     * @notice Add a vault to the GLUEX_VAULTS array (optional helper)
     */
    function addGlueXVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid vault");
        // Check if already exists
        for (uint256 i = 0; i < GLUEX_VAULTS.length; i++) {
            require(GLUEX_VAULTS[i] != _vault, "Vault already exists");
        }
        GLUEX_VAULTS.push(_vault);
        whitelistedVaults[_vault] = true;
        emit VaultWhitelisted(_vault, true);
    }

    function whitelistRouter(address _router, bool _enabled) external onlyOwner {
        require(_router != address(0), "Invalid router");
        whitelistedRouters[_router] = _enabled;
        emit RouterWhitelisted(_router, _enabled);
    }

    function updateProtocolFee(uint256 _newFeeBps) external onlyOwner {
        require(_newFeeBps <= MAX_FEE_BPS, "Fee too high");
        protocolFeeBps = _newFeeBps;
        emit ProtocolFeeUpdated(_newFeeBps);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    // Allow contract to receive ETH
    receive() external payable {}
}

