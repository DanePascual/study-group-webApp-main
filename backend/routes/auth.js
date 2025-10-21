const express = require("express");
const router = express.Router();
const admin = require("../config/firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// Configure your mailer (replace with your SMTP credentials or use Gmail App Password)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER, // replace with your email
    pass: process.env.GMAIL_PASS, // replace with your Gmail App Password
  },
});

// Utility: Generate a 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Utility: Hash OTP for extra security
function hashOTP(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

// Utility: Rate limit OTP requests per email (max 1 per 60 seconds)
async function canRequestOTP(email) {
  const doc = await admin
    .firestore()
    .collection("otpRateLimits")
    .doc(email)
    .get();
  if (!doc.exists) return true;
  const { lastRequested } = doc.data();
  return Date.now() - lastRequested > 60 * 1000; // 60 seconds
}

// 1. Request OTP endpoint (with rate limiting and hashed OTP)
router.post("/request-otp", async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@paterostechnologicalcollege\.edu\.ph$/.test(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  // Optional: Rate limit OTP requests per email
  if (!(await canRequestOTP(email))) {
    return res.status(429).json({
      error: "OTP recently sent. Please wait before requesting again.",
    });
  }

  const otp = generateOTP();
  const hashedOtp = hashOTP(otp);
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes from now

  // Store hashed OTP in Firestore
  await admin.firestore().collection("pendingOtps").doc(email).set({
    otp: hashedOtp,
    expiresAt,
  });

  // Update rate limit info
  await admin.firestore().collection("otpRateLimits").doc(email).set({
    lastRequested: Date.now(),
  });

  // Send OTP via email
  try {
    await transporter.sendMail({
      from: '"StudyGroup" <mailerstudygroup@gmail.com>',
      to: email,
      subject: "Your StudyGroup OTP Code",
      text: `Your verification code is: ${otp}`,
      html: `<b>Your verification code is:</b> <h2>${otp}</h2>`,
    });
    res.json({ message: "OTP sent to email." });
  } catch (err) {
    res.status(500).json({ error: "Failed to send email." });
  }
});

// 2. Verify OTP endpoint (with hashed compare)
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP required." });
  }

  const doc = await admin
    .firestore()
    .collection("pendingOtps")
    .doc(email)
    .get();
  if (!doc.exists) {
    return res.status(400).json({ error: "No OTP requested for this email." });
  }
  const data = doc.data();

  if (hashOTP(otp) !== data.otp) {
    return res.status(400).json({ error: "Invalid OTP." });
  }
  if (Date.now() > data.expiresAt) {
    return res
      .status(400)
      .json({ error: "OTP expired. Please request a new one." });
  }

  // Mark as verified (or simply delete the OTP entry for this email)
  await admin.firestore().collection("pendingOtps").doc(email).delete();
  // Optionally: create a flag in Firestore to allow signup (see below)
  await admin.firestore().collection("verifiedOtps").doc(email).set({
    verified: true,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ message: "OTP verified. You may now sign up." });
});

// 3. Updated Signup endpoint: Only allow if OTP was verified
router.post("/signup", async (req, res) => {
  const { firstName, lastName, email, studentId, course, yearLevel, password } =
    req.body;

  // Validate institutional email
  if (!/^[^\s@]+@paterostechnologicalcollege\.edu\.ph$/.test(email)) {
    return res.status(400).json({
      error:
        "Email must be a valid @paterostechnologicalcollege.edu.ph address.",
    });
  }

  // NEW: Validate Student ID format
  if (!/^\d{4}-\d{4}$/.test(studentId)) {
    return res.status(400).json({
      error: "Student ID must be in format YYYY-NNNN (e.g., 2024-1234).",
    });
  }

  // Check if the OTP was verified
  const otpDoc = await admin
    .firestore()
    .collection("verifiedOtps")
    .doc(email)
    .get();
  if (!otpDoc.exists) {
    return res
      .status(400)
      .json({ error: "Email not verified. Please verify OTP first." });
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });
    await admin
      .firestore()
      .collection("users")
      .doc(userRecord.uid)
      .set({
        name: `${firstName} ${lastName}`,
        email,
        studentNumber: studentId,
        program: course,
        yearLevel,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    // Delete the verified OTP flag to prevent re-use
    await admin.firestore().collection("verifiedOtps").doc(email).delete();
    res.status(201).json({ message: "Signup successful", uid: userRecord.uid });
  } catch (error) {
    let msg = error.message;
    if (error.code === "auth/email-already-exists") {
      msg = "This email is already registered.";
    }
    res.status(400).json({ error: msg });
  }
});

module.exports = router;
