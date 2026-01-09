// frontend/admin/js/admin-notifications.js
// Notification bell component for admin pages

const ADMIN_API_BASE =
  window.ADMIN_API_BASE ||
  window.API_BASE ||
  "https://study-group-backend-d8fc93ae1b7a.herokuapp.com";

class AdminNotificationManager {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.isOpen = false;
    this.container = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    // Wait for Firebase auth to be ready (admin pages use window.firebase pattern)
    if (typeof window.firebase !== "undefined" && window.firebase.auth) {
      window.firebase.onAuthStateChanged(async (user) => {
        if (user) {
          this.createBellIcon();
          await this.fetchNotifications();
          this.startPolling();
          this.initialized = true;
        }
      });
    } else {
      // Fallback: try after delay
      setTimeout(() => this.init(), 500);
    }
  }

  createBellIcon() {
    // Check if already exists
    if (document.getElementById("admin-notification-bell-container")) return;

    // Create notification bell container
    const bellContainer = document.createElement("div");
    bellContainer.id = "admin-notification-bell-container";
    bellContainer.innerHTML = `
      <button id="admin-notification-bell" class="admin-notification-bell" aria-label="Notifications">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        <span id="admin-notification-badge" class="admin-notification-badge hidden">0</span>
      </button>
      <div id="admin-notification-dropdown" class="admin-notification-dropdown hidden">
        <div class="admin-notification-header">
          <h3>Admin Notifications</h3>
          <button id="admin-mark-all-read" class="admin-mark-all-read-btn">Mark all read</button>
        </div>
        <div id="admin-notification-list" class="admin-notification-list">
          <div class="admin-notification-empty">No notifications</div>
        </div>
      </div>
    `;

    // Find the right place to insert - admin-top-nav at the end
    const topNav = document.querySelector(".admin-top-nav");
    if (topNav) {
      // Add bell to the right side of the top nav
      topNav.appendChild(bellContainer);
    } else {
      // Fallback: add to body as fixed element
      bellContainer.style.position = "fixed";
      bellContainer.style.top = "15px";
      bellContainer.style.right = "30px";
      bellContainer.style.zIndex = "9999";
      document.body.appendChild(bellContainer);
    }

    this.container = bellContainer;
    this.attachEventListeners();
    this.injectStyles();
  }

  attachEventListeners() {
    const bell = document.getElementById("admin-notification-bell");
    const dropdown = document.getElementById("admin-notification-dropdown");
    const markAllBtn = document.getElementById("admin-mark-all-read");

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
      if (this.container && !this.container.contains(e.target)) {
        this.isOpen = false;
        dropdown.classList.add("hidden");
      }
    });
  }

  async getAuthToken() {
    if (typeof window.firebase !== "undefined" && window.firebase.auth) {
      const user = window.firebase.auth.currentUser;
      if (!user) return null;
      return await user.getIdToken();
    }
    return null;
  }

  async fetchNotifications() {
    try {
      const token = await this.getAuthToken();
      if (!token) return;

      const response = await fetch(
        `${ADMIN_API_BASE}/api/notifications?limit=20`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch notifications");

      const data = await response.json();
      this.notifications = data.notifications || [];
      this.unreadCount = data.unreadCount || 0;

      this.updateUI();
    } catch (error) {
      console.error("[admin-notifications] Error fetching:", error);
    }
  }

  updateUI() {
    // Update badge
    const badge = document.getElementById("admin-notification-badge");
    if (badge) {
      if (this.unreadCount > 0) {
        badge.textContent = this.unreadCount > 99 ? "99+" : this.unreadCount;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }

    // Update list
    const list = document.getElementById("admin-notification-list");
    if (!list) return;

    if (this.notifications.length === 0) {
      list.innerHTML =
        '<div class="admin-notification-empty">No notifications</div>';
      return;
    }

    list.innerHTML = this.notifications
      .map((notif) => this.renderNotification(notif))
      .join("");

    // Attach click handlers
    list.querySelectorAll(".admin-notification-item").forEach((item) => {
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
      <div class="admin-notification-item ${unreadClass}" data-id="${
      notif.id
    }" data-link="${notif.link || ""}">
        <div class="admin-notification-icon">${icon}</div>
        <div class="admin-notification-content">
          <div class="admin-notification-title">${this.escapeHtml(
            notif.title
          )}</div>
          <div class="admin-notification-message">${this.escapeHtml(
            notif.message
          )}</div>
          <div class="admin-notification-time">${timeAgo}</div>
        </div>
      </div>
    `;
  }

  getIcon(type) {
    const icons = {
      "user-plus": "👤",
      "alert-triangle": "⚠️",
      admin_new_report: "🚨",
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

      await fetch(
        `${ADMIN_API_BASE}/api/notifications/${notificationId}/read`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Update local state
      const notif = this.notifications.find((n) => n.id === notificationId);
      if (notif) {
        notif.read = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.updateUI();
      }
    } catch (error) {
      console.error("[admin-notifications] Error marking as read:", error);
    }
  }

  async markAllAsRead() {
    try {
      const token = await this.getAuthToken();
      if (!token) return;

      await fetch(`${ADMIN_API_BASE}/api/notifications/read-all`, {
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
      console.error("[admin-notifications] Error marking all as read:", error);
    }
  }

  startPolling() {
    // Poll every 30 seconds for new notifications
    setInterval(() => {
      this.fetchNotifications();
    }, 30000);
  }

  injectStyles() {
    if (document.getElementById("admin-notification-styles")) return;

    const styles = document.createElement("style");
    styles.id = "admin-notification-styles";
    styles.textContent = `
      /* Position bell on the right side of top nav */
      .admin-top-nav {
        justify-content: flex-start;
      }
      
      #admin-notification-bell-container {
        position: relative;
        display: inline-flex;
        align-items: center;
        margin-left: auto;
      }

      .admin-notification-bell {
        background: none;
        border: none;
        cursor: pointer;
        padding: 8px;
        position: relative;
        color: var(--text-secondary, #64748b);
        border-radius: 8px;
        transition: background 0.3s, transform 0.2s, color 0.3s;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .admin-notification-bell:hover {
        background: var(--hover-bg, rgba(0, 0, 0, 0.05));
        color: var(--primary-color, #6366f1);
        transform: scale(1.05);
      }

      .admin-notification-bell svg {
        width: 20px;
        height: 20px;
      }

      .admin-notification-badge {
        position: absolute;
        top: 2px;
        right: 2px;
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

      .admin-notification-badge.hidden {
        display: none;
      }

      .admin-notification-dropdown {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        width: 360px;
        max-height: 450px;
        background: var(--card-bg, #fff);
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        overflow: hidden;
        border: 1px solid var(--border-color, #e2e8f0);
      }

      .admin-notification-dropdown.hidden {
        display: none;
      }

      .admin-notification-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 16px;
        border-bottom: 1px solid var(--border-color, #e2e8f0);
        background: var(--sidebar-bg, #f8fafc);
      }

      .admin-notification-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary, #1e293b);
      }

      .admin-mark-all-read-btn {
        background: none;
        border: none;
        color: var(--primary-color, #6366f1);
        font-size: 12px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background 0.2s;
      }

      .admin-mark-all-read-btn:hover {
        background: rgba(99, 102, 241, 0.1);
      }

      .admin-notification-list {
        max-height: 380px;
        overflow-y: auto;
      }

      .admin-notification-item {
        display: flex;
        gap: 12px;
        padding: 14px 16px;
        cursor: pointer;
        transition: background 0.2s;
        border-bottom: 1px solid var(--border-color, #e2e8f0);
      }

      .admin-notification-item:hover {
        background: var(--hover-bg, #f1f5f9);
      }

      .admin-notification-item.unread {
        background: rgba(99, 102, 241, 0.08);
        border-left: 3px solid var(--primary-color, #6366f1);
      }

      .admin-notification-item.unread:hover {
        background: rgba(99, 102, 241, 0.12);
      }

      .admin-notification-icon {
        font-size: 20px;
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--hover-bg, #f1f5f9);
        border-radius: 50%;
      }

      .admin-notification-content {
        flex: 1;
        min-width: 0;
      }

      .admin-notification-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary, #1e293b);
        margin-bottom: 3px;
      }

      .admin-notification-message {
        font-size: 12px;
        color: var(--text-secondary, #64748b);
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .admin-notification-time {
        font-size: 11px;
        color: var(--text-muted, #94a3b8);
      }

      .admin-notification-empty {
        padding: 40px 16px;
        text-align: center;
        color: var(--text-secondary, #64748b);
        font-size: 14px;
      }

      /* Scrollbar styling */
      .admin-notification-list::-webkit-scrollbar {
        width: 6px;
      }
      .admin-notification-list::-webkit-scrollbar-track {
        background: var(--sidebar-bg, #f8fafc);
      }
      .admin-notification-list::-webkit-scrollbar-thumb {
        background: var(--border-color, #cbd5e1);
        border-radius: 3px;
      }
    `;
    document.head.appendChild(styles);
  }
}

// Create singleton instance
const adminNotificationManager = new AdminNotificationManager();

// Auto-initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () =>
    adminNotificationManager.init()
  );
} else {
  adminNotificationManager.init();
}

// Export for use
window.adminNotificationManager = adminNotificationManager;
