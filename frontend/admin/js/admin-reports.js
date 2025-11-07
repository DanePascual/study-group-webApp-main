// frontend/admin/js/admin-reports.js
// Handles admin reports management with professional UX

let currentPage = 1;
let currentLimit = 10;
let currentStatus = "";
let currentSeverity = "";
let currentSearch = "";
let currentSort = "createdAt";
let currentSortDir = "desc";
let allReports = [];
let currentViewingReportId = null;
let activeCustomSelect = null;
let activeModalCustomSelect = null;

// ===== LISTEN: Wait for adminUser to be available =====
let adminUserReady = false;
window.addEventListener("adminUserReady", () => {
  adminUserReady = true;
  console.log("[admin-reports] ✅ adminUser is ready");
});

// ===== Initialize on page load =====
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[admin-reports] Initializing...");

  // Setup event listeners immediately
  setupEventListeners();

  // Wait for admin user to be set
  let attempts = 0;
  const checkAdminInterval = setInterval(() => {
    attempts++;
    if (window.adminUser) {
      clearInterval(checkAdminInterval);
      loadReports();
    } else if (attempts > 100) {
      clearInterval(checkAdminInterval);
      console.error("[admin-reports] Admin user not ready after 10 seconds");
    }
  }, 100);
});

// ===== Setup event listeners =====
function setupEventListeners() {
  console.log("[admin-reports] Setting up event listeners...");

  // Search input with debounce
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = e.target.value;
        currentPage = 1;
        loadReports();
      }, 300);
    });
  }

  // Pagination
  const prevBtn = document.getElementById("prevBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        loadReports();
        scrollToTop();
      }
    });
  }

  const nextBtn = document.getElementById("nextBtn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const totalPages = Math.ceil(allReports.length / currentLimit);
      if (currentPage < totalPages) {
        currentPage++;
        loadReports();
        scrollToTop();
      }
    });
  }

  console.log("[admin-reports] Event listeners setup complete");
}

// ===== MAIN PAGE CUSTOM SELECT FUNCTIONS =====
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
  if (type === "status") {
    currentStatus = value;
    document.getElementById("statusValue").textContent = label;
    document.getElementById("statusDropdown").classList.remove("active");
    document.getElementById("statusTrigger").classList.remove("active");
  } else if (type === "severity") {
    currentSeverity = value;
    document.getElementById("severityValue").textContent = label;
    document.getElementById("severityDropdown").classList.remove("active");
    document.getElementById("severityTrigger").classList.remove("active");
  }

  activeCustomSelect = null;
  currentPage = 1;
  loadReports();
}

// Close main page dropdowns when clicking outside
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

// ===== MODAL CUSTOM SELECT FUNCTIONS =====
function toggleModalCustomSelect(type) {
  const dropdown = document.getElementById(type + "Dropdown");
  const trigger = document.getElementById(type + "Trigger");

  // Close other dropdowns
  if (activeModalCustomSelect && activeModalCustomSelect !== type) {
    document
      .getElementById(activeModalCustomSelect + "Dropdown")
      ?.classList.remove("active");
    document
      .getElementById(activeModalCustomSelect + "Trigger")
      ?.classList.remove("active");
  }

  dropdown.classList.toggle("active");
  trigger.classList.toggle("active");
  activeModalCustomSelect = dropdown.classList.contains("active") ? type : null;
}

function selectModalCustomOption(type, value, label) {
  if (type === "modalStatus") {
    document.getElementById("newStatus").value = value;
    document.getElementById("modalStatusValue").textContent = label;
    document.getElementById("modalStatusDropdown").classList.remove("active");
    document.getElementById("modalStatusTrigger").classList.remove("active");
  }

  activeModalCustomSelect = null;
}

// Close modal dropdowns when clicking outside
document.addEventListener("click", (e) => {
  if (
    !e.target.closest(".custom-select-wrapper-modal") &&
    !e.target.closest(".modal")
  ) {
    document
      .querySelectorAll(".custom-select-dropdown-modal.active")
      .forEach((el) => {
        el.classList.remove("active");
      });
    document
      .querySelectorAll(".custom-select-trigger-modal.active")
      .forEach((el) => {
        el.classList.remove("active");
      });
    activeModalCustomSelect = null;
  }
});

// ===== Load reports =====
async function loadReports() {
  try {
    console.log("[admin-reports] Fetching reports...");
    const reportsList = document.getElementById("reportsList");
    const emptyState = document.getElementById("emptyState");

    // Show loading state
    reportsList.innerHTML = `
      <tr>
        <td colspan="6" class="loading">
          <div class="spinner"></div>
          <span>Loading reports...</span>
        </td>
      </tr>
    `;
    emptyState.style.display = "none";

    const params = new URLSearchParams({
      page: 1,
      limit: 1000, // Fetch all for client-side filtering
      status: currentStatus,
      severity: currentSeverity,
      search: currentSearch,
      sort: currentSort,
    });

    const response = await window.adminFetch(`/api/admin/reports?${params}`);
    console.log("[admin-reports] ✅ Reports fetched:", response);

    allReports = response.reports || [];
    displayReports();
    updatePaginationInfo();
  } catch (err) {
    console.error("[admin-reports] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to load reports: ${err.message}`);
    }
    document.getElementById("reportsList").innerHTML =
      '<tr><td colspan="6" class="error-message">Error loading reports. Please try again.</td></tr>';
  }
}

// ===== Display reports in table =====
function displayReports() {
  const tbody = document.getElementById("reportsList");
  const emptyState = document.getElementById("emptyState");
  const paginatedReports = getPaginatedReports();

  if (!paginatedReports || paginatedReports.length === 0) {
    tbody.innerHTML = "";
    emptyState.style.display = "flex";
    console.log("[admin-reports] No reports to display");
    return;
  }

  emptyState.style.display = "none";
  tbody.innerHTML = paginatedReports
    .map((report) => {
      const statusClass = `status-${report.status || "pending"}`;
      // Capitalize only first letter for severity
      const severityText = report.severity
        ? report.severity.charAt(0).toUpperCase() + report.severity.slice(1)
        : "Low";

      return `
        <tr data-report-id="${escapeHtml(report.id)}">
          <td>
            <span class="report-type">${escapeHtml(
              report.type || "Unknown"
            )}</span>
          </td>
          <td>
            <span class="user-email">${escapeHtml(
              report.reportedUserId || "N/A"
            )}</span>
          </td>
          <td>
            <span class="severity-badge">
              ${severityText}
            </span>
          </td>
          <td>
            <span class="status-badge ${statusClass}">
              ${capitalizeFirst(report.status || "pending")}
            </span>
          </td>
          <td>
            <span class="date-text">${window.formatDate(
              report.createdAt
            )}</span>
          </td>
          <td>
            <div class="action-buttons">
              <button
                class="action-link"
                onclick="window.viewReport('${escapeHtml(report.id)}')"
                title="View report details"
              >
                View
              </button>
              <button
                class="action-link"
                onclick="window.viewReportAndUpdate('${escapeHtml(report.id)}')"
                title="Update report status"
              >
                Update
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  console.log(
    `[admin-reports] Displayed ${paginatedReports.length} reports on page ${currentPage}`
  );
}

// ===== Get paginated reports =====
function getPaginatedReports() {
  const start = (currentPage - 1) * currentLimit;
  const end = start + currentLimit;
  return allReports.slice(start, end);
}

// ===== Update pagination info =====
function updatePaginationInfo() {
  const pageInfo = document.getElementById("pageInfo");
  const reportCount = document.getElementById("reportCount");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  const totalPages = Math.ceil(allReports.length / currentLimit);

  if (pageInfo) {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
  }

  if (reportCount) {
    const start =
      allReports.length === 0 ? 0 : (currentPage - 1) * currentLimit + 1;
    const end = Math.min(currentPage * currentLimit, allReports.length);
    reportCount.textContent = `(${start}-${end} of ${allReports.length} reports)`;
  }

  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
  }

  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
  }

  console.log(
    `[admin-reports] Pagination: Page ${currentPage}/${totalPages}, Total: ${allReports.length}`
  );
}

// ===== Clear all filters =====
function clearAllFilters() {
  document.getElementById("statusValue").textContent = "All Status";
  document.getElementById("severityValue").textContent = "All Severity";
  document.getElementById("searchInput").value = "";

  currentStatus = "";
  currentSeverity = "";
  currentSearch = "";
  currentPage = 1;

  loadReports();
  console.log("[admin-reports] All filters cleared");
}

// ===== Sort column =====
function sortColumn(column) {
  if (currentSort === column) {
    // Toggle sort direction
    currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
  } else {
    currentSort = column;
    currentSortDir = "desc";
  }

  // Sort all reports
  allReports.sort((a, b) => {
    let aVal = a[column];
    let bVal = b[column];

    // Handle different data types
    if (aVal === undefined || aVal === null) aVal = "";
    if (bVal === undefined || bVal === null) bVal = "";

    if (typeof aVal === "string") {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
      return currentSortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    } else {
      return currentSortDir === "asc" ? aVal - bVal : bVal - aVal;
    }
  });

  currentPage = 1;
  displayReports();
  updatePaginationInfo();

  console.log(`[admin-reports] Sorted by ${column} (${currentSortDir})`);
}

// ===== Change page size =====
function changePageSize() {
  const limitSelect = document.getElementById("limitSelect");
  currentLimit = parseInt(limitSelect.value);
  currentPage = 1;
  displayReports();
  updatePaginationInfo();
  console.log(`[admin-reports] Page size changed to ${currentLimit}`);
}

// ===== View report details =====
async function viewReport(reportId) {
  try {
    console.log(`[admin-reports] Viewing report ${reportId}...`);

    const report = allReports.find((r) => r.id === reportId);
    if (!report) {
      if (window.showError) {
        window.showError("Report not found");
      }
      return;
    }

    currentViewingReportId = reportId;

    // Populate modal
    document.getElementById("detailReportId").textContent = report.id;
    document.getElementById("detailType").textContent = capitalizeFirst(
      report.type || "Unknown"
    );
    document.getElementById(
      "detailSeverity"
    ).innerHTML = `<span class="severity-badge severity-${
      report.severity || "low"
    }">${capitalizeFirst(report.severity || "low")}</span>`;
    document.getElementById(
      "detailStatus"
    ).innerHTML = `<span class="status-badge status-${
      report.status || "pending"
    }">${capitalizeFirst(report.status || "pending")}</span>`;
    document.getElementById("detailCreatedAt").textContent =
      window.formatDateTime(report.createdAt);

    document.getElementById("detailReporterName").textContent =
      report.reporterName || "Unknown";
    document.getElementById("detailReporterEmail").textContent =
      report.reporterEmail || "N/A";
    document.getElementById("detailLocation").textContent =
      report.location || "N/A";
    document.getElementById("detailIncidentTime").textContent =
      report.incidentTime || "N/A";

    document.getElementById("detailReportedUser").textContent =
      report.reportedUserId || "N/A";
    document.getElementById("detailReason").textContent =
      report.reason || "No description provided";

    // Handle files
    const filesSection = document.getElementById("filesSection");
    const filesList = document.getElementById("filesList");

    if (report.files && report.files.length > 0) {
      filesSection.style.display = "block";
      filesList.innerHTML = report.files
        .map(
          (file) => `
        <div class="file-item">
          <span class="file-icon">📎</span>
          <a href="${escapeHtml(file.url)}" target="_blank" class="file-link">
            ${escapeHtml(file.name)}
          </a>
          <span class="file-size">(${formatFileSize(file.size)})</span>
        </div>
      `
        )
        .join("");
    } else {
      filesSection.style.display = "none";
    }

    // Open modal
    openModal("viewReportModal");
  } catch (err) {
    console.error("[admin-reports] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to load report details: ${err.message}`);
    }
  }
}

// ===== View report and open update modal =====
async function viewReportAndUpdate(reportId) {
  try {
    console.log(`[admin-reports] Viewing and updating report ${reportId}...`);

    const report = allReports.find((r) => r.id === reportId);
    if (!report) {
      if (window.showError) {
        window.showError("Report not found");
      }
      return;
    }

    currentViewingReportId = reportId;

    // Setup update modal directly without showing view modal
    document.getElementById(
      "currentStatusDisplay"
    ).innerHTML = `<span class="status-badge status-${
      report.status || "pending"
    }">${capitalizeFirst(report.status || "pending")}</span>`;

    // Reset form
    document.getElementById("newStatus").value = "";
    document.getElementById("modalStatusValue").textContent =
      "-- Select Status --";
    document.getElementById("updateReason").value = "";

    // Close any open dropdowns
    const dropdown = document.getElementById("modalStatusDropdown");
    const trigger = document.getElementById("modalStatusTrigger");
    if (dropdown) dropdown.classList.remove("active");
    if (trigger) trigger.classList.remove("active");
    activeModalCustomSelect = null;

    // Open update modal directly
    openModal("updateReportModal");
  } catch (err) {
    console.error("[admin-reports] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to update report: ${err.message}`);
    }
  }
}

// ===== Open update report modal =====
function openUpdateReportModal() {
  if (!currentViewingReportId) {
    if (window.showError) {
      window.showError("No report selected");
    }
    return;
  }

  const report = allReports.find((r) => r.id === currentViewingReportId);
  if (!report) {
    if (window.showError) {
      window.showError("Report not found");
    }
    return;
  }

  // Close view modal
  closeModal("viewReportModal");

  // Setup update modal
  document.getElementById(
    "currentStatusDisplay"
  ).innerHTML = `<span class="status-badge status-${
    report.status || "pending"
  }">${capitalizeFirst(report.status || "pending")}</span>`;

  // Reset form
  document.getElementById("newStatus").value = "";
  document.getElementById("modalStatusValue").textContent =
    "-- Select Status --";
  document.getElementById("updateReason").value = "";

  // Close any open dropdowns
  const dropdown = document.getElementById("modalStatusDropdown");
  const trigger = document.getElementById("modalStatusTrigger");
  if (dropdown) dropdown.classList.remove("active");
  if (trigger) trigger.classList.remove("active");
  activeModalCustomSelect = null;

  // Open update modal
  openModal("updateReportModal");
}

// ===== Confirm update report status =====
async function confirmUpdateReportStatus() {
  try {
    if (!currentViewingReportId) {
      if (window.showError) {
        window.showError("No report selected");
      }
      return;
    }

    const newStatus = document.getElementById("newStatus").value;
    const reason = document.getElementById("updateReason").value.trim();

    if (!newStatus) {
      if (window.showError) {
        window.showError("Please select a new status");
      }
      return;
    }

    console.log(
      `[admin-reports] Updating report ${currentViewingReportId} to ${newStatus}...`
    );

    const response = await window.adminFetch(
      `/api/admin/reports/${currentViewingReportId}/status`,
      {
        method: "PUT",
        body: JSON.stringify({
          status: newStatus,
          reason: reason || "No reason provided",
        }),
      }
    );

    console.log("[admin-reports] ✅ Report status updated:", response);

    // Update local report
    const report = allReports.find((r) => r.id === currentViewingReportId);
    if (report) {
      report.status = newStatus;
    }

    if (window.showSuccess) {
      window.showSuccess(
        `Report status updated to ${capitalizeFirst(newStatus)}`
      );
    }
    closeModal("updateReportModal");

    // Reload to show updated status
    setTimeout(() => {
      displayReports();
      updatePaginationInfo();
    }, 500);
  } catch (err) {
    console.error("[admin-reports] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to update report status: ${err.message}`);
    }
  }
}

// ===== Open modal =====
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    console.log(`[admin-reports] Opened modal: ${modalId}`);
  }
}

// ===== Close modal =====
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active");
    console.log(`[admin-reports] Closed modal: ${modalId}`);
  }
}

// ===== Close modal on outside click =====
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal")) {
    e.target.classList.remove("active");
  }
});

// ===== Escape key to close modal =====
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal.active").forEach((modal) => {
      modal.classList.remove("active");
    });
  }
});

// ===== Utility: Escape HTML =====
function escapeHtml(text) {
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

// ===== Utility: Capitalize first letter =====
function capitalizeFirst(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ===== Utility: Format file size =====
function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

// ===== Utility: Scroll to top =====
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ===== Make functions globally available =====
window.viewReport = viewReport;
window.viewReportAndUpdate = viewReportAndUpdate;
window.openUpdateReportModal = openUpdateReportModal;
window.confirmUpdateReportStatus = confirmUpdateReportStatus;
window.clearAllFilters = clearAllFilters;
window.sortColumn = sortColumn;
window.changePageSize = changePageSize;
window.toggleCustomSelect = toggleCustomSelect;
window.selectCustomOption = selectCustomOption;
window.toggleModalCustomSelect = toggleModalCustomSelect;
window.selectModalCustomOption = selectModalCustomOption;

console.log("[admin-reports] Module loaded ✅");
