const Subject = require('../models/Subject');
const Config = require('../models/Config');
const Timetable = require('../models/Timetable');
const generateTimetableData = require('./generateTimetableData');

async function generateTimetable({ semesters, department }) {
  const allSemesterData = [];

  for (const sem of semesters) {
    const subjects = await Subject.find({
      semester: parseInt(sem),
      department,
      isActive: true
    }).populate('faculty');

    const config = await Config.findOne({ semester: parseInt(sem), department });

    allSemesterData.push({ semester: parseInt(sem), department, subjects, config });
  }

  const allEntries = await generateTimetableData(allSemesterData);

  // Clear old timetables & save
  for (const sem of semesters) {
    await Timetable.deleteOne({ semester: parseInt(sem), department });
    const semesterEntries = allEntries.filter(e => e.semester === parseInt(sem));
    const timetable = new Timetable({ semester: parseInt(sem), department, entries: semesterEntries });
    await timetable.save();
  }

  return allEntries;
}

module.exports = generateTimetable;
