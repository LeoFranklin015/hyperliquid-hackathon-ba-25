import express from "express";
import cors from "cors";
import { Request, Response } from "express";
import { DatabaseService } from "./services/DatabaseService";
import { DatabaseConnection } from "./config/database";
import { YieldOptimizationService } from "./services/YieldOptimizationService";

const app = express();
const PORT = process.env.PORT || 3001;

let dbService: DatabaseService | null = null;
let dbConnection: DatabaseConnection | null = null;
let yieldOptimizationService: YieldOptimizationService | null = null;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  const databaseStats = dbConnection?.getConnectionInfo() || {
    isConnected: false,
    readyState: 0,
  };

  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "yield-optimization-backend",
    version: "1.0.0",
    yield: {
      initialized: yieldOptimizationService !== null,
    },
    database: databaseStats,
  });
});

// Basic info endpoint
app.get("/", (_req: Request, res: Response) => {
  res.json({
    message: "Yield Optimization Backend Service",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      "yield-positions": "/api/yield/positions/:userAddress",
      "yield-optimize": "/api/yield/optimize/:userAddress/:positionIndex",
      "yield-optimize-all": "/api/yield/optimize-all",
      "yield-statistics": "/api/yield/statistics",
      "yield-optimizations": "/api/yield/optimizations/:userAddress",
      "yield-stats": "/api/yield/stats",
    },
  });
});

// ===== YIELD OPTIMIZATION API ENDPOINTS =====

// Get user yield positions
app.get(
  "/api/yield/positions/:userAddress",
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!yieldOptimizationService) {
        res.status(500).json({ error: "Yield Optimization Service not initialized" });
        return;
      }

      const { userAddress } = req.params;
      const positions = await yieldOptimizationService.getUserPositions(userAddress);

      res.json({
        message: "User Yield Positions",
        userAddress,
        positions,
        count: positions.length,
      });
    } catch (error) {
      console.error("Failed to get user yield positions:", error);
      res.status(500).json({
        error: "Failed to get user yield positions",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Optimize a specific position
app.post(
  "/api/yield/optimize/:userAddress/:positionIndex",
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!yieldOptimizationService) {
        res.status(500).json({ error: "Yield Optimization Service not initialized" });
        return;
      }

      const { userAddress, positionIndex } = req.params;
      const positionIdx = parseInt(positionIndex);

      if (isNaN(positionIdx)) {
        res.status(400).json({ error: "Invalid position index" });
        return;
      }

      const result = await yieldOptimizationService.optimizePosition(
        userAddress,
        positionIdx
      );

      res.json({
        message: result.success ? "Position optimized successfully" : "Optimization skipped",
        result,
      });
    } catch (error) {
      console.error("Failed to optimize position:", error);
      res.status(500).json({
        error: "Failed to optimize position",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Optimize all positions (manual trigger)
app.post(
  "/api/yield/optimize-all",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      if (!yieldOptimizationService) {
        res.status(500).json({ error: "Yield Optimization Service not initialized" });
        return;
      }

      // Start optimization in background
      yieldOptimizationService.optimizeAllPositions().catch((error) => {
        console.error("❌ Background yield optimization failed:", error);
      });

      res.json({
        message: "Yield optimization started",
        status: "optimizing",
        timestamp: new Date().toISOString(),
        note: "Optimization is running in the background. Check logs for progress.",
      });
    } catch (error) {
      console.error("Failed to start yield optimization:", error);
      res.status(500).json({
        error: "Failed to start yield optimization",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Get yield statistics across all vaults
app.get(
  "/api/yield/statistics",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      if (!yieldOptimizationService) {
        res.status(500).json({ error: "Yield Optimization Service not initialized" });
        return;
      }

      const stats = await yieldOptimizationService.getYieldStatistics();

      res.json({
        message: "Yield Statistics",
        statistics: stats,
      });
    } catch (error) {
      console.error("Failed to get yield statistics:", error);
      res.status(500).json({
        error: "Failed to get yield statistics",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Get yield optimizations for a user
app.get(
  "/api/yield/optimizations/:userAddress",
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!dbService) {
        res.status(500).json({ error: "Database service not initialized" });
        return;
      }

      const { userAddress } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const optimizations = await dbService.getUserYieldOptimizations(userAddress, limit);

      res.json({
        message: "User Yield Optimizations",
        userAddress,
        optimizations,
        count: optimizations.length,
      });
    } catch (error) {
      console.error("Failed to get user yield optimizations:", error);
      res.status(500).json({
        error: "Failed to get user yield optimizations",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Get yield optimization statistics
app.get(
  "/api/yield/stats",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      if (!dbService) {
        res.status(500).json({ error: "Database service not initialized" });
        return;
      }

      const stats = await dbService.getYieldOptimizationStats();

      res.json({
        message: "Yield Optimization Statistics",
        stats,
      });
    } catch (error) {
      console.error("Failed to get yield optimization stats:", error);
      res.status(500).json({
        error: "Failed to get yield optimization stats",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Initialize services on startup
async function initializeServices() {
  try {
    console.log("🔧 Initializing services...");

    // Initialize Database Connection
    dbConnection = DatabaseConnection.getInstance();
    await dbConnection.connect();

    // Initialize Database Service
    dbService = DatabaseService.getInstance();
    console.log("✅ Database services initialized");

    // Initialize Yield Optimization Service
    const optimizerContractAddress =
      process.env.YIELD_OPTIMIZER_CONTRACT_ADDRESS ||
      "0x0000000000000000000000000000000000000000";
    
    if (optimizerContractAddress !== "0x0000000000000000000000000000000000000000") {
      yieldOptimizationService = new YieldOptimizationService(optimizerContractAddress);
      console.log("✅ Yield Optimization Service initialized");
      
      // Optionally start automated optimization (runs every hour)
      // yieldOptimizationService.startOptimization();
      // console.log("✅ Automated yield optimization started");
    } else {
      console.log(
        "⚠️  Warning: Yield Optimizer contract address not set. Please set YIELD_OPTIMIZER_CONTRACT_ADDRESS environment variable."
      );
    }
  } catch (error) {
    console.error("❌ Failed to initialize services:", error);
    console.log("🔄 Services will be available via API endpoints");
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down gracefully...");
  if (yieldOptimizationService) {
    yieldOptimizationService.stopOptimization();
  }
  if (dbConnection) {
    await dbConnection.disconnect();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down gracefully...");
  if (yieldOptimizationService) {
    yieldOptimizationService.stopOptimization();
  }
  if (dbConnection) {
    await dbConnection.disconnect();
  }
  process.exit(0);
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Yield Optimization Backend running on port ${PORT}`);
  console.log(`🏥 Health check available at http://localhost:${PORT}/health`);

  // Initialize services after server starts
  await initializeServices();
});

export default app;
