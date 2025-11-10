// models/FloodResult.js
const mongoose = require("mongoose");

const FloodResultSchema = new mongoose.Schema(
  {
    success: { type: Boolean },
    message: { type: String },
    data: { type: mongoose.Schema.Types.Mixed }, // allows any structure
    timestamp: { type: mongoose.Schema.Types.Mixed },
    status: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true } // adds createdAt and updatedAt
);

module.exports = mongoose.model("FloodResult", FloodResultSchema);
