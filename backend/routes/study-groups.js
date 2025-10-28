const express = require("express");
const router = express.Router();
const admin = require("../config/firebase-admin");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");
const rateLimit = require("express-rate-limit");

// ===== SECURITY: Rate limiters =====
const createRoomLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Max 20 rooms per hour per user
  keyGenerator: (req) => req.user?.uid || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many rooms created. Please try again later (max 20 per hour).",
  },
  skip: (req) => !req.user,
});

const updateRoomLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 updates per minute per user
  keyGenerator: (req) => req.user?.uid || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many updates. Please try again later.",
  },
  skip: (req) => !req.user,
});

// ===== SECURITY: Constants =====
const MAX_ROOM_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SUBJECT_LENGTH = 50;
const MAX_TAG_LENGTH = 30;
const MAX_TAGS = 3;
const VALID_SUBJECTS = [
  "programming",
  "web",
  "database",
  "networking",
  "security",
  "ai",
  "other",
];
const VALID_PRIVACY = ["public", "private"];

// ===== SECURITY: Sanitization helpers =====
function sanitizeString(str, maxLength = 255) {
  if (typeof str !== "string") return "";
  return str.trim().substring(0, maxLength);
}

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function logSecurityEvent(eventType, uid, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY] ${timestamp} | Event: ${eventType} | User: ${uid} | Details:`,
    details
  );
}

// ===== SECURITY: Input validation =====
function validateRoomInput(data) {
  const errors = [];

  // Validate name
  if (!data.name || typeof data.name !== "string") {
    errors.push("Room name is required");
  } else {
    const name = data.name.trim();
    if (name.length === 0) {
      errors.push("Room name cannot be empty");
    } else if (name.length > MAX_ROOM_NAME_LENGTH) {
      errors.push(
        `Room name must be ${MAX_ROOM_NAME_LENGTH} characters or less`
      );
    }
  }

  // Validate description (optional but if provided, validate)
  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== "string") {
      errors.push("Description must be a string");
    } else if (data.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`
      );
    }
  }

  // Validate subject
  if (!data.subject || !VALID_SUBJECTS.includes(data.subject)) {
    errors.push(`Subject must be one of: ${VALID_SUBJECTS.join(", ")}`);
  }

  // Validate tags (optional but if provided, validate)
  if (data.tags !== undefined && data.tags !== null) {
    if (!Array.isArray(data.tags)) {
      errors.push("Tags must be an array");
    } else if (data.tags.length > MAX_TAGS) {
      errors.push(`Maximum ${MAX_TAGS} tags allowed`);
    } else {
      for (const tag of data.tags) {
        if (typeof tag !== "string") {
          errors.push("Each tag must be a string");
          break;
        }
        if (tag.trim().length === 0) {
          errors.push("Tags cannot be empty");
          break;
        }
        if (tag.length > MAX_TAG_LENGTH) {
          errors.push(`Each tag must be ${MAX_TAG_LENGTH} characters or less`);
          break;
        }
      }
    }
  }

  // Validate privacy (optional but if provided, validate)
  if (
    data.privacy !== undefined &&
    data.privacy !== null &&
    !VALID_PRIVACY.includes(data.privacy)
  ) {
    errors.push(`Privacy must be one of: ${VALID_PRIVACY.join(", ")}`);
  }

  // Validate sessionDate (optional but if provided, validate format)
  if (data.sessionDate !== undefined && data.sessionDate !== null) {
    if (typeof data.sessionDate !== "string") {
      errors.push("Session date must be a string (YYYY-MM-DD format)");
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.sessionDate)) {
      errors.push("Session date must be in YYYY-MM-DD format");
    } else {
      const dateObj = new Date(data.sessionDate);
      if (isNaN(dateObj.getTime())) {
        errors.push("Session date is invalid");
      }
    }
  }

  // Validate sessionTime (optional but if provided, validate format)
  if (data.sessionTime !== undefined && data.sessionTime !== null) {
    if (typeof data.sessionTime !== "string") {
      errors.push("Session time must be a string (HH:MM format)");
    } else if (!/^\d{2}:\d{2}$/.test(data.sessionTime)) {
      errors.push("Session time must be in HH:MM format");
    }
  }

  return errors;
}

// ===== POST /api/study-groups - Create room =====
router.post(
  "/",
  firebaseAuthMiddleware,
  createRoomLimiter,
  async (req, res) => {
    try {
      const uid = req.user.uid;
      const email = req.user.email;

      // ===== SECURITY: Validate input =====
      const validationErrors = validateRoomInput(req.body);
      if (validationErrors.length > 0) {
        logSecurityEvent("CREATE_ROOM_VALIDATION_FAILED", uid, {
          errors: validationErrors,
        });
        return res.status(400).json({
          error: "Validation failed",
          details: validationErrors,
        });
      }

      // ===== SECURITY: Sanitize inputs =====
      const name = sanitizeString(req.body.name, MAX_ROOM_NAME_LENGTH);
      const description = sanitizeString(
        req.body.description || "",
        MAX_DESCRIPTION_LENGTH
      );
      const subject = sanitizeString(req.body.subject, MAX_SUBJECT_LENGTH);
      const tags = (req.body.tags || [])
        .map((tag) => sanitizeString(tag, MAX_TAG_LENGTH))
        .filter((tag) => tag.length > 0)
        .slice(0, MAX_TAGS);
      const privacy = req.body.privacy || "public";
      const sessionDate = req.body.sessionDate || null;
      const sessionTime = req.body.sessionTime || null;

      // ===== Build room object =====
      const roomId = `room_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const roomData = {
        id: roomId,
        name,
        description,
        subject,
        tags,
        privacy,
        creator: uid,
        creatorEmail: email,
        participants: [uid],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        sessionDate,
        sessionTime,
        isActive: true,
      };

      // ===== Save to Firestore =====
      const db = admin.firestore();
      await db.collection("study-groups").doc(roomId).set(roomData);

      console.log(`[study-groups] Room created: ${roomId} by ${uid}`);
      logSecurityEvent("ROOM_CREATED", uid, {
        roomId,
        name,
        privacy,
      });

      // Return sanitized response
      res.status(201).json({
        id: roomId,
        name,
        description,
        subject,
        tags,
        privacy,
        creator: uid,
        creatorEmail: email,
        participants: [uid],
        createdAt: new Date().toISOString(),
        sessionDate,
        sessionTime,
        isActive: true,
      });
    } catch (error) {
      console.error("[study-groups] Error creating room:", error);
      logSecurityEvent("ROOM_CREATION_ERROR", req.user?.uid, {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to create room" });
    }
  }
);

// ===== GET /api/study-groups - List all rooms =====
router.get("/", async (req, res) => {
  try {
    const db = admin.firestore();
    const snapshot = await db
      .collection("study-groups")
      .where("isActive", "==", true)
      .orderBy("createdAt", "desc")
      .get();

    const rooms = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        subject: data.subject,
        tags: data.tags || [],
        creator: data.creator,
        creatorEmail: data.creatorEmail,
        privacy: data.privacy || "public",
        participants: data.participants || [],
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : "",
        sessionDate: data.sessionDate || null,
        sessionTime: data.sessionTime || null,
        isActive: data.isActive || true,
      };
    });

    res.json(rooms);
  } catch (error) {
    console.error("[study-groups] Error listing rooms:", error);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// ===== GET /api/study-groups/:id - Get single room =====
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = admin.firestore();
    const doc = await db.collection("study-groups").doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Room not found" });
    }

    const data = doc.data();
    res.json({
      id: data.id,
      name: data.name,
      description: data.description,
      subject: data.subject,
      tags: data.tags || [],
      creator: data.creator,
      creatorEmail: data.creatorEmail,
      privacy: data.privacy || "public",
      participants: data.participants || [],
      createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : "",
      sessionDate: data.sessionDate || null,
      sessionTime: data.sessionTime || null,
      isActive: data.isActive || true,
    });
  } catch (error) {
    console.error("[study-groups] Error fetching room:", error);
    res.status(500).json({ error: "Failed to fetch room" });
  }
});

// ===== PUT /api/study-groups/:id - Update room (owner only) =====
router.put(
  "/:id",
  firebaseAuthMiddleware,
  updateRoomLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;
      const uid = req.user.uid;
      const db = admin.firestore();
      const doc = await db.collection("study-groups").doc(id).get();

      if (!doc.exists) {
        logSecurityEvent("UPDATE_ROOM_NOT_FOUND", uid, { roomId: id });
        return res.status(404).json({ error: "Room not found" });
      }

      const roomData = doc.data();

      // ===== SECURITY: Only room creator can update =====
      if (roomData.creator !== uid && req.user.admin !== true) {
        logSecurityEvent("UNAUTHORIZED_ROOM_UPDATE", uid, {
          roomId: id,
          creator: roomData.creator,
        });
        return res
          .status(403)
          .json({ error: "Forbidden: Only creator can update room" });
      }

      // ===== SECURITY: Validate update input =====
      const validationErrors = validateRoomInput(req.body);
      if (validationErrors.length > 0) {
        logSecurityEvent("UPDATE_ROOM_VALIDATION_FAILED", uid, {
          roomId: id,
          errors: validationErrors,
        });
        return res.status(400).json({
          error: "Validation failed",
          details: validationErrors,
        });
      }

      // ===== SECURITY: Sanitize inputs =====
      const updates = {};
      if (req.body.name) {
        updates.name = sanitizeString(req.body.name, MAX_ROOM_NAME_LENGTH);
      }
      if (req.body.description !== undefined) {
        updates.description = sanitizeString(
          req.body.description,
          MAX_DESCRIPTION_LENGTH
        );
      }
      if (req.body.subject) {
        updates.subject = sanitizeString(req.body.subject, MAX_SUBJECT_LENGTH);
      }
      if (req.body.tags) {
        updates.tags = req.body.tags
          .map((tag) => sanitizeString(tag, MAX_TAG_LENGTH))
          .filter((tag) => tag.length > 0)
          .slice(0, MAX_TAGS);
      }
      if (req.body.privacy) {
        updates.privacy = req.body.privacy;
      }
      if (req.body.sessionDate !== undefined) {
        updates.sessionDate = req.body.sessionDate;
      }
      if (req.body.sessionTime !== undefined) {
        updates.sessionTime = req.body.sessionTime;
      }

      updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection("study-groups").doc(id).update(updates);

      console.log(`[study-groups] Room updated: ${id} by ${uid}`);
      logSecurityEvent("ROOM_UPDATED", uid, { roomId: id });

      // Fetch and return updated room
      const updatedDoc = await db.collection("study-groups").doc(id).get();
      const updatedData = updatedDoc.data();

      res.json({
        id: updatedData.id,
        name: updatedData.name,
        description: updatedData.description,
        subject: updatedData.subject,
        tags: updatedData.tags || [],
        creator: updatedData.creator,
        creatorEmail: updatedData.creatorEmail,
        privacy: updatedData.privacy || "public",
        participants: updatedData.participants || [],
        createdAt: updatedData.createdAt
          ? updatedData.createdAt.toDate().toISOString()
          : "",
        sessionDate: updatedData.sessionDate || null,
        sessionTime: updatedData.sessionTime || null,
        isActive: updatedData.isActive || true,
      });
    } catch (error) {
      console.error("[study-groups] Error updating room:", error);
      logSecurityEvent("ROOM_UPDATE_ERROR", req.user?.uid, {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to update room" });
    }
  }
);

// ===== DELETE /api/study-groups/:id - Delete room (owner only) =====
router.delete("/:id", firebaseAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;
    const db = admin.firestore();
    const doc = await db.collection("study-groups").doc(id).get();

    if (!doc.exists) {
      logSecurityEvent("DELETE_ROOM_NOT_FOUND", uid, { roomId: id });
      return res.status(404).json({ error: "Room not found" });
    }

    const roomData = doc.data();

    // ===== SECURITY: Only room creator can delete =====
    if (roomData.creator !== uid && req.user.admin !== true) {
      logSecurityEvent("UNAUTHORIZED_ROOM_DELETE", uid, {
        roomId: id,
        creator: roomData.creator,
      });
      return res
        .status(403)
        .json({ error: "Forbidden: Only creator can delete room" });
    }

    await db.collection("study-groups").doc(id).delete();

    console.log(`[study-groups] Room deleted: ${id} by ${uid}`);
    logSecurityEvent("ROOM_DELETED", uid, { roomId: id });

    res.json({ success: true, message: "Room deleted successfully" });
  } catch (error) {
    console.error("[study-groups] Error deleting room:", error);
    logSecurityEvent("ROOM_DELETE_ERROR", req.user?.uid, {
      error: error.message,
    });
    res.status(500).json({ error: "Failed to delete room" });
  }
});

// ===== POST /api/study-groups/:id/join - Join room =====
router.post("/:id/join", firebaseAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;
    const db = admin.firestore();
    const doc = await db.collection("study-groups").doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Room not found" });
    }

    const roomData = doc.data();
    const participants = roomData.participants || [];

    // ===== SECURITY: Check privacy =====
    if (roomData.privacy === "private" && roomData.creator !== uid) {
      logSecurityEvent("JOIN_PRIVATE_ROOM_DENIED", uid, {
        roomId: id,
      });
      return res
        .status(403)
        .json({ error: "This is a private room. Invitation required." });
    }

    // Check if already member
    if (participants.includes(uid)) {
      return res.status(400).json({ error: "Already a member of this room" });
    }

    // Add to participants
    participants.push(uid);
    await db.collection("study-groups").doc(id).update({
      participants,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[study-groups] User ${uid} joined room ${id}`);
    logSecurityEvent("ROOM_JOINED", uid, { roomId: id });

    res.json({ success: true, message: "Joined room successfully" });
  } catch (error) {
    console.error("[study-groups] Error joining room:", error);
    logSecurityEvent("ROOM_JOIN_ERROR", req.user?.uid, {
      error: error.message,
    });
    res.status(500).json({ error: "Failed to join room" });
  }
});

module.exports = router;
