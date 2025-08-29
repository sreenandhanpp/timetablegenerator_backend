const express = require("express");
const { authenticateToken, requireAdmin } = require("../middlewares/auth");
const mongoose = require("mongoose");
const Staff = require("../models/Staff");
const Subject = require("../models/Subject");

const router = express.Router();

// Admin dashboard stats
router.get("/dashboard-stats", async (req, res) => {
  try {
    // Get total staff count
    const totalStaff = await Staff.countDocuments({ isActive: true });

    // Get active subjects count
    const activeSubjects = await Subject.countDocuments({ isActive: true });

    // Get distinct departments from staff or subjects (choose primary source)
    const departmentsFromStaff = await Staff.distinct("department", { isActive: true });
    const departmentsFromSubjects = await Subject.distinct("department", { isActive: true });

    // Merge and deduplicate department list
    const allDepartments = [...new Set([...departmentsFromStaff, ...departmentsFromSubjects])];

    res.json({
      totalStaff,
      activeSubjects,
      totalDepartments: allDepartments.length,
    });
  } catch (error) {
    console.log("Error fetching admin dashboard stats:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


module.exports = router;  