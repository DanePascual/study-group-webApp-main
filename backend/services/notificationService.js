// backend/services/notificationService.js
// Centralized notification service for creating and managing notifications

const admin = require("../config/firebase-admin");
const db = admin.firestore();

/**
 * Notification Types:
 * - room_join: Someone joined your study room
 * - room_leave: Someone left your study room
 * - room_invite: You received a room invite
 * - topic_post: Someone created a post in your topic
 * - post_comment: Someone commented on your post
 * - report_status: Your report status was updated
 * - admin_new_report: (Admin) New report submitted
 * - admin_new_user: (Admin) New user registered
 */

const NOTIFICATION_TYPES = {
  ROOM_JOIN: "room_join",
  ROOM_LEAVE: "room_leave",
  ROOM_INVITE: "room_invite",
  TOPIC_POST: "topic_post",
  POST_COMMENT: "post_comment",
  REPORT_STATUS: "report_status",
  ADMIN_NEW_REPORT: "admin_new_report",
  ADMIN_NEW_USER: "admin_new_user",
};

/**
 * Create a notification for a user
 * @param {string} userId - The user ID to notify
 * @param {object} options - Notification options
 * @param {string} options.type - Notification type (see NOTIFICATION_TYPES)
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {object} options.data - Additional data (roomId, postId, etc.)
 * @param {string} options.icon - Icon type (info, success, warning, user, comment, etc.)
 * @param {string} options.link - Optional link to navigate to
 */
async function createNotification(userId, options) {
  try {
    if (!userId) {
      console.warn("[notifications] No userId provided, skipping notification");
      return null;
    }

    const {
      type,
      title,
      message,
      data = {},
      icon = "info",
      link = "",
    } = options;

    const notification = {
      userId,
      type,
      title,
      message,
      data,
      icon,
      link,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtISO: new Date().toISOString(),
    };

    const docRef = await db.collection("notifications").add(notification);
    console.log(
      `[notifications] Created notification ${docRef.id} for user ${userId}: ${type}`
    );

    return { id: docRef.id, ...notification };
  } catch (error) {
    console.error("[notifications] Error creating notification:", error);
    return null;
  }
}

/**
 * Create notifications for multiple users
 * @param {string[]} userIds - Array of user IDs to notify
 * @param {object} options - Notification options (same as createNotification)
 */
async function createBulkNotifications(userIds, options) {
  try {
    const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
    const results = await Promise.all(
      uniqueUserIds.map((userId) => createNotification(userId, options))
    );
    return results.filter(Boolean);
  } catch (error) {
    console.error("[notifications] Error creating bulk notifications:", error);
    return [];
  }
}

/**
 * Notify all admins about something
 * @param {object} options - Notification options
 */
async function notifyAllAdmins(options) {
  try {
    // Get all admin users
    const adminsSnapshot = await db
      .collection("admins")
      .where("status", "==", "active")
      .get();

    const adminIds = adminsSnapshot.docs.map((doc) => doc.id);

    if (adminIds.length === 0) {
      console.log("[notifications] No active admins to notify");
      return [];
    }

    console.log(`[notifications] Notifying ${adminIds.length} admins`);
    return await createBulkNotifications(adminIds, options);
  } catch (error) {
    console.error("[notifications] Error notifying admins:", error);
    return [];
  }
}

/**
 * Mark a notification as read
 * @param {string} notificationId - The notification ID
 * @param {string} userId - The user ID (for verification)
 */
async function markAsRead(notificationId, userId) {
  try {
    const notifRef = db.collection("notifications").doc(notificationId);
    const notifDoc = await notifRef.get();

    if (!notifDoc.exists) {
      return { success: false, error: "Notification not found" };
    }

    if (notifDoc.data().userId !== userId) {
      return { success: false, error: "Unauthorized" };
    }

    await notifRef.update({ read: true });
    return { success: true };
  } catch (error) {
    console.error("[notifications] Error marking as read:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Mark all notifications as read for a user
 * @param {string} userId - The user ID
 */
async function markAllAsRead(userId) {
  try {
    const snapshot = await db
      .collection("notifications")
      .where("userId", "==", userId)
      .where("read", "==", false)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { read: true });
    });

    await batch.commit();
    console.log(
      `[notifications] Marked ${snapshot.size} notifications as read for user ${userId}`
    );
    return { success: true, count: snapshot.size };
  } catch (error) {
    console.error("[notifications] Error marking all as read:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a notification
 * @param {string} notificationId - The notification ID
 * @param {string} userId - The user ID (for verification)
 */
async function deleteNotification(notificationId, userId) {
  try {
    const notifRef = db.collection("notifications").doc(notificationId);
    const notifDoc = await notifRef.get();

    if (!notifDoc.exists) {
      return { success: false, error: "Notification not found" };
    }

    if (notifDoc.data().userId !== userId) {
      return { success: false, error: "Unauthorized" };
    }

    await notifRef.delete();
    return { success: true };
  } catch (error) {
    console.error("[notifications] Error deleting notification:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get notifications for a user
 * @param {string} userId - The user ID
 * @param {object} options - Query options
 * @param {number} options.limit - Max notifications to return (default 50)
 * @param {boolean} options.unreadOnly - Only return unread notifications
 */
async function getNotifications(userId, options = {}) {
  try {
    const { limit = 50, unreadOnly = false } = options;

    let query = db
      .collection("notifications")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (unreadOnly) {
      query = query.where("read", "==", false);
    }

    const snapshot = await query.get();

    const notifications = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAtISO || null,
      };
    });

    // Get unread count
    const unreadSnapshot = await db
      .collection("notifications")
      .where("userId", "==", userId)
      .where("read", "==", false)
      .count()
      .get();

    return {
      notifications,
      unreadCount: unreadSnapshot.data().count,
    };
  } catch (error) {
    console.error("[notifications] Error getting notifications:", error);
    return { notifications: [], unreadCount: 0 };
  }
}

// ===== Convenience methods for specific notification types =====

/**
 * Notify room owner when someone joins
 */
async function notifyRoomJoin(roomOwnerId, joinerName, roomName, roomId) {
  return createNotification(roomOwnerId, {
    type: NOTIFICATION_TYPES.ROOM_JOIN,
    title: "Someone joined your room",
    message: `${joinerName} joined "${roomName}"`,
    icon: "user-plus",
    link: `/student/pages/study-room-inside.html?roomId=${roomId}`,
    data: { roomId, joinerName, roomName },
  });
}

/**
 * Notify room owner when someone leaves
 */
async function notifyRoomLeave(roomOwnerId, leaverName, roomName, roomId) {
  return createNotification(roomOwnerId, {
    type: NOTIFICATION_TYPES.ROOM_LEAVE,
    title: "Someone left your room",
    message: `${leaverName} left "${roomName}"`,
    icon: "user-minus",
    link: `/student/pages/study-room-inside.html?roomId=${roomId}`,
    data: { roomId, leaverName, roomName },
  });
}

/**
 * Notify user when they receive a room invite
 */
async function notifyRoomInvite(invitedUserId, inviterName, roomName, roomId) {
  return createNotification(invitedUserId, {
    type: NOTIFICATION_TYPES.ROOM_INVITE,
    title: "Room invite received",
    message: `${inviterName} invited you to "${roomName}"`,
    icon: "mail",
    link: `/student/pages/study-rooms.html`,
    data: { roomId, inviterName, roomName },
  });
}

/**
 * Notify topic owner when someone creates a post
 */
async function notifyTopicPost(
  topicOwnerId,
  posterName,
  topicTitle,
  topicId,
  postId
) {
  return createNotification(topicOwnerId, {
    type: NOTIFICATION_TYPES.TOPIC_POST,
    title: "New post in your topic",
    message: `${posterName} created a post in "${topicTitle}"`,
    icon: "file-text",
    link: `/student/pages/post.html?id=${postId}`,
    data: { topicId, postId, posterName, topicTitle },
  });
}

/**
 * Notify post owner when someone comments
 */
async function notifyPostComment(
  postOwnerId,
  commenterName,
  postTitle,
  postId
) {
  return createNotification(postOwnerId, {
    type: NOTIFICATION_TYPES.POST_COMMENT,
    title: "New comment on your post",
    message: `${commenterName} commented on "${postTitle}"`,
    icon: "message-circle",
    link: `/student/pages/post.html?id=${postId}`,
    data: { postId, commenterName, postTitle },
  });
}

/**
 * Notify user when their report status changes
 */
async function notifyReportStatus(reporterId, reportId, oldStatus, newStatus) {
  const statusText = newStatus === "resolved" ? "resolved" : "dismissed";
  return createNotification(reporterId, {
    type: NOTIFICATION_TYPES.REPORT_STATUS,
    title: `Report ${statusText}`,
    message: `Your report #${reportId.slice(-8)} has been ${statusText}`,
    icon: newStatus === "resolved" ? "check-circle" : "x-circle",
    link: `/student/pages/report.html`,
    data: { reportId, oldStatus, newStatus },
  });
}

/**
 * Notify all admins about a new report
 */
async function notifyAdminsNewReport(reportId, reporterName, reportType) {
  return notifyAllAdmins({
    type: NOTIFICATION_TYPES.ADMIN_NEW_REPORT,
    title: "New report submitted",
    message: `${reporterName} submitted a ${reportType} report`,
    icon: "alert-triangle",
    link: `/admin/reports.html`,
    data: { reportId, reporterName, reportType },
  });
}

/**
 * Notify all admins about a new user registration
 */
async function notifyAdminsNewUser(userId, userName, userEmail) {
  return notifyAllAdmins({
    type: NOTIFICATION_TYPES.ADMIN_NEW_USER,
    title: "New user registered",
    message: `${userName || userEmail} just registered`,
    icon: "user-plus",
    link: `/admin/users.html`,
    data: { userId, userName, userEmail },
  });
}

module.exports = {
  NOTIFICATION_TYPES,
  createNotification,
  createBulkNotifications,
  notifyAllAdmins,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotifications,
  // Convenience methods
  notifyRoomJoin,
  notifyRoomLeave,
  notifyRoomInvite,
  notifyTopicPost,
  notifyPostComment,
  notifyReportStatus,
  notifyAdminsNewReport,
  notifyAdminsNewUser,
};
