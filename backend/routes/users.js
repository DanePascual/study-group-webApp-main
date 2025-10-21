const express = require("express");
const router = express.Router();
const admin = require("../config/firebase-admin");
const supabase = require("../config/supabase");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

// GET current user's profile (protected)
router.get("/profile", firebaseAuthMiddleware, async (req, res) => {
  const uid = req.user.uid; // Provided by the auth middleware

  try {
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    const data = userDoc.data();
    // Only return fields that exist in auth.js/signup
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
    res.status(500).json({ error: error.message });
  }
});

// UPDATE current user's profile (protected)
router.put("/profile", firebaseAuthMiddleware, async (req, res) => {
  const uid = req.user.uid; // Provided by the auth middleware
  // Only allow updating fields from signup (plus photoFilename)
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

  // Only update allowed fields
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
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

    // If a new photoFilename is provided and it differs from the old one, attempt to delete the old file from Supabase
    if (
      updates.photoFilename &&
      oldFilename &&
      updates.photoFilename !== oldFilename
    ) {
      try {
        // Try deleting from the 'profiles' bucket first (you created this bucket)
        const { error: delError1 } = await supabase.storage
          .from("profiles")
          .remove([oldFilename]);
        if (delError1) {
          // If removal failed (perhaps the file is stored in a different bucket like 'resources'), try 'resources' as fallback
          console.warn(
            "Could not remove old file from 'profiles' bucket:",
            delError1
          );
          const { error: delError2 } = await supabase.storage
            .from("resources")
            .remove([oldFilename]);
          if (delError2) {
            console.warn(
              "Could not remove old file from 'resources' bucket:",
              delError2
            );
            // Do not fail the whole update; log and continue
          } else {
            console.log(
              "Removed old profile file from 'resources' bucket:",
              oldFilename
            );
          }
        } else {
          console.log(
            "Removed old profile file from 'profiles' bucket:",
            oldFilename
          );
        }
      } catch (e) {
        console.warn(
          "Error deleting old profile file from Supabase (continuing):",
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
    console.error("Error in PUT /api/users/profile:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET user profile by UID (protected)
router.get("/:uid", firebaseAuthMiddleware, async (req, res) => {
  const { uid } = req.params;

  // Security: Only allow users to access their own profile
  if (req.user.uid !== uid) {
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
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
