import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("🚀 Whitelisting GlueX Vaults and Routers for Yield Optimizer...\n");

  // Get network configuration
  const rpcUrl =
    process.env.HYPEREVM_RPC_URL ||
    process.env.RPC_URL ||
    "https://rpc.hyperevm.com";
  const privateKey = process.env.HYPEREVM_PRIVATE_KEY;
  const optimizerAddress = process.env.YIELD_OPTIMIZER_CONTRACT_ADDRESS;

  if (!privateKey) {
    throw new Error("HYPEREVM_PRIVATE_KEY not set in environment variables");
  }

  if (!optimizerAddress) {
    throw new Error(
      "YIELD_OPTIMIZER_CONTRACT_ADDRESS not set in environment variables"
    );
  }

  // Initialize provider and wallet
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("🔗 RPC URL:", rpcUrl);
  console.log("👤 Deployer Address:", wallet.address);
  console.log("📋 Yield Optimizer Contract:", optimizerAddress);

  // GlueX Vault addresses (from requirements)
  const GLUEX_VAULTS = [
    "0xe25514992597786e07872e6c5517fe1906c0cadd",
    "0xcdc3975df9d1cf054f44ed238edfb708880292ea",
    "0x8f9291606862eef771a97e5b71e4b98fd1fa216a",
    "0x9f75eac57d1c6f7248bd2aede58c95689f3827f7",
    "0x63cf7ee583d9954febf649ad1c40c97a6493b1be",
  ];

  // Get Yield Optimizer ABI (minimal - just the functions we need)
  const optimizerABI = [
    "function whitelistVault(address _vault, bool _enabled) external",
    "function whitelistRouter(address _router, bool _enabled) external",
    "function whitelistedVaults(address) external view returns (bool)",
    "function whitelistedRouters(address) external view returns (bool)",
  ];

  const optimizer = new ethers.Contract(
    optimizerAddress,
    optimizerABI,
    wallet
  );

  console.log("\n📦 Whitelisting GlueX Vaults...");
  for (const vault of GLUEX_VAULTS) {
    try {
      // Check if already whitelisted
      const isWhitelisted = await optimizer.whitelistedVaults(vault);
      if (isWhitelisted) {
        console.log(`✅ Vault ${vault} is already whitelisted`);
        continue;
      }

      console.log(`🔄 Whitelisting vault: ${vault}...`);
      const tx = await optimizer.whitelistVault(vault, true);
      console.log(`   Transaction hash: ${tx.hash}`);
      await tx.wait();
      console.log(`✅ Vault ${vault} whitelisted successfully`);
    } catch (error) {
      console.error(`❌ Failed to whitelist vault ${vault}:`, error);
    }
  }

  // GlueX Router addresses
  // Note: These are placeholder - you may need to get the actual router address
  // from GlueX Router API responses or documentation
  // For now, we'll check if there's a router address in env or use a common one
  const routerAddresses: string[] = [];

  // Check if there's a router address in env
  if (process.env.GLUEX_ROUTER_ADDRESS) {
    routerAddresses.push(process.env.GLUEX_ROUTER_ADDRESS);
  }

  // Common router addresses (you may need to update these based on GlueX documentation)
  // Since we don't have the exact router address, we'll note this
  if (routerAddresses.length === 0) {
    console.log(
      "\n⚠️  No GlueX Router addresses found. Router addresses are typically"
    );
    console.log(
      "   returned by the GlueX Router API in the 'router' field of quote responses."
    );
    console.log(
      "   Set GLUEX_ROUTER_ADDRESS in .env or whitelist routers manually."
    );
  } else {
    console.log("\n🔄 Whitelisting GlueX Routers...");
    for (const router of routerAddresses) {
      try {
        // Check if already whitelisted
        const isWhitelisted = await optimizer.whitelistedRouters(router);
        if (isWhitelisted) {
          console.log(`✅ Router ${router} is already whitelisted`);
          continue;
        }

        console.log(`🔄 Whitelisting router: ${router}...`);
        const tx = await optimizer.whitelistRouter(router, true);
        console.log(`   Transaction hash: ${tx.hash}`);
        await tx.wait();
        console.log(`✅ Router ${router} whitelisted successfully`);
      } catch (error) {
        console.error(`❌ Failed to whitelist router ${router}:`, error);
      }
    }
  }

  console.log("\n✅ Whitelisting complete!");
  console.log("\n📝 Summary:");
  console.log(`   Whitelisted ${GLUEX_VAULTS.length} GlueX vaults`);
  console.log(`   Whitelisted ${routerAddresses.length} router(s)`);
  console.log(
    "\n💡 Note: Router addresses are returned dynamically by GlueX Router API."
  );
  console.log(
    "   You may need to whitelist routers as they appear in quote responses."
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Whitelisting failed:", error);
    process.exit(1);
  });

