const express = require("express");
const router = express.Router();
const admin = require("../config/firebase-admin");
const supabase = require("../config/supabase");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

// ===== SECURITY: Constants =====
const ALLOWED_COLLEGE_DOMAIN = "@paterostechnologicalcollege.edu.ph";
const MAX_NAME_LENGTH = 255;
const MAX_BIO_LENGTH = 2000;
const MAX_STUDENT_NUMBER_LENGTH = 50;
const MAX_PROGRAM_LENGTH = 100;
const MAX_INSTITUTION_LENGTH = 255;
const MAX_YEAR_LEVEL_LENGTH = 50;
const MAX_SPECIALIZATION_LENGTH = 100;
const MAX_GRADUATION_LENGTH = 50;

// ===== SECURITY: Sanitization helpers =====
function sanitizeString(str, maxLength = 255) {
  if (typeof str !== "string") return "";
  return str.trim().substring(0, maxLength);
}

function validateCollegeEmail(email) {
  if (typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  return trimmed.endsWith(ALLOWED_COLLEGE_DOMAIN);
}

function logSecurityEvent(eventType, uid, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY] ${timestamp} | Event: ${eventType} | User: ${uid} | Details:`,
    details
  );
}

// ===== GET all users list (PUBLIC - for report form suggestions) =====
// ✅ NEW ENDPOINT: No auth required, returns basic user info
router.get("/list", async (req, res) => {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection("users").select("email", "name").get();

    const users = snapshot.docs.map((doc) => ({
      email: doc.data().email || "",
      name: doc.data().name || "",
    }));

    console.log(`[users] GET /list returned ${users.length} users`);
    return res.json(users);
  } catch (err) {
    console.error("[users] GET /list error:", err);
    return res.status(500).json({ error: "Could not fetch users list" });
  }
});

// ===== GET current user's profile (protected) =====
router.get("/profile", firebaseAuthMiddleware, async (req, res) => {
  const uid = req.user.uid;

  try {
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    const data = userDoc.data();

    // Return sanitized profile data (email is NEVER editable, so it's safe to return)
    res.json({
      name: data.name || "",
      email: data.email || "", // ← Read-only from backend
      studentNumber: data.studentNumber || "",
      program: data.program || "",
      yearLevel: data.yearLevel || "",
      institution: data.institution || "",
      specialization: data.specialization || "",
      graduation: data.graduation || "",
      bio: data.bio || "",
      photo: data.photo || "",
      photoFilename: data.photoFilename || "",
      createdAt: data.createdAt || "",
      lastUpdated: data.lastUpdated || "",
    });
  } catch (error) {
    console.error("[users] GET /profile error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== UPDATE current user's profile (protected) =====
router.put("/profile", firebaseAuthMiddleware, async (req, res) => {
  const uid = req.user.uid;
  const firebaseEmail = req.user.email; // From Firebase auth

  // ===== SECURITY: Email is NOT in allowedFields - it's LOCKED =====
  const allowedFields = [
    "name",
    "studentNumber",
    "program",
    "yearLevel",
    "institution",
    "specialization",
    "graduation",
    "bio",
    "photo",
    "photoFilename",
  ];

  // Validate that email is NOT being updated
  if (req.body.email !== undefined) {
    logSecurityEvent("UPDATE_EMAIL_ATTEMPTED", uid, {
      attemptedEmail: req.body.email,
      reason: "Email is read-only",
    });
    return res.status(400).json({
      error:
        "Email cannot be changed. Contact support if you need to update your email.",
    });
  }

  // Build updates with validation & sanitization
  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      let value = req.body[field];

      // ===== SECURITY: Sanitize and validate each field =====
      if (field === "name") {
        value = sanitizeString(value, MAX_NAME_LENGTH);
        if (!value) {
          logSecurityEvent("UPDATE_NAME_EMPTY", uid, {});
          return res.status(400).json({ error: "Name cannot be empty" });
        }
      } else if (field === "bio") {
        value = sanitizeString(value, MAX_BIO_LENGTH);
      } else if (field === "studentNumber") {
        value = sanitizeString(value, MAX_STUDENT_NUMBER_LENGTH);
      } else if (field === "program") {
        value = sanitizeString(value, MAX_PROGRAM_LENGTH);
      } else if (field === "institution") {
        value = sanitizeString(value, MAX_INSTITUTION_LENGTH);
      } else if (field === "yearLevel") {
        value = sanitizeString(value, MAX_YEAR_LEVEL_LENGTH);
      } else if (field === "specialization") {
        value = sanitizeString(value, MAX_SPECIALIZATION_LENGTH);
      } else if (field === "graduation") {
        value = sanitizeString(value, MAX_GRADUATION_LENGTH);
      }

      updates[field] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No valid profile fields provided." });
  }

  try {
    const userRef = admin.firestore().collection("users").doc(uid);

    // Read existing doc to find previous photoFilename (if any)
    const existingDoc = await userRef.get();
    const existingData = existingDoc.exists ? existingDoc.data() : null;
    const oldFilename =
      existingData && existingData.photoFilename
        ? existingData.photoFilename
        : null;

    // If a new photoFilename is provided and it differs from the old one, delete the old file
    if (
      updates.photoFilename &&
      oldFilename &&
      updates.photoFilename !== oldFilename
    ) {
      try {
        const { error: delError1 } = await supabase.storage
          .from("profiles")
          .remove([oldFilename]);
        if (delError1) {
          console.warn(
            "[users] Could not remove old file from 'profiles' bucket:",
            delError1
          );
          const { error: delError2 } = await supabase.storage
            .from("resources")
            .remove([oldFilename]);
          if (delError2) {
            console.warn(
              "[users] Could not remove old file from 'resources' bucket:",
              delError2
            );
          } else {
            console.log(
              "[users] Removed old profile file from 'resources' bucket:",
              oldFilename
            );
          }
        } else {
          console.log(
            "[users] Removed old profile file from 'profiles' bucket:",
            oldFilename
          );
        }
      } catch (e) {
        console.warn(
          "[users] Error deleting old profile file (continuing):",
          e
        );
      }
    }

    // Set server-side lastUpdated timestamp
    updates.lastUpdated = admin.firestore.FieldValue.serverTimestamp();

    // Update (or create) the user document in Firestore
    await userRef.set(updates, { merge: true });

    // Get the updated document to return to the client
    const userDoc = await userRef.get();
    const data = userDoc.data() || {};

    console.log(`[users] Profile updated for user=${uid}`);

    res.json({
      name: data.name || "",
      email: data.email || "", // ← Never changes
      studentNumber: data.studentNumber || "",
      program: data.program || "",
      yearLevel: data.yearLevel || "",
      institution: data.institution || "",
      specialization: data.specialization || "",
      graduation: data.graduation || "",
      bio: data.bio || "",
      photo: data.photo || "",
      photoFilename: data.photoFilename || "",
      createdAt: data.createdAt || "",
      lastUpdated: data.lastUpdated || "",
    });
  } catch (error) {
    console.error("[users] PUT /profile error:", error);
    logSecurityEvent("UPDATE_PROFILE_ERROR", uid, {
      error: error.message,
    });
    res.status(500).json({ error: error.message });
  }
});

// ===== GET user profile by UID (protected) =====
router.get("/:uid", firebaseAuthMiddleware, async (req, res) => {
  const { uid } = req.params;

  // Security: Only allow users to access their own profile
  if (req.user.uid !== uid) {
    logSecurityEvent("UNAUTHORIZED_PROFILE_ACCESS", req.user.uid, {
      targetUid: uid,
      reason: "UID mismatch",
    });
    return res.status(403).json({ error: "Forbidden: UID mismatch" });
  }

  try {
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    const data = userDoc.data();
    res.json({
      name: data.name || "",
      email: data.email || "",
      studentNumber: data.studentNumber || "",
      program: data.program || "",
      yearLevel: data.yearLevel || "",
      institution: data.institution || "",
      specialization: data.specialization || "",
      graduation: data.graduation || "",
      bio: data.bio || "",
      photo: data.photo || "",
      photoFilename: data.photoFilename || "",
      createdAt: data.createdAt || "",
      lastUpdated: data.lastUpdated || "",
    });
  } catch (error) {
    console.error("[users] GET /:uid error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
