const express = require("express");
const Timetable = require("../models/Timetable");
const Subject = require("../models/Subject");
const Config = require("../models/Config");
const { authenticateToken, requireAdmin } = require("../middlewares/auth");
const generateTimetableData = require("../utils/generateTimetableData");
const formatTimetable = require("../utils/formatTimeTable");
const ActiveTimetable = require("../models/ActiveTimetable");

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

// GET /timetables/versions
router.get("/versions", async (req, res) => {
  try {
    const timetables = await Timetable.aggregate([
      {
        $addFields: {
          type: { $cond: [{ $eq: [{ $mod: ["$semester", 2] }, 0] }, "even", "odd"] }
        }
      },
      {
        $group: {
          _id: { type: "$type", version: "$version" },
          createdAt: { $first: "$createdAt" }, // first by sort order
          department: { $first: "$department" }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    const formatted = timetables.map(t => ({
      department: t.department,
      type: t._id.type,
      version: t._id.version,
      createdAt: t.createdAt
        ? `${t.createdAt.getDate().toString().padStart(2, "0")}-${(t.createdAt.getMonth() + 1)
            .toString()
            .padStart(2, "0")}-${t.createdAt.getFullYear()}`
        : null
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch timetable versions" });
  }
});


// GET /timetables/version/:type/:version
router.get("/version/:type/:version", async (req, res) => {
  try {
    const { type, version } = req.params;
    console.log(`Fetching timetables for type: ${type}, version: ${version}`);

    // Determine semester parity
    const isEven = type.toLowerCase() === "even";
    const semesterFilter = isEven
      ? { $mod: ["$semester", 2] } // Mongo doesn't allow $mod here directly
      : null;

    // Since $mod in .find() is done as: { field: { $mod: [divisor, remainder] } }
    const filter = {
      version: parseInt(version, 10),
      semester: { $mod: [2, isEven ? 0 : 1] }
    };

    const timetables = await Timetable.find(filter).sort({ semester: 1 });

    res.json(timetables);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch timetable details" });
  }
});


// Activate a timetable version for all users
router.post("/active/:type/:version", async (req, res) => {
  try {
    const { type, version } = req.params;

    // 1️⃣ Remove any existing active timetable for this type
    await ActiveTimetable.deleteMany({ type });

    // 2️⃣ Set the new active timetable
    const newActive = new ActiveTimetable({
      type,
      version: Number(version),
      activatedAt: new Date()
    });

    await newActive.save();

    res.json({ message: `Active timetable for ${type} set to version ${version}` });
  } catch (error) {
    console.error("Error setting active timetable:", error);
    res.status(500).json({ error: "Failed to set active timetable" });
  }
});

// GET /timetable/active/:type
router.get("/active/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const active = await ActiveTimetable.findOne({ type });

    if (!active) {
      return res.status(404).json({ message: "No active timetable found" });
    }

    res.json(active);
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

// @desc    Public - Get active timetable by semester, department, and odd/even type
// @access  Public
router.get("/public/:semester/:dept", async (req, res) => {
  try {
    const { semester, dept } = req.params;

    // Determine odd/even type from semester number
    const type = Number(semester) % 2 === 0 ? "even" : "odd";

    // 1️⃣ Get the active version for the given type
    const activeVersionDoc = await ActiveTimetable.findOne({ type });

    if (!activeVersionDoc) {
      return res.status(404).json({ message: "No active timetable version found for this type" });
    }

    const { version } = activeVersionDoc;

    // 2️⃣ Fetch timetable from the active version
    const timetable = await Timetable.findOne({
      semester: Number(semester),
      department: dept,
      version
    }).populate("entries.subject");

    if (!timetable) {
      return res.status(404).json({
        message: "No timetable found for this semester & department in active version"
      });
    }

    // 3️⃣ Return timetable
    res.json({
      activeVersion: version,
      type,
      timetable
    });

  } catch (error) {
    console.error("Error fetching active public timetable:", error);
    res.status(500).json({ message: "Server error" });
  }
});



module.exports = router;
