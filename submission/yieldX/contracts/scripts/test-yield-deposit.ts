import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("🧪 Testing Yield Optimizer Deposit...\n");

  const optimizerAddress =
    process.env.YIELD_OPTIMIZER_CONTRACT_ADDRESS ||
    "0x156BE3E178551749f53524E745E9dD10a4ddFe79";
  const rpcUrl =
    process.env.HYPEREVM_RPC_URL ||
    process.env.RPC_URL ||
    "https://rpc.hyperevm.com";
  const privateKey = process.env.HYPEREVM_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("HYPEREVM_PRIVATE_KEY not set in environment variables");
  }

  // Initialize provider and wallet
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("👤 Wallet Address:", wallet.address);
  console.log("📋 Yield Optimizer Contract:", optimizerAddress);

  // Get Yield Optimizer ABI (minimal)
  const optimizerABI = [
    "function deposit(address _vault, uint256 _amount, uint256 _minSharesOut) external returns (uint256)",
    "function getUserPositions(address) external view returns ((address vault, address asset, uint256 shares, uint256 assets, bool active)[])",
    "function whitelistedVaults(address) external view returns (bool)",
  ];

  const optimizer = new ethers.Contract(
    optimizerAddress,
    optimizerABI,
    wallet
  );

  // Get first GlueX vault address
  const testVault = "0xe25514992597786e07872e6c5517fe1906c0cadd";

  console.log("\n📋 Checking vault whitelist status...");
  const isWhitelisted = await optimizer.whitelistedVaults(testVault);
  console.log(`   Vault ${testVault}: ${isWhitelisted ? "✅ Whitelisted" : "❌ Not whitelisted"}`);

  if (!isWhitelisted) {
    console.log("\n❌ Vault is not whitelisted. Please whitelist it first.");
    console.log("   Run: npx hardhat run scripts/whitelist-yield-optimizer.ts");
    return;
  }

  // Check if vault is ERC-4626
  const erc4626ABI = [
    "function asset() external view returns (address)",
    "function deposit(uint256 assets, address receiver) external returns (uint256 shares)",
  ];

  try {
    const vault = new ethers.Contract(testVault, erc4626ABI, provider);
    const assetAddress = await vault.asset();
    console.log(`   Asset Address: ${assetAddress}`);

    // Get ERC-20 ABI for checking balance
    const erc20ABI = [
      "function balanceOf(address) external view returns (uint256)",
      "function decimals() external view returns (uint8)",
      "function approve(address spender, uint256 amount) external returns (bool)",
    ];

    const asset = new ethers.Contract(assetAddress, erc20ABI, wallet);
    const decimals = await asset.decimals();
    const balance = await asset.balanceOf(wallet.address);

    console.log(`   Current Balance: ${ethers.formatUnits(balance, decimals)}`);

    if (balance === 0n) {
      console.log("\n⚠️  No balance found. You need to have tokens to deposit.");
      console.log("   This is a test script - in production, users would deposit via the contract.");
      return;
    }

    // For testing, use a small amount (1% of balance or 1 token, whichever is smaller)
    const depositAmount = balance / 100n > ethers.parseUnits("1", decimals)
      ? ethers.parseUnits("1", decimals)
      : balance / 100n;

    console.log(`\n📝 Would deposit: ${ethers.formatUnits(depositAmount, decimals)} tokens`);
    console.log("\n⚠️  This is a dry-run. To actually deposit, uncomment the code below.");

    // Uncomment to actually deposit:
    /*
    console.log("\n💰 Approving tokens...");
    const approveTx = await asset.approve(optimizerAddress, depositAmount);
    await approveTx.wait();
    console.log("✅ Approved");

    console.log("\n💰 Depositing to Yield Optimizer...");
    const depositTx = await optimizer.deposit(testVault, depositAmount, 0, {
      gasLimit: 500000,
    });
    console.log(`   Transaction hash: ${depositTx.hash}`);
    const receipt = await depositTx.wait();
    console.log("✅ Deposit successful!");

    // Check positions
    console.log("\n📊 Checking user positions...");
    const positions = await optimizer.getUserPositions(wallet.address);
    console.log(`   Positions: ${positions.length}`);
    if (positions.length > 0) {
      positions.forEach((pos: any, idx: number) => {
        console.log(`   Position ${idx}:`);
        console.log(`     Vault: ${pos.vault}`);
        console.log(`     Asset: ${pos.asset}`);
        console.log(`     Shares: ${pos.shares.toString()}`);
        console.log(`     Assets: ${pos.assets.toString()}`);
        console.log(`     Active: ${pos.active}`);
      });
    }
    */

  } catch (error) {
    console.error("\n❌ Error:", error instanceof Error ? error.message : error);
    console.log("\n⚠️  This might be because:");
    console.log("   1. The vault is not ERC-4626 compatible");
    console.log("   2. The vault address is incorrect");
    console.log("   3. Network/RPC connection issue");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });

