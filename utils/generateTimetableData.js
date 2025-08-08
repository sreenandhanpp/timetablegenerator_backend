const Timetable = require("../models/Timetable");
const generateTimeSlots = require("./generateTimeSlots");

async function generateTimetableData(allSemesterData) {
  const finalTimetables = [];
  const MAX_EXECUTION_TIME = 30000; // 30 seconds timeout
  const startTime = Date.now();

  // Global tracking of faculty assignments across all semesters
  const globalFacultyAvailability = new Map();

  function checkTimeout() {
    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
      throw new Error('Timetable generation timed out');
    }
  }

  // Initialize global faculty tracking
  function initializeGlobalFacultyTracking() {
    for (const { subjects } of allSemesterData) {
      if (!subjects) continue;
      
      for (const subject of subjects) {
        const facultyId = subject.faculty?._id?.toString();
        if (!facultyId) continue;
        
        if (!globalFacultyAvailability.has(facultyId)) {
          globalFacultyAvailability.set(facultyId, {
            assignedSlots: new Map(), // day -> Set of slot indices
            subjects: new Set()      // Set of subject IDs
          });
        }
        
        // Track which subjects this faculty is assigned to
        globalFacultyAvailability.get(facultyId).subjects.add(subject._id.toString());
      }
    }
  }

  initializeGlobalFacultyTracking();

  // Main execution flow
  for (const { semester, department, subjects, config } of allSemesterData) {
    checkTimeout();

    if (!subjects || !subjects.length || !config) {
      finalTimetables.push({ semester, department, entries: [] });
      continue;
    }

    const timeSlots = generateTimeSlots(config).filter(s => s.type === 'lecture');
    const days = config.workingDays;
    const totalSlotsPerDay = timeSlots.length;
    const entries = [];
    
    // Local tracking structures
    const facultyAvailability = new Map();
    const roomAvailability = new Map();
    const subjectAssignments = new Map();
    const subjectDayDistribution = new Map();

    // Sort subjects by priority (labs first, then by periodsPerWeek descending)
    const sortedSubjects = [...subjects].sort((a, b) => {
      if (a.subjectType === 'Lab' && b.subjectType !== 'Lab') return -1;
      if (b.subjectType === 'Lab' && a.subjectType !== 'Lab') return 1;
      return b.periodsPerWeek - a.periodsPerWeek;
    });

    // Precompute fixed event slots
    const fixedEventSlots = new Set();
    timeSlots.forEach((slot, index) => {
      if (
        (config.qcpcEnabled && slot.start >= config.qcpcTime.start && slot.start < config.qcpcTime.end) ||
        (slot.start >= config.lunchBreak.start && slot.start < config.lunchBreak.end) ||
        config.breakTimes.some(b => slot.start >= b.start && slot.start < b.end)
      ) {
        fixedEventSlots.add(index);
      }
    });

    // Helper functions
    function isFacultyGloballyAvailable(facultyId, day, slotIndex) {
      if (!globalFacultyAvailability.has(facultyId)) return true;
      
      const facultyGlobalData = globalFacultyAvailability.get(facultyId);
      return !facultyGlobalData.assignedSlots.get(day)?.has(slotIndex);
    }

    function isSlotEmpty(day, slotIndex) {
      if (fixedEventSlots.has(slotIndex)) return false;
      
      for (const [, daySlots] of roomAvailability) {
        if (daySlots.get(day)?.has(slotIndex)) {
          return false;
        }
      }
      return true;
    }

    function findConsecutiveSlots(day, room, count, facultyId) {
      const facultyDaySlots = facultyAvailability.get(facultyId)?.get(day);
      const roomDaySlots = roomAvailability.get(room)?.get(day);
      
      if (!facultyDaySlots || !roomDaySlots) return [];

      for (let i = 0; i <= totalSlotsPerDay - count; i++) {
        let consecutive = true;
        for (let j = 0; j < count; j++) {
          if (fixedEventSlots.has(i + j) || 
              facultyDaySlots.has(i + j) || 
              roomDaySlots.has(i + j) ||
              !isFacultyGloballyAvailable(facultyId, day, i + j)) {
            consecutive = false;
            break;
          }
        }
        if (consecutive) {
          return Array.from({length: count}, (_, j) => i + j);
        }
      }
      return [];
    }

    function isSameSubjectAdjacent(day, slotIndex, subjectId) {
      // Check previous slot
      if (slotIndex > 0) {
        const prevEntry = entries.find(e => 
          e.day === day && 
          e.timeSlot.end === timeSlots[slotIndex].start
        );
        if (prevEntry && prevEntry.subject.toString() === subjectId) {
          return true;
        }
      }
      
      // Check next slot
      if (slotIndex < totalSlotsPerDay - 1) {
        const nextEntry = entries.find(e => 
          e.day === day && 
          e.timeSlot.start === timeSlots[slotIndex].end
        );
        if (nextEntry && nextEntry.subject.toString() === subjectId) {
          return true;
        }
      }
      
      return false;
    }

    function findAvailableRoom(day, slotIndex) {
      if (fixedEventSlots.has(slotIndex)) return null;
      
      const availableRooms = [];
      for (const [room, daySlots] of roomAvailability) {
        if (!daySlots.get(day)?.has(slotIndex)) {
          availableRooms.push(room);
        }
      }
      
      return availableRooms.length > 0 
        ? availableRooms[Math.floor(Math.random() * availableRooms.length)] 
        : null;
    }

    function createEntry(day, slotIndex, subject, room) {
      return {
        day,
        timeSlot: {
          start: timeSlots[slotIndex].start,
          end: timeSlots[slotIndex].end
        },
        subject: subject._id,
        type: subject.subjectType.toLowerCase(),
        room: room
      };
    }

    function findBestSlotsForLecture(day, facultyId, subjectId) {
      const facultyDaySlots = facultyAvailability.get(facultyId)?.get(day);
      if (!facultyDaySlots) return [];
      
      const availableSlots = [];
      
      for (let slotIndex = 0; slotIndex < totalSlotsPerDay; slotIndex++) {
        checkTimeout();
        
        if (fixedEventSlots.has(slotIndex)) continue;
        if (facultyDaySlots.has(slotIndex)) continue;
        if (isSameSubjectAdjacent(day, slotIndex, subjectId)) continue;
        if (!isFacultyGloballyAvailable(facultyId, day, slotIndex)) continue;
        
        const room = findAvailableRoom(day, slotIndex);
        if (room) {
          let score = 100;
          
          // Calculate score (optimized)
          const facultyDayCount = facultyDaySlots.size;
          score -= facultyDayCount * 5;
          
          if (slotIndex < Math.floor(totalSlotsPerDay/2)) score += 10;
          
          const subjectDayCount = subjectDayDistribution.get(subjectId)?.get(day) || 0;
          if (subjectDayCount === 0) score += 15;
          
          availableSlots.push({ slotIndex, room, score });
        }
      }
      
      return availableSlots.length > 1 
        ? availableSlots.sort((a, b) => b.score - a.score)
        : availableSlots;
    }

    function addFixedEvents() {
      for (const day of days) {
        if (config.qcpcEnabled) {
          entries.push({ day, timeSlot: config.qcpcTime, type: 'qcpc' });
        }
        entries.push({ day, timeSlot: config.lunchBreak, type: 'lunch' });
        for (const b of config.breakTimes) {
          entries.push({ day, timeSlot: b, type: 'break' });
        }
      }
    }

    function initializeDataStructures() {
      // Initialize subject assignments for ALL subjects first
      for (const subject of subjects) {
        const subjectId = subject._id.toString();
        if (!subjectAssignments.has(subjectId)) {
          subjectAssignments.set(subjectId, {
            assigned: 0,
            lastDay: null,
            lastSlot: -1
          });
          
          const dayDist = new Map();
          for (const day of days) {
            dayDist.set(day, 0);
          }
          subjectDayDistribution.set(subjectId, dayDist);
        }
      }

      // Initialize faculty availability
      for (const subject of subjects) {
        const facultyId = subject.faculty?._id?.toString();
        if (!facultyId) continue;
        
        if (!facultyAvailability.has(facultyId)) {
          const facultyDays = new Map();
          for (const day of days) {
            facultyDays.set(day, new Set());
          }
          facultyAvailability.set(facultyId, facultyDays);
        }
      }

      // Initialize room availability (20 rooms + labs)
      const labNames = subjects
        .filter(s => s.subjectType === 'Lab')
        .map(s => s.labName)
        .filter(Boolean);

      const allRooms = [
        ...Array.from({length: 20}, (_, i) => `Room ${101 + i}`),
        ...new Set(labNames)
      ];

      for (const room of allRooms) {
        if (!roomAvailability.has(room)) {
          const roomDays = new Map();
          for (const day of days) {
            roomDays.set(day, new Set());
          }
          roomAvailability.set(room, roomDays);
        }
      }
    }

    function updateGlobalFacultyAvailability(facultyId, day, slotIndex) {
      if (!globalFacultyAvailability.has(facultyId)) {
        globalFacultyAvailability.set(facultyId, {
          assignedSlots: new Map(),
          subjects: new Set()
        });
      }
      
      const facultyData = globalFacultyAvailability.get(facultyId);
      if (!facultyData.assignedSlots.has(day)) {
        facultyData.assignedSlots.set(day, new Set());
      }
      
      facultyData.assignedSlots.get(day).add(slotIndex);
    }

    function assignAllLabs() {
      const labSubjects = sortedSubjects.filter(s => s.subjectType === 'Lab');
      
      for (const subject of labSubjects) {
        checkTimeout();
        
        const facultyId = subject.faculty?._id?.toString();
        const subjectId = subject._id.toString();
        
        if (!facultyId) {
          console.warn(`No faculty assigned for lab subject: ${subject.name}`);
          continue;
        }

        const periodsRequired = subject.periodsPerWeek || 0;
        const labRoom = subject.labName || `Lab ${Math.floor(Math.random() * 5) + 1}`;
        const labDuration = Math.min(3, periodsRequired);

        // Get faculty days sorted by availability
        const facultyDays = facultyAvailability.has(facultyId)
          ? Array.from(facultyAvailability.get(facultyId).entries())
              .sort(([, aSlots], [, bSlots]) => aSlots.size - bSlots.size)
          : [];

        for (const [day] of facultyDays) {
          if (subjectAssignments.get(subjectId).assigned >= periodsRequired) break;

          // Find consecutive slots
          const availableSlots = findConsecutiveSlots(day, labRoom, labDuration, facultyId);
          if (availableSlots.length === labDuration) {
            for (const slotIndex of availableSlots) {
              facultyAvailability.get(facultyId).get(day).add(slotIndex);
              roomAvailability.get(labRoom).get(day).add(slotIndex);
              updateGlobalFacultyAvailability(facultyId, day, slotIndex);
              
              entries.push(createEntry(day, slotIndex, subject, labRoom));
              
              const subjectData = subjectAssignments.get(subjectId);
              subjectData.assigned++;
              subjectData.lastDay = day;
              subjectData.lastSlot = slotIndex;
              
              subjectDayDistribution.get(subjectId).set(day, 
                subjectDayDistribution.get(subjectId).get(day) + 1);
            }
          }
        }
      }
    }

    function assignAllLectures() {
      const lectureSubjects = sortedSubjects.filter(s => s.subjectType !== 'Lab');
      
      for (let pass = 0; pass < 3; pass++) {
        for (const subject of lectureSubjects) {
          checkTimeout();
          
          const facultyId = subject.faculty?._id?.toString();
          const subjectId = subject._id.toString();
          
          if (!facultyId) {
            console.warn(`No faculty assigned for lecture subject: ${subject.name}`);
            continue;
          }

          if (!subjectAssignments.has(subjectId)) {
            subjectAssignments.set(subjectId, {
              assigned: 0,
              lastDay: null,
              lastSlot: -1
            });
          }

          const periodsRequired = subject.periodsPerWeek || 0;
          if (subjectAssignments.get(subjectId).assigned >= periodsRequired) continue;

          // Get days sorted by least assigned for this subject
          const subjectDays = subjectDayDistribution.has(subjectId)
            ? Array.from(subjectDayDistribution.get(subjectId).entries())
                .sort(([, aCount], [, bCount]) => aCount - bCount)
            : [];

          for (const [day] of subjectDays) {
            if (subjectAssignments.get(subjectId).assigned >= periodsRequired) break;
            if (subjectDayDistribution.get(subjectId).get(day) >= 2) continue;

            const availableSlots = findBestSlotsForLecture(day, facultyId, subjectId);
            
            if (availableSlots.length > 0) {
              const { slotIndex, room } = availableSlots[0];
              
              facultyAvailability.get(facultyId).get(day).add(slotIndex);
              roomAvailability.get(room).get(day).add(slotIndex);
              updateGlobalFacultyAvailability(facultyId, day, slotIndex);
              
              entries.push(createEntry(day, slotIndex, subject, room));
              
              const subjectData = subjectAssignments.get(subjectId);
              subjectData.assigned++;
              subjectData.lastDay = day;
              subjectData.lastSlot = slotIndex;
              
              subjectDayDistribution.get(subjectId).set(day, 
                subjectDayDistribution.get(subjectId).get(day) + 1);
            }
          }
        }
      }
    }

    function fillAllSlots() {
      const lectureSubjects = sortedSubjects.filter(s => s.subjectType !== 'Lab');
      
      for (const day of days) {
        for (let slotIndex = 0; slotIndex < totalSlotsPerDay; slotIndex++) {
          checkTimeout();
          
          if (isSlotEmpty(day, slotIndex)) {
            for (const subject of lectureSubjects) {
              const facultyId = subject.faculty?._id?.toString();
              const subjectId = subject._id.toString();
              
              if (!facultyId) continue;

              if (subjectAssignments.get(subjectId).assigned < subject.periodsPerWeek &&
                  !facultyAvailability.get(facultyId).get(day).has(slotIndex) &&
                  !isSameSubjectAdjacent(day, slotIndex, subjectId) &&
                  isFacultyGloballyAvailable(facultyId, day, slotIndex)) {
                
                const room = findAvailableRoom(day, slotIndex);
                if (room) {
                  facultyAvailability.get(facultyId).get(day).add(slotIndex);
                  roomAvailability.get(room).get(day).add(slotIndex);
                  updateGlobalFacultyAvailability(facultyId, day, slotIndex);
                  
                  entries.push(createEntry(day, slotIndex, subject, room));
                  
                  const subjectData = subjectAssignments.get(subjectId);
                  subjectData.assigned++;
                  subjectData.lastDay = day;
                  subjectData.lastSlot = slotIndex;
                  
                  subjectDayDistribution.get(subjectId).set(day, 
                    subjectDayDistribution.get(subjectId).get(day) + 1);
                  break;
                }
              }
            }
          }
        }
      }

      // Second pass: fill any remaining slots
      for (const day of days) {
        for (let slotIndex = 0; slotIndex < totalSlotsPerDay; slotIndex++) {
          checkTimeout();
          
          if (isSlotEmpty(day, slotIndex)) {
            for (const subject of lectureSubjects) {
              const facultyId = subject.faculty?._id?.toString();
              const subjectId = subject._id.toString();
              
              if (!facultyId) continue;

              if (!facultyAvailability.get(facultyId).get(day).has(slotIndex) &&
                  !isSameSubjectAdjacent(day, slotIndex, subjectId) &&
                  isFacultyGloballyAvailable(facultyId, day, slotIndex)) {
                
                const room = findAvailableRoom(day, slotIndex);
                if (room) {
                  facultyAvailability.get(facultyId).get(day).add(slotIndex);
                  roomAvailability.get(room).get(day).add(slotIndex);
                  updateGlobalFacultyAvailability(facultyId, day, slotIndex);
                  
                  entries.push(createEntry(day, slotIndex, subject, room));
                  
                  const subjectData = subjectAssignments.get(subjectId);
                  subjectData.assigned++;
                  subjectData.lastDay = day;
                  subjectData.lastSlot = slotIndex;
                  
                  subjectDayDistribution.get(subjectId).set(day, 
                    subjectDayDistribution.get(subjectId).get(day) + 1);
                  break;
                }
              }
            }
          }
        }
      }
    }

    // Initialize data structures
    initializeDataStructures();

    // Assign labs first with consecutive slots
    assignAllLabs();

    // Assign lectures in optimized manner
    assignAllLectures();

    // Ensure all slots are filled
    fillAllSlots();

    // Add fixed events
    addFixedEvents();

    // Prepare for saving
    finalTimetables.push({ semester, department, entries });
  }

  // Batch save all timetables at once
  await saveAllTimetables(finalTimetables);
  
  return finalTimetables;
}

async function saveAllTimetables(timetables) {
  const bulkOps = timetables.map(timetable => ({
    updateOne: {
      filter: { semester: timetable.semester, department: timetable.department },
      update: { $set: { entries: timetable.entries } },
      upsert: true
    }
  }));
  
  await Timetable.bulkWrite(bulkOps);
}

module.exports = generateTimetableData;