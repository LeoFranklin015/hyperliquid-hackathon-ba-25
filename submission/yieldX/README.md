# yieldX - Automated Yield Optimization Protocol

**yieldX** is an automated yield optimization protocol built on HyperEVM that intelligently reallocates user capital across whitelisted ERC-4626 vaults to maximize returns. By leveraging GlueX Yields API and Router API, yieldX continuously monitors yield opportunities and automatically moves funds to the highest-yielding vaults.

## 🎯 Problem Statement

APY volatility across HyperEVM lending markets creates significant opportunities for yield optimization. Users often miss out on better yields because they lack the time or expertise to continuously monitor and reallocate their positions. yieldX solves this by automating the entire process, ensuring users always earn the best available yield.

## 💡 Solution

yieldX combines:
- **On-chain custody** via ERC-4626 compatible smart contracts (BoringVault)
- **Off-chain intelligence** using GlueX Yields API to identify optimal yield opportunities
- **Automated reallocation** via GlueX Router API for seamless asset swaps
- **Continuous monitoring** with a backend service that tracks and optimizes positions

## 🏗️ Architecture

### Smart Contracts (`/contracts`)
- **YieldOptimizer.sol**: Main contract that manages user positions and executes optimizations
  - ERC-4626 compatible vault interactions
  - Whitelisted vault and router management
  - Position tracking and optimization execution
  - Slippage protection and security features

### Backend Service (`/backend`)
- **YieldOptimizationService**: Core service that monitors yields and triggers optimizations
- **GlueXYieldsService**: Integrates with GlueX Yields API to fetch current APY data
- **GlueXservice**: Handles GlueX Router API calls for swap quotes
- **DatabaseService**: Tracks optimization history and statistics
- **REST API**: Exposes endpoints for position management and optimization triggers

## 🛠️ Tech Stack

### Smart Contracts
- **Solidity** ^0.8.20
- **Hardhat** for development and deployment
- **OpenZeppelin** contracts for security (ReentrancyGuard, Ownable, SafeERC20)
- **ERC-4626** standard for vault interactions

### Backend
- **TypeScript/Node.js**
- **Express.js** for REST API
- **Viem** for blockchain interactions
- **Mongoose** for database operations
- **node-cron** for scheduled optimizations

### APIs & Services
- **GlueX Yields API**: Real-time yield data across vaults
- **GlueX Router API**: Optimal swap routing and execution
- **HyperEVM RPC**: Blockchain interactions

## 🚀 Features

### Core Functionality
- ✅ **Automated Position Monitoring**: Continuously tracks user positions across whitelisted vaults
- ✅ **Yield Comparison**: Compares current position APY with available opportunities
- ✅ **Intelligent Reallocation**: Automatically moves funds to higher-yielding vaults when threshold is met (default: 0.5% APY difference)
- ✅ **Slippage Protection**: Ensures minimum shares received during optimizations
- ✅ **Multi-Vault Support**: Works with all 5 GlueX vaults plus additional whitelisted vaults
- ✅ **Position History**: Tracks all optimizations in database for analytics

### API Endpoints

- `GET /api/yield/positions/:userAddress` - Get all positions for a user
- `POST /api/yield/optimize/:userAddress/:positionIndex` - Optimize a specific position
- `POST /api/yield/optimize-all` - Trigger optimization for all positions
- `GET /api/yield/statistics` - Get yield statistics across all vaults
- `GET /api/yield/optimizations/:userAddress` - Get optimization history for a user
- `GET /api/yield/stats` - Get overall optimization statistics

## 📋 Setup Instructions

### Prerequisites
- Node.js 18+
- Hardhat
- MongoDB (for backend)
- Access to GlueX Portal (https://portal.gluex.xyz) for API credentials

### Smart Contract Deployment

```bash
cd contracts
npm install
cp .env.example .env
# Add your private key and RPC URL to .env
npx hardhat compile
npx hardhat run scripts/deploy-yield-optimizer.ts --network hyperevm
npx hardhat run scripts/whitelist-yield-optimizer.ts --network hyperevm
```

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Configure:
# - MONGODB_URI
# - RPC_URL (HyperEVM RPC)
# - YIELD_OPTIMIZER_CONTRACT_ADDRESS
# - GLUEX_API_KEY (from GlueX Portal)
# - PRIVATE_KEY (keeper wallet)
npm run build
npm start
```

### Environment Variables

**Backend (.env)**
```
MONGODB_URI=mongodb://localhost:27017/yieldx
RPC_URL=https://rpc.hyperevm.com
YIELD_OPTIMIZER_CONTRACT_ADDRESS=0x...
GLUEX_API_KEY=your_gluex_api_key
PRIVATE_KEY=your_keeper_wallet_private_key
```

**Contracts (.env)**
```
PRIVATE_KEY=your_deployer_private_key
HYPEREVM_RPC_URL=https://rpc.hyperevm.com
```

## 🎬 Demo

### Key Demo Scenarios

1. **Position Opening**: User deposits assets into a vault through YieldOptimizer
2. **Automatic Optimization**: Backend service detects better yield opportunity and reallocates
3. **Manual Optimization**: User triggers optimization via API endpoint
4. **Statistics Dashboard**: View yield statistics and optimization history

### Demo Flow
1. Deploy YieldOptimizer contract
2. Whitelist GlueX vaults and routers
3. User deposits assets (e.g., USDC) into a vault
4. Backend monitors yields and detects better opportunity (e.g., 2% APY → 4% APY)
5. System automatically:
   - Gets quote from GlueX Router API
   - Executes swap and reallocation
   - Updates position in contract
   - Records optimization in database
6. User views updated position with higher yield

## 🔒 Security Features

- **ReentrancyGuard**: Prevents reentrancy attacks
- **Ownable**: Admin controls for whitelisting
- **Slippage Protection**: Minimum shares/amounts enforced
- **Whitelist System**: Only approved vaults and routers can be used
- **Pausable**: Emergency pause functionality

## 📊 GlueX Vaults Supported

The following GlueX vaults are integrated:
- `0xe25514992597786e07872e6c5517fe1906c0cadd`
- `0xcdc3975df9d1cf054f44ed238edfb708880292ea`
- `0x8f9291606862eef771a97e5b71e4b98fd1fa216a`
- `0x9f75eac57d1c6f7248bd2aede58c95689f3827f7`
- `0x63cf7ee583d9954febf649ad1c40c97a6493b1be`

## 🎯 Acceptance Criteria (GlueX Task)

- ✅ **ERC-4626/BoringVault Compatible**: Contract uses ERC-4626 standard for vault interactions
- ✅ **GlueX Yields API Integration**: Backend service fetches real-time yield data
- ✅ **GlueX Router API Integration**: Uses Router API for optimal swap routing
- ✅ **GlueX Vaults Whitelisted**: All 5 GlueX vaults are included in whitelist

## 🔮 Future Enhancements

- Frontend dashboard for user interaction
- Multi-asset optimization strategies
- Risk-adjusted yield scoring
- Gas optimization for frequent reallocations
- Governance token for protocol decisions

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Team

Built for the HyperEVM Hackathon 2024.

## 🙏 Acknowledgments

- GlueX for providing Yields and Router APIs
- Hyperliquid for the HyperEVM infrastructure
- OpenZeppelin for security-tested contracts

