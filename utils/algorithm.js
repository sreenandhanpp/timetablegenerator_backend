const generateTimeSlots = require('./generateTimeSlots');

async function generateTimetableData(semester, department, subjects, config) {
  const timeSlots = generateTimeSlots(config).filter(slot => slot.type === 'lecture');
  const days = config.workingDays;
  const totalSlotsPerDay = timeSlots.length;
  const entries = [];

  // Faculty availability matrix: facultyId -> day -> slot index -> boolean
  const facultyAvailability = {};
  for (const subject of subjects) {
    const facultyId = subject.faculty?._id?.toString();
    if (!facultyId) continue;

    if (!facultyAvailability[facultyId]) {
      facultyAvailability[facultyId] = {};
      for (const day of days) {
        facultyAvailability[facultyId][day] = new Array(totalSlotsPerDay).fill(false);
      }
    }
  }

  // Subject period assignment tracking
  const subjectAssignments = new Map();

  // Assign each subject
  for (const subject of subjects) {
    const facultyId = subject.faculty?._id?.toString();
    if (!facultyId) continue;

    const periodsRequired = subject.periodsPerWeek || 0;
    let assignedCount = 0;

    for (const day of days) {
      for (let slotIndex = 0; slotIndex < totalSlotsPerDay; slotIndex++) {
        if (assignedCount >= periodsRequired) break;

        const isFacultyBusy = facultyAvailability[facultyId]?.[day]?.[slotIndex];
        if (isFacultyBusy) continue;

        // Mark faculty as busy
        facultyAvailability[facultyId][day][slotIndex] = true;

        // Add the timetable entry
        entries.push({
          day,
          timeSlot: {
            start: timeSlots[slotIndex].start,
            end: timeSlots[slotIndex].end
          },
          subject: subject._id,
          type: subject.subjectType.toLowerCase(),
          room: subject.subjectType === 'Lab' ? subject.labName : `Room ${Math.floor(Math.random() * 20) + 101}`
        });

        assignedCount++;
      }

      if (assignedCount >= periodsRequired) break;
    }

    // Optional: warn if couldn't assign all periods
    if (assignedCount < periodsRequired) {
      console.warn(`Could not assign all periods for subject: ${subject.subjectName}`);
    }
  }

  // Add fixed blocks (QCPC, Lunch, Breaks)
  for (const day of days) {
    if (config.qcpcEnabled) {
      entries.push({ day, timeSlot: config.qcpcTime, type: 'qcpc' });
    }
    entries.push({ day, timeSlot: config.lunchBreak, type: 'lunch' });
    for (const b of config.breakTimes) {
      entries.push({ day, timeSlot: b, type: 'break' });
    }
  }

  return entries;
}

module.exports = generateTimetableData;
