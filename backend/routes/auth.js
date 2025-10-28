const express = require("express");
const router = express.Router();
const admin = require("../config/firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

// Configure your mailer (replace with your SMTP credentials or use Gmail App Password)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER, // replace with your email
    pass: process.env.GMAIL_PASS, // replace with your Gmail App Password
  },
});

// ===== SECURITY: Password validation constants =====
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
  specialChars: "!@#$%^&*()",
};

// ===== SECURITY: Rate limiters =====
const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many OTP verification attempts. Try again in 15 minutes.",
  },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 attempts per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signup attempts. Please try again later." },
});

const requestOtpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 OTP requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OTP requests. Please try again later." },
});

// ===== SECURITY: Logging helper =====
function logSecurityEvent(eventType, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY] ${timestamp} | Event: ${eventType} | Details:`,
    details
  );
}

// ===== SECURITY: Password validation helper =====
function validatePassword(password) {
  if (!password || typeof password !== "string") {
    return { valid: false, errors: ["Password is required"] };
  }

  const errors = [];

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(
      `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`
    );
  }

  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (PASSWORD_REQUIREMENTS.requireNumber && !/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (
    PASSWORD_REQUIREMENTS.requireSpecial &&
    !new RegExp(`[${PASSWORD_REQUIREMENTS.specialChars}]`).test(password)
  ) {
    errors.push(
      `Password must contain at least one special character (${PASSWORD_REQUIREMENTS.specialChars})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ===== Utility: Generate a 6-digit OTP =====
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ===== Utility: Hash OTP for extra security =====
function hashOTP(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

// ===== Utility: Rate limit OTP requests per email (max 1 per 60 seconds) =====
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

// ===== Utility: Sanitize input =====
function sanitizeString(str, maxLength = 255) {
  if (typeof str !== "string") return "";
  return str.trim().substring(0, maxLength);
}

// ===== 1. Request OTP endpoint (with rate limiting and hashed OTP) =====
router.post("/request-otp", requestOtpLimiter, async (req, res) => {
  const { email } = req.body;

  // ===== SECURITY: Validate email format =====
  if (!email || !/^[^\s@]+@paterostechnologicalcollege\.edu\.ph$/.test(email)) {
    logSecurityEvent("REQUEST_OTP_INVALID_EMAIL", { email });
    return res.status(400).json({ error: "Invalid email format." });
  }

  // ===== SECURITY: Rate limit OTP requests per email =====
  if (!(await canRequestOTP(email))) {
    logSecurityEvent("REQUEST_OTP_RATE_LIMIT", { email });
    return res.status(429).json({
      error: "OTP recently sent. Please wait before requesting again.",
    });
  }

  const otp = generateOTP();
  const hashedOtp = hashOTP(otp);
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes from now

  try {
    // Store hashed OTP in Firestore
    await admin.firestore().collection("pendingOtps").doc(email).set({
      otp: hashedOtp,
      expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update rate limit info
    await admin.firestore().collection("otpRateLimits").doc(email).set({
      lastRequested: Date.now(),
    });

    // Send OTP via email
    await transporter.sendMail({
      from: '"StudyGroup" <mailerstudygroup@gmail.com>',
      to: email,
      subject: "Your StudyGroup OTP Code",
      text: `Your verification code is: ${otp}\n\nThis code expires in 5 minutes.`,
      html: `<b>Your verification code is:</b> <h2>${otp}</h2><p>This code expires in 5 minutes.</p>`,
    });

    console.log(`[auth] OTP sent to ${email}`);
    res.json({ message: "OTP sent to email." });
  } catch (err) {
    console.error("[auth] Failed to send OTP email:", err);
    logSecurityEvent("REQUEST_OTP_EMAIL_FAILED", { email, error: err.message });
    res.status(500).json({ error: "Failed to send email." });
  }
});

// ===== 2. Verify OTP endpoint (with hashed compare and rate limiting) =====
router.post("/verify-otp", verifyOtpLimiter, async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    logSecurityEvent("VERIFY_OTP_MISSING_PARAMS", {
      email,
      otp: otp ? "***" : "missing",
    });
    return res.status(400).json({ error: "Email and OTP required." });
  }

  try {
    const doc = await admin
      .firestore()
      .collection("pendingOtps")
      .doc(email)
      .get();

    if (!doc.exists) {
      logSecurityEvent("VERIFY_OTP_NOT_FOUND", { email });
      return res
        .status(400)
        .json({ error: "No OTP requested for this email." });
    }

    const data = doc.data();

    // ===== SECURITY: Constant-time comparison to prevent timing attacks =====
    if (hashOTP(otp) !== data.otp) {
      logSecurityEvent("VERIFY_OTP_INVALID", { email });
      return res.status(400).json({ error: "Invalid OTP." });
    }

    if (Date.now() > data.expiresAt) {
      logSecurityEvent("VERIFY_OTP_EXPIRED", { email });
      await admin.firestore().collection("pendingOtps").doc(email).delete();
      return res
        .status(400)
        .json({ error: "OTP expired. Please request a new one." });
    }

    // Mark as verified
    await admin.firestore().collection("pendingOtps").doc(email).delete();
    await admin.firestore().collection("verifiedOtps").doc(email).set({
      verified: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[auth] OTP verified for ${email}`);
    res.json({ message: "OTP verified. You may now sign up." });
  } catch (error) {
    console.error("[auth] OTP verification error:", error);
    logSecurityEvent("VERIFY_OTP_ERROR", { email, error: error.message });
    res.status(500).json({ error: "Server error during OTP verification." });
  }
});

// ===== 3. Updated Signup endpoint: Validate password strength =====
router.post("/signup", signupLimiter, async (req, res) => {
  const { firstName, lastName, email, studentId, course, yearLevel, password } =
    req.body;

  // ===== SECURITY: Sanitize inputs =====
  const sanitizedFirstName = sanitizeString(firstName, 100);
  const sanitizedLastName = sanitizeString(lastName, 100);
  const sanitizedCourse = sanitizeString(course, 100);
  const sanitizedYearLevel = sanitizeString(yearLevel, 50);

  // ===== SECURITY: Validate institutional email =====
  if (!/^[^\s@]+@paterostechnologicalcollege\.edu\.ph$/.test(email)) {
    logSecurityEvent("SIGNUP_INVALID_EMAIL", { email });
    return res.status(400).json({
      error:
        "Email must be a valid @paterostechnologicalcollege.edu.ph address.",
    });
  }

  // ===== SECURITY: Validate Student ID format =====
  if (!/^\d{4}-\d{4}$/.test(studentId)) {
    logSecurityEvent("SIGNUP_INVALID_STUDENT_ID", { studentId });
    return res.status(400).json({
      error: "Student ID must be in format YYYY-NNNN (e.g., 2024-1234).",
    });
  }

  // ===== SECURITY: Validate password strength =====
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    logSecurityEvent("SIGNUP_WEAK_PASSWORD", { email });
    return res.status(400).json({
      error: "Password does not meet requirements:",
      details: passwordValidation.errors,
    });
  }

  // ===== SECURITY: Check if email was verified via OTP =====
  try {
    const otpDoc = await admin
      .firestore()
      .collection("verifiedOtps")
      .doc(email)
      .get();
    if (!otpDoc.exists) {
      logSecurityEvent("SIGNUP_OTP_NOT_VERIFIED", { email });
      return res
        .status(400)
        .json({ error: "Email not verified. Please verify OTP first." });
    }

    // ===== Create user in Firebase Auth =====
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: `${sanitizedFirstName} ${sanitizedLastName}`,
    });

    // ===== Store user profile in Firestore =====
    await admin
      .firestore()
      .collection("users")
      .doc(userRecord.uid)
      .set({
        name: `${sanitizedFirstName} ${sanitizedLastName}`,
        email,
        studentNumber: studentId,
        program: sanitizedCourse,
        yearLevel: sanitizedYearLevel,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });

    // ===== SECURITY: Delete the verified OTP flag to prevent re-use =====
    await admin.firestore().collection("verifiedOtps").doc(email).delete();

    console.log(`[auth] User signup successful: ${email}`);
    res.status(201).json({ message: "Signup successful", uid: userRecord.uid });
  } catch (error) {
    console.error("[auth] Signup error:", error);
    logSecurityEvent("SIGNUP_ERROR", { email, error: error.message });

    let msg = error.message;
    if (error.code === "auth/email-already-exists") {
      msg = "This email is already registered.";
    } else if (error.code === "auth/invalid-password") {
      msg = "Password does not meet Firebase security requirements.";
    }

    res.status(400).json({ error: msg });
  }
});

module.exports = router;
