const mongoose = require("mongoose");

const travelSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    ref: "ActorCode"
  },
  travelDate: {
    type: Date,
    required: true,
  },
  locations: [ 
    {
      city: { type: String, required: true },
      state: { type: String }, 
      latitude: { type: Number }, 
      longitude: { type: Number },
    }
  ],
  purpose: String,
  modeOfTransport: String,
  returnDate: Date,
  travelDuration: Number,
  totalDistance: Number, 
  status: {
    type: String,
    enum: ["Scheduled", "Ongoing", "Completed", "Cancelled"],
    default: "Scheduled",
  },
}, {
  timestamps: true,
  strict: false,
});

// ⏳ Travel duration calculation
travelSchema.pre("save", function (next) {
  if (this.travelDate && this.returnDate) {
    const durationInMs = new Date(this.returnDate) - new Date(this.travelDate);
    this.travelDuration = Math.ceil(durationInMs / (1000 * 60 * 60 * 24)); // in days
  }
  next();
});

module.exports = mongoose.model("Travel", travelSchema);
