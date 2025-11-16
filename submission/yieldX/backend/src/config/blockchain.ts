import "dotenv/config";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hyperevmMainnet } from "./chains";

export interface BlockchainConfig {
  rpcUrl: string;
  chainId: number;
  dcaContractAddress: string;
  limitOrderContractAddress: string;
  twapContractAddress: string;
}

export const getBlockchainConfig = (): BlockchainConfig => {
  const rpcUrl =
    process.env.RPC_URL ||
    process.env.HYPEREVM_RPC_URL ||
    "https://rpc.hyperevm.com";
  const dcaContractAddress =
    process.env.DCA_CONTRACT_ADDRESS ||
    "0x0000000000000000000000000000000000000000"; // Placeholder - will be set after deployment
  const limitOrderContractAddress =
    process.env.LIMIT_ORDER_CONTRACT_ADDRESS ||
    "0x0000000000000000000000000000000000000000"; // Placeholder - will be set after deployment
  const twapContractAddress =
    process.env.TWAP_CONTRACT_ADDRESS ||
    "0x0000000000000000000000000000000000000000"; // Placeholder - will be set after deployment
  return {
    rpcUrl,
    chainId: 999, // HyperEVM Mainnet
    dcaContractAddress,
    limitOrderContractAddress,
    twapContractAddress,
  };
};

export const keeperWallet = createWalletClient({
  chain: hyperevmMainnet,
  transport: http(process.env.HYPEREVM_RPC_URL || "https://rpc.hyperevm.com"),
  account: privateKeyToAccount(
    process.env.HYPEREVM_MAINNET_PRIVATE_KEY as `0x`
  ),
});
