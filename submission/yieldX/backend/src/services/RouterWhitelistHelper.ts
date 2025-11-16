import { keeperWallet } from "../config/blockchain";
import { parseAbi } from "viem";

/**
 * Helper service to whitelist routers on-the-fly
 * Note: This requires owner privileges on the Yield Optimizer contract
 */
export class RouterWhitelistHelper {
  private optimizerContract: string;

  // Minimal ABI for router whitelisting
  private optimizerABI = parseAbi([
    "function whitelistRouter(address _router, bool _enabled) external",
    "function whitelistedRouters(address) external view returns (bool)",
  ]);

  constructor(optimizerContractAddress: string) {
    this.optimizerContract = optimizerContractAddress;
  }

  /**
   * Check if a router is whitelisted
   */
  async isRouterWhitelisted(routerAddress: string): Promise<boolean> {
    try {
      const { createPublicClient, http } = await import("viem");
      const { hyperevmMainnet } = await import("../config/chains");

      const client = createPublicClient({
        chain: hyperevmMainnet,
        transport: http(
          process.env.RPC_URL ||
            process.env.HYPEREVM_RPC_URL ||
            "https://rpc.hyperevm.com"
        ),
      });

      const isWhitelisted = await client.readContract({
        address: this.optimizerContract as `0x`,
        abi: this.optimizerABI,
        functionName: "whitelistedRouters",
        args: [routerAddress as `0x`],
      });

      return isWhitelisted as boolean;
    } catch (error) {
      console.error(`❌ Error checking router whitelist status:`, error);
      return false;
    }
  }

  /**
   * Whitelist a router (requires owner)
   * Returns true if whitelisted successfully, false otherwise
   */
  async whitelistRouter(routerAddress: string): Promise<boolean> {
    try {
      // Check if already whitelisted
      const isWhitelisted = await this.isRouterWhitelisted(routerAddress);
      if (isWhitelisted) {
        console.log(`✅ Router ${routerAddress} is already whitelisted`);
        return true;
      }

      console.log(`🔄 Attempting to whitelist router: ${routerAddress}...`);

      const txhash = await keeperWallet.writeContract({
        address: this.optimizerContract as `0x`,
        abi: this.optimizerABI,
        functionName: "whitelistRouter",
        args: [routerAddress as `0x`, true],
      });

      console.log(`📝 Router whitelist transaction submitted: ${txhash}`);

      // Wait for transaction confirmation
      const { createPublicClient, http } = await import("viem");
      const { hyperevmMainnet } = await import("../config/chains");

      const client = createPublicClient({
        chain: hyperevmMainnet,
        transport: http(
          process.env.RPC_URL ||
            process.env.HYPEREVM_RPC_URL ||
            "https://rpc.hyperevm.com"
        ),
      });

      const receipt = await client.waitForTransactionReceipt({
        hash: txhash,
      });

      if (receipt.status === "success") {
        console.log(`✅ Router ${routerAddress} whitelisted successfully`);
        return true;
      } else {
        console.error(`❌ Router whitelist transaction failed`);
        return false;
      }
    } catch (error) {
      console.error(
        `❌ Failed to whitelist router ${routerAddress}:`,
        error instanceof Error ? error.message : error
      );
      // If error is "Only owner" or similar, that's expected if the backend wallet isn't the owner
      if (
        error instanceof Error &&
        (error.message.includes("Ownable") ||
          error.message.includes("owner") ||
          error.message.includes("unauthorized"))
      ) {
        console.log(
          `⚠️  Note: Router whitelisting requires owner privileges. The backend wallet may not be the contract owner.`
        );
        console.log(
          `   Please whitelist router ${routerAddress} manually using the whitelist-yield-optimizer.ts script.`
        );
      }
      return false;
    }
  }

  /**
   * Ensure router is whitelisted (check first, then whitelist if needed)
   */
  async ensureRouterWhitelisted(routerAddress: string): Promise<boolean> {
    const isWhitelisted = await this.isRouterWhitelisted(routerAddress);
    if (isWhitelisted) {
      return true;
    }

    // Try to whitelist
    return await this.whitelistRouter(routerAddress);
  }
}

