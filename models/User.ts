import { Schema, model, models, type Model, type Types } from "mongoose";

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  quotaBytes: number;
  usedBytes: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    quotaBytes: { type: Number, default: 50 * 1024 * 1024, min: 0 },
    usedBytes: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

userSchema.index({ createdAt: -1 });

export const User: Model<IUser> =
  (models.User as Model<IUser>) || model<IUser>("User", userSchema);
