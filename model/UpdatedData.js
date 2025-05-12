const mongoose = require("mongoose");

const updatedDataSchema = new mongoose.Schema(
  {
    modelName: {
      type: String,
      required: true,
      trim: true,
    },
    modelId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "modelName",
    },
    previousData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    newData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    updatedBy: {
      name: {
        type: String,
        required: true,
      },
      code: {
        type: String,
        required: true,
      },
    },
    updateReason: {
      type: String,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    seenBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        seenAt: Date,
      },
    ],
    
    
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
updatedDataSchema.index({ modelName: 1, modelId: 1 });
updatedDataSchema.index({ "updatedBy.userId": 1 });
updatedDataSchema.index({ timestamp: -1 });

const UpdatedData = mongoose.model("UpdatedData", updatedDataSchema);

module.exports = UpdatedData;
