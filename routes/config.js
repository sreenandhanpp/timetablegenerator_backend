const express = require("express");
const Config = require("../models/Config");
const { authenticateToken, requireAdmin } = require("../middlewares/auth");

const router = express.Router();

// Get config for semester and department
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const  semester  = req.params.id;

    if (!semester) {
      return res
        .status(400)
        .json({ message: "Semester and department are required" });
    }

    // Since semester is now string, we don't parseInt
    let config = await Config.findOne({
      semester,
    });

    // Create default config if none exists
    if (!config) {
      config = new Config({
        semester,
        department,
        breakTimes: [
          { name: "Short Break 1", start: "10:45", end: "11:00" },
          { name: "Short Break 2", start: "14:00", end: "14:15" },
        ],
      });
      await config.save();
    }

    res.json(config);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update config
router.put("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { semester, department } = req.body;

    const config = await Config.findOneAndUpdate(
      { semester, department },
      req.body,
      { new: true, upsert: true, runValidators: true }
    );

    res.json(config);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Add new config
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { semester, department } = req.body;

    // Check if config already exists
    const existingConfig = await Config.findOne({ semester, department });
    if (existingConfig) {
      return res
        .status(400)
        .json({
          message: "Config for this semester and department already exists",
        });
    }

    // Create new config
    const config = new Config(req.body);
    await config.save();

    res.status(201).json({
      message: "Config added successfully",
      config,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
