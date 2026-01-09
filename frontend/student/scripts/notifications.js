// frontend/student/scripts/notifications.js
// Notification bell component for student pages

import { API_BASE } from "../../config/appConfig.js";
import { auth } from "../../config/firebase.js";

class NotificationManager {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.isOpen = false;
    this.container = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    // Wait for auth to be ready
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        this.createBellIcon();
        await this.fetchNotifications();
        this.startPolling();
        this.initialized = true;
      }
    });
  }

  createBellIcon() {
    // Check if already exists
    if (document.getElementById("notification-bell-container")) return;

    // Create notification bell container
    const bellContainer = document.createElement("div");
    bellContainer.id = "notification-bell-container";
    bellContainer.innerHTML = `
      <button id="notification-bell" class="notification-bell" aria-label="Notifications">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        <span id="notification-badge" class="notification-badge hidden">0</span>
      </button>
      <div id="notification-dropdown" class="notification-dropdown hidden">
        <div class="notification-header">
          <h3>Notifications</h3>
          <button id="mark-all-read" class="mark-all-read-btn">Mark all read</button>
        </div>
        <div id="notification-list" class="notification-list">
          <div class="notification-empty">No notifications</div>
        </div>
      </div>
    `;

    // Find the right place to insert - prefer .nav-right for proper alignment
    const navRight = document.querySelector(".nav-right");
    const themeToggle = document.querySelector(".theme-toggle");

    if (navRight && themeToggle) {
      // Insert before theme toggle for proper order: search | bell | theme
      navRight.insertBefore(bellContainer, themeToggle);
    } else {
      // Fallback to other selectors
      const header = document.querySelector(
        ".navbar-right, .header-right, .user-menu, header nav"
      );
      if (header) {
        header.insertBefore(bellContainer, header.firstChild);
      } else {
        // Fallback: add to body as fixed element
        bellContainer.style.position = "fixed";
        bellContainer.style.top = "20px";
        bellContainer.style.right = "80px";
        bellContainer.style.zIndex = "9999";
        document.body.appendChild(bellContainer);
      }
    }

    this.container = bellContainer;
    this.attachEventListeners();
    this.injectStyles();
  }

  attachEventListeners() {
    const bell = document.getElementById("notification-bell");
    const dropdown = document.getElementById("notification-dropdown");
    const markAllBtn = document.getElementById("mark-all-read");

    // Toggle dropdown
    bell.addEventListener("click", (e) => {
      e.stopPropagation();
      this.isOpen = !this.isOpen;
      dropdown.classList.toggle("hidden", !this.isOpen);
    });

    // Mark all as read
    markAllBtn.addEventListener("click", async () => {
      await this.markAllAsRead();
    });

    // Close on outside click
    document.addEventListener("click", (e) => {
      if (!this.container.contains(e.target)) {
        this.isOpen = false;
        dropdown.classList.add("hidden");
      }
    });
  }

  async getAuthToken() {
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  }

  async fetchNotifications() {
    try {
      const token = await this.getAuthToken();
      if (!token) return;

      const response = await fetch(`${API_BASE}/api/notifications?limit=20`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch notifications");

      const data = await response.json();
      this.notifications = data.notifications || [];
      this.unreadCount = data.unreadCount || 0;

      this.updateUI();
    } catch (error) {
      console.error("[notifications] Error fetching:", error);
    }
  }

  updateUI() {
    // Update badge
    const badge = document.getElementById("notification-badge");
    if (badge) {
      if (this.unreadCount > 0) {
        badge.textContent = this.unreadCount > 99 ? "99+" : this.unreadCount;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }

    // Update list
    const list = document.getElementById("notification-list");
    if (!list) return;

    if (this.notifications.length === 0) {
      list.innerHTML = '<div class="notification-empty">No notifications</div>';
      return;
    }

    list.innerHTML = this.notifications
      .map((notif) => this.renderNotification(notif))
      .join("");

    // Attach click handlers
    list.querySelectorAll(".notification-item").forEach((item) => {
      item.addEventListener("click", () =>
        this.handleNotificationClick(item.dataset.id)
      );
    });
  }

  renderNotification(notif) {
    const timeAgo = this.formatTimeAgo(notif.createdAt);
    const icon = this.getIcon(notif.icon || notif.type);
    const unreadClass = notif.read ? "" : "unread";

    return `
      <div class="notification-item ${unreadClass}" data-id="${
      notif.id
    }" data-link="${notif.link || ""}">
        <div class="notification-icon">${icon}</div>
        <div class="notification-content">
          <div class="notification-title">${this.escapeHtml(notif.title)}</div>
          <div class="notification-message">${this.escapeHtml(
            notif.message
          )}</div>
          <div class="notification-time">${timeAgo}</div>
        </div>
      </div>
    `;
  }

  getIcon(type) {
    const icons = {
      "user-plus": "👤",
      "user-minus": "👋",
      mail: "✉️",
      "file-text": "📝",
      "message-circle": "💬",
      "check-circle": "✅",
      "x-circle": "❌",
      "alert-triangle": "⚠️",
      room_join: "👤",
      room_leave: "👋",
      room_invite: "✉️",
      topic_post: "📝",
      post_comment: "💬",
      report_status: "📋",
      admin_new_report: "⚠️",
      admin_new_user: "👤",
      info: "ℹ️",
    };
    return icons[type] || "🔔";
  }

  formatTimeAgo(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async handleNotificationClick(notificationId) {
    const notif = this.notifications.find((n) => n.id === notificationId);
    if (!notif) return;

    // Mark as read
    if (!notif.read) {
      await this.markAsRead(notificationId);
    }

    // Navigate if link exists
    if (notif.link) {
      window.location.href = notif.link;
    }
  }

  async markAsRead(notificationId) {
    try {
      const token = await this.getAuthToken();
      if (!token) return;

      await fetch(`${API_BASE}/api/notifications/${notificationId}/read`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Update local state
      const notif = this.notifications.find((n) => n.id === notificationId);
      if (notif) {
        notif.read = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.updateUI();
      }
    } catch (error) {
      console.error("[notifications] Error marking as read:", error);
    }
  }

  async markAllAsRead() {
    try {
      const token = await this.getAuthToken();
      if (!token) return;

      await fetch(`${API_BASE}/api/notifications/read-all`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Update local state
      this.notifications.forEach((n) => (n.read = true));
      this.unreadCount = 0;
      this.updateUI();
    } catch (error) {
      console.error("[notifications] Error marking all as read:", error);
    }
  }

  startPolling() {
    // Poll every 30 seconds for new notifications
    setInterval(() => {
      this.fetchNotifications();
    }, 30000);
  }

  injectStyles() {
    if (document.getElementById("notification-styles")) return;

    const styles = document.createElement("style");
    styles.id = "notification-styles";
    styles.textContent = `
      #notification-bell-container {
        position: relative;
        display: inline-flex;
        align-items: center;
      }

      .notification-bell {
        background: none;
        border: none;
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
        position: relative;
        color: var(--medium-text, #64748b);
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .notification-bell:hover {
        background: var(--background-light, #f1f5f9);
        transform: scale(1.1);
      }

      .notification-bell svg {
        width: 20px;
        height: 20px;
      }

      .notification-badge {
        position: absolute;
        top: 0px;
        right: 0px;
        background: #ef4444;
        color: white;
        font-size: 10px;
        font-weight: bold;
        min-width: 16px;
        height: 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
      }

      .notification-badge.hidden {
        display: none;
      }

      .notification-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        width: 320px;
        max-height: 400px;
        background: var(--bg-secondary, #fff);
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        overflow: hidden;
        border: 1px solid var(--border-color, #e5e7eb);
      }

      .notification-dropdown.hidden {
        display: none;
      }

      .notification-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-color, #e5e7eb);
        background: var(--bg-primary, #f9fafb);
      }

      .notification-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary, #333);
      }

      .mark-all-read-btn {
        background: none;
        border: none;
        color: var(--primary-color, #6366f1);
        font-size: 12px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background 0.2s;
      }

      .mark-all-read-btn:hover {
        background: var(--bg-hover, #f3f4f6);
      }

      .notification-list {
        max-height: 340px;
        overflow-y: auto;
      }

      .notification-item {
        display: flex;
        gap: 12px;
        padding: 12px 16px;
        cursor: pointer;
        transition: background 0.2s;
        border-bottom: 1px solid var(--border-color, #f3f4f6);
      }

      .notification-item:hover {
        background: var(--bg-hover, #f9fafb);
      }

      .notification-item.unread {
        background: var(--bg-unread, #eff6ff);
      }

      .notification-item.unread:hover {
        background: var(--bg-unread-hover, #dbeafe);
      }

      .notification-icon {
        font-size: 20px;
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-icon, #f3f4f6);
        border-radius: 50%;
      }

      .notification-content {
        flex: 1;
        min-width: 0;
      }

      .notification-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary, #333);
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .notification-message {
        font-size: 12px;
        color: var(--text-secondary, #666);
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .notification-time {
        font-size: 11px;
        color: var(--text-muted, #999);
      }

      .notification-empty {
        padding: 40px 16px;
        text-align: center;
        color: var(--text-muted, #999);
        font-size: 14px;
      }

      /* Dark mode support - using body.dark-mode class */
      body.dark-mode .notification-bell {
        color: #bbb;
      }
      body.dark-mode .notification-bell:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      body.dark-mode .notification-dropdown {
        background: #2a2a2a;
        border-color: #444;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
      }
      body.dark-mode .notification-header {
        background: #1a1a1a;
        border-color: #444;
      }
      body.dark-mode .notification-header h3 {
        color: #e0e0e0;
      }
      body.dark-mode .mark-all-read-btn {
        color: #4caf50;
      }
      body.dark-mode .mark-all-read-btn:hover {
        background: rgba(76, 175, 80, 0.1);
      }
      body.dark-mode .notification-item {
        border-color: #444;
      }
      body.dark-mode .notification-item:hover {
        background: #333;
      }
      body.dark-mode .notification-item.unread {
        background: #2c3b2d;
      }
      body.dark-mode .notification-item.unread:hover {
        background: #3a4a3b;
      }
      body.dark-mode .notification-title {
        color: #e0e0e0;
      }
      body.dark-mode .notification-message {
        color: #bbb;
      }
      body.dark-mode .notification-time {
        color: #999;
      }
      body.dark-mode .notification-icon {
        background: #333;
      }
      body.dark-mode .notification-empty {
        color: #999;
      }
    `;
    document.head.appendChild(styles);
  }
}

// Create and export singleton instance
const notificationManager = new NotificationManager();

// Auto-initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () =>
    notificationManager.init()
  );
} else {
  notificationManager.init();
}

export default notificationManager;
