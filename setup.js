const mongoose = require('mongoose');
const User = require('./models/User');
const dotenv = require('dotenv');

dotenv.config();

async function setupDefaultAdmin() {
  try {
    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('Admin already exists');
      return;
    }

    // Create default admin
    const admin = new User({
      email: 'admin@cloudeleven.com',
      password: 'admin123',
      role: 'admin',
      name: 'System Administrator'
    });

    await admin.save();
    console.log('✅ Default admin created successfully');
    console.log('Email: admin@cloudeleven.com');
    console.log('Password: admin123');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

// Export the function
module.exports = setupDefaultAdmin;
