const express = require("express");
const router = express.Router();
const admin = require("../../config/firebase-admin");
const adminAuthMiddleware = require("../../middleware/adminAuthMiddleware");
const { adminBanLimiter } = require("../../server");

const db = admin.firestore();

// GET /api/admin/users
// Query params: page=1, limit=10, search=text, status=active|banned, sort=newest
router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    console.log("[admin-users] Fetching users...");
    console.log("[admin-users] Query params:", req.query);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const status = req.query.status; // active, banned
    const sort = req.query.sort || "newest";

    let query = db.collection("users");

    // ===== Apply sorting first (required before where) =====
    if (sort === "newest") {
      query = query.orderBy("createdAt", "desc");
    } else if (sort === "oldest") {
      query = query.orderBy("createdAt", "asc");
    }

    // ===== Only filter by banned in query if status is banned =====
    if (status === "banned") {
      query = query.where("isBanned", "==", true);
      console.log("[admin-users] Filter: banned users only");
    } else {
      console.log("[admin-users] No Firestore filter (will filter in memory)");
    }

    // ===== Get all matching documents =====
    const snapshot = await query.get();
    console.log(`[admin-users] Query returned ${snapshot.size} documents`);

    // ===== Apply search and status filters IN MEMORY =====
    let allUsers = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          uid: doc.id,
          name: data.name || "Unknown",
          email: data.email || "",
          program: data.program || "Unknown",
          createdAt: data.createdAt || null,
          isBanned: data.isBanned || false,
          bannedAt: data.bannedAt || null,
          bannedReason: data.bannedReason || null,
          bannedBy: data.bannedBy || null,
          photo: data.photo || null,
          studentNumber: data.studentNumber || null,
          yearLevel: data.yearLevel || null,
        };
      })
      .filter((u) => {
        // Apply search filter
        if (search) {
          const searchLower = search.toLowerCase();
          const matchesSearch =
            u.name.toLowerCase().includes(searchLower) ||
            u.email.toLowerCase().includes(searchLower);
          if (!matchesSearch) return false;
        }

        // Apply status filter (in memory)
        if (status === "active") {
          return u.isBanned === false || !u.isBanned;
        } else if (status === "banned") {
          return u.isBanned === true;
        }

        return true; // All users
      });

    console.log(`[admin-users] After filtering: ${allUsers.length} users`);

    // ===== Calculate pagination =====
    const total = allUsers.length;
    const pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // ===== Apply pagination =====
    const users = allUsers.slice(offset, offset + limit);

    console.log(
      `[admin-users] ✅ Returning ${users.length} users (page ${page}/${pages})`
    );

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
      filters: {
        status: status || "all",
        search,
        sort,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin-users] Error:", err.message);
    console.error("[admin-users] Stack:", err.stack);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// GET /api/admin/users/:uid
// Get single user details
router.get("/:uid", adminAuthMiddleware, async (req, res) => {
  try {
    const userId = req.params.uid;
    console.log(`[admin-users] Fetching user ${userId}...`);

    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();

    res.json({
      uid: userDoc.id,
      name: userData.name || "Unknown",
      email: userData.email || "",
      program: userData.program || "Unknown",
      createdAt: userData.createdAt || null,
      isBanned: userData.isBanned || false,
      bannedAt: userData.bannedAt || null,
      bannedReason: userData.bannedReason || null,
      bannedBy: userData.bannedBy || null,
      photo: userData.photo || null,
      studentNumber: userData.studentNumber || null,
      yearLevel: userData.yearLevel || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin-users] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// PUT /api/admin/users/:uid/ban
// Ban user
router.put("/:uid/ban", adminAuthMiddleware, adminBanLimiter, async (req, res) => {
  try {
    const userId = req.params.uid;
    const { reason, duration } = req.body;
    const adminUid = req.user.uid;
    const adminName = req.user.name || "Unknown";

    console.log(`[admin-users] Banning user ${userId}...`);

    if (!reason) {
      return res.status(400).json({ error: "Reason is required" });
    }

    const bannedAt = new Date();

    // ===== Update user =====
    await db.collection("users").doc(userId).update({
      isBanned: true,
      bannedAt,
      bannedReason: reason,
      bannedBy: adminUid,
    });

    // ===== Create bannedUsers entry =====
    await db
      .collection("bannedUsers")
      .doc(userId)
      .set({
        uid: userId,
        bannedAt,
        bannedReason: reason,
        bannedBy: adminUid,
        status: "active",
        duration: duration || "permanent",
      });

    // ===== Log to audit logs =====
    await db.collection("auditLogs").add({
      timestamp: bannedAt,
      adminUid,
      adminName,
      action: "ban_user",
      targetUid: userId,
      targetName: "User",
      changes: {
        field: "isBanned",
        from: false,
        to: true,
      },
      reason,
      duration: duration || "permanent",
      status: "completed",
    });

    console.log(`[admin-users] ✅ User ${userId} banned successfully`);

    res.json({
      success: true,
      message: `User ${userId} has been banned`,
      bannedAt,
    });
  } catch (err) {
    console.error("[admin-users] Error:", err.message);
    res.status(500).json({ error: "Failed to ban user" });
  }
});

// PUT /api/admin/users/:uid/unban
// Unban user
router.put("/:uid/unban", adminAuthMiddleware, adminBanLimiter, async (req, res) => {
  try {
    const userId = req.params.uid;
    const adminUid = req.user.uid;
    const adminName = req.user.name || "Unknown";

    console.log(`[admin-users] Unbanning user ${userId}...`);

    // ===== Update user =====
    await db.collection("users").doc(userId).update({
      isBanned: false,
      bannedAt: null,
      bannedReason: null,
      bannedBy: null,
    });

    // ===== Delete bannedUsers entry =====
    await db.collection("bannedUsers").doc(userId).delete();

    // ===== Log to audit logs =====
    await db.collection("auditLogs").add({
      timestamp: new Date(),
      adminUid,
      adminName,
      action: "unban_user",
      targetUid: userId,
      targetName: "User",
      changes: {
        field: "isBanned",
        from: true,
        to: false,
      },
      reason: "Admin unbanned user",
      status: "completed",
    });

    console.log(`[admin-users] ✅ User ${userId} unbanned successfully`);

    res.json({
      success: true,
      message: `User ${userId} has been unbanned`,
    });
  } catch (err) {
    console.error("[admin-users] Error:", err.message);
    res.status(500).json({ error: "Failed to unban user" });
  }
});

module.exports = router;
