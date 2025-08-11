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
// generateTimeSlots.js
function generateTimeSlots(config) {
  const {
    classStartTime,
    classEndTime,
    periodDuration,
    lunchBreak,
    breakTimes = [],
    qcpcEnabled = false,
    qcpcTime = { start: "08:50", end: "09:05" },
    periodsPerDay = 6 // default lecture periods per day
  } = config;

  if (!classStartTime || !classEndTime || !periodDuration || !lunchBreak) {
    throw new Error("Missing required configuration parameters");
  }

  const timeToMinutes = t => {
    const [hh, mm] = t.split(":").map(Number);
    return hh * 60 + mm;
  };
  const minutesToTime = m => {
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  const startMin = timeToMinutes(classStartTime);
  const endMin = timeToMinutes(classEndTime);
  const lunchStart = timeToMinutes(lunchBreak.start);
  const lunchEnd = timeToMinutes(lunchBreak.end);

  // Build occupied intervals for breaks (QCPC, lunch, other breaks)
  const occupied = [];
  if (qcpcEnabled && qcpcTime?.start && qcpcTime?.end) {
    occupied.push({ start: timeToMinutes(qcpcTime.start), end: timeToMinutes(qcpcTime.end), name: "QCPC" });
  }
  occupied.push({ start: lunchStart, end: lunchEnd, name: "Lunch Break" });
  for (const bt of breakTimes) {
    if (bt.start && bt.end) occupied.push({ start: timeToMinutes(bt.start), end: timeToMinutes(bt.end), name: bt.name || "Break" });
  }

  // Merge overlapping occupied intervals
  occupied.sort((a,b) => a.start - b.start);
  const merged = [];
  for (const iv of occupied) {
    if (!merged.length) merged.push({...iv});
    else {
      const last = merged[merged.length - 1];
      if (iv.start <= last.end) {
        last.end = Math.max(last.end, iv.end);
        last.name = last.name === iv.name ? last.name : `${last.name}/${iv.name}`;
      } else merged.push({...iv});
    }
  }

  // helper to find next free start >= ptr of given dur within limit [ptr, limit)
  function findNextFree(ptr, dur, limit) {
    let p = ptr;
    while (p + dur <= limit) {
      let overlapped = false;
      for (const iv of merged) {
        if (p < iv.end && (p + dur) > iv.start) {
          p = iv.end; // jump over break
          overlapped = true;
          break;
        }
      }
      if (!overlapped) return p;
    }
    return null;
  }

  // place morning and afternoon lecture slots (prefer balanced split)
  const morningCount = Math.ceil(periodsPerDay / 2);
  const afternoonCount = periodsPerDay - morningCount;
  const lectureSlots = [];

  // morning: [startMin, lunchStart)
  let ptr = startMin;
  for (let i = 0; i < morningCount; i++) {
    const s = findNextFree(ptr, periodDuration, lunchStart);
    if (s === null) break;
    lectureSlots.push({ start: s, end: s + periodDuration });
    ptr = s + periodDuration;
  }

  // afternoon: [lunchEnd, endMin)
  ptr = lunchEnd;
  for (let i = 0; i < afternoonCount; i++) {
    const s = findNextFree(ptr, periodDuration, endMin);
    if (s === null) break;
    lectureSlots.push({ start: s, end: s + periodDuration });
    ptr = s + periodDuration;
  }

  // if we didn't place all lecture slots, try placing anywhere in the day (excluding breaks)
  let attempts = 0;
  while (lectureSlots.length < periodsPerDay && attempts < 3) {
    // scan whole day
    let p = startMin;
    while (p + periodDuration <= endMin && lectureSlots.length < periodsPerDay) {
      const s = findNextFree(p, periodDuration, endMin);
      if (!s) break;
      const dup = lectureSlots.some(ls => ls.start === s);
      if (!dup) lectureSlots.push({ start: s, end: s + periodDuration });
      p = s + periodDuration;
    }
    attempts++;
  }

  // Build final slot list: merge lecture slots and break slots, sort
  const result = [];
  for (const ls of lectureSlots) result.push({ startMin: ls.start, endMin: ls.end, type: "lecture", name: "" });
  for (const iv of merged) {
    // clamp within class window
    const s = Math.max(iv.start, startMin);
    const e = Math.min(iv.end, endMin);
    if (e > s) result.push({ startMin: s, endMin: e, type: "break", name: iv.name });
  }

  result.sort((a,b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // convert to time strings and merge adjacent identical types
  const slots = [];
  for (const r of result) {
    const start = minutesToTime(r.startMin);
    const end = minutesToTime(r.endMin);
    const type = r.type;
    const name = r.name || (type === "lecture" ? "" : "Break");
    const prev = slots[slots.length - 1];
    if (prev && prev.type === type && prev.end === start) {
      // extend previous
      prev.end = end;
      prev.duration = timeToMinutes(prev.end) - timeToMinutes(prev.start);
      if (type === "break" && prev.name.indexOf(name) === -1) prev.name = prev.name ? `${prev.name}/${name}` : name;
    } else {
      slots.push({ start, end, type, name, duration: r.endMin - r.startMin });
    }
  }

  return slots.filter(s => timeToMinutes(s.start) >= startMin && timeToMinutes(s.end) <= endMin);
}

module.exports = generateTimeSlots;

  return slots;
}

module.exports = generateTimeSlots;
