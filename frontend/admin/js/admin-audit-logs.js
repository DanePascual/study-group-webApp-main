// frontend/admin/js/admin-audit-logs.js
// Handles admin audit logs display

let currentPage = 1;
let currentLimit = 10;
let currentAction = "";
let currentDays = 30;
let currentSearch = "";
let allLogs = [];
let activeCustomSelect = null;
let userCache = {}; // Cache to store user data

// ===== LISTEN: Wait for adminUser to be available =====
let adminUserReady = false;
window.addEventListener("adminUserReady", () => {
  adminUserReady = true;
  console.log("[admin-audit-logs] ✅ adminUser is ready");
});

// ===== Initialize on page load =====
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[admin-audit-logs] Initializing...");

  // Setup event listeners immediately
  setupEventListeners();

  // Wait for admin user to be set
  let attempts = 0;
  const checkAdminInterval = setInterval(() => {
    attempts++;
    if (window.adminUser) {
      clearInterval(checkAdminInterval);
      loadAuditLogs();
    } else if (attempts > 50) {
      clearInterval(checkAdminInterval);
      console.error("[admin-audit-logs] Admin user not loaded");
    }
  }, 100);
});

// ===== Setup event listeners =====
function setupEventListeners() {
  console.log("[admin-audit-logs] Setting up event listeners...");

  // Search input with debounce
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = e.target.value;
        currentPage = 1;
        loadAuditLogs();
      }, 300);
    });
  }

  // Pagination
  const prevBtn = document.getElementById("prevBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        loadAuditLogs();
        scrollToTop();
      }
    });
  }

  const nextBtn = document.getElementById("nextBtn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const totalPages = Math.ceil(allLogs.length / currentLimit);
      if (currentPage < totalPages) {
        currentPage++;
        loadAuditLogs();
        scrollToTop();
      }
    });
  }

  console.log("[admin-audit-logs] Event listeners setup complete");
}

// ===== CUSTOM SELECT FUNCTIONS =====
function toggleCustomSelect(type) {
  const dropdown = document.getElementById(type + "Dropdown");
  const trigger = document.getElementById(type + "Trigger");

  // Close other dropdowns
  if (activeCustomSelect && activeCustomSelect !== type) {
    document
      .getElementById(activeCustomSelect + "Dropdown")
      ?.classList.remove("active");
    document
      .getElementById(activeCustomSelect + "Trigger")
      ?.classList.remove("active");
  }

  dropdown.classList.toggle("active");
  trigger.classList.toggle("active");
  activeCustomSelect = dropdown.classList.contains("active") ? type : null;
}

function selectCustomOption(type, value, label) {
  if (type === "action") {
    currentAction = value;
    document.getElementById("actionValue").textContent = label;
    document.getElementById("actionDropdown").classList.remove("active");
    document.getElementById("actionTrigger").classList.remove("active");
  } else if (type === "days") {
    currentDays = parseInt(value) || 30;
    document.getElementById("daysValue").textContent = label;
    document.getElementById("daysDropdown").classList.remove("active");
    document.getElementById("daysTrigger").classList.remove("active");
  }

  activeCustomSelect = null;
  currentPage = 1;
  loadAuditLogs();
}

// Close dropdowns when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".custom-select-wrapper")) {
    document
      .querySelectorAll(".custom-select-dropdown.active")
      .forEach((el) => {
        el.classList.remove("active");
      });
    document.querySelectorAll(".custom-select-trigger.active").forEach((el) => {
      el.classList.remove("active");
    });
    activeCustomSelect = null;
  }
});

// ===== Load audit logs =====
async function loadAuditLogs() {
  try {
    console.log("[admin-audit-logs] Fetching audit logs...");
    const logsList = document.getElementById("logsList");
    const emptyState = document.getElementById("emptyState");

    // Show loading state
    logsList.innerHTML = `
      <tr>
        <td colspan="6" class="loading">
          <div class="spinner"></div>
          <span>Loading audit logs...</span>
        </td>
      </tr>
    `;
    emptyState.style.display = "none";

    const params = new URLSearchParams({
      page: 1,
      limit: 1000, // Fetch all for client-side filtering
      action: currentAction,
      days: currentDays,
      search: currentSearch,
    });

    const response = await window.adminFetch(`/api/admin/audit-logs?${params}`);

    console.log("[admin-audit-logs] ✅ Audit logs fetched:", response);

    allLogs = response.logs || [];
    displayLogs();
    updatePaginationInfo();
  } catch (err) {
    console.error("[admin-audit-logs] Error:", err.message);
    window.showError(`Failed to load audit logs: ${err.message}`);
    document.getElementById("logsList").innerHTML =
      '<tr><td colspan="6" class="error-message">Error loading audit logs. Please try again.</td></tr>';
  }
}

// ===== Display logs in table =====
function displayLogs() {
  const tbody = document.getElementById("logsList");
  const emptyState = document.getElementById("emptyState");
  const paginatedLogs = getPaginatedLogs();

  if (!paginatedLogs || paginatedLogs.length === 0) {
    tbody.innerHTML = "";
    emptyState.style.display = "flex";
    console.log("[admin-audit-logs] No logs to display");
    return;
  }

  emptyState.style.display = "none";
  tbody.innerHTML = paginatedLogs
    .map((log) => {
      const actionLabel = formatActionLabel(log.action);
      // Get target display (report ID, user email, etc.)
      const targetDisplay =
        log.targetId ||
        log.targetReportId ||
        log.targetEmail ||
        log.targetName ||
        "N/A";

      return `
        <tr data-log-id="${escapeHtml(log.id)}">
          <td>
            <span class="admin-name">${escapeHtml(
              log.adminEmail || log.adminName || "Unknown"
            )}</span>
          </td>
          <td>
            <span class="action-text">${escapeHtml(actionLabel)}</span>
          </td>
          <td>
            <span class="target-text">${escapeHtml(targetDisplay)}</span>
          </td>
          <td>
            <span class="reason-text">${escapeHtml(
              log.reason || "N/A"
            ).substring(0, 40)}...</span>
          </td>
          <td>
            <span class="date-text">${window.formatDateTime(
              log.timestamp
            )}</span>
          </td>
          <td>
            <div class="action-buttons">
              <button
                class="action-link"
                onclick="window.viewLogDetails('${escapeHtml(log.id)}')"
                title="View log details"
              >
                View
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  console.log(
    `[admin-audit-logs] Displayed ${paginatedLogs.length} audit logs on page ${currentPage}`
  );
}

// ===== Get paginated logs =====
function getPaginatedLogs() {
  const start = (currentPage - 1) * currentLimit;
  const end = start + currentLimit;
  return allLogs.slice(start, end);
}

// ===== Update pagination info =====
function updatePaginationInfo() {
  const pageInfo = document.getElementById("pageInfo");
  const logCount = document.getElementById("logCount");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  const totalPages = Math.ceil(allLogs.length / currentLimit);

  if (pageInfo) {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
  }

  if (logCount) {
    const start =
      allLogs.length === 0 ? 0 : (currentPage - 1) * currentLimit + 1;
    const end = Math.min(currentPage * currentLimit, allLogs.length);
    logCount.textContent = `(${start}-${end} of ${allLogs.length} logs)`;
  }

  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
  }

  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
  }

  console.log(
    `[admin-audit-logs] Pagination: Page ${currentPage}/${totalPages}, Total: ${allLogs.length}`
  );
}

// ===== Clear all filters =====
function clearAllFilters() {
  document.getElementById("actionValue").textContent = "All Actions";
  document.getElementById("daysValue").textContent = "Last 30 Days";
  document.getElementById("searchInput").value = "";

  currentAction = "";
  currentDays = 30;
  currentSearch = "";
  currentPage = 1;

  loadAuditLogs();
  console.log("[admin-audit-logs] All filters cleared");
}

// ===== Change page size =====
function changePageSize() {
  const limitSelect = document.getElementById("limitSelect");
  currentLimit = parseInt(limitSelect.value);
  currentPage = 1;
  loadAuditLogs();
  console.log(`[admin-audit-logs] Page size changed to ${currentLimit}`);
}

// ===== Format changes to descriptive text =====
function formatChangesForDisplay(changes, action) {
  if (!changes) {
    // Handle ban/unban cases - just use the action name
    if (action === "ban_user") {
      return [
        {
          description: "Ban User",
        },
      ];
    } else if (action === "unban_user") {
      return [
        {
          description: "Unban User",
        },
      ];
    }
    return null;
  }

  // If changes is a string, try to parse it
  if (typeof changes === "string") {
    try {
      changes = JSON.parse(changes);
    } catch (e) {
      return null;
    }
  }

  // If it's not an object or array, return null
  if (typeof changes !== "object") {
    return null;
  }

  // Handle array of changes
  if (Array.isArray(changes)) {
    return changes
      .map((change) => formatSingleChange(change, action))
      .filter((item) => item !== null);
  }

  // Handle single change object
  return [formatSingleChange(changes, action)].filter((item) => item !== null);
}

// ===== Format a single change object =====
function formatSingleChange(change, action) {
  if (!change) return null;

  // Handle report status updates - "Update Report Status to [status]"
  if (change.field === "status" && action === "update_report_status") {
    const status = toString(change.to || change.new || "");
    if (status) {
      return {
        description: `Update Report Status to ${status}`,
      };
    }
  }

  // Handle other status changes
  if (change.field === "status") {
    const status = toString(change.to || change.new || "");
    if (status) {
      return {
        description: `Update Status to ${status}`,
      };
    }
  }

  return null;
}

// ===== Utility: Convert any value to string safely =====
function toString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "object") {
    if (value.toLocaleDateString) {
      return value.toLocaleDateString();
    }
    return JSON.stringify(value);
  }
  return String(value);
}

// ===== Render changes as HTML (Simple descriptive format) =====
function renderChangesHTML(changes, action) {
  const formattedChanges = formatChangesForDisplay(changes, action);

  if (!formattedChanges || formattedChanges.length === 0) {
    return '<p class="no-changes">No changes recorded</p>';
  }

  return formattedChanges
    .map(
      (change) => `
    <div class="change-item">
      ${escapeHtml(change.description)}
    </div>
  `
    )
    .join("");
}

// ===== View log details in modal =====
async function viewLogDetails(logId) {
  try {
    console.log(`[admin-audit-logs] Viewing log ${logId} details...`);

    const log = allLogs.find((l) => l.id === logId);
    if (!log) {
      window.showError("Log not found");
      return;
    }

    console.log("[admin-audit-logs] ✅ Log details:", log);

    const actionLabel = formatActionLabel(log.action);

    // Get the target display
    const targetDisplay =
      log.targetId ||
      log.targetReportId ||
      log.targetEmail ||
      log.targetName ||
      "N/A";

    // Get affected user name
    const affectedUserName = log.affectedUserName || log.targetName || "N/A";

    // Populate modal fields
    document.getElementById("detailAction").textContent =
      escapeHtml(actionLabel);
    document.getElementById("detailAdminName").textContent = escapeHtml(
      log.adminEmail || log.adminName || "Unknown"
    );
    document.getElementById("detailAffectedUserName").textContent =
      escapeHtml(affectedUserName);
    document.getElementById("detailStatus").textContent = escapeHtml(
      log.status || "Completed"
    );
    document.getElementById("detailTimestamp").textContent = escapeHtml(
      window.formatDateTime(log.timestamp)
    );
    document.getElementById("detailTarget").textContent =
      escapeHtml(targetDisplay);
    document.getElementById("detailReason").textContent = escapeHtml(
      log.reason || "No reason provided"
    );

    // Render user-friendly changes
    document.getElementById("detailChanges").innerHTML = renderChangesHTML(
      log.changes,
      log.action
    );

    // Open modal
    openModal("viewLogDetailsModal");
  } catch (err) {
    console.error("[admin-audit-logs] Error:", err.message);
    window.showError(`Failed to load log details: ${err.message}`);
  }
}

// ===== Modal functions =====
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    console.log(`[admin-audit-logs] Opened modal: ${modalId}`);
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active");
    console.log(`[admin-audit-logs] Closed modal: ${modalId}`);
  }
}

// Close modal when clicking outside
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal")) {
    e.target.classList.remove("active");
  }
});

// Close modal with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal.active").forEach((modal) => {
      modal.classList.remove("active");
    });
  }
});

// ===== Format action label =====
function formatActionLabel(action) {
  if (!action) return "Unknown";

  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ===== Utility: Escape HTML =====
function escapeHtml(text) {
  text = toString(text);

  if (!text) return "";

  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// ===== Utility: Scroll to top =====
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ===== Make functions globally available =====
window.viewLogDetails = viewLogDetails;
window.clearAllFilters = clearAllFilters;
window.changePageSize = changePageSize;
window.toggleCustomSelect = toggleCustomSelect;
window.selectCustomOption = selectCustomOption;

console.log("[admin-audit-logs] Module loaded ✅");
