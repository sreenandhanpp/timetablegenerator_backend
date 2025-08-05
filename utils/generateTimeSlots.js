function generateTimeSlots(config) {
  const slots = [];
  const { classStartTime, classEndTime, periodDuration, lunchBreak, breakTimes, qcpcEnabled, qcpcTime } = config;

  if (qcpcEnabled) {
    slots.push({ start: qcpcTime.start, end: qcpcTime.end, type: 'qcpc' });
  }

  let [hours, minutes] = classStartTime.split(':').map(Number);
  let currentTime = new Date();
  currentTime.setHours(hours, minutes, 0, 0);

  const [endHours, endMinutes] = classEndTime.split(':').map(Number);
  const endDateTime = new Date();
  endDateTime.setHours(endHours, endMinutes, 0, 0);

  while (currentTime < endDateTime) {
    const slotStart = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;

    let isBreak = false;
    let breakName = '';

    if (slotStart >= lunchBreak.start && slotStart < lunchBreak.end) {
      isBreak = true;
      breakName = 'Lunch Break';
    }

    for (const breakTime of breakTimes) {
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
      const [endH, endM] = (breakName === 'Lunch Break' ? lunchBreak.end : breakTimes.find(b => b.name === breakName).end).split(':').map(Number);
      currentTime.setHours(endH, endM, 0, 0);
    }
  }

  return slots;
}

module.exports = generateTimeSlots;
