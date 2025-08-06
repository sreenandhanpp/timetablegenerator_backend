const express = require("express");
const Timetable = require("../models/Timetable");
const Subject = require("../models/Subject");
const Config = require("../models/Config");
const { authenticateToken, requireAdmin } = require("../middlewares/auth");
const generateTimetableData = require("../utils/generateTimetableData");
const formatTimetable = require("../utils/formatTimeTable");

const router = express.Router();

// Generate timetable
router.post("/generate", async (req, res) => {
  try {
    const { department, type } = req.body; // type could be 'even' or 'odd'
    console.log(req.body, "req.body");
    if (!department)
      return res.status(400).json({ message: "Department is required" });

    const semestersToGenerate = type === "even" ? [2, 4, 6, 8] : [1, 3, 5, 7];

    // Prepare all semester data
    const allSemesterData = [];
    for (const sem of semestersToGenerate) {
      const subjects = await Subject.find({
        semester: sem,
        department,
        isActive: true,
      }).populate("faculty");

      let config = await Config.findOne({ semester: sem });

      // Fallback: use global config
      if (!config) {
        config = await Config.findOne({ semester: "global" });
      }
      console.log(config, "config");

      allSemesterData.push({
        semester: sem,
        department,
        subjects,
        config,
      });
    }
    console.log(allSemesterData, "allSemesterData");

    // Pass all semesters to generator
    const timetables = await generateTimetableData(allSemesterData);

    // const formattedTimetable = formatTimetable(timetables);

    res.json(timetables);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get timetable
router.get("/", async (req, res) => {
  try {
    const { semester, department } = req.query;

    if (!semester || !department) {
      return res
        .status(400)
        .json({ message: "Semester and department are required" });
    }

    const timetable = await Timetable.findOne({
      semester: parseInt(semester),
      department,
      isActive: true,
    }).populate("entries.subject");

    if (!timetable) {
      return res.status(404).json({ message: "Timetable not found" });
    }

    const timetables = await generateTimetableData(allSemesterData);
const formattedTimetables = formatTimetableForFrontend(timetables);
res.json(formattedTimetables);

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get staff timetable
router.get("/staff/:staffId", authenticateToken, async (req, res) => {
  try {
    const { staffId } = req.params;

    // Find all subjects taught by this staff member
    const subjects = await Subject.find({ faculty: staffId, isActive: true });
    const subjectIds = subjects.map((s) => s._id);

    // Find all timetables containing these subjects
    const timetables = await Timetable.find({
      "entries.subject": { $in: subjectIds },
      isActive: true,
    }).populate("entries.subject");

    // Filter entries for this staff member only
    const staffTimetables = timetables.map((timetable) => ({
      ...timetable.toObject(),
      entries: timetable.entries.filter(
        (entry) =>
          entry.subject && subjectIds.some((id) => id.equals(entry.subject._id))
      ),
    }));

    res.json(staffTimetables);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
