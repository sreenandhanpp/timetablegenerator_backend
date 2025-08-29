const express = require('express');
const { authenticateToken } = require('../middlewares/auth');
const ActivityLog = require('../models/ActivityLog');

const router = express.Router();

router.get("/recent",authenticateToken, async (req, res) => {
  try {
    const activities = await ActivityLog.find()
      .sort({ createdAt: -1 })
      .limit(20); // latest 20 actions

    res.json(activities);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;