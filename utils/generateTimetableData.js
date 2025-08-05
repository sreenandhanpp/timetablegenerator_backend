// utils/generateTimetableData.js
const Timetable = require('../models/Timetable');
const generateTimeSlots = require('./generateTimeSlots');

async function generateTimetableData(allSemesterData) {
  // Faculty availability: facultyId -> day -> slotIndex -> boolean
  const facultyAvailability = {};
  const finalTimetables = [];

  for (const { semester, department, subjects, config } of allSemesterData) {
    if (!subjects || !subjects.length || !config) {
      finalTimetables.push({ semester, department, entries: [] });
      continue;
    }

    const timeSlots = generateTimeSlots(config).filter(s => s.type === 'lecture');
    const days = config.workingDays;
    const totalSlotsPerDay = timeSlots.length;
    const entries = [];

    // Ensure faculty in global availability table
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

    // Assign periods
    for (const subject of subjects) {
      const facultyId = subject.faculty?._id?.toString();
      if (!facultyId) continue;

      let assignedCount = 0;
      const periodsRequired = subject.periodsPerWeek;

      for (const day of days) {
        for (let slotIndex = 0; slotIndex < totalSlotsPerDay; slotIndex++) {
          if (assignedCount >= periodsRequired) break;

          if (facultyAvailability[facultyId][day][slotIndex]) continue;

          // Assign and block faculty slot globally
          facultyAvailability[facultyId][day][slotIndex] = true;

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
      }
    }

    // Add fixed events
    for (const day of days) {
      if (config.qcpcEnabled) {
        entries.push({ day, timeSlot: config.qcpcTime, type: 'qcpc' });
      }
      entries.push({ day, timeSlot: config.lunchBreak, type: 'lunch' });
      for (const b of config.breakTimes) {
        entries.push({ day, timeSlot: b, type: 'break' });
      }
    }

    // Save timetable
    await Timetable.deleteOne({ semester, department });
    const timetableDoc = new Timetable({ semester, department, entries });
    await timetableDoc.save();

    finalTimetables.push(timetableDoc);
  }

  return finalTimetables;
}

module.exports = generateTimetableData;
