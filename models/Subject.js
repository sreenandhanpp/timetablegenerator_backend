const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  subjectName: {
    type: String,
    required: true,
    trim: true
  },
  subjectCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  subjectType: {
    type: String,
    enum: ['Lecture', 'Lab'],
    required: true
  },
  faculty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  periodsPerWeek: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  labName: {
    type: String,
    required: function() {
      return this.subjectType === 'Lab';
    }
  },
  semester: {
    type: Number,
    required: true,
    min: 1,
    max: 8
  },
  department: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Subject', subjectSchema);