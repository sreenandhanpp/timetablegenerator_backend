const express = require('express');
const Timetable = require('../models/Timetable');
const Subject = require('../models/Subject');
const Config = require('../models/Config');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const generateTimetable = require('../utils/generateTimetable');

const router = express.Router();

// Generate timetable
router.post('/generate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { semester, department } = req.body;
    if (!semester || !department) return res.status(400).json({ message: 'Semester and department required' });

    if (parseInt(semester) % 2 !== 0 || ![2, 4, 6, 8].includes(parseInt(semester))) {
      return res.status(400).json({ message: 'Only even semesters (S2/S4/S6/S8) are allowed' });
    }

    const timetable = await generateTimetable({ semester, department });

    if (!timetable || timetable.entries.length === 0) {
      return res.json({ semester, entries: [] }); // S2 with no data
    }

    res.json(timetable);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get timetable
router.get('/', async (req, res) => {
  try {
    const { semester, department } = req.query;

    if (!semester || !department) {
      return res.status(400).json({ message: 'Semester and department are required' });
    }

    const timetable = await Timetable.findOne({
      semester: parseInt(semester),
      department,
      isActive: true
    }).populate('entries.subject');

    if (!timetable) {
      return res.status(404).json({ message: 'Timetable not found' });
    }

    res.json(timetable);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get staff timetable
router.get('/staff/:staffId', authenticateToken, async (req, res) => {
  try {
    const { staffId } = req.params;

    // Find all subjects taught by this staff member
    const subjects = await Subject.find({ faculty: staffId, isActive: true });
    const subjectIds = subjects.map(s => s._id);

    // Find all timetables containing these subjects
    const timetables = await Timetable.find({
      'entries.subject': { $in: subjectIds },
      isActive: true
    }).populate('entries.subject');

    // Filter entries for this staff member only
    const staffTimetables = timetables.map(timetable => ({
      ...timetable.toObject(),
      entries: timetable.entries.filter(entry => 
        entry.subject && subjectIds.some(id => id.equals(entry.subject._id))
      )
    }));

    res.json(staffTimetables);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;