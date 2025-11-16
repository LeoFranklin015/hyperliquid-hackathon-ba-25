import mongoose, { Schema, Document } from "mongoose";

export interface IYieldOptimization extends Document {
  userAddress: string;
  positionIndex: number;
  fromVault: string;
  toVault: string;
  assetsReallocated: string;
  previousAPY: number;
  newAPY: number;
  transactionHash?: string;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const YieldOptimizationSchema: Schema = new Schema(
  {
    userAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    positionIndex: {
      type: Number,
      required: true,
    },
    fromVault: {
      type: String,
      required: true,
      lowercase: true,
    },
    toVault: {
      type: String,
      required: true,
      lowercase: true,
    },
    assetsReallocated: {
      type: String,
      required: true,
    },
    previousAPY: {
      type: Number,
      required: true,
    },
    newAPY: {
      type: Number,
      required: true,
    },
    transactionHash: {
      type: String,
      lowercase: true,
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for user optimizations
YieldOptimizationSchema.index({ userAddress: 1, timestamp: -1 });

export default mongoose.model<IYieldOptimization>(
  "YieldOptimization",
  YieldOptimizationSchema
);

