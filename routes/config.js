const express = require("express");
const Config = require("../models/Config");
const { authenticateToken, requireAdmin } = require("../middlewares/auth");
const mongoose = require("mongoose");

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
  // Update config by ID route
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid configuration ID" });
    }

    // Prepare the update data
    const updateData = {
      qcpcEnabled: req.body.qcpcEnabled,
      qcpcTime: {
        start: req.body.qcpcStart,
        end: req.body.qcpcEnd
      },
      classStartTime: req.body.classStart,
      classEndTime: req.body.classEnd,
      periodDuration: req.body.periodBeforeLunch, // Maintain backward compatibility
      periodBeforeLunch: req.body.periodBeforeLunch,
      periodAfterLunch: req.body.periodAfterLunch,
      lunchBreak: {
        start: req.body.lunchStart,
        end: req.body.lunchEnd
      },
      breaks: req.body.breaks.map(breakItem => ({
        name: breakItem.name,
        start: breakItem.start,
        end: breakItem.end
      })),
      // Note: semester and department shouldn't be updated as they're part of the unique index
    };

    // Find and update the config by ID
    const updatedConfig = await Config.findByIdAndUpdate(
      id,
      updateData,
      { 
        new: true, // Return the updated document
        runValidators: true // Run schema validators on update
      }
    );

    if (!updatedConfig) {
      return res.status(404).json({ message: "Configuration not found" });
    }

    res.json(updatedConfig);
  } catch (error) {
    console.log(error);
    res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
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
