const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');


// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const staffRoutes = require('./routes/staff');
const subjectRoutes = require('./routes/subjects');
const timetableRoutes = require('./routes/timetable');
const configRoutes = require('./routes/config');
const activityRoutes = require('./routes/activity');
const adminRoutes = require('./routes/admin');
const setupDefaultAdmin = require('./setup');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cloud-eleven')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Set up default admin user
setupDefaultAdmin();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/config', configRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/admin', adminRoutes);


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Cloud Eleven API is running' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});