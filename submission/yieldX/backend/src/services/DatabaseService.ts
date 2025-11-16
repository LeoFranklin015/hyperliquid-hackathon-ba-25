import DCAOrder, { IDCAOrder } from "../models/DCAOrder";
import DCAExecution, { IDCAExecution } from "../models/DCAExecution";
import LimitOrder, { ILimitOrder } from "../models/LimitOrder";
import TWAPOrder, { ITWAPOrder } from "../models/TWAPOrder";
import TWAPExecution, { ITWAPExecution } from "../models/TWAPExecution";
import YieldPosition, { IYieldPosition } from "../models/YieldPosition";
import YieldOptimization, { IYieldOptimization } from "../models/YieldOptimization";
import {
  ParsedDCAOrder,
  ParsedLimitOrder,
  ParsedTWAPOrder,
} from "./EventListener";
import { ScheduledDCAJob, ScheduledTWAPJob } from "./Scheduler";

export class DatabaseService {
  private static instance: DatabaseService;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Save a new DCA order from blockchain event
   */
  async saveDCAOrder(parsedOrder: ParsedDCAOrder): Promise<IDCAOrder> {
    try {
      // Create installment array with scheduled times
      const installments = [];
      for (let i = 1; i <= parsedOrder.installmentsLeft; i++) {
        const scheduledTime = new Date(
          parsedOrder.nextExecutionTime.getTime() +
            (i - 1) * parsedOrder.intervalSeconds * 1000
        );
        installments.push({
          installmentNumber: i,
          scheduledTime,
          status: "pending",
        });
      }

      const dcaOrder = new DCAOrder({
        orderId: parsedOrder.orderId,
        userAddress: parsedOrder.userAddress,
        inputToken: parsedOrder.inputToken,
        outputToken: parsedOrder.outputToken,
        totalAmount: parsedOrder.totalAmount,
        amountPerInstallment: parsedOrder.amountPerInstallment,
        installmentsLeft: parsedOrder.installmentsLeft,
        totalInstallments: parsedOrder.installmentsLeft,
        intervalSeconds: parsedOrder.intervalSeconds,
        nextExecutionTime: parsedOrder.nextExecutionTime,
        status: parsedOrder.status,
        installments,
        completedInstallments: 0,
      });

      const savedOrder = await dcaOrder.save();
      console.log(
        `💾 Saved DCA Order: ${savedOrder.orderId} (${installments.length} installments)`
      );
      return savedOrder;
    } catch (error) {
      console.error(
        `❌ Failed to save DCA order ${parsedOrder.orderId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Save a new Limit Order from blockchain event
   */
  async saveLimitOrder(parsedOrder: ParsedLimitOrder): Promise<ILimitOrder> {
    try {
      const limitOrder = new LimitOrder({
        orderId: parsedOrder.orderId,
        userAddress: parsedOrder.userAddress,
        inputToken: parsedOrder.inputToken,
        outputToken: parsedOrder.outputToken,
        inputAmount: parsedOrder.inputAmount,
        limitPrice: parsedOrder.limitPrice,
        isBuy: parsedOrder.isBuy,
        status: parsedOrder.status,
      });

      const savedOrder = await limitOrder.save();
      console.log(`💾 Saved Limit Order: ${savedOrder.orderId}`);
      return savedOrder;
    } catch (error) {
      console.error(
        `❌ Failed to save Limit Order ${parsedOrder.orderId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Save a new TWAP Order from blockchain event
   */
  async saveTWAPOrder(parsedOrder: ParsedTWAPOrder): Promise<ITWAPOrder> {
    try {
      // Create chunk array with scheduled times
      const chunks = [];
      const chunkInterval = parsedOrder.timeWindow / parsedOrder.totalChunks;

      for (let i = 1; i <= parsedOrder.totalChunks; i++) {
        const scheduledTime = new Date(
          parsedOrder.nextExecutionTime.getTime() +
            (i - 1) * chunkInterval * 1000
        );
        chunks.push({
          chunkNumber: i,
          scheduledTime,
          status: "pending",
        });
      }

      const twapOrder = new TWAPOrder({
        orderId: parsedOrder.orderId,
        userAddress: parsedOrder.userAddress,
        inputToken: parsedOrder.inputToken,
        outputToken: parsedOrder.outputToken,
        totalAmount: parsedOrder.totalAmount,
        amountPerChunk: parsedOrder.amountPerChunk,
        chunksLeft: parsedOrder.chunksLeft,
        totalChunks: parsedOrder.totalChunks,
        timeWindow: parsedOrder.timeWindow,
        startTime: parsedOrder.startTime,
        endTime: parsedOrder.endTime,
        nextExecutionTime: parsedOrder.nextExecutionTime,
        outputReceiver: parsedOrder.outputReceiver,
        status: parsedOrder.status,
        chunks,
        completedChunks: 0,
      });

      const savedOrder = await twapOrder.save();
      console.log(
        `💾 Saved TWAP Order: ${savedOrder.orderId} (${chunks.length} chunks)`
      );
      return savedOrder;
    } catch (error) {
      console.error(
        `❌ Failed to save TWAP order ${parsedOrder.orderId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Create execution records for scheduled DCA jobs
   */
  async createExecutionRecords(
    orderId: string,
    jobs: ScheduledDCAJob[]
  ): Promise<IDCAExecution[]> {
    try {
      const executions = jobs.map((job) => ({
        orderId: job.orderId,
        jobId: job.jobId,
        userAddress: job.userAddress,
        installmentNumber: job.installmentNumber,
        totalInstallments: job.totalInstallments,
        amountPerInstallment: job.amountPerInstallment,
        inputToken: job.inputToken,
        outputToken: job.outputToken,
        scheduledTime: job.nextExecutionTime,
        status: "pending" as const,
        retryCount: 0,
      }));

      const savedExecutions = await DCAExecution.insertMany(executions);
      console.log(
        `💾 Created ${savedExecutions.length} DCA execution records for Order: ${orderId}`
      );
      return savedExecutions;
    } catch (error) {
      console.error(
        `❌ Failed to create DCA execution records for order ${orderId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Create execution records for scheduled TWAP jobs
   */
  async createTWAPExecutionRecords(
    orderId: string,
    jobs: ScheduledTWAPJob[]
  ): Promise<ITWAPExecution[]> {
    try {
      const executions = jobs.map((job) => ({
        orderId: job.orderId,
        jobId: job.jobId,
        userAddress: job.userAddress,
        chunkNumber: job.chunkNumber,
        totalChunks: job.totalChunks,
        amountPerChunk: job.amountPerChunk,
        inputToken: job.inputToken,
        outputToken: job.outputToken,
        scheduledTime: job.nextExecutionTime,
        status: "pending" as const,
        retryCount: 0,
        createdAt: new Date(),
      }));

      const savedExecutions = await TWAPExecution.insertMany(executions);
      console.log(
        `💾 Created ${savedExecutions.length} TWAP execution records for Order: ${orderId}`
      );
      return savedExecutions;
    } catch (error) {
      console.error(
        `❌ Failed to create TWAP execution records for order ${orderId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update execution status when job starts
   */
  async updateExecutionStart(jobId: string): Promise<void> {
    try {
      // Update DCAExecution record
      await DCAExecution.findOneAndUpdate(
        { jobId },
        {
          status: "executing",
          executedAt: new Date(),
        }
      );

      // Update installment status in DCAOrder
      const execution = await DCAExecution.findOne({ jobId });
      if (execution) {
        await DCAOrder.findOneAndUpdate(
          {
            orderId: execution.orderId,
            "installments.installmentNumber": execution.installmentNumber,
          },
          {
            $set: {
              "installments.$.status": "executing",
              "installments.$.executedAt": new Date(),
            },
          }
        );
      }

      console.log(`📝 Updated execution start: ${jobId}`);
    } catch (error) {
      console.error(
        `❌ Failed to update execution start for job ${jobId}:`,
        error
      );
    }
  }

  /**
   * Update execution status when job completes successfully
   */
  async updateExecutionSuccess(
    jobId: string,
    transactionHash?: string,
    gasUsed?: string
  ): Promise<void> {
    try {
      const completedAt = new Date();

      // Update DCAExecution record
      await DCAExecution.findOneAndUpdate(
        { jobId },
        {
          status: "completed",
          completedAt,
          transactionHash,
          gasUsed,
        }
      );

      // Update installment status in DCAOrder and check if order is complete
      const execution = await DCAExecution.findOne({ jobId });
      if (execution) {
        // Update the specific installment
        await DCAOrder.findOneAndUpdate(
          {
            orderId: execution.orderId,
            "installments.installmentNumber": execution.installmentNumber,
          },
          {
            $set: {
              "installments.$.status": "completed",
              "installments.$.completedAt": completedAt,
              "installments.$.transactionHash": transactionHash,
              "installments.$.gasUsed": gasUsed,
            },
            $inc: { completedInstallments: 1 },
          }
        );

        // Check if all installments are completed
        await this.checkAndUpdateOrderCompletion(execution.orderId);
      }

      console.log(`✅ Updated execution success: ${jobId}`);
    } catch (error) {
      console.error(
        `❌ Failed to update execution success for job ${jobId}:`,
        error
      );
    }
  }

  /**
   * Update execution status when job fails
   */
  async updateExecutionFailure(
    jobId: string,
    errorMessage: string
  ): Promise<void> {
    try {
      const completedAt = new Date();

      // Update DCAExecution record
      await DCAExecution.findOneAndUpdate(
        { jobId },
        {
          status: "failed",
          completedAt,
          errorMessage,
          $inc: { retryCount: 1 },
        }
      );

      // Update installment status in DCAOrder
      const execution = await DCAExecution.findOne({ jobId });
      if (execution) {
        await DCAOrder.findOneAndUpdate(
          {
            orderId: execution.orderId,
            "installments.installmentNumber": execution.installmentNumber,
          },
          {
            $set: {
              "installments.$.status": "failed",
              "installments.$.completedAt": completedAt,
              "installments.$.errorMessage": errorMessage,
            },
          }
        );

        // Check if we should mark the entire order as failed
        await this.checkAndUpdateOrderCompletion(execution.orderId);
      }

      console.log(`❌ Updated execution failure: ${jobId}`);
    } catch (error) {
      console.error(
        `❌ Failed to update execution failure for job ${jobId}:`,
        error
      );
    }
  }

  /**
   * Update TWAP execution status when job starts
   */
  async updateTWAPExecutionStart(jobId: string): Promise<void> {
    try {
      // Update TWAPExecution record
      await TWAPExecution.findOneAndUpdate(
        { jobId },
        {
          status: "executing",
          executedAt: new Date(),
        }
      );

      // Update chunk status in TWAPOrder
      const execution = await TWAPExecution.findOne({ jobId });
      if (execution) {
        await TWAPOrder.findOneAndUpdate(
          {
            orderId: execution.orderId,
            "chunks.chunkNumber": execution.chunkNumber,
          },
          {
            $set: {
              "chunks.$.status": "executing",
              "chunks.$.executedAt": new Date(),
            },
          }
        );
      }

      console.log(`📝 Updated TWAP execution start: ${jobId}`);
    } catch (error) {
      console.error(
        `❌ Failed to update TWAP execution start for job ${jobId}:`,
        error
      );
    }
  }

  /**
   * Update TWAP execution status when job completes successfully
   */
  async updateTWAPExecutionSuccess(
    jobId: string,
    transactionHash?: string,
    gasUsed?: string
  ): Promise<void> {
    try {
      const completedAt = new Date();

      // Update TWAPExecution record
      await TWAPExecution.findOneAndUpdate(
        { jobId },
        {
          status: "completed",
          completedAt,
          transactionHash,
          gasUsed,
        }
      );

      // Update chunk status in TWAPOrder and check if order is complete
      const execution = await TWAPExecution.findOne({ jobId });
      if (execution) {
        // Update the specific chunk
        await TWAPOrder.findOneAndUpdate(
          {
            orderId: execution.orderId,
            "chunks.chunkNumber": execution.chunkNumber,
          },
          {
            $set: {
              "chunks.$.status": "completed",
              "chunks.$.completedAt": completedAt,
              "chunks.$.transactionHash": transactionHash,
              "chunks.$.gasUsed": gasUsed,
            },
            $inc: { completedChunks: 1 },
          }
        );

        // Check if all chunks are completed
        await this.checkAndUpdateTWAPOrderCompletion(execution.orderId);
      }

      console.log(`✅ Updated TWAP execution success: ${jobId}`);
    } catch (error) {
      console.error(
        `❌ Failed to update TWAP execution success for job ${jobId}:`,
        error
      );
    }
  }

  /**
   * Update TWAP execution status when job fails
   */
  async updateTWAPExecutionFailure(
    jobId: string,
    errorMessage: string
  ): Promise<void> {
    try {
      const completedAt = new Date();

      // Update TWAPExecution record
      await TWAPExecution.findOneAndUpdate(
        { jobId },
        {
          status: "failed",
          completedAt,
          errorMessage,
          $inc: { retryCount: 1 },
        }
      );

      // Update chunk status in TWAPOrder
      const execution = await TWAPExecution.findOne({ jobId });
      if (execution) {
        await TWAPOrder.findOneAndUpdate(
          {
            orderId: execution.orderId,
            "chunks.chunkNumber": execution.chunkNumber,
          },
          {
            $set: {
              "chunks.$.status": "failed",
              "chunks.$.completedAt": completedAt,
              "chunks.$.errorMessage": errorMessage,
            },
          }
        );

        // Check if we should mark the entire order as failed
        await this.checkAndUpdateTWAPOrderCompletion(execution.orderId);
      }

      console.log(`❌ Updated TWAP execution failure: ${jobId}`);
    } catch (error) {
      console.error(
        `❌ Failed to update TWAP execution failure for job ${jobId}:`,
        error
      );
    }
  }

  /**
   * Get DCA orders for a user
   */
  async getUserDCAOrders(
    userAddress: string,
    status?: string
  ): Promise<IDCAOrder[]> {
    try {
      const query: any = { userAddress };
      if (status) {
        query.status = status;
      }

      const orders = await DCAOrder.find(query).sort({ createdAt: -1 });
      return orders;
    } catch (error) {
      console.error(
        `❌ Failed to get DCA orders for user ${userAddress}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get executions for a DCA order
   */
  async getOrderExecutions(orderId: string): Promise<IDCAExecution[]> {
    try {
      const executions = await DCAExecution.find({ orderId }).sort({
        installmentNumber: 1,
      });
      return executions;
    } catch (error) {
      console.error(`❌ Failed to get executions for order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Get executions for a user
   */
  async getUserExecutions(
    userAddress: string,
    limit: number = 50
  ): Promise<IDCAExecution[]> {
    try {
      const executions = await DCAExecution.find({ userAddress })
        .sort({ createdAt: -1 })
        .limit(limit);
      return executions;
    } catch (error) {
      console.error(
        `❌ Failed to get executions for user ${userAddress}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<{
    totalOrders: number;
    activeOrders: number;
    completedOrders: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    totalTWAPOrders: number;
    activeTWAPOrders: number;
    completedTWAPOrders: number;
    totalTWAPExecutions: number;
    successfulTWAPExecutions: number;
    failedTWAPExecutions: number;
  }> {
    try {
      const [
        totalOrders,
        activeOrders,
        completedOrders,
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        totalTWAPOrders,
        activeTWAPOrders,
        completedTWAPOrders,
        totalTWAPExecutions,
        successfulTWAPExecutions,
        failedTWAPExecutions,
      ] = await Promise.all([
        DCAOrder.countDocuments(),
        DCAOrder.countDocuments({ status: "active" }),
        DCAOrder.countDocuments({ status: "completed" }),
        DCAExecution.countDocuments(),
        DCAExecution.countDocuments({ status: "completed" }),
        DCAExecution.countDocuments({ status: "failed" }),
        TWAPOrder.countDocuments(),
        TWAPOrder.countDocuments({ status: "active" }),
        TWAPOrder.countDocuments({ status: "completed" }),
        TWAPExecution.countDocuments(),
        TWAPExecution.countDocuments({ status: "completed" }),
        TWAPExecution.countDocuments({ status: "failed" }),
      ]);

      return {
        totalOrders,
        activeOrders,
        completedOrders,
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        totalTWAPOrders,
        activeTWAPOrders,
        completedTWAPOrders,
        totalTWAPExecutions,
        successfulTWAPExecutions,
        failedTWAPExecutions,
      };
    } catch (error) {
      console.error("❌ Failed to get dashboard stats:", error);
      throw error;
    }
  }

  /**
   * Update DCA order status
   */
  async updateOrderStatus(
    orderId: string,
    status: "active" | "completed" | "cancelled" | "failed"
  ): Promise<void> {
    try {
      await DCAOrder.findOneAndUpdate({ orderId }, { status });
      console.log(`📝 Updated order ${orderId} status to: ${status}`);
    } catch (error) {
      console.error(`❌ Failed to update order status for ${orderId}:`, error);
    }
  }

  /**
   * Update TWAP order status
   */
  async updateTWAPOrderStatus(
    orderId: string,
    status: "active" | "completed" | "cancelled" | "failed"
  ): Promise<void> {
    try {
      await TWAPOrder.findOneAndUpdate({ orderId }, { status });
      console.log(`📝 Updated TWAP order ${orderId} status to: ${status}`);
    } catch (error) {
      console.error(
        `❌ Failed to update TWAP order status for ${orderId}:`,
        error
      );
    }
  }

  /**
   * Check if all installments are completed and update order status accordingly
   */
  private async checkAndUpdateOrderCompletion(orderId: string): Promise<void> {
    try {
      const order = await DCAOrder.findOne({ orderId });
      if (!order) return;

      const completedInstallments = order.installments.filter(
        (inst) => inst.status === "completed"
      ).length;
      const failedInstallments = order.installments.filter(
        (inst) => inst.status === "failed"
      ).length;
      const totalInstallments = order.totalInstallments;

      let newStatus = order.status;

      if (completedInstallments === totalInstallments) {
        // All installments completed successfully
        newStatus = "completed";
        console.log(
          `🎉 DCA Order ${orderId} completed - all ${totalInstallments} installments done`
        );
      } else if (
        failedInstallments > 0 &&
        completedInstallments + failedInstallments === totalInstallments
      ) {
        // Some installments failed, but all are processed
        newStatus = "failed";
        console.log(
          `❌ DCA Order ${orderId} failed - ${failedInstallments} installments failed`
        );
      }

      if (newStatus !== order.status) {
        await DCAOrder.findOneAndUpdate(
          { orderId },
          {
            status: newStatus,
            installmentsLeft: totalInstallments - completedInstallments,
          }
        );
        console.log(`📝 Updated DCA Order ${orderId} status to: ${newStatus}`);
      }
    } catch (error) {
      console.error(
        `❌ Failed to check order completion for ${orderId}:`,
        error
      );
    }
  }

  /**
   * Check if all chunks are completed and update TWAP order status accordingly
   */
  private async checkAndUpdateTWAPOrderCompletion(
    orderId: string
  ): Promise<void> {
    try {
      const order = await TWAPOrder.findOne({ orderId });
      if (!order) return;

      const completedChunks = order.chunks.filter(
        (chunk) => chunk.status === "completed"
      ).length;
      const failedChunks = order.chunks.filter(
        (chunk) => chunk.status === "failed"
      ).length;
      const totalChunks = order.totalChunks;

      let newStatus = order.status;

      if (completedChunks === totalChunks) {
        // All chunks completed successfully
        newStatus = "completed";
        console.log(
          `🎉 TWAP Order ${orderId} completed - all ${totalChunks} chunks done`
        );
      } else if (
        failedChunks > 0 &&
        completedChunks + failedChunks === totalChunks
      ) {
        // Some chunks failed, but all are processed
        newStatus = "failed";
        console.log(
          `❌ TWAP Order ${orderId} failed - ${failedChunks} chunks failed`
        );
      }

      if (newStatus !== order.status) {
        await TWAPOrder.findOneAndUpdate(
          { orderId },
          {
            status: newStatus,
            chunksLeft: totalChunks - completedChunks,
          }
        );
        console.log(`📝 Updated TWAP Order ${orderId} status to: ${newStatus}`);
      }
    } catch (error) {
      console.error(
        `❌ Failed to check TWAP order completion for ${orderId}:`,
        error
      );
    }
  }

  /**
   * Get installment details for a specific order
   */
  async getOrderInstallments(orderId: string): Promise<{
    orderId: string;
    totalInstallments: number;
    completedInstallments: number;
    installments: any[];
  } | null> {
    try {
      const order = await DCAOrder.findOne({ orderId });
      if (!order) return null;

      return {
        orderId: order.orderId,
        totalInstallments: order.totalInstallments,
        completedInstallments: order.completedInstallments,
        installments: order.installments.map((inst) => ({
          installmentNumber: inst.installmentNumber,
          scheduledTime: inst.scheduledTime,
          status: inst.status,
          transactionHash: inst.transactionHash,
          executedAt: inst.executedAt,
          completedAt: inst.completedAt,
          gasUsed: inst.gasUsed,
          errorMessage: inst.errorMessage,
        })),
      };
    } catch (error) {
      console.error(
        `❌ Failed to get installments for order ${orderId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get recent activity for dashboard
   */
  async getRecentActivity(limit: number = 20): Promise<{
    recentOrders: IDCAOrder[];
    recentExecutions: IDCAExecution[];
    recentTWAPOrders: ITWAPOrder[];
    recentTWAPExecutions: ITWAPExecution[];
  }> {
    try {
      const [
        recentOrders,
        recentExecutions,
        recentTWAPOrders,
        recentTWAPExecutions,
      ] = await Promise.all([
        DCAOrder.find().sort({ createdAt: -1 }).limit(limit),
        DCAExecution.find().sort({ createdAt: -1 }).limit(limit),
        TWAPOrder.find().sort({ createdAt: -1 }).limit(limit),
        TWAPExecution.find().sort({ createdAt: -1 }).limit(limit),
      ]);

      return {
        recentOrders,
        recentExecutions,
        recentTWAPOrders,
        recentTWAPExecutions,
      };
    } catch (error) {
      console.error("❌ Failed to get recent activity:", error);
      throw error;
    }
  }

  // ===== LIMIT ORDER METHODS =====

  /**
   * Get Limit Orders for a user
   */
  async getUserLimitOrders(
    userAddress: string,
    status?: string
  ): Promise<ILimitOrder[]> {
    try {
      const query: any = { userAddress };
      if (status) {
        query.status = status;
      }

      const orders = await LimitOrder.find(query).sort({ createdAt: -1 });
      return orders;
    } catch (error) {
      console.error(
        `❌ Failed to get Limit Orders for user ${userAddress}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get Limit Order by ID
   */
  async getLimitOrder(orderId: string): Promise<ILimitOrder | null> {
    try {
      const order = await LimitOrder.findOne({ orderId });
      return order;
    } catch (error) {
      console.error(`❌ Failed to get Limit Order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Update Limit Order status
   */
  async updateLimitOrderStatus(
    orderId: string,
    status: "active" | "executed" | "cancelled" | "expired"
  ): Promise<void> {
    try {
      await LimitOrder.findOneAndUpdate({ orderId }, { status });
      console.log(`📝 Updated Limit Order ${orderId} status to: ${status}`);
    } catch (error) {
      console.error(
        `❌ Failed to update Limit Order status for ${orderId}:`,
        error
      );
    }
  }

  /**
   * Mark Limit Order as executed
   */
  async markLimitOrderExecuted(
    orderId: string,
    outputAmount: string,
    executedPrice: string,
    keeper: string,
    executionTransactionHash: string
  ): Promise<void> {
    try {
      await LimitOrder.findOneAndUpdate(
        { orderId },
        {
          status: "executed",
          executedAt: new Date(),
          outputAmount,
          executedPrice,
          keeper,
          executionTransactionHash,
        }
      );
      console.log(`✅ Marked Limit Order ${orderId} as executed`);
    } catch (error) {
      console.error(
        `❌ Failed to mark Limit Order ${orderId} as executed:`,
        error
      );
    }
  }

  /**
   * Get Limit Order statistics
   */
  async getLimitOrderStats(): Promise<{
    totalOrders: number;
    activeOrders: number;
    executedOrders: number;
    cancelledOrders: number;
  }> {
    try {
      const [totalOrders, activeOrders, executedOrders, cancelledOrders] =
        await Promise.all([
          LimitOrder.countDocuments(),
          LimitOrder.countDocuments({ status: "active" }),
          LimitOrder.countDocuments({ status: "executed" }),
          LimitOrder.countDocuments({ status: "cancelled" }),
        ]);

      return {
        totalOrders,
        activeOrders,
        executedOrders,
        cancelledOrders,
      };
    } catch (error) {
      console.error("❌ Failed to get Limit Order stats:", error);
      throw error;
    }
  }

  async getActiveLimitOrders(): Promise<any[]> {
    const data = await LimitOrder.find({ status: "active" });
    return data;
  }

  /**
   * Get TWAP Order by ID
   */
  async getTWAPOrder(orderId: string): Promise<ITWAPOrder | null> {
    try {
      const order = await TWAPOrder.findOne({ orderId });
      return order;
    } catch (error) {
      console.error(`❌ Failed to get TWAP Order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Get TWAP orders for a specific user
   */
  async getUserTWAPOrders(
    userAddress: string,
    status?: string
  ): Promise<ITWAPOrder[]> {
    try {
      const query: any = { userAddress };
      if (status) {
        query.status = status;
      }

      const orders = await TWAPOrder.find(query).sort({ createdAt: -1 });
      return orders;
    } catch (error) {
      console.error(
        `❌ Failed to get TWAP orders for user ${userAddress}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get TWAP order statistics
   */
  async getTWAPOrderStats(): Promise<{
    totalOrders: number;
    activeOrders: number;
    completedOrders: number;
    failedOrders: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
  }> {
    try {
      const [
        totalOrders,
        activeOrders,
        completedOrders,
        failedOrders,
        totalExecutions,
        successfulExecutions,
        failedExecutions,
      ] = await Promise.all([
        TWAPOrder.countDocuments(),
        TWAPOrder.countDocuments({ status: "active" }),
        TWAPOrder.countDocuments({ status: "completed" }),
        TWAPOrder.countDocuments({ status: "failed" }),
        TWAPExecution.countDocuments(),
        TWAPExecution.countDocuments({ status: "completed" }),
        TWAPExecution.countDocuments({ status: "failed" }),
      ]);

      return {
        totalOrders,
        activeOrders,
        completedOrders,
        failedOrders,
        totalExecutions,
        successfulExecutions,
        failedExecutions,
      };
    } catch (error) {
      console.error("❌ Failed to get TWAP Order stats:", error);
      throw error;
    }
  }

  /**
   * Get TWAP executions for a specific order
   */
  async getTWAPOrderExecutions(orderId: string): Promise<ITWAPExecution[]> {
    try {
      const executions = await TWAPExecution.find({ orderId }).sort({
        chunkNumber: 1,
      });
      return executions;
    } catch (error) {
      console.error(
        `❌ Failed to get TWAP executions for order ${orderId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get TWAP executions for a specific user
   */
  async getUserTWAPExecutions(
    userAddress: string,
    limit: number = 50
  ): Promise<ITWAPExecution[]> {
    try {
      const executions = await TWAPExecution.find({ userAddress })
        .sort({ createdAt: -1 })
        .limit(limit);
      return executions;
    } catch (error) {
      console.error(
        `❌ Failed to get TWAP executions for user ${userAddress}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Save a yield optimization transaction
   */
  async saveYieldOptimization(
    optimization: {
      userAddress: string;
      positionIndex: number;
      fromVault: string;
      toVault: string;
      assetsReallocated: string;
      previousAPY: number;
      newAPY: number;
      transactionHash?: string;
      timestamp: Date;
    }
  ): Promise<IYieldOptimization> {
    try {
      const yieldOptimization = new YieldOptimization({
        userAddress: optimization.userAddress.toLowerCase(),
        positionIndex: optimization.positionIndex,
        fromVault: optimization.fromVault.toLowerCase(),
        toVault: optimization.toVault.toLowerCase(),
        assetsReallocated: optimization.assetsReallocated,
        previousAPY: optimization.previousAPY,
        newAPY: optimization.newAPY,
        transactionHash: optimization.transactionHash?.toLowerCase(),
        timestamp: optimization.timestamp,
      });

      const saved = await yieldOptimization.save();
      console.log(
        `💾 Saved Yield Optimization: ${saved._id} for user ${optimization.userAddress}`
      );
      return saved;
    } catch (error) {
      console.error(
        `❌ Failed to save yield optimization:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get yield optimizations for a user
   */
  async getUserYieldOptimizations(
    userAddress: string,
    limit: number = 50
  ): Promise<IYieldOptimization[]> {
    try {
      const optimizations = await YieldOptimization.find({
        userAddress: userAddress.toLowerCase(),
      })
        .sort({ timestamp: -1 })
        .limit(limit);
      return optimizations;
    } catch (error) {
      console.error(
        `❌ Failed to get yield optimizations for user ${userAddress}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all users with yield positions
   */
  async getUsersWithYieldPositions(): Promise<string[]> {
    try {
      const positions = await YieldPosition.find({ active: true }).distinct(
        "userAddress"
      );
      return positions;
    } catch (error) {
      console.error(`❌ Failed to get users with yield positions:`, error);
      return [];
    }
  }

  /**
   * Save or update a yield position
   */
  async saveYieldPosition(
    position: {
      userAddress: string;
      positionIndex: number;
      vault: string;
      asset: string;
      shares: string;
      assets: string;
      apy?: number;
      active: boolean;
    }
  ): Promise<IYieldPosition> {
    try {
      const yieldPosition = await YieldPosition.findOneAndUpdate(
        {
          userAddress: position.userAddress.toLowerCase(),
          positionIndex: position.positionIndex,
        },
        {
          vault: position.vault.toLowerCase(),
          asset: position.asset.toLowerCase(),
          shares: position.shares,
          assets: position.assets,
          apy: position.apy,
          active: position.active,
        },
        { upsert: true, new: true }
      );

      return yieldPosition;
    } catch (error) {
      console.error(`❌ Failed to save yield position:`, error);
      throw error;
    }
  }

  /**
   * Get yield optimization statistics
   */
  async getYieldOptimizationStats(): Promise<{
    totalOptimizations: number;
    successfulOptimizations: number;
    totalAssetsReallocated: string;
    averageAPYImprovement: number;
  }> {
    try {
      const optimizations = await YieldOptimization.find();
      
      const totalOptimizations = optimizations.length;
      const successfulOptimizations = optimizations.filter(
        (opt) => opt.transactionHash
      ).length;
      
      const totalAssetsReallocated = optimizations.reduce(
        (sum, opt) => sum + BigInt(opt.assetsReallocated),
        BigInt(0)
      ).toString();
      
      const apyImprovements = optimizations.map(
        (opt) => opt.newAPY - opt.previousAPY
      );
      const averageAPYImprovement =
        apyImprovements.length > 0
          ? apyImprovements.reduce((sum, imp) => sum + imp, 0) /
            apyImprovements.length
          : 0;

      return {
        totalOptimizations,
        successfulOptimizations,
        totalAssetsReallocated,
        averageAPYImprovement,
      };
    } catch (error) {
      console.error(`❌ Failed to get yield optimization stats:`, error);
      throw error;
    }
  }
}
