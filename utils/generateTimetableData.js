const Timetable = require("../models/Timetable");
const generateTimeSlots = require("./generateTimeSlots");

async function generateTimetableData(allSemesterData) {
  const facultyAvailability = {};
  const roomAvailability = {};
  const subjectAssignments = {};
  const subjectDayDistribution = {};
  const finalTimetables = [];

  for (const { semester, department, subjects, config } of allSemesterData) {
    if (!subjects || !subjects.length || !config) {
      finalTimetables.push({ semester, department, entries: [] });
      continue;
    }

    const timeSlots = generateTimeSlots(config).filter(s => s.type === 'lecture');
    const days = config.workingDays;
    const totalSlotsPerDay = timeSlots.length;
    const entries = [];
    
    // Initialize data structures
    initializeDataStructures();

    // Sort subjects by priority (labs first, then by periodsPerWeek descending)
    const sortedSubjects = [...subjects].sort((a, b) => {
      if (a.subjectType === 'Lab' && b.subjectType !== 'Lab') return -1;
      if (b.subjectType === 'Lab' && a.subjectType !== 'Lab') return 1;
      return b.periodsPerWeek - a.periodsPerWeek;
    });

    // Assign labs first with consecutive slots
    assignAllLabs();

    // Assign lectures in optimized manner
    assignAllLectures();

    // Fill remaining slots with additional periods if needed
    fillRemainingSlots();

    // Add fixed events
    addFixedEvents();

    // Save timetable
    await saveTimetable();

    // Helper functions
    function initializeDataStructures() {
      // Initialize faculty availability
      for (const subject of subjects) {
        const facultyId = subject.faculty?._id?.toString();
        if (!facultyId) continue;
        
        if (!facultyAvailability[facultyId]) {
          facultyAvailability[facultyId] = {};
          for (const day of days) {
            facultyAvailability[facultyId][day] = new Array(totalSlotsPerDay).fill(false);
          }
        }
      }

      // Initialize room availability (20 rooms + labs)
      const labNames = subjects
        .filter(s => s.subjectType === 'Lab')
        .map(s => s.labName)
        .filter(Boolean);

      const allRooms = [
        ...Array.from({length: 20}, (_, i) => `Room ${101 + i}`),
        ...new Set(labNames) // Unique lab names
      ];

      for (const room of allRooms) {
        roomAvailability[room] = {};
        for (const day of days) {
          roomAvailability[room][day] = new Array(totalSlotsPerDay).fill(false);
        }
      }

      // Initialize subject assignments tracking
      subjectAssignments[semester] = {};
      subjectDayDistribution[semester] = {};
      for (const subject of subjects) {
        subjectAssignments[semester][subject._id] = {
          assigned: 0,
          lastDay: null,
          lastSlot: -1
        };
        subjectDayDistribution[semester][subject._id] = {};
        days.forEach(day => {
          subjectDayDistribution[semester][subject._id][day] = 0;
        });
      }
    }

    function assignAllLabs() {
      const labSubjects = sortedSubjects.filter(s => s.subjectType === 'Lab');
      
      for (const subject of labSubjects) {
        const facultyId = subject.faculty?._id?.toString();
        if (!facultyId) continue;

        const periodsRequired = subject.periodsPerWeek || 0;
        const labRoom = subject.labName || `Lab ${Math.floor(Math.random() * 5) + 1}`;
        const labDuration = Math.min(3, periodsRequired); // Typically 2-3 hour labs

        // Try to assign labs on different days
        const daysByAvailability = [...days].sort((a, b) => {
          const aCount = facultyAvailability[facultyId][a].filter(Boolean).length;
          const bCount = facultyAvailability[facultyId][b].filter(Boolean).length;
          return aCount - bCount;
        });

        for (const day of daysByAvailability) {
          if (subjectAssignments[semester][subject._id].assigned >= periodsRequired) break;

          // Find consecutive slots in the morning (before lunch)
          const morningSlots = findConsecutiveSlots(day, labRoom, labDuration, facultyId, true);
          if (morningSlots.length === labDuration) {
            for (const slotIndex of morningSlots) {
              facultyAvailability[facultyId][day][slotIndex] = true;
              roomAvailability[labRoom][day][slotIndex] = true;
              
              entries.push(createEntry(day, slotIndex, subject, labRoom));
              subjectAssignments[semester][subject._id].assigned++;
              subjectDayDistribution[semester][subject._id][day]++;
              subjectAssignments[semester][subject._id].lastDay = day;
              subjectAssignments[semester][subject._id].lastSlot = slotIndex;
            }
            continue;
          }

          // If no morning slots, try afternoon
          const afternoonSlots = findConsecutiveSlots(day, labRoom, labDuration, facultyId, false);
          if (afternoonSlots.length === labDuration) {
            for (const slotIndex of afternoonSlots) {
              facultyAvailability[facultyId][day][slotIndex] = true;
              roomAvailability[labRoom][day][slotIndex] = true;
              
              entries.push(createEntry(day, slotIndex, subject, labRoom));
              subjectAssignments[semester][subject._id].assigned++;
              subjectDayDistribution[semester][subject._id][day]++;
              subjectAssignments[semester][subject._id].lastDay = day;
              subjectAssignments[semester][subject._id].lastSlot = slotIndex;
            }
          }
        }
      }
    }

    function assignAllLectures() {
      const lectureSubjects = sortedSubjects.filter(s => s.subjectType !== 'Lab');
      
      // Assign in multiple passes to distribute evenly
      for (let pass = 0; pass < 3; pass++) {
        for (const subject of lectureSubjects) {
          const facultyId = subject.faculty?._id?.toString();
          if (!facultyId) continue;

          const periodsRequired = subject.periodsPerWeek || 0;
          if (subjectAssignments[semester][subject._id].assigned >= periodsRequired) continue;

          // Get days sorted by least assigned for this subject first
          const daysBySubjectDistribution = [...days].sort((a, b) => {
            return subjectDayDistribution[semester][subject._id][a] - 
                   subjectDayDistribution[semester][subject._id][b];
          });

          for (const day of daysBySubjectDistribution) {
            if (subjectAssignments[semester][subject._id].assigned >= periodsRequired) break;
            if (subjectDayDistribution[semester][subject._id][day] >= 2) continue; // Max 2 per day

            // Find best available slot that's not adjacent to same subject
            const availableSlots = findBestSlotsForLecture(day, facultyId, subject._id);
            
            if (availableSlots.length > 0) {
              const slotInfo = availableSlots[0]; // Take the best available slot
              const { slotIndex, room } = slotInfo;
              
              facultyAvailability[facultyId][day][slotIndex] = true;
              roomAvailability[room][day][slotIndex] = true;
              
              entries.push(createEntry(day, slotIndex, subject, room));
              subjectAssignments[semester][subject._id].assigned++;
              subjectDayDistribution[semester][subject._id][day]++;
              subjectAssignments[semester][subject._id].lastDay = day;
              subjectAssignments[semester][subject._id].lastSlot = slotIndex;
            }
          }
        }
      }
    }

    function fillRemainingSlots() {
      // Fill any remaining empty slots with additional periods if needed
      const lectureSubjects = sortedSubjects.filter(s => s.subjectType !== 'Lab');
      
      for (const day of days) {
        for (let slotIndex = 0; slotIndex < totalSlotsPerDay; slotIndex++) {
          // Skip if this is a fixed event slot (like lunch)
          if (isFixedEventSlot(timeSlots[slotIndex].start)) continue;
          
          // Check if slot is empty
          let slotFilled = false;
          for (const room in roomAvailability) {
            if (roomAvailability[room][day][slotIndex]) {
              slotFilled = true;
              break;
            }
          }
          
          if (!slotFilled) {
            // Try to find a subject that can use this slot
            for (const subject of lectureSubjects) {
              const facultyId = subject.faculty?._id?.toString();
              if (!facultyId) continue;
              
              const periodsRequired = subject.periodsPerWeek || 0;
              if (subjectAssignments[semester][subject._id].assigned >= periodsRequired) continue;
              
              // Check if faculty is available and not teaching same subject consecutively
              if (!facultyAvailability[facultyId][day][slotIndex] &&
                  !isSameSubjectAdjacent(day, slotIndex, subject._id)) {
                
                const room = findAvailableRoom(day, slotIndex);
                if (room) {
                  facultyAvailability[facultyId][day][slotIndex] = true;
                  roomAvailability[room][day][slotIndex] = true;
                  
                  entries.push(createEntry(day, slotIndex, subject, room));
                  subjectAssignments[semester][subject._id].assigned++;
                  subjectDayDistribution[semester][subject._id][day]++;
                  subjectAssignments[semester][subject._id].lastDay = day;
                  subjectAssignments[semester][subject._id].lastSlot = slotIndex;
                  break;
                }
              }
            }
          }
        }
      }
    }

    function findConsecutiveSlots(day, room, count, facultyId, preferMorning = true) {
      const availableSlots = [];
      
      if (!roomAvailability[room] || !roomAvailability[room][day]) {
        return availableSlots;
      }

      // Determine search order based on preference
      const searchRanges = preferMorning 
        ? [
            {start: 0, end: Math.floor(totalSlotsPerDay/2)}, // Morning first
            {start: Math.floor(totalSlotsPerDay/2), end: totalSlotsPerDay} // Then afternoon
          ]
        : [
            {start: Math.floor(totalSlotsPerDay/2), end: totalSlotsPerDay}, // Afternoon first
            {start: 0, end: Math.floor(totalSlotsPerDay/2)} // Then morning
          ];

      for (const range of searchRanges) {
        for (let i = range.start; i <= range.end - count; i++) {
          let consecutive = true;
          for (let j = 0; j < count; j++) {
            if (roomAvailability[room][day][i + j] || 
                facultyAvailability[facultyId][day][i + j] ||
                isFixedEventSlot(timeSlots[i + j].start)) {
              consecutive = false;
              break;
            }
          }
          if (consecutive) {
            for (let j = 0; j < count; j++) {
              availableSlots.push(i + j);
            }
            return availableSlots;
          }
        }
      }
      return availableSlots;
    }

    function findBestSlotsForLecture(day, facultyId, subjectId) {
      const availableSlots = [];
      
      for (let slotIndex = 0; slotIndex < totalSlotsPerDay; slotIndex++) {
        // Skip fixed event slots
        if (isFixedEventSlot(timeSlots[slotIndex].start)) continue;
        
        // Check faculty and room availability
        if (!facultyAvailability[facultyId][day][slotIndex]) {
          const room = findAvailableRoom(day, slotIndex);
          if (room) {
            // Check if this would create consecutive same-subject lectures
            if (!isSameSubjectAdjacent(day, slotIndex, subjectId)) {
              // Calculate score for this slot (higher is better)
              let score = 100;
              
              // Prefer slots that balance faculty workload
              const facultyDayCount = facultyAvailability[facultyId][day].filter(Boolean).length;
              score -= facultyDayCount * 5;
              
              // Prefer morning slots (index 0-3) for better distribution
              if (slotIndex < 4) score += 10;
              
              // Prefer afternoon slots if morning is full
              if (slotIndex >= Math.floor(totalSlotsPerDay/2)) score += 5;
              
              availableSlots.push({ slotIndex, room, score });
            }
          }
        }
      }
      
      // Sort by score descending
      return availableSlots.sort((a, b) => b.score - a.score);
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

    function isFixedEventSlot(startTime) {
      // Check if this slot overlaps with fixed events
      return (
        (config.qcpcEnabled && startTime >= config.qcpcTime.start && startTime < config.qcpcTime.end) ||
        (startTime >= config.lunchBreak.start && startTime < config.lunchBreak.end) ||
        config.breakTimes.some(b => startTime >= b.start && startTime < b.end)
      );
    }

    function findAvailableRoom(day, slotIndex) {
      // Get all available rooms, shuffle them to distribute usage
      const availableRooms = Object.keys(roomAvailability)
        .filter(room => 
          !roomAvailability[room][day][slotIndex] && 
          !isFixedEventSlot(timeSlots[slotIndex].start)
        )
        .sort(() => Math.random() - 0.5); // Shuffle for better distribution
      
      return availableRooms.length > 0 ? availableRooms[0] : null;
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

    async function saveTimetable() {
      await Timetable.deleteOne({ semester, department });
      const timetableDoc = new Timetable({ semester, department, entries });
      await timetableDoc.save();
      finalTimetables.push(timetableDoc);
    }
  }

  return finalTimetables;
}

module.exports = generateTimetableData;