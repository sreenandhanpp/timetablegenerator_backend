const express = require('express');
const Subject = require('../models/Subject');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const ActivityLog = require('../models/ActivityLog');

const router = express.Router();

// Get all subjects
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { semester, department } = req.query;
    const filter = { isActive: true };
    
    if (semester) filter.semester = parseInt(semester);
    if (department) filter.department = department;

    const subjects = await Subject.find(filter)
      .populate('faculty', 'name email department')
      .sort({ subjectName: 1 });
    
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add new subject
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      subjectName,
      subjectCode,
      subjectType,
      faculty,
      periodsPerWeek,
      labName,
      semester,
      department
    } = req.body;

    // Check if subject code already exists
    const existingSubject = await Subject.findOne({ subjectCode });
    if (existingSubject) {
      return res.status(400).json({ message: 'Subject code already exists' });
    }

    const subject = new Subject({
      subjectName,
      subjectCode: subjectCode.toUpperCase(),
      subjectType,
      faculty,
      periodsPerWeek,
      labName,
      semester,
      department
    });

    await subject.save();
    await subject.populate('faculty', 'name email department');

    await ActivityLog.create({
      action: "Added subject",
      performedBy: req.user?.name || "Admin", // from auth
  details: `Added subject ${subjectName} (${subjectCode})`, // readable text for UI
    });

    res.status(201).json(subject);
  } catch (error) {
    console.error('Error adding subject:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get subject by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id)
      .populate('faculty', 'name email department');
    
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    
    res.json(subject);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update subject
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('faculty', 'name email department');

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    await ActivityLog.create({
      action: "Updated subject",
      performedBy: req.user?.name || "Admin", // from auth
  details: `Updated subject ${subject.subjectName} (${subject.subjectCode})`, // readable text for UI
    });

    res.json(subject);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete subject (soft delete)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    await ActivityLog.create({
      action: "Deleted subject",
      performedBy: req.user?.name || "Admin", // from auth
  details: `Deleted subject ${subject.subjectName} (${subject.subjectCode})`,
    });

    res.json({ message: 'Subject deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;