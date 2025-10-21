const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER, // Your Gmail address from .env
    pass: process.env.GMAIL_PASS, // Your App Password from .env
  },
});

transporter.sendMail(
  {
    from: `"StudyGroup" <${process.env.GMAIL_USER}>`,
    to: "dcpascual@paterostechnologicalcollege.edu.ph", // You can send it to yourself for this test!
    subject: "Test Email from Nodemailer",
    text: "This is a test email sent from your Node.js app using Nodemailer!",
  },
  (err, info) => {
    if (err) {
      return console.log("Error:", err);
    }
    console.log("Email sent:", info.response);
  }
);
