// generateTimetableData.js
const Timetable = require("../models/Timetable");
const generateTimeSlots = require("./generateTimeSlots");

async function generateTimetableData(allSemesterData) {
  const finalTimetables = [];
  const MAX_EXECUTION_TIME = 30000; // 30 seconds
  const startTime = Date.now();

  function checkTimeout() {
    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
      throw new Error('Timetable generation timed out');
    }
  }

  // Global tracking of faculty assignments across all semesters
  const globalFacultyAvailability = new Map();

  function initializeGlobalFacultyTracking() {
    for (const { subjects } of allSemesterData) {
      if (!subjects) continue;
      for (const subject of subjects) {
        const facultyId = subject.faculty?._id?.toString();
        if (!facultyId) continue;
        if (!globalFacultyAvailability.has(facultyId)) {
          globalFacultyAvailability.set(facultyId, { assignedSlots: new Map(), subjects: new Set() });
        }
        globalFacultyAvailability.get(facultyId).subjects.add(subject._id.toString());
      }
    }
  }
  initializeGlobalFacultyTracking();

  function isFacultyGloballyAvailable(facultyId, day, fullSlotIndex) {
    if (!facultyId) return true;
    const g = globalFacultyAvailability.get(facultyId);
    return !g?.assignedSlots.get(day)?.has(fullSlotIndex);
  }

  function updateGlobalFacultyAvailability(facultyId, day, fullSlotIndex) {
    if (!facultyId) return;
    if (!globalFacultyAvailability.has(facultyId)) {
      globalFacultyAvailability.set(facultyId, { assignedSlots: new Map(), subjects: new Set() });
    }
    const g = globalFacultyAvailability.get(facultyId);
    if (!g.assignedSlots.has(day)) g.assignedSlots.set(day, new Set());
    g.assignedSlots.get(day).add(fullSlotIndex);
  }

  // loop semesters
  for (const { semester, department, subjects, config } of allSemesterData) {
    checkTimeout();

    if (!subjects || !subjects.length || !config) {
      finalTimetables.push({ semester, department, entries: [] });
      continue;
    }

    // full daily pattern (lectures + breaks)
    const fullSlots = generateTimeSlots(config);
    const days = config.workingDays;

    // compute lecture indices and limit to periodsPerDay
    const PERIODS_PER_DAY = Number(config.periodsPerDay || 6);
    const lectureFullIndices = [];
    for (let i = 0; i < fullSlots.length; i++) {
      if (fullSlots[i].type === 'lecture') lectureFullIndices.push(i);
    }
    const dailyLectureIndices = lectureFullIndices.slice(0, PERIODS_PER_DAY);

    // morning lecture indices (before lunch)
    const lunchStartMinutes = (() => {
      try { const [h, m] = config.lunchBreak.start.split(':').map(Number); return h * 60 + m; }
      catch { return 12 * 60; }
    })();
    const morningLectureIndices = dailyLectureIndices.filter(fi => {
      const [h, m] = fullSlots[fi].start.split(':').map(Number);
      return (h * 60 + m) < lunchStartMinutes;
    });

    // fixed full indices (breaks/lunch/qcpc)
    const fixedFullIndices = new Set();
    for (let i = 0; i < fullSlots.length; i++) {
      if (fullSlots[i].type !== 'lecture') fixedFullIndices.add(i);
    }

    // data structures
    const entries = []; // final entries
    const facultyAvailability = new Map(); // facultyId -> Map(day -> Set(fullIdx))
    const roomAvailability = new Map(); // room -> Map(day -> Set(fullIdx))
    const subjectAssignments = new Map(); // subjectId -> { assigned, lastDay, lastFullIdx }
    const subjectDayDistribution = new Map(); // subjectId -> Map(day->count)

    // track whether a lab was already assigned on a day (we want at most one lab per day)
    const dayLabAssigned = new Map(); // day -> number of labs assigned (0 or 1)
    for (const d of days) dayLabAssigned.set(d, 0);

    // initialize subjects, faculty, rooms
    function initializeDataStructures() {
      for (const s of subjects) {
        const sid = s._id.toString();
        subjectAssignments.set(sid, { assigned: 0, lastDay: null, lastFullIdx: -1 });
        const md = new Map();
        for (const d of days) md.set(d, 0);
        subjectDayDistribution.set(sid, md);
      }
      for (const s of subjects) {
        const f = s.faculty?._id?.toString();
        if (!f) continue;
        if (!facultyAvailability.has(f)) {
          const dm = new Map();
          for (const d of days) dm.set(d, new Set());
          facultyAvailability.set(f, dm);
        }
      }
      const labNames = subjects.filter(s => s.subjectType === 'Lab').map(s => s.labName).filter(Boolean);
      const rooms = [...Array.from({ length: 20 }, (_, i) => `Room ${101 + i}`), ...new Set(labNames)];
      for (const r of rooms) {
        if (!roomAvailability.has(r)) {
          const rm = new Map();
          for (const d of days) rm.set(d, new Set());
          roomAvailability.set(r, rm);
        }
      }
    }

    initializeDataStructures();

    // helpers
    function isSlotFree(day, fullIdx) {
      if (fixedFullIndices.has(fullIdx)) return false;
      for (const [, daySlots] of roomAvailability) {
        if (daySlots.get(day).has(fullIdx)) return false;
      }
      return true;
    }

    function findRoomForFullSlot(day, fullIdx, preferredRoom) {
      if (preferredRoom && roomAvailability.has(preferredRoom) && !roomAvailability.get(preferredRoom).get(day).has(fullIdx)) {
        return preferredRoom;
      }
      for (const [r, ds] of roomAvailability) {
        if (!ds.get(day).has(fullIdx)) return r;
      }
      return null;
    }

    function lecturePosToFull(pos) {
      return dailyLectureIndices[pos];
    }
    function fullToLecturePos(fullIdx) {
      return dailyLectureIndices.indexOf(fullIdx);
    }

    // consecutive check in lecture columns
    function canPlaceSubjectAtLecturePos(day, lecturePos, subjectId, subjectType) {
      if (lecturePos < 0 || lecturePos >= dailyLectureIndices.length) return false;
      const fullIdx = lecturePosToFull(lecturePos);
      if (fixedFullIndices.has(fullIdx)) return false;
      if (subjectType === 'Lab') return true; // labs allowed consecutive blocks
      // check previous two lecture positions
      let before = 0, after = 0;
      for (let i = 1; i <= 2; i++) {
        const prevPos = lecturePos - i;
        if (prevPos < 0) break;
        const prevFull = lecturePosToFull(prevPos);
        const prevEntry = entries.find(e => e.day === day && e.timeSlot.start === fullSlots[prevFull].start);
        if (prevEntry && prevEntry.subject && prevEntry.subject.toString() === subjectId) before++;
        else break;
      }
      for (let i = 1; i <= 2; i++) {
        const nextPos = lecturePos + i;
        if (nextPos >= dailyLectureIndices.length) break;
        const nextFull = lecturePosToFull(nextPos);
        const nextEntry = entries.find(e => e.day === day && e.timeSlot.start === fullSlots[nextFull].start);
        if (nextEntry && nextEntry.subject && nextEntry.subject.toString() === subjectId) after++;
        else break;
      }
      return (before < 2 && after < 2);
    }

    function findConsecutiveLecturePositions(day, count, facultyId, preferredRoom, allowedPositions) {
      // allowedPositions is an array of lecture positions (indices into dailyLectureIndices) to search (e.g., morning positions)
      if (!facultyAvailability.get(facultyId)) return [];
      const facDaySet = facultyAvailability.get(facultyId).get(day);
      const positions = allowedPositions.slice().sort((a,b)=>a-b);
      for (let i = 0; i <= positions.length - count; i++) {
        let ok = true;
        const block = [];
        for (let j = 0; j < count; j++) {
          const pos = positions[i + j];
          if (positions[i] + j !== pos) { ok = false; break; } // must be continuous lecture positions
          const fullIdx = lecturePosToFull(pos);
          if (!isSlotFree(day, fullIdx)) { ok = false; break; }
          if (facDaySet.has(fullIdx)) { ok = false; break; }
          if (!isFacultyGloballyAvailable(facultyId, day, fullIdx)) { ok = false; break; }
          const room = findRoomForFullSlot(day, fullIdx, preferredRoom);
          if (!room) { ok = false; break; }
          block.push(fullIdx);
        }
        if (ok) return block;
      }
      return [];
    }

    function reserveAssignmentsForFullSlot(day, fullIdx, subject, room) {
      entries.push({
        day,
        timeSlot: { start: fullSlots[fullIdx].start, end: fullSlots[fullIdx].end },
        subject: subject._id,
        type: subject.subjectType.toLowerCase(),
        room
      });
      // update subject map
      const sid = subject._id.toString();
      const sd = subjectAssignments.get(sid) || { assigned: 0, lastDay: null, lastFullIdx: -1 };
      sd.assigned = (sd.assigned || 0) + 1;
      sd.lastDay = day;
      sd.lastFullIdx = fullIdx;
      subjectAssignments.set(sid, sd);
      // update subject day dist
      subjectDayDistribution.get(sid).set(day, subjectDayDistribution.get(sid).get(day) + 1);
      // book faculty
      const f = subject.faculty?._id?.toString();
      if (f) {
        facultyAvailability.get(f).get(day).add(fullIdx);
        updateGlobalFacultyAvailability(f, day, fullIdx);
      }
      // book room
      if (!roomAvailability.has(room)) {
        const m = new Map();
        for (const d of days) m.set(d, new Set());
        roomAvailability.set(room, m);
      }
      roomAvailability.get(room).get(day).add(fullIdx);
    }

    // --- LAB ASSIGNMENT (modified) ---
    // sort labs by descending periods (bigger labs first)
    const labSubjects = subjects.filter(s => s.subjectType === 'Lab').sort((a, b) => (b.periodsPerWeek || 0) - (a.periodsPerWeek || 0));

    for (const lab of labSubjects) {
      checkTimeout();
      const sid = lab._id.toString();
      const facultyId = lab.faculty?._id?.toString();
      if (!facultyId) continue;
      let remaining = Math.max(0, lab.periodsPerWeek || 0);
      if (remaining === 0) continue;

      // Allowed lecture positions for morning (convert full morning indices to lecture positions)
      const morningPositions = morningLectureIndices.map(fullIdx => fullToLecturePos(fullIdx)).filter(p => p >= 0);

      // Prefer days with no lab assigned yet and where faculty has least load
      const dayOrder = [...days].sort((a,b) => {
        const avA = facultyAvailability.get(facultyId)?.get(a).size || 0;
        const avB = facultyAvailability.get(facultyId)?.get(b).size || 0;
        // prefer day with no lab assigned and lower faculty slots
        return (dayLabAssigned.get(a) - dayLabAssigned.get(b)) || (avA - avB);
      });

      while (remaining > 0) {
        checkTimeout();
        let placed = false;
        // try longest block first (3,2,1)
        for (const len of [Math.min(3, remaining), Math.min(2, remaining), 1]) {
          if (len <= 0) continue;
          // iterate candidate days in preferred order
          for (const day of dayOrder) {
            if (dayLabAssigned.get(day) >= 1) continue; // ensure only one lab per day
            // try to find consecutive block in morningPositions first
            const blockMorning = findConsecutiveLecturePositions(day, len, facultyId, lab.labName || null, morningPositions);
            if (blockMorning.length === len) {
              for (const fullIdx of blockMorning) {
                reserveAssignmentsForFullSlot(day, fullIdx, lab, findRoomForFullSlot(day, fullIdx, lab.labName || null));
              }
              dayLabAssigned.set(day, dayLabAssigned.get(day) + 1);
              remaining -= len;
              placed = true;
              break;
            }
            // if cannot find morning block, try anywhere among dailyLectureIndices
            const allPositions = dailyLectureIndices.map((_, i) => i);
            const blockAny = findConsecutiveLecturePositions(day, len, facultyId, lab.labName || null, allPositions);
            if (blockAny.length === len) {
              // still prefer that the block starts before lunch if possible; but accept any if necessary
              for (const fullIdx of blockAny) {
                reserveAssignmentsForFullSlot(day, fullIdx, lab, findRoomForFullSlot(day, fullIdx, lab.labName || null));
              }
              dayLabAssigned.set(day, dayLabAssigned.get(day) + 1);
              remaining -= len;
              placed = true;
              break;
            }
          } // days
          if (placed) break;
        } // len
        if (!placed) {
          // cannot place a block — try to place single period on any day that has no lab yet
          let singlePlaced = false;
          for (const day of dayOrder) {
            if (dayLabAssigned.get(day) >= 1) continue;
            for (const pos of morningPositions) {
              const fullIdx = lecturePosToFull(pos);
              if (!isSlotFree(day, fullIdx)) continue;
              if (!isFacultyGloballyAvailable(facultyId, day, fullIdx)) continue;
              reserveAssignmentsForFullSlot(day, fullIdx, lab, findRoomForFullSlot(day, fullIdx, lab.labName || null));
              dayLabAssigned.set(day, dayLabAssigned.get(day) + 1);
              remaining -= 1;
              singlePlaced = true;
              break;
            }
            if (singlePlaced) break;
          }
          if (!singlePlaced) break; // nothing more possible
        }
      } // while remaining
    } // end labs

    // --- LECTURE ASSIGNMENT ---
    const lectureSubjects = subjects.filter(s => s.subjectType !== 'Lab').sort((a,b) => (b.periodsPerWeek || 0) - (a.periodsPerWeek || 0));

    // To reduce repeating identical day patterns, we'll rotate/shuffle lecture subject order per day
    // Create a day-specific subject order by rotating base list and randomizing a bit
    const baseLectureOrder = lectureSubjects.map(s => s);
    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      checkTimeout();
      const day = days[dayIndex];
      // rotate the base list by dayIndex and small shuffle
      let dayLectureOrder = baseLectureOrder.slice(dayIndex).concat(baseLectureOrder.slice(0, dayIndex));
      // small Fisher-Yates shuffle with limited swaps to keep overall priorities but vary order
      for (let k = 0; k < Math.min(3, dayLectureOrder.length); k++) {
        const i = Math.floor(Math.random() * dayLectureOrder.length);
        const j = Math.floor(Math.random() * dayLectureOrder.length);
        [dayLectureOrder[i], dayLectureOrder[j]] = [dayLectureOrder[j], dayLectureOrder[i]];
      }

      // Iterate subjects in this day order and try to place up to their needed periods
      for (const subject of dayLectureOrder) {
        const sid = subject._id.toString();
        const facultyId = subject.faculty?._id?.toString();
        if (!facultyId) continue;
        const needed = Math.max(0, (subject.periodsPerWeek || 0) - (subjectAssignments.get(sid).assigned || 0));
        if (needed <= 0) continue;
        // scan lecture positions for this day and place respecting consecutive constraint
        for (let pos = 0; pos < dailyLectureIndices.length && (subjectAssignments.get(sid).assigned || 0) < (subject.periodsPerWeek || 0); pos++) {
          checkTimeout();
          const fullIdx = lecturePosToFull(pos);
          if (!isSlotFree(day, fullIdx)) continue;
          if (!isFacultyGloballyAvailable(facultyId, day, fullIdx)) continue;
          if (!canPlaceSubjectAtLecturePos(day, pos, sid, subject.subjectType)) continue;
          const room = findRoomForFullSlot(day, fullIdx, null);
          if (!room) continue;
          reserveAssignmentsForFullSlot(day, fullIdx, subject, room);
        }
      }
    }

    // --- FILL REMAINING LECTURE SLOTS (prefer labs that still need quota) ---
    function tryPlaceOneSlot(sub) {
      const facultyId = sub.faculty?._id?.toString();
      if (!facultyId) return false;
      for (const day of days) {
        for (let pos = 0; pos < dailyLectureIndices.length; pos++) {
          checkTimeout();
          const fullIdx = lecturePosToFull(pos);
          if (!isSlotFree(day, fullIdx)) continue;
          if (!isFacultyGloballyAvailable(facultyId, day, fullIdx)) continue;
          if (!canPlaceSubjectAtLecturePos(day, pos, sub._id.toString(), sub.subjectType)) continue;
          const room = findRoomForFullSlot(day, fullIdx, sub.subjectType === 'Lab' ? sub.labName : null);
          if (!room) continue;
          // ensure not assigning second lab on same day
          if (sub.subjectType === 'Lab' && dayLabAssigned.get(day) >= 1) continue;
          reserveAssignmentsForFullSlot(day, fullIdx, sub, room);
          if (sub.subjectType === 'Lab') dayLabAssigned.set(day, dayLabAssigned.get(day) + 1);
          return true;
        }
      }
      return false;
    }

    let progress = true;
    while (progress) {
      progress = false;
      // labs needing quota first
      for (const lab of subjects.filter(s => s.subjectType === 'Lab')) {
        const sid = lab._id.toString();
        if ((subjectAssignments.get(sid).assigned || 0) < (lab.periodsPerWeek || 0)) {
          if (tryPlaceOneSlot(lab)) progress = true;
        }
      }
      // then other subjects with lower assigned count to spread
      const sortedByAssigned = [...subjects].sort((a,b) => (subjectAssignments.get(a._id.toString()).assigned || 0) - (subjectAssignments.get(b._id.toString()).assigned || 0));
      for (const s of sortedByAssigned) {
        if (tryPlaceOneSlot(s)) progress = true;
      }
    }

    // force-fill any leftover lecture columns (last resort) while preserving global faculty conflicts
    for (const day of days) {
      for (let pos = 0; pos < dailyLectureIndices.length; pos++) {
        const fullIdx = lecturePosToFull(pos);
        if (!isSlotFree(day, fullIdx)) continue;
        for (const sub of subjects) {
          const facultyId = sub.faculty?._id?.toString();
          if (!facultyId) continue;
          if (!isFacultyGloballyAvailable(facultyId, day, fullIdx)) continue;
          const room = findRoomForFullSlot(day, fullIdx, sub.subjectType === 'Lab' ? sub.labName : null);
          if (!room) continue;
          // if lab and day already has lab, skip (try preserve rule)
          if (sub.subjectType === 'Lab' && dayLabAssigned.get(day) >= 1) continue;
          reserveAssignmentsForFullSlot(day, fullIdx, sub, room);
          if (sub.subjectType === 'Lab') dayLabAssigned.set(day, dayLabAssigned.get(day) + 1);
          break;
        }
      }
    }

    // --- Insert fixed events (breaks/lunch/qcpc) so UI displays them ---
    for (const day of days) {
      for (let fi = 0; fi < fullSlots.length; fi++) {
        if (fullSlots[fi].type !== 'lecture') {
          // don't duplicate if already present (shouldn't be)
          const exists = entries.find(e => e.day === day && e.timeSlot.start === fullSlots[fi].start);
          if (!exists) {
            entries.push({
              day,
              timeSlot: { start: fullSlots[fi].start, end: fullSlots[fi].end },
              subject: null,
              type: fullSlots[fi].type,
              room: null,
              name: fullSlots[fi].name || (fullSlots[fi].type === 'break' ? 'Break' : fullSlots[fi].type)
            });
          }
        }
      }
    }

    // sort entries by day then by start time
    entries.sort((a, b) => {
      const da = days.indexOf(a.day), db = days.indexOf(b.day);
      if (da !== db) return da - db;
      const [ah, am] = a.timeSlot.start.split(':').map(Number);
      const [bh, bm] = b.timeSlot.start.split(':').map(Number);
      return ah * 60 + am - (bh * 60 + bm);
    });

    finalTimetables.push({ semester, department, entries });
  } // end semester loop

  // save all timetables
  await saveAllTimetables(finalTimetables);
  return finalTimetables;

  // helper to save
 async function saveAllTimetables(timetables) {
  const bulkOps = [];

  for (const timetable of timetables) {
    // Find last version for this semester & department
    const last = await Timetable.findOne({
      semester: timetable.semester,
      department: timetable.department
    }).sort({ version: -1 });

    const newVersion = last ? last.version + 1 : 1;

    // Add insert operation (not update)
    bulkOps.push({
      insertOne: {
        document: {
          semester: timetable.semester,
          department: timetable.department,
          version: newVersion,
          entries: timetable.entries,
          createdAt: new Date()
        }
      }
    });
  }

  if (bulkOps.length) {
    await Timetable.bulkWrite(bulkOps);
  }
}

}

module.exports = generateTimetableData;
