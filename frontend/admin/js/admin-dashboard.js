// frontend/admin/js/admin-dashboard.js
// Handles admin dashboard data and display

let currentPage = 1;

// ===== LISTEN: Wait for adminUser to be available =====
let adminUserReady = false;
window.addEventListener("adminUserReady", () => {
  adminUserReady = true;
  console.log("[admin-dashboard] ✅ adminUser is ready");
});

// ===== Initialize on page load =====
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[admin-dashboard] Initializing...");

  // Wait for admin user to be set
  const checkAdminInterval = setInterval(() => {
    if (window.adminUser) {
      clearInterval(checkAdminInterval);
      loadDashboardData();
    }
  }, 100);

  // Refresh data every 30 seconds
  setInterval(loadDashboardData, 30000);
});

// ===== Load dashboard data =====
async function loadDashboardData() {
  try {
    console.log("[admin-dashboard] Fetching dashboard data...");

    const response = await window.adminFetch("/api/admin/dashboard");

    console.log("[admin-dashboard] Data fetched:", response);

    // Update stats
    document.getElementById("totalUsers").textContent =
      response.stats.totalUsers || "0";
    document.getElementById("totalBanned").textContent =
      response.stats.totalBanned || "0";
    document.getElementById("totalReports").textContent =
      response.stats.totalReports || "0";
    document.getElementById("pendingReports").textContent =
      response.stats.pendingReports || "0";
    document.getElementById("totalAdmins").textContent =
      response.stats.totalAdmins || "0";

    // ✅ UPDATED: Changed from activeUsers to totalRooms
    document.getElementById("totalRooms").textContent =
      response.stats.totalRooms || "0";

    // Update recent actions
    displayRecentActions(response.recentActions || []);

    console.log("[admin-dashboard] Dashboard updated");
  } catch (err) {
    console.error("[admin-dashboard] Error:", err.message);
    window.showError(`Failed to load dashboard: ${err.message}`);
  }
}

// ===== Display recent actions =====
function displayRecentActions(actions) {
  const container = document.getElementById("recentActionsList");

  if (!actions || actions.length === 0) {
    container.innerHTML =
      '<tr><td colspan="5" class="loading">No recent actions yet</td></tr>';
    return;
  }

  container.innerHTML = actions
    .map((action) => {
      // Format action name
      const actionLabel = formatActionName(action.action);

      // Format timestamps
      const fullTimestamp = window.formatDateTime(action.timestamp);
      const timeAgo = window.formatTimeAgo(action.timestamp);

      // Get badge color for action type
      const actionBadgeClass = getActionBadgeClass(action.action);

      return `
        <tr>
          <td>
            <span class="action-badge ${actionBadgeClass}">
              ${actionLabel}
            </span>
          </td>
          <td>${action.adminName || "Unknown"}</td>
          <td>${action.targetName || "Unknown"}</td>
          <td>
            <span class="timestamp-full" title="${fullTimestamp}">
              ${fullTimestamp}
            </span>
          </td>
          <td>
            <span class="timestamp-ago">${timeAgo}</span>
          </td>
        </tr>
      `;
    })
    .join("");

  console.log(`[admin-dashboard] Displayed ${actions.length} recent actions`);
}

// ===== Format action name =====
function formatActionName(action) {
  return action
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ===== Get action badge class =====
function getActionBadgeClass(action) {
  const actionLower = action.toLowerCase();

  if (actionLower.includes("ban")) {
    return "badge-danger";
  } else if (actionLower.includes("unban")) {
    return "badge-success";
  } else if (actionLower.includes("promote")) {
    return "badge-primary";
  } else if (actionLower.includes("remove")) {
    return "badge-warning";
  } else if (actionLower.includes("report")) {
    return "badge-info";
  }

  return "badge-default";
}

console.log("[admin-dashboard] Module loaded ✅");
