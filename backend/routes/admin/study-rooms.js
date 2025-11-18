// backend/routes/admin/study-rooms.js
const express = require("express");
const router = express.Router();
const admin = require("../../config/firebase-admin");
const adminAuthMiddleware = require("../../middleware/adminAuthMiddleware");

const db = admin.firestore();

// ===== Helper: Get user by UID (uses admin endpoint logic) =====
async function getUser(uid) {
  if (!uid) return null;

  try {
    console.log(`[study-rooms] Fetching user ${uid}...`);
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      console.warn(`[study-rooms] User ${uid} not found`);
      return null;
    }

    const userData = userDoc.data();
    return {
      uid: userDoc.id,
      name: userData.name || "Unknown",
      email: userData.email || "",
      program: userData.program || "Unknown",
    };
  } catch (err) {
    console.warn(`[study-rooms] Could not fetch user ${uid}:`, err.message);
    return null;
  }
}

// ===== Helper: Enhance rooms with user names =====
async function enhanceRooms(rooms) {
  console.log(
    `[study-rooms] Enhancing ${rooms.length} rooms with creator info...`
  );

  const enhancedRooms = await Promise.all(
    rooms.map(async (room) => {
      // Get creator info if creator UID exists
      if (room.creator) {
        console.log(
          `[study-rooms] Processing creator for room ${room.id}: ${room.creator}`
        );

        const creatorData = await getUser(room.creator);

        if (creatorData) {
          room.creatorName = creatorData.name;
          room.creatorEmail = creatorData.email;
          console.log(
            `[study-rooms] ✅ Set creator for ${room.id}: ${creatorData.name} (${creatorData.email})`
          );
        } else {
          room.creatorName = "Unknown";
          room.creatorEmail = "";
          console.warn(
            `[study-rooms] Could not fetch creator data for ${room.creator}`
          );
        }
      } else {
        room.creatorName = "Unknown";
        room.creatorEmail = "";
        console.warn(`[study-rooms] Room ${room.id} has no creator UID`);
      }

      return room;
    })
  );

  console.log("[study-rooms] ✅ Room enhancement complete");
  return enhancedRooms;
}

// GET /api/admin/study-rooms
// List all study rooms with filters and statistics
router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    console.log("[study-rooms] Fetching study rooms...");
    console.log("[study-rooms] Query params:", req.query);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status; // active, inactive
    const privacy = req.query.privacy; // public, private
    const search = req.query.search || "";

    // ===== Get all rooms =====
    console.log("[study-rooms] Querying study-groups collection...");
    const roomsSnapshot = await db.collection("study-groups").get();
    console.log(`[study-rooms] Found ${roomsSnapshot.size} rooms`);

    let rooms = roomsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: data.id || doc.id,
        name: data.name || "Untitled Room",
        description: data.description || "",
        creator: data.creator, // Keep UID for enhancement
        creatorName: null, // Will be enhanced
        creatorEmail: null, // Will be enhanced
        participants: data.participants || [],
        privacy: data.privacy || "public",
        isActive: data.isActive !== false,
        createdAt: data.createdAt,
        sessionDate: data.sessionDate || null,
        sessionTime: data.sessionTime || null,
      };
    });

    console.log(`[study-rooms] Total rooms in database: ${rooms.length}`);

    // ===== Enhance rooms with creator info =====
    console.log("[study-rooms] Starting room enhancement...");
    rooms = await enhanceRooms(rooms);

    // ===== Apply filters =====
    // Status filter
    if (status === "active") {
      rooms = rooms.filter((room) => room.isActive === true);
      console.log(
        `[study-rooms] After status filter (active): ${rooms.length} rooms`
      );
    } else if (status === "inactive") {
      rooms = rooms.filter((room) => room.isActive === false);
      console.log(
        `[study-rooms] After status filter (inactive): ${rooms.length} rooms`
      );
    }

    // Privacy filter
    if (privacy === "public") {
      rooms = rooms.filter((room) => (room.privacy || "public") === "public");
      console.log(
        `[study-rooms] After privacy filter (public): ${rooms.length} rooms`
      );
    } else if (privacy === "private") {
      rooms = rooms.filter((room) => room.privacy === "private");
      console.log(
        `[study-rooms] After privacy filter (private): ${rooms.length} rooms`
      );
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      rooms = rooms.filter(
        (room) =>
          (room.name && room.name.toLowerCase().includes(searchLower)) ||
          (room.creatorName &&
            room.creatorName.toLowerCase().includes(searchLower)) ||
          (room.description &&
            room.description.toLowerCase().includes(searchLower))
      );
      console.log(`[study-rooms] After search filter: ${rooms.length} rooms`);
    }

    // ===== Calculate statistics =====
    const allRoomsSnapshot = await db.collection("study-groups").get();
    const allRooms = allRoomsSnapshot.docs.map((doc) => doc.data());

    const totalRooms = allRooms.length;
    const activeRooms = allRooms.filter((r) => r.isActive !== false).length;
    const publicRooms = allRooms.filter(
      (r) => (r.privacy || "public") === "public"
    ).length;
    const privateRooms = allRooms.filter((r) => r.privacy === "private").length;

    console.log("[study-rooms] Statistics:", {
      totalRooms,
      activeRooms,
      publicRooms,
      privateRooms,
    });

    // ===== Pagination =====
    const total = rooms.length;
    const pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedRooms = rooms.slice(offset, offset + limit);

    console.log(
      `[study-rooms] ✅ Fetched ${paginatedRooms.length} rooms (page ${page}/${pages})`
    );

    res.json({
      rooms: paginatedRooms,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
      stats: {
        totalRooms,
        activeRooms,
        publicRooms,
        privateRooms,
      },
      filters: {
        status: status || "all",
        privacy: privacy || "all",
        search,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[study-rooms] Error:", err.message);
    console.error("[study-rooms] Stack:", err.stack);
    res.status(500).json({
      error: "Failed to fetch study rooms",
      details: err.message,
    });
  }
});

// GET /api/admin/study-rooms/:roomId
// Get single study room details
router.get("/:roomId", adminAuthMiddleware, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    console.log(`[study-rooms] Fetching room ${roomId}...`);

    const roomDoc = await db.collection("study-groups").doc(roomId).get();

    if (!roomDoc.exists) {
      console.warn(`[study-rooms] Room not found: ${roomId}`);
      return res.status(404).json({ error: "Room not found" });
    }

    const data = roomDoc.data();

    // Get creator info
    let creatorName = "Unknown";
    let creatorEmail = "";

    if (data.creator) {
      console.log(`[study-rooms] Fetching creator info for ${data.creator}...`);
      const creatorData = await getUser(data.creator);
      if (creatorData) {
        creatorName = creatorData.name;
        creatorEmail = creatorData.email;
        console.log(
          `[study-rooms] ✅ Found creator: ${creatorName} (${creatorEmail})`
        );
      } else {
        console.warn(
          `[study-rooms] Could not fetch creator data for ${data.creator}`
        );
      }
    }

    const roomDetails = {
      id: data.id || roomId,
      name: data.name || "Untitled Room",
      description: data.description || "",
      creator: data.creator,
      creatorName,
      creatorEmail,
      participants: data.participants || [],
      privacy: data.privacy || "public",
      isActive: data.isActive !== false,
      createdAt: data.createdAt,
      sessionDate: data.sessionDate || null,
      sessionTime: data.sessionTime || null,
    };

    console.log(`[study-rooms] ✅ Room details retrieved for ${roomId}`);

    res.json(roomDetails);
  } catch (err) {
    console.error("[study-rooms] Error:", err.message);
    res.status(500).json({
      error: "Failed to fetch room details",
      details: err.message,
    });
  }
});

// PUT /api/admin/study-rooms/:roomId/deactivate
// Deactivate a study room
router.put("/:roomId/deactivate", adminAuthMiddleware, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const adminUid = req.user.uid;
    const adminName = req.user.name || "Unknown";

    console.log(`[study-rooms] Deactivating room ${roomId}...`);

    // Check if room exists
    const roomDoc = await db.collection("study-groups").doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ error: "Room not found" });
    }

    const roomData = roomDoc.data();

    // Update room status
    await db.collection("study-groups").doc(roomId).update({
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedBy: adminUid,
    });

    // Log to audit logs
    await db.collection("auditLogs").add({
      timestamp: new Date(),
      adminUid,
      adminName,
      action: "deactivate_study_room",
      targetRoomId: roomId,
      targetName: roomData.name || "Unknown Room",
      changes: {
        field: "isActive",
        from: true,
        to: false,
      },
      reason: "Room deactivated by admin",
      status: "completed",
    });

    console.log(`[study-rooms] ✅ Room ${roomId} deactivated`);

    res.json({
      success: true,
      message: "Room deactivated successfully",
      deactivatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[study-rooms] Error:", err.message);
    res.status(500).json({
      error: "Failed to deactivate room",
      details: err.message,
    });
  }
});

// PUT /api/admin/study-rooms/:roomId/activate
// Activate a study room
router.put("/:roomId/activate", adminAuthMiddleware, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const adminUid = req.user.uid;
    const adminName = req.user.name || "Unknown";

    console.log(`[study-rooms] Activating room ${roomId}...`);

    // Check if room exists
    const roomDoc = await db.collection("study-groups").doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ error: "Room not found" });
    }

    const roomData = roomDoc.data();

    // Update room status
    await db.collection("study-groups").doc(roomId).update({
      isActive: true,
      activatedAt: new Date(),
      activatedBy: adminUid,
    });

    // Log to audit logs
    await db.collection("auditLogs").add({
      timestamp: new Date(),
      adminUid,
      adminName,
      action: "activate_study_room",
      targetRoomId: roomId,
      targetName: roomData.name || "Unknown Room",
      changes: {
        field: "isActive",
        from: false,
        to: true,
      },
      reason: "Room activated by admin",
      status: "completed",
    });

    console.log(`[study-rooms] ✅ Room ${roomId} activated`);

    res.json({
      success: true,
      message: "Room activated successfully",
      activatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[study-rooms] Error:", err.message);
    res.status(500).json({
      error: "Failed to activate room",
      details: err.message,
    });
  }
});

// DELETE /api/admin/study-rooms/:roomId
// Delete a study room permanently
router.delete("/:roomId", adminAuthMiddleware, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const adminUid = req.user.uid;
    const adminName = req.user.name || "Unknown";

    console.log(`[study-rooms] Deleting room ${roomId}...`);

    // Check if room exists
    const roomDoc = await db.collection("study-groups").doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ error: "Room not found" });
    }

    const roomData = roomDoc.data();

    // Delete the room
    await db.collection("study-groups").doc(roomId).delete();

    // Log to audit logs
    await db.collection("auditLogs").add({
      timestamp: new Date(),
      adminUid,
      adminName,
      action: "delete_study_room",
      targetRoomId: roomId,
      targetName: roomData.name || "Unknown Room",
      changes: {
        field: "status",
        from: "active",
        to: "deleted",
      },
      reason: "Room permanently deleted by admin",
      status: "completed",
    });

    console.log(`[study-rooms] ✅ Room ${roomId} deleted`);

    res.json({
      success: true,
      message: "Room deleted successfully",
      deletedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[study-rooms] Error:", err.message);
    res.status(500).json({
      error: "Failed to delete room",
      details: err.message,
    });
  }
});

module.exports = router;
