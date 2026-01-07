// frontend/student/scripts/report.js
// MY REPORTS HISTORY PAGE
// This page displays the user's submitted reports history with filtering and details.
// Report submission is now handled contextually via the reportModal.js component.

import { auth } from "../../config/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { fetchJsonWithAuth } from "./apiClient.js";

let CURRENT_SESSION = null;
let allReports = [];
let filteredReports = [];

// ===== Helpers =====
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showNotification(message, type = "info") {
  const existing = document.querySelectorAll(".notification");
  existing.forEach((n) => n.remove());
  const n = document.createElement("div");
  n.className = `notification notification-${type}`;
  n.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${
      type === "success" ? "#4caf50" : type === "error" ? "#f44336" : "#2196f3"
    };
    color: white;
    padding: 12px 18px;
    border-radius: 8px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.12);
    z-index: 10000;
    max-width: 360px;
    font-size: 13px;
  `;
  n.textContent = message;
  document.body.appendChild(n);
  setTimeout(() => {
    n.style.opacity = "0";
    setTimeout(() => n.remove(), 400);
  }, 4000);
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function formatFullDate(dateStr) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function getStatusLabel(status) {
  const statusMap = {
    pending: "Pending Review",
    in_review: "In Review",
    resolved: "Resolved",
    dismissed: "Dismissed",
  };
  return statusMap[status] || "Pending Review";
}

function getStatusClass(status) {
  const classMap = {
    pending: "status-pending",
    in_review: "status-review",
    resolved: "status-resolved",
    dismissed: "status-dismissed",
  };
  return classMap[status] || "status-pending";
}

function getStatusIcon(status) {
  const iconMap = {
    pending: "bi-clock",
    in_review: "bi-search",
    resolved: "bi-check-circle",
    dismissed: "bi-x-circle",
  };
  return iconMap[status] || "bi-clock";
}

function getReportTypeLabel(type) {
  const typeMap = {
    harassment: "Harassment/Bullying",
    inappropriate: "Inappropriate Content",
    cheating: "Academic Dishonesty",
    spam: "Spam/Off-topic",
    privacy: "Privacy Violation",
    threat: "Threats/Violence",
    impersonation: "Impersonation",
    other: "Other Violation",
  };
  return typeMap[type] || type || "Unknown";
}

function getContextTypeLabel(contextType) {
  const contextMap = {
    study_room: "Study Room",
    topic: "Discussion Topic",
    post: "Discussion Post",
    comment: "Comment",
    user_profile: "User Profile",
    other: "Other",
  };
  return contextMap[contextType] || contextType || "—";
}

// ===== Update sidebar =====
function updateSidebarUserInfo() {
  try {
    const avatar = document.getElementById("sidebarAvatar");
    const name = document.getElementById("sidebarName");
    const course = document.getElementById("sidebarCourse");

    const currentName = name ? name.textContent.trim() : "";
    const nameIsDefault =
      !currentName || currentName === "" || currentName === "Loading...";

    if (name && nameIsDefault && CURRENT_SESSION?.user) {
      name.textContent = CURRENT_SESSION.user;
    }

    const currentCourse = course ? course.textContent.trim() : "";
    const courseIsDefault =
      !currentCourse || currentCourse === "" || currentCourse === "Loading...";
    if (course && courseIsDefault) {
      course.textContent = CURRENT_SESSION?.userProgram || "";
    }

    if (avatar && !avatar.querySelector("img")) {
      const currentAvatarText = avatar.textContent
        ? avatar.textContent.trim()
        : "";
      if (!currentAvatarText && CURRENT_SESSION?.userAvatar) {
        avatar.textContent = CURRENT_SESSION.userAvatar.toUpperCase();
      }
    }
  } catch (err) {
    console.warn("updateSidebarUserInfo failed:", err && err.message);
  }
}

// ===== Sync theme =====
function syncThemeUI() {
  try {
    const savedTheme = localStorage.getItem("theme") || "light";
    const themeToggle = document.getElementById("themeToggle");
    const body = document.body;
    if (!themeToggle || !body) return;
    if (savedTheme === "dark") {
      body.classList.add("dark-mode");
      themeToggle.innerHTML = '<i class="bi bi-sun"></i>';
    } else {
      body.classList.remove("dark-mode");
      themeToggle.innerHTML = '<i class="bi bi-moon"></i>';
    }
  } catch (err) {
    // non-fatal
  }
}

// ===== Fetch profile =====
async function fetchBackendProfile() {
  return fetchJsonWithAuth("/api/users/profile", { method: "GET" });
}

// ===== Fetch my reports =====
async function fetchMyReports() {
  try {
    const data = await fetchJsonWithAuth("/api/reports?mine=true", {
      method: "GET",
    });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("fetchMyReports: failed", err);
    return [];
  }
}

// ===== Render reports list =====
function renderReportsList() {
  const reportsList = document.getElementById("reportsList");
  const reportsEmpty = document.getElementById("reportsEmpty");

  if (!reportsList) return;

  if (!filteredReports || filteredReports.length === 0) {
    reportsList.innerHTML = "";
    if (reportsEmpty) reportsEmpty.style.display = "block";
    return;
  }

  if (reportsEmpty) reportsEmpty.style.display = "none";

  const html = filteredReports
    .map(
      (rep) => `
    <div class="report-card" data-report-id="${escapeHtml(
      rep.id || rep.reportId || ""
    )}">
      <div class="report-card-header">
        <div class="report-id">
          <i class="bi bi-flag"></i>
          Report #${escapeHtml(rep.id || rep.reportId || "—")}
        </div>
        <div class="report-status ${getStatusClass(rep.status)}">
          <i class="bi ${getStatusIcon(rep.status)}"></i>
          ${escapeHtml(getStatusLabel(rep.status))}
        </div>
      </div>
      <div class="report-card-body">
        <div class="report-info-row">
          <span class="report-label">Type:</span>
          <span class="report-value">${escapeHtml(
            getReportTypeLabel(rep.type)
          )}</span>
        </div>
        <div class="report-info-row">
          <span class="report-label">Reported User:</span>
          <span class="report-value">${escapeHtml(
            rep.reportedUser || rep.targetName || "—"
          )}</span>
        </div>
        <div class="report-info-row">
          <span class="report-label">Location:</span>
          <span class="report-value">${escapeHtml(
            rep.location || rep.contextName || "—"
          )}</span>
        </div>
        <div class="report-info-row">
          <span class="report-label">Submitted:</span>
          <span class="report-value">${escapeHtml(
            formatRelativeTime(rep.timestamp || rep.createdAt)
          )}</span>
        </div>
        ${
          rep.description
            ? `
        <div class="report-description">
          <span class="report-label">Description:</span>
          <p>${escapeHtml(rep.description).substring(0, 150)}${
                rep.description.length > 150 ? "..." : ""
              }</p>
        </div>
        `
            : ""
        }
      </div>
      <div class="report-card-footer">
        <button class="view-details-btn" data-report-id="${escapeHtml(
          rep.id || rep.reportId || ""
        )}">
          <i class="bi bi-eye"></i> View Details
        </button>
      </div>
    </div>
  `
    )
    .join("");

  reportsList.innerHTML = html;

  // Bind click events for view details
  reportsList.querySelectorAll(".view-details-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const reportId = btn.dataset.reportId;
      showReportDetail(reportId);
    });
  });
}

// ===== Update summary stats =====
function updateSummaryStats() {
  const totalEl = document.getElementById("totalReports");
  const pendingEl = document.getElementById("pendingReports");
  const resolvedEl = document.getElementById("resolvedReports");

  if (totalEl) totalEl.textContent = allReports.length;

  if (pendingEl) {
    const pendingCount = allReports.filter(
      (r) => r.status === "pending" || r.status === "in_review" || !r.status
    ).length;
    pendingEl.textContent = pendingCount;
  }

  if (resolvedEl) {
    const resolvedCount = allReports.filter(
      (r) => r.status === "resolved"
    ).length;
    resolvedEl.textContent = resolvedCount;
  }
}

// ===== Apply filters =====
function applyFilters() {
  const statusFilter = document.getElementById("statusFilter");
  const sortOrder = document.getElementById("sortOrder");

  const status = statusFilter ? statusFilter.value : "all";
  const sort = sortOrder ? sortOrder.value : "newest";

  // Filter by status
  if (status === "all") {
    filteredReports = [...allReports];
  } else {
    filteredReports = allReports.filter((r) => {
      if (status === "pending") return r.status === "pending" || !r.status;
      return r.status === status;
    });
  }

  // Sort
  filteredReports.sort((a, b) => {
    const dateA = new Date(a.timestamp || a.createdAt || 0);
    const dateB = new Date(b.timestamp || b.createdAt || 0);
    return sort === "newest" ? dateB - dateA : dateA - dateB;
  });

  renderReportsList();
}

// ===== Show report detail modal =====
function showReportDetail(reportId) {
  const report = allReports.find((r) => (r.id || r.reportId) === reportId);
  if (!report) return;

  const modal = document.getElementById("reportDetailModal");
  const content = document.getElementById("reportDetailContent");

  if (!modal || !content) return;

  const html = `
    <div class="detail-section">
      <div class="detail-status ${getStatusClass(report.status)}">
        <i class="bi ${getStatusIcon(report.status)}"></i>
        ${escapeHtml(getStatusLabel(report.status))}
      </div>
    </div>
    
    <div class="detail-section">
      <h4>Report Information</h4>
      <div class="detail-row">
        <span class="detail-label">Report ID:</span>
        <span class="detail-value">#${escapeHtml(
          report.id || report.reportId || "—"
        )}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Type:</span>
        <span class="detail-value">${escapeHtml(
          getReportTypeLabel(report.type)
        )}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Severity:</span>
        <span class="detail-value severity-${escapeHtml(
          report.severity || "low"
        )}">${escapeHtml((report.severity || "low").toUpperCase())}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Submitted:</span>
        <span class="detail-value">${escapeHtml(
          formatFullDate(report.timestamp || report.createdAt)
        )}</span>
      </div>
    </div>
    
    <div class="detail-section">
      <h4>Reported User</h4>
      <div class="detail-row">
        <span class="detail-label">Name:</span>
        <span class="detail-value">${escapeHtml(
          report.targetName || report.reportedUser || "—"
        )}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Email:</span>
        <span class="detail-value">${escapeHtml(
          report.targetEmail || report.reportedUser || "—"
        )}</span>
      </div>
    </div>
    
    <div class="detail-section">
      <h4>Context</h4>
      <div class="detail-row">
        <span class="detail-label">Location Type:</span>
        <span class="detail-value">${escapeHtml(
          getContextTypeLabel(report.contextType)
        )}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Location:</span>
        <span class="detail-value">${escapeHtml(
          report.location || report.contextName || "—"
        )}</span>
      </div>
      ${
        report.contentType
          ? `
      <div class="detail-row">
        <span class="detail-label">Content Type:</span>
        <span class="detail-value">${escapeHtml(report.contentType)}</span>
      </div>
      `
          : ""
      }
    </div>
    
    <div class="detail-section">
      <h4>Description</h4>
      <p class="detail-description">${escapeHtml(
        report.description || "No description provided."
      )}</p>
    </div>
    
    ${
      report.evidenceUrls && report.evidenceUrls.length > 0
        ? `
    <div class="detail-section">
      <h4>Evidence</h4>
      <div class="evidence-list">
        ${report.evidenceUrls
          .map(
            (url, i) => `
          <a href="${escapeHtml(url)}" target="_blank" class="evidence-link">
            <i class="bi bi-file-earmark"></i> Evidence ${i + 1}
          </a>
        `
          )
          .join("")}
      </div>
    </div>
    `
        : ""
    }
    
    ${
      report.adminNotes
        ? `
    <div class="detail-section">
      <h4>Admin Response</h4>
      <p class="admin-notes">${escapeHtml(report.adminNotes)}</p>
    </div>
    `
        : ""
    }
  `;

  content.innerHTML = html;
  modal.style.display = "flex";
}

window.closeReportDetailModal = function () {
  const modal = document.getElementById("reportDetailModal");
  if (modal) modal.style.display = "none";
};

// ===== Load and render reports =====
async function loadReports() {
  const reportsList = document.getElementById("reportsList");

  if (reportsList) {
    reportsList.innerHTML = `
      <div class="reports-loading">
        <i class="bi bi-arrow-repeat spin"></i>
        Loading your reports...
      </div>
    `;
  }

  allReports = await fetchMyReports();
  updateSummaryStats();
  applyFilters();
}

// ===== Auth state handler =====
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.classList.add("visible");

  try {
    const profile = await fetchBackendProfile();
    const userName = profile.name || user.displayName || user.email || "User";
    CURRENT_SESSION = {
      uid: user.uid,
      user: userName,
      userAvatar: userName ? userName[0] : user.email ? user.email[0] : "U",
      userProgram: profile.program || "",
      email: (profile.email || user.email || "").toLowerCase().trim(),
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila",
      datetime: new Date().toISOString(),
    };

    updateSidebarUserInfo();
    syncThemeUI();

    initializeReportsPage();
  } catch (err) {
    console.error("Auth/profile init error:", err);
    showNotification(
      "Could not initialize profile. Please sign in again.",
      "error"
    );
  } finally {
    if (overlay) overlay.classList.remove("visible");
  }
});

// ===== Initialize page =====
function initializeReportsPage() {
  function initUI() {
    // Bind filter change events
    const statusFilter = document.getElementById("statusFilter");
    const sortOrder = document.getElementById("sortOrder");

    if (statusFilter) {
      statusFilter.addEventListener("change", applyFilters);
    }
    if (sortOrder) {
      sortOrder.addEventListener("change", applyFilters);
    }

    // Close modal on overlay click
    const modal = document.getElementById("reportDetailModal");
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.style.display = "none";
        }
      });
    }

    // Load reports
    loadReports();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
  } else {
    initUI();
  }
}
