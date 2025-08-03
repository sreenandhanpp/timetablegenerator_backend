const express = require('express');
const Timetable = require('../models/Timetable');
const Subject = require('../models/Subject');
const Config = require('../models/Config');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

const router = express.Router();

// Generate time slots based on config
const generateTimeSlots = (config) => {
  const slots = [];
  const startTime = config.classStartTime;
  const endTime = config.classEndTime;
  const periodDuration = config.periodDuration;
  
  // Add QCPC if enabled
  if (config.qcpcEnabled) {
    slots.push({
      start: config.qcpcTime.start,
      end: config.qcpcTime.end,
      type: 'qcpc'
    });
  }

  // Parse start time
  let [hours, minutes] = startTime.split(':').map(Number);
  let currentTime = new Date();
  currentTime.setHours(hours, minutes, 0, 0);

  // Parse end time
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  const endDateTime = new Date();
  endDateTime.setHours(endHours, endMinutes, 0, 0);

  while (currentTime < endDateTime) {
    const slotStart = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
    
    // Check for breaks
    let isBreak = false;
    let breakName = '';
    
    // Check lunch break
    if (slotStart >= config.lunchBreak.start && slotStart < config.lunchBreak.end) {
      isBreak = true;
      breakName = 'Lunch Break';
    }
    
    // Check other breaks
    for (const breakTime of config.breakTimes) {
      if (slotStart >= breakTime.start && slotStart < breakTime.end) {
        isBreak = true;
        breakName = breakTime.name;
        break;
      }
    }

    // Add period duration
    currentTime.setMinutes(currentTime.getMinutes() + periodDuration);
    const slotEnd = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;

    slots.push({
      start: slotStart,
      end: slotEnd,
      type: isBreak ? 'break' : 'lecture',
      name: isBreak ? breakName : ''
    });

    // Add break duration if it's a break
    if (isBreak) {
      // Skip to end of break
      if (breakName === 'Lunch Break') {
        const [lunchEndHours, lunchEndMinutes] = config.lunchBreak.end.split(':').map(Number);
        currentTime.setHours(lunchEndHours, lunchEndMinutes, 0, 0);
      } else {
        const breakTime = config.breakTimes.find(bt => bt.name === breakName);
        if (breakTime) {
          const [breakEndHours, breakEndMinutes] = breakTime.end.split(':').map(Number);
          currentTime.setHours(breakEndHours, breakEndMinutes, 0, 0);
        }
      }
    }
  }

  return slots;
};

// Simple timetable generation algorithm
const generateTimetableData = async (semester, department, subjects, config) => {
  const timeSlots = generateTimeSlots(config);
  const days = config.workingDays;
  const entries = [];

  // Filter available lecture slots
  const lectureSlots = timeSlots.filter(slot => slot.type === 'lecture');
  
  let slotIndex = 0;
  
  // Distribute subjects across days and time slots
  for (const subject of subjects) {
    for (let period = 0; period < subject.periodsPerWeek; period++) {
      if (slotIndex >= lectureSlots.length * days.length) {
        break; // No more slots available
      }

      const dayIndex = Math.floor(slotIndex / lectureSlots.length);
      const timeSlotIndex = slotIndex % lectureSlots.length;
      
      if (dayIndex < days.length) {
        const timeSlot = lectureSlots[timeSlotIndex];
        
        entries.push({
          day: days[dayIndex],
          timeSlot: {
            start: timeSlot.start,
            end: timeSlot.end
          },
          subject: subject._id,
          type: subject.subjectType.toLowerCase(),
          room: subject.subjectType === 'Lab' ? subject.labName : `Room ${Math.floor(Math.random() * 20) + 101}`
        });
      }
      
      slotIndex++;
    }
  }

  // Add breaks and QCPC to all days
  for (const day of days) {
    // Add QCPC
    if (config.qcpcEnabled) {
      entries.push({
        day,
        timeSlot: {
          start: config.qcpcTime.start,
          end: config.qcpcTime.end
        },
        type: 'qcpc'
      });
    }

    // Add lunch break
    entries.push({
      day,
      timeSlot: {
        start: config.lunchBreak.start,
        end: config.lunchBreak.end
      },
      type: 'lunch'
    });

    // Add other breaks
    for (const breakTime of config.breakTimes) {
      entries.push({
        day,
        timeSlot: {
          start: breakTime.start,
          end: breakTime.end
        },
        type: 'break'
      });
    }
  }

  return entries;
};

// Generate timetable
router.post('/generate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { semester, department } = req.body;

    if (!semester || !department) {
      return res.status(400).json({ message: 'Semester and department are required' });
    }

    // Get subjects for the semester and department
    const subjects = await Subject.find({
      semester: parseInt(semester),
      department,
      isActive: true
    }).populate('faculty');

    if (subjects.length === 0) {
      return res.status(400).json({ message: 'No subjects found for the given semester and department' });
    }

    // Get configuration
    const config = await Config.findOne({
      semester: parseInt(semester),
      department
    });

    if (!config) {
      return res.status(400).json({ message: 'Configuration not found. Please set up configuration first.' });
    }

    // Generate timetable entries
    const entries = await generateTimetableData(semester, department, subjects, config);

    // Delete existing timetable if any
    await Timetable.deleteOne({ semester: parseInt(semester), department });

    // Create new timetable
    const timetable = new Timetable({
      semester: parseInt(semester),
      department,
      entries
    });

    await timetable.save();
    await timetable.populate('entries.subject');

    res.json(timetable);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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