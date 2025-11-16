import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("🚀 Deploying Yield Optimizer Contract...\n");

  // Get network configuration
  const network = process.env.NETWORK || "hyperEVM";
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

  console.log("📡 Network:", network);
  console.log("🔗 RPC URL:", rpcUrl);
  console.log("👤 Deployer Address:", wallet.address);

  // Get deployer balance
  const balance = await provider.getBalance(wallet.address);
  console.log("💰 Deployer Balance:", ethers.formatEther(balance), "ETH\n");

  // Treasury address (can be deployer for now)
  const treasury = process.env.TREASURY_ADDRESS || wallet.address;
  console.log("🏦 Treasury Address:", treasury);

  // Read contract bytecode and ABI
  const artifactsPath = path.join(__dirname, "../artifacts/contracts/YieldOptimizer.sol/YieldOptimizer.json");

  if (!fs.existsSync(artifactsPath)) {
    throw new Error(
      `Contract artifacts not found at ${artifactsPath}. Please compile the contract first with: npx hardhat compile`
    );
  }

  const artifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));
  const bytecode = artifact.bytecode;
  const abi = artifact.abi;

  console.log("\n📝 Deploying YieldOptimizer contract...");

  // Create contract factory
  const YieldOptimizerFactory = new ethers.ContractFactory(abi, bytecode, wallet);

  // Deploy contract (let ethers estimate gas automatically)
  const yieldOptimizer = await YieldOptimizerFactory.deploy(treasury);

  console.log("⏳ Waiting for deployment transaction...");
  await yieldOptimizer.waitForDeployment();

  const contractAddress = await yieldOptimizer.getAddress();
  console.log("✅ Yield Optimizer deployed to:", contractAddress);

  // Get deployment transaction receipt
  const deploymentTx = yieldOptimizer.deploymentTransaction();
  if (deploymentTx) {
    const receipt = await deploymentTx.wait();
    console.log("📋 Deployment Transaction Hash:", receipt?.hash);
    console.log("⛽ Gas Used:", receipt?.gasUsed.toString());
  }

  // Save deployment info
  const deploymentInfo = {
    contractAddress,
    network,
    deployer: wallet.address,
    treasury,
    timestamp: new Date().toISOString(),
    transactionHash: deploymentTx?.hash,
    gluxVaults: [
      "0xe25514992597786e07872e6c5517fe1906c0cadd",
      "0xcdc3975df9d1cf054f44ed238edfb708880292ea",
      "0x8f9291606862eef771a97e5b71e4b98fd1fa216a",
      "0x9f75eac57d1c6f7248bd2aede58c95689f3827f7",
      "0x63cf7ee583d9954febf649ad1c40c97a6493b1be",
    ],
  };

  const deploymentPath = path.join(
    __dirname,
    `../deployments/yield-optimizer-${network}.json`
  );
  fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n💾 Deployment info saved to:", deploymentPath);
  console.log("\n📋 Deployment Summary:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  console.log("\n🎉 Deployment completed successfully!");
  console.log("\n📝 Next steps:");
  console.log(`1. Set YIELD_OPTIMIZER_CONTRACT_ADDRESS=${contractAddress} in your .env file`);
  console.log("2. The contract has already whitelisted all GlueX vaults");
  console.log("3. Whitelist GlueX Router addresses using addRouter() function");
  console.log("4. Start the backend service to begin yield optimization");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });

