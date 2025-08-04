// timetable/generateTimetable.js
const Subject = require('../models/Subject');
const Config = require('../models/Config');
const Timetable = require('../models/Timetable');
const generateTimetableData = require('./algorithm');

async function generateTimetable({ semester, department }) {
  const subjects = await Subject.find({
    semester: parseInt(semester),
    department,
    isActive: true
  }).populate('faculty');

  if (!subjects.length) return [];

  const config = await Config.findOne({ semester: parseInt(semester), department });
  if (!config) throw new Error('Configuration missing');

  const entries = await generateTimetableData(semester, department, subjects, config);

  await Timetable.deleteOne({ semester: parseInt(semester), department });
  const timetable = new Timetable({ semester: parseInt(semester), department, entries });
  await timetable.save();

  return timetable.populate('entries.subject');
}

module.exports = generateTimetable;
