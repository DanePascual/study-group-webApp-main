// backend/routes/notifications.js
// API routes for notifications

const express = require("express");
const router = express.Router();
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");
const notificationService = require("../services/notificationService");

/**
 * GET /api/notifications
 * Get notifications for the authenticated user
 * Query params: limit (default 50), unreadOnly (default false)
 */
router.get("/", firebaseAuthMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const limit = parseInt(req.query.limit) || 50;
    const unreadOnly = req.query.unreadOnly === "true";

    console.log(`[notifications] Fetching notifications for user ${userId}`);

    const result = await notificationService.getNotifications(userId, {
      limit,
      unreadOnly,
    });

    res.json({
      success: true,
      notifications: result.notifications,
      unreadCount: result.unreadCount,
    });
  } catch (error) {
    console.error("[notifications] Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get only the unread count (lightweight endpoint for badge)
 */
router.get("/unread-count", firebaseAuthMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;

    const result = await notificationService.getNotifications(userId, {
      limit: 1,
      unreadOnly: true,
    });

    res.json({
      success: true,
      unreadCount: result.unreadCount,
    });
  } catch (error) {
    console.error("[notifications] Error fetching unread count:", error);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a specific notification as read
 */
router.put("/:id/read", firebaseAuthMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const notificationId = req.params.id;

    console.log(
      `[notifications] Marking notification ${notificationId} as read for user ${userId}`
    );

    const result = await notificationService.markAsRead(notificationId, userId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[notifications] Error marking as read:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read for the authenticated user
 */
router.put("/read-all", firebaseAuthMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;

    console.log(
      `[notifications] Marking all notifications as read for user ${userId}`
    );

    const result = await notificationService.markAllAsRead(userId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, count: result.count });
  } catch (error) {
    console.error("[notifications] Error marking all as read:", error);
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a specific notification
 */
router.delete("/:id", firebaseAuthMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const notificationId = req.params.id;

    console.log(
      `[notifications] Deleting notification ${notificationId} for user ${userId}`
    );

    const result = await notificationService.deleteNotification(
      notificationId,
      userId
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[notifications] Error deleting notification:", error);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

module.exports = router;
