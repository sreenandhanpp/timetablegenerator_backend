function formatTimetableForFrontend(rawData) {
  return rawData.map(({ semester, department, entries }) => {
    const daysGrouped = {};

    entries.forEach(entry => {
      if (!daysGrouped[entry.day]) {
        daysGrouped[entry.day] = [];
      }
      daysGrouped[entry.day].push({
        label: `${entry.timeSlot.start}-${entry.timeSlot.end}`,
        start: entry.timeSlot.start,
        end: entry.timeSlot.end,
        type: entry.type,
        subject: entry.subject?.name || null,
        faculty: entry.subject?.faculty?.name || null,
        room: entry.room || null
      });
    });

    return {
      semester,
      department,
      days: Object.keys(daysGrouped).map(day => ({
        day,
        slots: daysGrouped[day]
      }))
    };
  });
}

module.exports = formatTimetableForFrontend;