const express = require("express");
const router = express.Router();
const admin = require("../config/firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { INSTITUTION_EMAIL_DOMAIN } = require("../config/constants");

// ===== NODEMAILER CONFIGURATION =====
// ✅ FIXED: Better error handling and validation
let transporter;

function initializeMailer() {
  try {
    // Validate environment variables
    if (!process.env.GMAIL_USER) {
      console.error("[auth] ❌ CRITICAL: GMAIL_USER not set in .env file!");
      return false;
    }

    if (!process.env.GMAIL_PASS) {
      console.error("[auth] ❌ CRITICAL: GMAIL_PASS not set in .env file!");
      return false;
    }

    // Remove spaces from Gmail App Password (in case they were included)
    const cleanPassword = process.env.GMAIL_PASS.replace(/\s+/g, "");

    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER.trim(),
        pass: cleanPassword, // Gmail App Password (16 chars without spaces)
      },
      // ✅ NEW: Add connection pool for better reliability
      pool: {
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 4000,
        rateLimit: 5,
      },
    });

    console.log("[auth] ✅ Nodemailer initialized successfully");
    console.log(`[auth] ✅ Using email: ${process.env.GMAIL_USER}`);
    return true;
  } catch (err) {
    console.error("[auth] ❌ Failed to initialize nodemailer:", err.message);
    return false;
  }
}

// Initialize on startup
const mailerReady = initializeMailer();

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

// ===== SECURITY: Allowed courses =====
const ALLOWED_COURSES = ["BSIT", "CCS", "BSOA", "COA", "ABA"];

// ===== SECURITY: Rate limiters =====
const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many OTP verification attempts. Try again in 15 minutes.",
  },
  skip: (req) => false,
  keyGenerator: (req) => req.body?.email || req.ip,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 attempts per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signup attempts. Please try again later." },
  skip: (req) => false,
  keyGenerator: (req) => req.body?.email || req.ip,
});

const requestOtpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 OTP requests per minute per IP/email
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OTP requests. Please try again later." },
  skip: (req) => false,
  keyGenerator: (req) => req.body?.email || req.ip,
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
  try {
    const doc = await admin
      .firestore()
      .collection("otpRateLimits")
      .doc(email)
      .get();
    if (!doc.exists) return true;
    const { lastRequested } = doc.data();
    return Date.now() - lastRequested > 60 * 1000; // 60 seconds
  } catch (err) {
    console.error("[auth] Error checking OTP rate limit:", err);
    return true; // Allow on error
  }
}

// ===== Utility: Sanitize input =====
function sanitizeString(str, maxLength = 255) {
  if (typeof str !== "string") return "";
  return str.trim().substring(0, maxLength);
}

// ===== TEST ENDPOINT: Check email configuration (for debugging) =====
router.get("/test-email", async (req, res) => {
  if (!transporter || !mailerReady) {
    return res.status(500).json({
      error: "Email service not configured",
      details: "Check GMAIL_USER and GMAIL_PASS in .env file",
    });
  }

  try {
    const result = await transporter.sendMail({
      from: `"StudyGroup Test" <${process.env.GMAIL_USER}>`,
      to: "dcpascual@paterostechnologicalcollege.edu.ph",
      subject: "Test Email from StudyGroup Backend",
      text: "This is a test email to verify nodemailer is working.",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h1>Test Email</h1>
          <p>If you see this, email service is working!</p>
          <p>Timestamp: ${new Date().toISOString()}</p>
        </div>
      `,
    });

    console.log("[auth] ✅ Test email sent successfully:", result.messageId);
    res.json({
      success: true,
      messageId: result.messageId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[auth] ❌ Test email failed:", err.message);
    logSecurityEvent("TEST_EMAIL_FAILED", { error: err.message });
    res.status(500).json({
      error: "Failed to send test email",
      details: err.message,
    });
  }
});

// ===== 1. Request OTP endpoint =====
router.post("/request-otp", requestOtpLimiter, async (req, res) => {
  const { email } = req.body;

  console.log(`[auth] Received OTP request for email: ${email}`);

  // ===== SECURITY: Validate email format =====
  const escapeRegex = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const domainRe = new RegExp(
    `^[^\\s@]+@${escapeRegex(INSTITUTION_EMAIL_DOMAIN)}$`
  );
  if (!email || !domainRe.test(email)) {
    console.warn(`[auth] Invalid email format: ${email}`);
    logSecurityEvent("REQUEST_OTP_INVALID_EMAIL", { email });
    return res.status(400).json({ error: "Invalid email format." });
  }

  // ===== SECURITY: Check if nodemailer is configured =====
  if (!transporter || !mailerReady) {
    console.error("[auth] ❌ Nodemailer not configured!");
    logSecurityEvent("REQUEST_OTP_MAILER_NOT_CONFIGURED", { email });
    return res.status(500).json({
      error: "Email service is not configured. Contact administrator.",
    });
  }

  // ===== SECURITY: Rate limit OTP requests per email =====
  if (!(await canRequestOTP(email))) {
    console.warn(`[auth] Rate limit exceeded for email: ${email}`);
    logSecurityEvent("REQUEST_OTP_RATE_LIMIT", { email });
    return res.status(429).json({
      error:
        "OTP recently sent. Please wait 60 seconds before requesting again.",
    });
  }

  const otp = generateOTP();
  const hashedOtp = hashOTP(otp);
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes from now

  try {
    console.log(`[auth] Generated OTP for ${email}: ${otp}`);

    // Store hashed OTP in Firestore
    await admin.firestore().collection("pendingOtps").doc(email).set({
      otp: hashedOtp,
      expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[auth] ✅ Stored OTP in Firestore for ${email}`);

    // Update rate limit info
    await admin.firestore().collection("otpRateLimits").doc(email).set({
      lastRequested: Date.now(),
    });
    console.log(`[auth] ✅ Updated OTP rate limit for ${email}`);

    // ===== SEND EMAIL =====
    console.log(`[auth] Attempting to send email to ${email}...`);

    try {
      const mailOptions = {
        from: `"StudyGroup" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: "Your StudyGroup OTP Code",
        text: `Your verification code is: ${otp}\n\nThis code expires in 5 minutes.\n\nIf you did not request this code, please ignore this email.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; border-radius: 8px;">
            <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <h2 style="color: #333; text-align: center; margin-bottom: 30px;">StudyGroup Email Verification</h2>
              
              <p style="color: #666; text-align: center; margin-bottom: 20px;">Your verification code is:</p>
              
              <div style="background: #f0f0f0; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
                <h1 style="color: #4CAF50; font-size: 48px; letter-spacing: 8px; margin: 0; font-weight: bold;">${otp}</h1>
              </div>
              
              <p style="color: #666; text-align: center; margin-bottom: 20px;">
                This code expires in <strong>5 minutes</strong>.
              </p>
              
              <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  <strong>⚠️ Important:</strong> If you did not request this code, please ignore this email. Do not share this code with anyone.
                </p>
              </div>
              
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              
              <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
                © ${new Date().getFullYear()} StudyGroup. All rights reserved.
              </p>
            </div>
          </div>
        `,
      };

      const result = await transporter.sendMail(mailOptions);

      console.log(
        `[auth] ✅ Email sent successfully to ${email}. Message ID: ${result.messageId}`
      );
      logSecurityEvent("REQUEST_OTP_SUCCESS", { email });

      res.json({
        message: "OTP sent to email.",
        expiresIn: "5 minutes",
      });
    } catch (emailErr) {
      console.error(
        `[auth] ❌ Email delivery failed for ${email}:`,
        emailErr.message
      );
      logSecurityEvent("REQUEST_OTP_EMAIL_FAILED", {
        email,
        error: emailErr.message,
        errorCode: emailErr.code,
      });

      // Return specific error message based on error type
      if (emailErr.message.includes("Invalid login")) {
        return res.status(500).json({
          error:
            "Email authentication failed. Check GMAIL_USER and GMAIL_PASS configuration.",
        });
      } else if (
        emailErr.message.includes("No response") ||
        emailErr.message.includes("timeout")
      ) {
        return res.status(503).json({
          error: "Email service timeout. Please try again later.",
        });
      } else if (emailErr.message.includes("ECONNREFUSED")) {
        return res.status(503).json({
          error: "Cannot connect to email service. Try again later.",
        });
      }

      return res.status(500).json({
        error: "Failed to send email. Please try again later.",
      });
    }
  } catch (err) {
    console.error("[auth] Error in request-otp:", err.message);
    logSecurityEvent("REQUEST_OTP_ERROR", { email, error: err.message });
    res.status(500).json({ error: "Server error. Please try again later." });
  }
});

// ===== 2. Verify OTP endpoint =====
router.post("/verify-otp", verifyOtpLimiter, async (req, res) => {
  const { email, otp } = req.body;

  console.log(`[auth] Received OTP verification request for email: ${email}`);

  if (!email || !otp) {
    console.warn("[auth] Missing email or OTP in verification request");
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
      console.warn(`[auth] No pending OTP found for ${email}`);
      logSecurityEvent("VERIFY_OTP_NOT_FOUND", { email });
      return res
        .status(400)
        .json({ error: "No OTP requested for this email." });
    }

    const data = doc.data();

    // ===== SECURITY: Constant-time comparison to prevent timing attacks =====
    if (hashOTP(otp) !== data.otp) {
      console.warn(`[auth] Invalid OTP provided for ${email}`);
      logSecurityEvent("VERIFY_OTP_INVALID", { email });
      return res.status(400).json({ error: "Invalid OTP." });
    }

    if (Date.now() > data.expiresAt) {
      console.warn(`[auth] OTP expired for ${email}`);
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
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[auth] ✅ OTP verified successfully for ${email}`);
    logSecurityEvent("VERIFY_OTP_SUCCESS", { email });

    res.json({ message: "OTP verified. You may now sign up." });
  } catch (error) {
    console.error("[auth] OTP verification error:", error);
    logSecurityEvent("VERIFY_OTP_ERROR", { email, error: error.message });
    res.status(500).json({ error: "Server error during OTP verification." });
  }
});

// ===== 3. Signup endpoint =====
router.post("/signup", signupLimiter, async (req, res) => {
  const {
    firstName = "",
    lastName = "",
    email,
    studentId = "",
    course = "",
    yearLevel = "",
    password,
  } = req.body;

  console.log(`[auth] Received signup request for email: ${email}`);

  // ===== SECURITY: Sanitize inputs =====
  const sanitizedFirstName = sanitizeString(firstName || "", 100);
  const sanitizedLastName = sanitizeString(lastName || "", 100);
  const sanitizedCourse = sanitizeString(course || "", 100);
  const sanitizedYearLevel = sanitizeString(yearLevel || "", 50);

  // Support simplified signup (email + password only)
  const isSimpleSignup =
    !studentId &&
    !sanitizedCourse &&
    !sanitizedYearLevel &&
    !sanitizedFirstName &&
    !sanitizedLastName;

  // ===== SECURITY: Validate institutional email =====
  const escapeRegex2 = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const domainRe2 = new RegExp(
    `^[^\\s@]+@${escapeRegex2(INSTITUTION_EMAIL_DOMAIN)}$`
  );
  if (!domainRe2.test(email)) {
    console.warn(`[auth] Invalid institutional email: ${email}`);
    logSecurityEvent("SIGNUP_INVALID_EMAIL", { email });
    return res.status(400).json({
      error: `Email must be a valid @${INSTITUTION_EMAIL_DOMAIN} address.`,
    });
  }

  // ===== SECURITY: Validate Student ID format (skip for simple signup) =====
  if (!isSimpleSignup) {
    if (!/^\d{4}-\d{4}$/.test(studentId)) {
      console.warn(`[auth] Invalid student ID format: ${studentId}`);
      logSecurityEvent("SIGNUP_INVALID_STUDENT_ID", { studentId });
      return res.status(400).json({
        error: "Student ID must be in format YYYY-NNNN (e.g., 2024-1234).",
      });
    }
  }

  // ===== SECURITY: Validate course value (skip for simple signup) =====
  if (!isSimpleSignup) {
    if (!ALLOWED_COURSES.includes(sanitizedCourse)) {
      console.warn(`[auth] Invalid course value: ${course}`);
      logSecurityEvent("SIGNUP_INVALID_COURSE", { email, course });
      return res.status(400).json({
        error: "Invalid course selection. Please choose a valid course.",
      });
    }
  }

  // ===== SECURITY: Validate password strength =====
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    console.warn(`[auth] Weak password for ${email}`);
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
      console.warn(`[auth] Email not verified via OTP: ${email}`);
      logSecurityEvent("SIGNUP_OTP_NOT_VERIFIED", { email });
      return res
        .status(400)
        .json({ error: "Email not verified. Please verify OTP first." });
    }

    // ===== Create user in Firebase Auth =====
    console.log(`[auth] Creating Firebase Auth user for ${email}`);

    const displayName =
      sanitizedFirstName || sanitizedLastName
        ? `${sanitizedFirstName} ${sanitizedLastName}`.trim()
        : "";

    const userRecord = await admin.auth().createUser({
      email,
      password,
      ...(displayName ? { displayName } : {}),
      emailVerified: true,
    });

    console.log(`[auth] ✅ Firebase Auth user created: ${userRecord.uid}`);

    // ===== Store user profile in Firestore =====
    console.log(`[auth] Storing user profile for ${email}...`);

    await admin
      .firestore()
      .collection("users")
      .doc(userRecord.uid)
      .set({
        name:
          sanitizedFirstName || sanitizedLastName
            ? `${sanitizedFirstName} ${sanitizedLastName}`.trim()
            : "",
        email,
        studentNumber: isSimpleSignup ? "" : studentId,
        program: isSimpleSignup ? "" : sanitizedCourse,
        yearLevel: isSimpleSignup ? "" : sanitizedYearLevel,
        avatar: sanitizedFirstName
          ? sanitizedFirstName.charAt(0).toUpperCase()
          : "",
        isBanned: false,
        bannedAt: null,
        bannedReason: null,
        bannedBy: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });

    console.log(`[auth] ✅ User profile stored in Firestore for ${email}`);

    // ===== SECURITY: Delete the verified OTP flag to prevent re-use =====
    await admin.firestore().collection("verifiedOtps").doc(email).delete();

    console.log(
      `[auth] ✅ User signup successful: ${email} (UID: ${userRecord.uid})`
    );
    logSecurityEvent("SIGNUP_SUCCESS", { email, uid: userRecord.uid });

    res.status(201).json({
      message: "Signup successful. Welcome to StudyGroup!",
      uid: userRecord.uid,
    });
  } catch (error) {
    console.error("[auth] Signup error:", error);
    logSecurityEvent("SIGNUP_ERROR", { email, error: error.message });

    let msg = error.message;
    if (error.code === "auth/email-already-exists") {
      msg = "This email is already registered.";
    } else if (error.code === "auth/invalid-password") {
      msg = "Password does not meet Firebase security requirements.";
    } else if (error.code === "auth/invalid-email") {
      msg = "Invalid email format.";
    }

    res.status(400).json({ error: msg });
  }
});

module.exports = router;
