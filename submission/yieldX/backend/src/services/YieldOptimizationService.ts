import { DatabaseService } from "./DatabaseService";
import { GlueXYieldsService, YieldOpportunity } from "./GlueXYieldsService";
import { getQuote } from "./GlueXservice";
import { keeperWallet } from "../config/blockchain";
import { createPublicClient, http, parseAbi } from "viem";
import { hyperevmMainnet } from "../config/chains";
import * as cron from "node-cron";
import { RouterWhitelistHelper } from "./RouterWhitelistHelper";

// GlueX Vault addresses (from requirements)
const GLUEX_VAULTS = [
  "0xe25514992597786e07872e6c5517fe1906c0cadd",
  "0xcdc3975df9d1cf054f44ed238edfb708880292ea",
  "0x8f9291606862eef771a97e5b71e4b98fd1fa216a",
  "0x9f75eac57d1c6f7248bd2aede58c95689f3827f7",
  "0x63cf7ee583d9954febf649ad1c40c97a6493b1be",
] as const;

// YieldOptimizer ABI (minimal interface)
const YIELD_OPTIMIZER_ABI = parseAbi([
  "function getUserPositions(address) external view returns ((address vault, address asset, uint256 shares, uint256 assets, bool active)[])",
  "function optimizePosition(uint256, (address[] routers, bytes[] calldatas, address[] inputTokens, address[] outputTokens, uint256[] inputAmounts, address targetVault, uint256 minSharesOut)) external returns (uint256)",
  "function deposit(address vault, uint256 amount, uint256 minSharesOut) external payable returns (uint256)",
  "event PositionOptimized(address indexed user, address indexed fromVault, address indexed toVault, uint256 assetsReallocated, uint256 newShares)",
  "event PositionOpened(address indexed user, address indexed vault, address indexed asset, uint256 assetsDeposited, uint256 sharesReceived)",
]);

export interface UserPosition {
  userAddress: string;
  positionIndex: number;
  vault: string;
  asset: string;
  shares: string;
  assets: string;
  apy?: number;
  active: boolean;
}

export interface OptimizationResult {
  success: boolean;
  userAddress: string;
  positionIndex: number;
  fromVault: string;
  toVault: string;
  assetsReallocated: string;
  newShares: string;
  newAPY: number;
  previousAPY: number;
  transactionHash?: string;
  error?: string;
}

/**
 * Yield Optimization Service
 * Monitors yields across whitelisted vaults and reallocates capital to optimize returns
 */
export class YieldOptimizationService {
  private yieldsService: GlueXYieldsService;
  private dbService: DatabaseService;
  private client: any;
  private optimizerContract: string;
  private optimizationJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private optimizationThreshold: number = 0.5; // 0.5% APY difference threshold
  private routerWhitelistHelper: RouterWhitelistHelper;

  constructor(optimizerContractAddress: string) {
    this.yieldsService = new GlueXYieldsService();
    this.dbService = DatabaseService.getInstance();
    this.optimizerContract = optimizerContractAddress;

    // Initialize blockchain client
    this.client = createPublicClient({
      chain: hyperevmMainnet,
      transport: http(
        process.env.RPC_URL ||
          process.env.HYPEREVM_RPC_URL ||
          "https://rpc.hyperevm.com"
      ),
    });

    // Initialize router whitelist helper
    this.routerWhitelistHelper = new RouterWhitelistHelper(optimizerContractAddress);

    console.log("📊 Yield Optimization Service initialized");
  }

  /**
   * Start automated yield optimization
   * Runs optimization check every hour
   */
  startOptimization(): void {
    if (this.isRunning) {
      console.log("⚠️  Yield optimization is already running");
      return;
    }

    // Run optimization check every hour
    this.optimizationJob = cron.schedule("0 * * * *", async () => {
      console.log("⏰ Running scheduled yield optimization check...");
      await this.optimizeAllPositions();
    });

    this.isRunning = true;
    console.log("✅ Automated yield optimization started (runs every hour)");
  }

  /**
   * Stop automated yield optimization
   */
  stopOptimization(): void {
    if (this.optimizationJob) {
      this.optimizationJob.stop();
      this.optimizationJob = null;
    }
    this.isRunning = false;
    console.log("🛑 Automated yield optimization stopped");
  }

  /**
   * Get all user positions from the optimizer contract
   */
  async getUserPositions(userAddress: string): Promise<UserPosition[]> {
    try {
      const positions = await this.client.readContract({
        address: this.optimizerContract as `0x`,
        abi: YIELD_OPTIMIZER_ABI,
        functionName: "getUserPositions",
        args: [userAddress as `0x`],
      });

      const enrichedPositions: UserPosition[] = await Promise.all(
        positions.map(async (position: any, index: number) => {
          // Get current APY for this vault
          const opportunities = await this.yieldsService.getYieldOpportunities(
            [position.vault],
            "hyperevm"
          );
          const currentAPY = opportunities.length > 0 ? opportunities[0].apy : 0;

          return {
            userAddress,
            positionIndex: index,
            vault: position.vault,
            asset: position.asset,
            shares: position.shares.toString(),
            assets: position.assets.toString(),
            apy: currentAPY,
            active: position.active,
          };
        })
      );

      return enrichedPositions;
    } catch (error) {
      console.error(`❌ Error fetching user positions for ${userAddress}:`, error);
      return [];
    }
  }

  /**
   * Find the best yield opportunity across all whitelisted vaults
   */
  async findBestYieldOpportunity(
    currentAsset?: string
  ): Promise<YieldOpportunity | null> {
    const allVaults = [...GLUEX_VAULTS];
    return await this.yieldsService.findBestYieldForAsset(
      currentAsset || "",
      allVaults,
      "hyperevm"
    );
  }

  /**
   * Optimize a single position by reallocating to higher yielding vault
   */
  async optimizePosition(
    userAddress: string,
    positionIndex: number
  ): Promise<OptimizationResult> {
    try {
      console.log(
        `🔍 Optimizing position ${positionIndex} for user ${userAddress}...`
      );

      // Get current position
      const positions = await this.getUserPositions(userAddress);
      if (positionIndex >= positions.length || !positions[positionIndex].active) {
        throw new Error("Invalid or inactive position");
      }

      const currentPosition = positions[positionIndex];
      const currentAPY = currentPosition.apy || 0;

      // Find best yield opportunity
      const bestOpportunity = await this.findBestYieldOpportunity(
        currentPosition.asset
      );

      if (!bestOpportunity) {
        throw new Error("No yield opportunities found");
      }

      // Check if optimization is worthwhile (APY difference > threshold)
      const apyDifference = bestOpportunity.apy - currentAPY;
      if (apyDifference < this.optimizationThreshold) {
        return {
          success: false,
          userAddress,
          positionIndex,
          fromVault: currentPosition.vault,
          toVault: bestOpportunity.vault,
          assetsReallocated: "0",
          newShares: "0",
          newAPY: bestOpportunity.apy,
          previousAPY: currentAPY,
          error: `APY difference (${apyDifference.toFixed(2)}%) below threshold (${this.optimizationThreshold}%)`,
        };
      }

      // If target vault is the same as current vault, no optimization needed
      if (
        bestOpportunity.vault.toLowerCase() ===
        currentPosition.vault.toLowerCase()
      ) {
        return {
          success: false,
          userAddress,
          positionIndex,
          fromVault: currentPosition.vault,
          toVault: bestOpportunity.vault,
          assetsReallocated: "0",
          newShares: "0",
          newAPY: bestOpportunity.apy,
          previousAPY: currentAPY,
          error: "Already in best vault",
        };
      }

      // Prepare swap parameters if asset conversion is needed
      // For now, assume same asset (vault-to-vault transfer)
      // In a full implementation, you'd check if asset conversion is needed
      const needsSwap =
        currentPosition.asset.toLowerCase() !==
        bestOpportunity.asset.toLowerCase();

      let routers: `0x${string}`[] = [];
      let calldatas: `0x${string}`[] = [];
      let inputTokens: `0x${string}`[] = [];
      let outputTokens: `0x${string}`[] = [];
      let inputAmounts: bigint[] = [];

      if (needsSwap) {
        // Get quote from GlueX Router API for asset conversion
        const quote = await getQuote({
          chainID: "hyperevm",
          inputToken: currentPosition.asset,
          outputToken: bestOpportunity.asset,
          userAddress: this.optimizerContract as `0x`,
          outputReceiver: this.optimizerContract as `0x`,
          inputAmount: currentPosition.assets,
        });

        if (!quote.success || !quote.data?.result) {
          throw new Error("Failed to get swap quote");
        }

        const routerAddress = quote.data.result.router;
        
        // Ensure router is whitelisted before using it
        const routerWhitelisted = await this.routerWhitelistHelper.ensureRouterWhitelisted(
          routerAddress
        );
        
        if (!routerWhitelisted) {
          throw new Error(
            `Router ${routerAddress} is not whitelisted and could not be whitelisted automatically. Please whitelist manually.`
          );
        }

        routers = [routerAddress as `0x${string}`];
        calldatas = [quote.data.result.calldata as `0x${string}`];
        inputTokens = [currentPosition.asset as `0x${string}`];
        outputTokens = [bestOpportunity.asset as `0x${string}`];
        inputAmounts = [BigInt(currentPosition.assets)];
      }

      // Calculate minimum shares to receive (with 1% slippage tolerance)
      const minSharesOut = "0"; // Would calculate based on expected shares

      // Execute optimization on-chain
      const txhash = await keeperWallet.writeContract({
        address: this.optimizerContract as `0x`,
        abi: YIELD_OPTIMIZER_ABI,
        functionName: "optimizePosition",
        args: [
          BigInt(positionIndex),
          {
            routers: routers,
            calldatas: calldatas,
            inputTokens: inputTokens,
            outputTokens: outputTokens,
            inputAmounts: inputAmounts,
            targetVault: bestOpportunity.vault as `0x`,
            minSharesOut: BigInt(minSharesOut),
          },
        ],
      });

      console.log(`📝 Optimization transaction submitted: ${txhash}`);

      // Wait for transaction confirmation
      const receipt = await this.client.waitForTransactionReceipt({
        hash: txhash,
      });

      if (receipt.status === "success") {
        // Save optimization to database
        await this.dbService.saveYieldOptimization({
          userAddress,
          positionIndex,
          fromVault: currentPosition.vault,
          toVault: bestOpportunity.vault,
          assetsReallocated: currentPosition.assets,
          previousAPY: currentAPY,
          newAPY: bestOpportunity.apy,
          transactionHash: txhash,
          timestamp: new Date(),
        });

        console.log(
          `✅ Position optimized: ${currentPosition.vault} -> ${bestOpportunity.vault} (APY: ${currentAPY.toFixed(2)}% -> ${bestOpportunity.apy.toFixed(2)}%)`
        );

        return {
          success: true,
          userAddress,
          positionIndex,
          fromVault: currentPosition.vault,
          toVault: bestOpportunity.vault,
          assetsReallocated: currentPosition.assets,
          newShares: "0", // Would get from event logs
          newAPY: bestOpportunity.apy,
          previousAPY: currentAPY,
          transactionHash: txhash,
        };
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ Failed to optimize position: ${errorMessage}`);

      return {
        success: false,
        userAddress,
        positionIndex,
        fromVault: "",
        toVault: "",
        assetsReallocated: "0",
        newShares: "0",
        newAPY: 0,
        previousAPY: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Optimize all positions for all users (called by scheduled job)
   */
  async optimizeAllPositions(): Promise<void> {
    try {
      console.log("🔍 Checking all positions for optimization opportunities...");

      // Get all users with positions (would need to track this in database)
      // For now, we'll optimize positions that were previously created
      const users = await this.dbService.getUsersWithYieldPositions();

      let optimizedCount = 0;
      let skippedCount = 0;

      for (const userAddress of users) {
        const positions = await this.getUserPositions(userAddress);

        for (const position of positions) {
          if (!position.active) continue;

          const result = await this.optimizePosition(
            userAddress,
            position.positionIndex
          );

          if (result.success) {
            optimizedCount++;
            // Small delay between optimizations
            await new Promise((resolve) => setTimeout(resolve, 2000));
          } else {
            skippedCount++;
          }
        }
      }

      console.log(
        `✅ Optimization check complete: ${optimizedCount} optimized, ${skippedCount} skipped`
      );
    } catch (error) {
      console.error("❌ Error in optimizeAllPositions:", error);
    }
  }

  /**
   * Get yield statistics across all whitelisted vaults
   */
  async getYieldStatistics(): Promise<{
    vaults: YieldOpportunity[];
    averageAPY: number;
    highestAPY: number;
    timestamp: number;
  }> {
    const opportunities = await this.yieldsService.getYieldOpportunities(
      [...GLUEX_VAULTS],
      "hyperevm"
    );

    const averageAPY =
      opportunities.length > 0
        ? opportunities.reduce((sum, opp) => sum + opp.apy, 0) /
          opportunities.length
        : 0;
    const highestAPY =
      opportunities.length > 0
        ? Math.max(...opportunities.map((opp) => opp.apy))
        : 0;

    return {
      vaults: opportunities,
      averageAPY,
      highestAPY,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if optimization service is running
   */
  isOptimizationRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Set optimization threshold (minimum APY difference to trigger reallocation)
   */
  setOptimizationThreshold(threshold: number): void {
    this.optimizationThreshold = threshold;
    console.log(`📊 Optimization threshold set to ${threshold}%`);
  }
}

