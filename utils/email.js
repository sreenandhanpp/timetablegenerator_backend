const nodemailer = require('nodemailer');
require('dotenv').config(); // Ensure environment variables are loaded

// Create the transporter for Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends a welcome email to newly added staff
 * @param {Object} staffData - Contains email, name, and password
 */
const sendWelcomeEmail = async (staffData) => {
  const mailOptions = {
    from: `"Timetable System" <${process.env.EMAIL_USER}>`,
    to: staffData.email,
    subject: 'Welcome to Our Institution - Staff Account Created',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome, ${staffData.name}!</h2>
        <p>Your staff account has been successfully created.</p>

        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Login Credentials:</strong></p>
          <p>Email: ${staffData.email}</p>
          <p>Temporary Password: ${staffData.password}</p>
          <p>Login URL: <a href="${process.env.FRONTEND_URL}/login">Click here to login</a></p>
        </div>

        <p style="color: #ef4444; font-weight: bold;">
          For security reasons, please change your password after first login.
        </p>

        <p>Best regards,<br>Administration Team</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${staffData.email}`);
  } catch (error) {
    console.error(`❌ Failed to send welcome email to ${staffData.email}:`, error.message);
  }
};

module.exports = {
  sendWelcomeEmail,
};
