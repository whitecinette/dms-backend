const mongoose = require("mongoose");

const deletedDataSchema = new mongoose.Schema(
  {
    collectionName: {
      type: String,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    
    deletedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, strict: false }
);

const DeletedData = mongoose.model("DeletedData", deletedDataSchema);

module.exports = DeletedData;
