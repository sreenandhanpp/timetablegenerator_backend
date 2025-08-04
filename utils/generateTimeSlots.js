// timetable/generateTimeSlots.js
function generateTimeSlots(config) {
  const slots = [];
  const startTime = config.classStartTime;
  const endTime = config.classEndTime;
  const periodDuration = config.periodDuration;

  if (config.qcpcEnabled) {
    slots.push({ start: config.qcpcTime.start, end: config.qcpcTime.end, type: 'qcpc' });
  }

  let [hours, minutes] = startTime.split(':').map(Number);
  let currentTime = new Date();
  currentTime.setHours(hours, minutes, 0, 0);

  const [endHours, endMinutes] = endTime.split(':').map(Number);
  const endDateTime = new Date();
  endDateTime.setHours(endHours, endMinutes, 0, 0);

  while (currentTime < endDateTime) {
    const slotStart = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
    
    let isBreak = false;
    let breakName = '';

    if (slotStart >= config.lunchBreak.start && slotStart < config.lunchBreak.end) {
      isBreak = true;
      breakName = 'Lunch Break';
    }

    for (const breakTime of config.breakTimes) {
      if (slotStart >= breakTime.start && slotStart < breakTime.end) {
        isBreak = true;
        breakName = breakTime.name;
        break;
      }
    }

    currentTime.setMinutes(currentTime.getMinutes() + periodDuration);
    const slotEnd = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;

    slots.push({
      start: slotStart,
      end: slotEnd,
      type: isBreak ? 'break' : 'lecture',
      name: isBreak ? breakName : ''
    });

    if (isBreak) {
      const [endH, endM] = (breakName === 'Lunch Break' ? config.lunchBreak.end : config.breakTimes.find(b => b.name === breakName).end).split(':').map(Number);
      currentTime.setHours(endH, endM, 0, 0);
    }
  }

  return slots;
}

module.exports = generateTimeSlots;
