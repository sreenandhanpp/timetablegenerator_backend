const mongoose = require("mongoose");

const ActiveTimetableSchema = new mongoose.Schema({
  type: { type: String, enum: ["odd", "even"], required: true },
  version: { type: Number, required: true },
  activatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ActiveTimetable", ActiveTimetableSchema);
