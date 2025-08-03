const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  semester: {
    type: String,
    required: true,
  },
  qcpcEnabled: {
    type: Boolean,
    default: true
  },
  qcpcTime: {
    start: {
      type: String,
      default: '08:50'
    },
    end: {
      type: String,
      default: '09:05'
    }
  },
  classStartTime: {
    type: String,
    default: '09:05'
  },
  classEndTime: {
    type: String,
    default: '16:15'
  },
  periodDuration: {
    type: Number,
    default: 50 // minutes
  },
  breakTimes: [{
    name: {
      type: String,
      required: true
    },
    start: {
      type: String,
      required: true
    },
    end: {
      type: String,
      required: true
    }
  }],
  lunchBreak: {
    start: {
      type: String,
      default: '12:25'
    },
    end: {
      type: String,
      default: '13:10'
    }
  },
  workingDays: {
    type: [String],
    default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  }
}, {
  timestamps: true
});

// Compound index for semester and department
configSchema.index({ semester: 1, department: 1 }, { unique: true });

module.exports = mongoose.model('Config', configSchema);