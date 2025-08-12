function generateTimeSlots(config) {
  const slots = [];
  const {
    classStartTime,
    classEndTime,
    periodDuration,
    lunchBreak,
    breakTimes = [],
    qcpcEnabled = false,
    qcpcTime = { start: "08:50", end: "09:05" }
  } = config;

  if (!classStartTime || !classEndTime || !periodDuration || !lunchBreak) {
    throw new Error("Missing required configuration parameters");
  }

  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const startMinutes = timeToMinutes(classStartTime);
  const endMinutes = timeToMinutes(classEndTime);
  const lunchStart = timeToMinutes(lunchBreak.start);
  const lunchEnd = timeToMinutes(lunchBreak.end);

  const processedBreakTimes = breakTimes.map((bt) => ({
    name: bt.name,
    start: timeToMinutes(bt.start),
    end: timeToMinutes(bt.end)
  }));

  // QCPC optional slot at top
  if (qcpcEnabled) {
    slots.push({
      start: qcpcTime.start,
      end: qcpcTime.end,
      type: "qcpc",
      name: "QCPC",
      duration: timeToMinutes(qcpcTime.end) - timeToMinutes(qcpcTime.start)
    });
  }

  let currentMinutes = startMinutes;

  while (currentMinutes < endMinutes) {
    const slotStart = `${String(Math.floor(currentMinutes / 60)).padStart(2, "0")}:${String(currentMinutes % 60).padStart(2, "0")}`;

    let isBreak = false;
    let breakName = "";
    let breakEndMinutes = currentMinutes + periodDuration;

    // lunch
    if (currentMinutes >= lunchStart && currentMinutes < lunchEnd) {
      isBreak = true;
      breakName = "Lunch Break";
      breakEndMinutes = lunchEnd;
    }

    // other breaks
    if (!isBreak) {
      for (const breakTime of processedBreakTimes) {
        if (currentMinutes >= breakTime.start && currentMinutes < breakTime.end) {
          isBreak = true;
          breakName = breakTime.name;
          breakEndMinutes = breakTime.end;
          break;
        }
      }
    }

    const slotEndMinutes = isBreak ? breakEndMinutes : currentMinutes + periodDuration;
    const slotEnd = `${String(Math.floor(slotEndMinutes / 60)).padStart(2, "0")}:${String(slotEndMinutes % 60).padStart(2, "0")}`;

    slots.push({
      start: slotStart,
      end: slotEnd,
      type: isBreak ? "break" : "lecture",
      name: isBreak ? breakName : "",
      duration: slotEndMinutes - currentMinutes
    });

    currentMinutes = slotEndMinutes;
  }

  return slots;
}

module.exports = generateTimeSlots;
