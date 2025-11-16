// HyperEVM mainnet chain configuration
export const hyperevmMainnet = {
  id: 999,
  name: "Hype",
  network: "hyperevm-mainnet",
  nativeCurrency: {
    decimals: 18,
    name: "Hype",
    symbol: "HYPE",
  },
  rpcUrls: {
    default: {
      http: [process.env.HYPEREVM_RPC_URL || "https://rpc.hyperevm.com"],
    },
    public: {
      http: [process.env.HYPEREVM_RPC_URL || "https://rpc.hyperevm.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "HyperEVMScan",
      url: "https://hyperevmscan.io",
    },
  },
} as const;
