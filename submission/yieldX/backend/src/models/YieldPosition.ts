import mongoose, { Schema, Document } from "mongoose";

export interface IYieldPosition extends Document {
  userAddress: string;
  positionIndex: number;
  vault: string;
  asset: string;
  shares: string;
  assets: string;
  apy?: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const YieldPositionSchema: Schema = new Schema(
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
    vault: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    asset: {
      type: String,
      required: true,
      lowercase: true,
    },
    shares: {
      type: String,
      required: true,
    },
    assets: {
      type: String,
      required: true,
    },
    apy: {
      type: Number,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for user and position
YieldPositionSchema.index({ userAddress: 1, positionIndex: 1 }, { unique: true });

export default mongoose.model<IYieldPosition>(
  "YieldPosition",
  YieldPositionSchema
);

