const express = require("express");
const router = express.Router();
const admin = require("../config/firebase-admin");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");

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

const joinRoomLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Max 20 join attempts per minute per user
  keyGenerator: (req) => req.user?.uid || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many join attempts. Please try again later.",
  },
  skip: (req) => !req.user,
});

// ===== SECURITY: Constants =====
const MAX_ROOM_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_PARTICIPANTS = 100;
const MAX_PASSWORD_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;
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

  // Validate privacy (optional but if provided, validate)
  if (
    data.privacy !== undefined &&
    data.privacy !== null &&
    !VALID_PRIVACY.includes(data.privacy)
  ) {
    errors.push(`Privacy must be one of: ${VALID_PRIVACY.join(", ")}`);
  }

  return errors;
}

// ===== HELPER: Check if room is active =====
function checkRoomActive(roomData, action = "perform this action") {
  if (!roomData.isActive) {
    return {
      isActive: false,
      error: `This room has been deactivated by an admin. You cannot ${action}.`,
    };
  }
  return { isActive: true };
}

// ===== HELPER: Format room response =====
function formatRoomResponse(data) {
  // Handle createdAt - could be FieldValue.serverTimestamp() or actual Timestamp
  let createdAtStr = "";
  if (data.createdAt) {
    if (typeof data.createdAt.toDate === "function") {
      // It's a Firestore Timestamp
      try {
        createdAtStr = data.createdAt.toDate().toISOString();
      } catch (err) {
        console.error("Error converting Firestore Timestamp:", err);
        createdAtStr = new Date().toISOString();
      }
    } else if (typeof data.createdAt === "string") {
      // It's already an ISO string
      createdAtStr = data.createdAt;
    } else if (data.createdAt instanceof Date) {
      // It's a JavaScript Date
      createdAtStr = data.createdAt.toISOString();
    }
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    privacy: data.privacy || "public",
    creator: data.creator,
    creatorEmail: data.creatorEmail,
    participants: data.participants || [],
    participantCount: (data.participants || []).length,
    createdAt: createdAtStr,
    isActive: data.isActive !== false,
    hasPassword: !!data.passwordHash,
    isPrivate: (data.privacy || "public") === "private",
  };
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
      const privacy = req.body.privacy || "public";

      // ===== SECURITY: Handle password for private rooms =====
      let passwordHash = null;
      if (privacy === "private" && req.body.password) {
        const password = sanitizeString(req.body.password, MAX_PASSWORD_LENGTH);

        if (password.length < MIN_PASSWORD_LENGTH) {
          return res.status(400).json({
            error: `Password for private room must be at least ${MIN_PASSWORD_LENGTH} characters`,
          });
        }

        if (password.length > MAX_PASSWORD_LENGTH) {
          return res.status(400).json({
            error: `Password must be ${MAX_PASSWORD_LENGTH} characters or less`,
          });
        }

        try {
          const rounds = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);
          passwordHash = await bcrypt.hash(password, rounds);
        } catch (err) {
          console.error("Error hashing password:", err);
          logSecurityEvent("PASSWORD_HASH_ERROR", uid, { error: err.message });
          return res.status(500).json({ error: "Failed to process password" });
        }
      }

      // ===== Build room object =====
      const roomId = `room_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const roomData = {
        id: roomId,
        name,
        description,
        privacy,
        creator: uid,
        creatorEmail: email,
        participants: [uid],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
      };

      if (passwordHash) {
        roomData.passwordHash = passwordHash;
      }

      // ===== Save to Firestore =====
      const db = admin.firestore();
      await db.collection("study-groups").doc(roomId).set(roomData);

      console.log(`[study-groups] Room created: ${roomId} by ${uid}`);
      logSecurityEvent("ROOM_CREATED", uid, {
        roomId,
        name,
        privacy,
        hasPassword: !!passwordHash,
      });

      // Convert for response (use current time since serverTimestamp is not yet resolved)
      const responseData = {
        ...roomData,
        createdAt: new Date().toISOString(),
      };

      res.status(201).json(formatRoomResponse(responseData));
    } catch (error) {
      console.error("[study-groups] Error creating room:", error);
      logSecurityEvent("ROOM_CREATION_ERROR", req.user?.uid, {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to create room" });
    }
  }
);

// ===== GET /api/study-groups - List all rooms (with deactivation filtering per user) =====
// ✅ FIXED: Show deactivated rooms ONLY to creators and participants
router.get("/", firebaseAuthMiddleware, async (req, res) => {
  try {
    const uid = req.user?.uid;
    const db = admin.firestore();

    // Get ALL rooms (active AND deactivated)
    const snapshot = await db
      .collection("study-groups")
      .orderBy("createdAt", "desc")
      .get();

    const rooms = snapshot.docs
      .map((doc) => formatRoomResponse(doc.data()))
      .filter((room) => {
        // ✅ If room is active, always show it
        if (room.isActive) {
          console.log(
            `[study-groups] Showing active room ${room.id} to user ${uid}`
          );
          return true;
        }

        // ✅ If room is deactivated, only show if user is:
        // 1. The creator (host), OR
        // 2. A participant
        if (!room.isActive) {
          const isCreator = room.creator === uid;
          const isParticipant = room.participants?.includes(uid);

          if (isCreator || isParticipant) {
            console.log(
              `[study-groups] Showing deactivated room ${room.id} to user ${uid} (creator: ${isCreator}, participant: ${isParticipant})`
            );
            return true;
          } else {
            console.log(
              `[study-groups] Hiding deactivated room ${room.id} from non-member user ${uid}`
            );
            return false;
          }
        }

        return false;
      });

    console.log(`[study-groups] Fetched ${rooms.length} rooms for user ${uid}`);
    res.json(rooms);
  } catch (error) {
    console.error("[study-groups] Error listing rooms:", error);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// ===== GET /api/study-groups/mine - Rooms joined by current user =====
router.get("/mine", firebaseAuthMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid;
    const db = admin.firestore();

    // Query rooms where participants array contains the user
    const snapshot = await db
      .collection("study-groups")
      .where("participants", "array-contains", uid)
      .orderBy("createdAt", "desc")
      .get();

    const rooms = snapshot.docs.map((doc) => formatRoomResponse(doc.data()));

    console.log(
      `[study-groups] Fetched ${rooms.length} joined rooms for ${uid}`
    );
    res.json(rooms);
  } catch (error) {
    console.error("[study-groups] Error fetching joined rooms:", error);
    res.status(500).json({ error: "Failed to fetch joined rooms" });
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

    res.json(formatRoomResponse(doc.data()));
  } catch (error) {
    console.error("[study-groups] Error fetching room:", error);
    res.status(500).json({ error: "Failed to fetch room" });
  }
});

// ===== PUT /api/study-groups/:id/password - Reset room password (owner only, private rooms only) =====
router.put(
  "/:id/password",
  firebaseAuthMiddleware,
  updateRoomLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;
      const uid = req.user.uid;
      const { password } = req.body;

      console.log(`[study-groups] Password reset request for room: ${id}`);
      console.log(`[study-groups] User: ${uid}`);
      console.log(`[study-groups] Password provided: ${!!password}`);

      const db = admin.firestore();
      const doc = await db.collection("study-groups").doc(id).get();

      if (!doc.exists) {
        console.log(`[study-groups] ❌ Room not found: ${id}`);
        logSecurityEvent("PASSWORD_RESET_ROOM_NOT_FOUND", uid, { roomId: id });
        return res.status(404).json({ error: "Room not found" });
      }

      const roomData = doc.data();
      console.log(
        `[study-groups] Room creator: ${roomData.creator}, Auth user: ${uid}`
      );

      // ===== SECURITY: Only room creator can reset password =====
      if (roomData.creator !== uid) {
        console.log(
          `[study-groups] ❌ Unauthorized - user is not room creator`
        );
        logSecurityEvent("UNAUTHORIZED_PASSWORD_RESET", uid, { roomId: id });
        return res.status(403).json({
          error: "Forbidden: Only room creator can reset password",
        });
      }

      // ===== SECURITY: Only private rooms can have password reset =====
      const privacy = String(roomData.privacy || "public").toLowerCase();
      if (privacy !== "private") {
        console.log(
          `[study-groups] ❌ Not a private room - privacy: ${privacy}`
        );
        logSecurityEvent("PASSWORD_RESET_NOT_PRIVATE", uid, { roomId: id });
        return res.status(400).json({
          error: "Password reset is only available for private rooms",
        });
      }

      // ===== SECURITY: Validate password =====
      if (!password || typeof password !== "string") {
        console.log(`[study-groups] ❌ No password provided or invalid type`);
        return res.status(400).json({ error: "New password is required" });
      }

      const sanitizedPassword = sanitizeString(password, MAX_PASSWORD_LENGTH);

      if (sanitizedPassword.length < MIN_PASSWORD_LENGTH) {
        console.log(`[study-groups] ❌ Password too short`);
        return res.status(400).json({
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        });
      }

      if (sanitizedPassword.length > MAX_PASSWORD_LENGTH) {
        console.log(`[study-groups] ❌ Password too long`);
        return res.status(400).json({
          error: `Password must be ${MAX_PASSWORD_LENGTH} characters or less`,
        });
      }

      // ===== SECURITY: Hash new password =====
      let newPasswordHash;
      try {
        const rounds = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);
        newPasswordHash = await bcrypt.hash(sanitizedPassword, rounds);
        console.log(`[study-groups] ✅ Password hashed successfully`);
      } catch (err) {
        console.error("[study-groups] Hash error:", err);
        logSecurityEvent("PASSWORD_HASH_ERROR", uid, {
          roomId: id,
          error: err.message,
        });
        return res.status(500).json({ error: "Failed to process password" });
      }

      // ===== Update Firestore with new password hash =====
      await db.collection("study-groups").doc(id).update({
        passwordHash: newPasswordHash,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(
        `[study-groups] ✅ Password reset successfully for room: ${id}`
      );
      logSecurityEvent("ROOM_PASSWORD_RESET", uid, { roomId: id });

      // Fetch and return updated room
      const updatedDoc = await db.collection("study-groups").doc(id).get();

      res.json({
        success: true,
        message: "Room password has been reset successfully",
        room: formatRoomResponse(updatedDoc.data()),
      });
    } catch (error) {
      console.error("[study-groups] Error resetting password:", error);
      logSecurityEvent("PASSWORD_RESET_ERROR", req.user?.uid, {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to reset room password" });
    }
  }
);

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
        return res.status(403).json({
          error: "Forbidden: Only creator can update room",
        });
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
      if (req.body.privacy) {
        updates.privacy = req.body.privacy;
      }

      // ===== SECURITY: Allow owner to set/change password =====
      if (req.body.password !== undefined) {
        if (req.body.password && req.body.password.length > 0) {
          const password = sanitizeString(
            req.body.password,
            MAX_PASSWORD_LENGTH
          );

          if (password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({
              error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
            });
          }

          try {
            const rounds = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);
            updates.passwordHash = await bcrypt.hash(password, rounds);
          } catch (err) {
            console.error("Error hashing password:", err);
            return res
              .status(500)
              .json({ error: "Failed to process password" });
          }
        } else {
          // Owner wants to remove password
          updates.passwordHash = admin.firestore.FieldValue.delete();
        }
      }

      updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection("study-groups").doc(id).update(updates);

      console.log(`[study-groups] Room updated: ${id} by ${uid}`);
      logSecurityEvent("ROOM_UPDATED", uid, { roomId: id });

      // Fetch and return updated room
      const updatedDoc = await db.collection("study-groups").doc(id).get();

      res.json(formatRoomResponse(updatedDoc.data()));
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
      return res.status(403).json({
        error: "Forbidden: Only creator can delete room",
      });
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
router.post(
  "/:id/join",
  firebaseAuthMiddleware,
  joinRoomLimiter,
  async (req, res) => {
    try {
      const { id } = req.params;
      const uid = req.user.uid;
      const db = admin.firestore();
      const roomRef = db.collection("study-groups").doc(id);

      // Use transaction to avoid race conditions when adding participants
      const result = await db.runTransaction(async (tx) => {
        const roomDoc = await tx.get(roomRef);
        if (!roomDoc.exists) {
          logSecurityEvent("JOIN_ROOM_NOT_FOUND", uid, { roomId: id });
          return { status: 404, body: { error: "Room not found" } };
        }

        const roomData = roomDoc.data();

        // ===== CHECK IF ROOM IS ACTIVE =====
        const activeCheck = checkRoomActive(roomData, "join this room");
        if (!activeCheck.isActive) {
          logSecurityEvent("JOIN_DEACTIVATED_ROOM", uid, { roomId: id });
          return { status: 403, body: { error: activeCheck.error } };
        }

        const participants = roomData.participants || [];

        // ===== Check if already member =====
        if (participants.includes(uid)) {
          // User is already a member - return success (no error) so frontend can proceed
          console.log(
            `[study-groups] User ${uid} is already member of room ${id}`
          );
          return {
            status: 200,
            body: {
              success: true,
              message: "You are already a member of this room",
              participantCount: participants.length,
              alreadyMember: true,
            },
          };
        }

        // ===== Check max participants limit =====
        if (participants.length >= MAX_PARTICIPANTS) {
          logSecurityEvent("JOIN_ROOM_FULL", uid, {
            roomId: id,
            participantCount: participants.length,
          });
          return {
            status: 403,
            body: {
              error: "This room has reached its maximum participant limit",
            },
          };
        }

        // ===== SECURITY: Check privacy and password =====
        if (roomData.privacy === "private") {
          // If no passwordHash set on private room, deny join
          if (!roomData.passwordHash) {
            logSecurityEvent("JOIN_PRIVATE_ROOM_NO_PASSWORD", uid, {
              roomId: id,
            });
            return {
              status: 403,
              body: {
                error:
                  "This private room currently requires an owner-set password to join. Contact the room owner.",
              },
            };
          }

          const providedPassword = req.body && req.body.password;
          if (!providedPassword || typeof providedPassword !== "string") {
            return {
              status: 400,
              body: { error: "Password is required to join this private room" },
            };
          }

          if (providedPassword.length < MIN_PASSWORD_LENGTH) {
            return {
              status: 400,
              body: {
                error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
              },
            };
          }

          // Compare with bcrypt hash
          try {
            const match = await bcrypt.compare(
              providedPassword,
              roomData.passwordHash
            );
            if (!match) {
              logSecurityEvent("JOIN_PRIVATE_ROOM_WRONG_PASSWORD", uid, {
                roomId: id,
              });
              return {
                status: 403,
                body: { error: "Incorrect password" },
              };
            }
          } catch (bcryptErr) {
            console.error("Error comparing password:", bcryptErr);
            logSecurityEvent("PASSWORD_COMPARE_ERROR", uid, {
              roomId: id,
              error: bcryptErr.message,
            });
            return {
              status: 500,
              body: { error: "Password verification failed" },
            };
          }
        }

        // Passed privacy/password checks -> add participant
        const newParticipants = Array.from(
          new Set([...participants, uid])
        ).slice(0, MAX_PARTICIPANTS);

        tx.update(roomRef, {
          participants: newParticipants,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
          status: 200,
          body: {
            success: true,
            message: "Joined room successfully",
            participantCount: newParticipants.length,
          },
        };
      }); // end transaction

      // Transaction returned a response object
      if (result.status && result.body) {
        // Log join success if 200 and not already member
        if (result.status === 200 && !result.body.alreadyMember) {
          console.log(
            `[study-groups] User ${req.user.uid} joined room ${id} successfully`
          );
          logSecurityEvent("ROOM_JOINED", req.user.uid, {
            roomId: id,
            participantCount: result.body.participantCount,
          });
        }
        return res.status(result.status).json(result.body);
      }

      // Fallback error
      return res.status(500).json({ error: "Failed to join room" });
    } catch (error) {
      console.error("[study-groups] Error joining room:", error);
      logSecurityEvent("ROOM_JOIN_ERROR", req.user?.uid, {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to join room" });
    }
  }
);

// ===== DELETE /api/study-groups/:id/participants/:userId - Remove participant =====
// Allow users to remove themselves OR room creator can remove others
router.delete(
  "/:id/participants/:userId",
  firebaseAuthMiddleware,
  async (req, res) => {
    try {
      const { id, userId } = req.params;
      const uid = req.user.uid;
      const db = admin.firestore();

      // Decode userId if URL encoded
      const decodedUserId = decodeURIComponent(userId);

      const doc = await db.collection("study-groups").doc(id).get();

      if (!doc.exists) {
        logSecurityEvent("REMOVE_PARTICIPANT_ROOM_NOT_FOUND", uid, {
          roomId: id,
        });
        return res.status(404).json({ error: "Room not found" });
      }

      const roomData = doc.data();

      // ===== CHECK IF ROOM IS ACTIVE =====
      const activeCheck = checkRoomActive(
        roomData,
        "remove participants from this room"
      );
      if (!activeCheck.isActive) {
        return res.status(403).json({ error: activeCheck.error });
      }

      // ===== SECURITY: Allow users to remove themselves OR room creator can remove others =====
      const isOwner = roomData.creator === uid;
      const isRemovingSelf = decodedUserId === uid;

      if (!isOwner && !isRemovingSelf) {
        logSecurityEvent("UNAUTHORIZED_REMOVE_PARTICIPANT", uid, {
          roomId: id,
          targetUserId: decodedUserId,
          creator: roomData.creator,
        });
        return res.status(403).json({
          error:
            "Forbidden: You can only remove yourself or the room creator can remove others",
        });
      }

      const participants = roomData.participants || [];

      // ===== Check if participant exists =====
      if (!participants.includes(decodedUserId)) {
        logSecurityEvent("REMOVE_PARTICIPANT_NOT_FOUND", uid, {
          roomId: id,
          targetUserId: decodedUserId,
        });
        return res.status(400).json({
          error: "User is not a participant in this room",
        });
      }

      // ===== Remove participant =====
      const updatedParticipants = participants.filter(
        (p) => p !== decodedUserId
      );

      await db.collection("study-groups").doc(id).update({
        participants: updatedParticipants,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(
        `[study-groups] User ${decodedUserId} removed from room ${id} by ${uid}`
      );
      logSecurityEvent("PARTICIPANT_REMOVED", uid, {
        roomId: id,
        removedUserId: decodedUserId,
        isOwner: isOwner,
        isRemovingSelf: isRemovingSelf,
      });

      res.json({
        success: true,
        message: "Participant removed successfully",
        participantCount: updatedParticipants.length,
      });
    } catch (error) {
      console.error("[study-groups] Error removing participant:", error);
      logSecurityEvent("REMOVE_PARTICIPANT_ERROR", req.user?.uid, {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to remove participant" });
    }
  }
);

module.exports = router;
