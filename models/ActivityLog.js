const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
  action: { type: String, required: true }, // e.g., "Generated timetable", "Activated timetable"
  performedBy: { type: String, required: true }, // Admin username or ID
  details: { type: String }, // Extra info like semester, dept, version, etc.
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);
