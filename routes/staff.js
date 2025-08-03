const express = require('express');
const Staff = require('../models/Staff');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

const router = express.Router();

// Get all staff
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const staff = await Staff.find({ isActive: true }).sort({ name: 1 });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// Add new staff
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, designation, department } = req.body;

    // Check if staff already exists by email or phone
    const existingStaff = await Staff.findOne({ 
      $or: [{ email }, { phone }] 
    });
    if (existingStaff) {
      return res.status(400).json({ message: 'Staff with this email or phone already exists' });
    }

    // Create staff record
    const staff = new Staff({
      name,
      email,
      phone,
      designation,
      department
    });

    await staff.save();

    // Create user account for staff
    const defaultPassword = 'staff123'; // In production, generate random password or email them
    const user = new User({
      email,
      password: defaultPassword,
      role: 'staff',
      name,
      department,
      staffId: staff._id
    });

    await user.save();

    res.status(201).json({ 
      staff,
      message: 'Staff added successfully',
      defaultPassword 
    });
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// Get staff by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ message: 'Staff not found' });
    }
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update staff
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, department } = req.body;
    
    const staff = await Staff.findByIdAndUpdate(
      req.params.id,
      { name, email, department },
      { new: true, runValidators: true }
    );

    if (!staff) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    // Update user record as well
    await User.findOneAndUpdate(
      { staffId: staff._id },
      { name, email, department }
    );

    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete staff (soft delete)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const staff = await Staff.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!staff) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    res.json({ message: 'Staff deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;