function formatTimetable(timetableData) {
  // Group by day
  const groupedByDay = {};

  timetableData.forEach(entry => {
    const { day, start, end, type, subject, room, semester } = entry;

    if (!groupedByDay[day]) {
      groupedByDay[day] = [];
    }

    // Find if a slot already exists for this time
    let slot = groupedByDay[day].find(s => s.start === start && s.end === end);

    if (!slot) {
      slot = { start, end };
      if (type === 'qcpc' || type === 'break' || type === 'lunch') {
        slot.type = type; // non-class periods
      } else {
        slot.classes = [];
      }
      groupedByDay[day].push(slot);
    }

    // Only push classes if it's not a break
    if (type !== 'qcpc' && type !== 'break' && type !== 'lunch') {
      slot.classes.push({
        semester,
        subject,
        type,
        room
      });
    }
  });

  // Convert grouped object to array sorted by time
  return Object.keys(groupedByDay).map(day => ({
    day,
    slots: groupedByDay[day].sort((a, b) => a.start.localeCompare(b.start))
  }));
}

module.exports = formatTimetable;