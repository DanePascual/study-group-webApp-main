// report.js — hardened & production-ready client logic for Report page
// - Uses backend /api/users/profile to get user info (no direct Firestore reads)
// - Sends Authorization Bearer token with report uploads and report fetches
// - Defensive DOM checks to avoid runtime errors when elements are missing
// - Uses API_BASE variable for backend host (change to production origin)
// - Does NOT include reporterId/reporterName in client payload (server should derive from token)
// - Keeps drag/drop, file size/count client-side checks but server MUST also validate

import { auth } from "../../config/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

const API_BASE = "http://localhost:5000"; // <-- set to production HTTPS origin in prod

let CURRENT_SESSION = null;

// Helper: show notification (keeps existing style but defensive)
function showNotification(message, type = "info") {
  const existingNotifications = document.querySelectorAll(".notification");
  existingNotifications.forEach((n) => n.remove());

  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
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
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => notification.remove(), 400);
  }, 4000);
}

// Defensive sidebar update: only set initials/name if sidebar still shows default/loading,
// and do not overwrite an existing <img> avatar set by centralized sidebar.js.
function updateSidebarUserInfo() {
  try {
    const avatar = document.getElementById("sidebarAvatar");
    const name = document.getElementById("sidebarName");
    const course = document.getElementById("sidebarCourse");

    const currentName = name ? name.textContent.trim() : "";
    const nameIsDefault =
      !currentName ||
      currentName === "" ||
      currentName === "Loading..." ||
      currentName === "Not signed in";

    if (name && nameIsDefault && CURRENT_SESSION?.user) {
      name.textContent = CURRENT_SESSION.user;
    }

    const currentCourse = course ? course.textContent.trim() : "";
    const courseIsDefault =
      !currentCourse || currentCourse === "" || currentCourse === "Loading...";
    if (course && courseIsDefault) {
      course.textContent = CURRENT_SESSION?.userProgram || "";
    }

    if (avatar) {
      const hasImg = avatar.querySelector && avatar.querySelector("img");
      if (!hasImg) {
        const currentAvatarText = avatar.textContent
          ? avatar.textContent.trim()
          : "";
        if (!currentAvatarText || currentAvatarText === "") {
          if (CURRENT_SESSION && CURRENT_SESSION.userAvatar) {
            avatar.textContent = CURRENT_SESSION.userAvatar.toUpperCase();
          }
        }
      }
    }
  } catch (err) {
    console.warn("updateSidebarUserInfo failed:", err && err.message);
  }
}

// Theme toggle (defensive)
function initializeTheme() {
  const themeToggle = document.getElementById("themeToggle");
  const body = document.body;
  if (!themeToggle || !body) return;
  const savedTheme = localStorage.getItem("theme") || "light";
  if (savedTheme === "dark") {
    body.classList.add("dark-mode");
    themeToggle.innerHTML = '<i class="bi bi-sun"></i>';
  } else {
    themeToggle.innerHTML = '<i class="bi bi-moon"></i>';
  }
  themeToggle.addEventListener("click", () => {
    body.classList.toggle("dark-mode");
    const isDark = body.classList.contains("dark-mode");
    themeToggle.innerHTML = isDark
      ? '<i class="bi bi-sun"></i>'
      : '<i class="bi bi-moon"></i>';
    localStorage.setItem("theme", isDark ? "dark" : "light");
    if (CURRENT_SESSION) {
      console.log(
        `🎨 Theme switched to ${isDark ? "dark" : "light"} by ${
          CURRENT_SESSION.user
        }`
      );
    }
  });
}

// Use backend to fetch profile (server uses Admin SDK)
async function fetchBackendProfile(idToken) {
  try {
    const resp = await fetch(`${API_BASE}/api/users/profile`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body.error || `Failed to fetch profile (${resp.status})`);
    }
    return await resp.json();
  } catch (err) {
    console.error("fetchBackendProfile error:", err);
    throw err;
  }
}

// Initialize after auth
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Not authenticated -> redirect to login
    window.location.href = "login.html";
    return;
  }

  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.classList.add("visible");

  try {
    const token = await user.getIdToken();
    // Get server-side profile (includes program and other fields)
    const profile = await fetchBackendProfile(token);

    const userName = profile.name || user.displayName || user.email || "User";
    CURRENT_SESSION = {
      uid: user.uid,
      user: userName,
      userAvatar: userName ? userName[0] : user.email ? user.email[0] : "U",
      userProgram: profile.program || "",
      email: profile.email || user.email,
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila",
      datetime: new Date().toISOString(),
    };

    // Defensive update so centralized sidebar.js can overwrite with authoritative photo/name if available
    updateSidebarUserInfo();
    initializeTheme();

    // Initialize page UI once the DOM is ready
    initializeReportPage();
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

// Main initialization for report page — DOM-related wiring is deferred inside this function.
function initializeReportPage() {
  function initReportUI() {
    // Elements (defensive checks)
    const reportForm = document.getElementById("reportForm");
    const fileInput = document.getElementById("fileInput");
    const uploadArea = document.getElementById("uploadArea");
    const uploadBtn = document.getElementById("uploadBtn");
    const uploadedFilesContainer = document.getElementById("uploadedFiles");
    const description = document.getElementById("description");
    const charCount = document.getElementById("charCount");
    const reportedUser = document.getElementById("reportedUser");
    const userSuggestions = document.getElementById("userSuggestions");
    const sidebar = document.getElementById("sidebar");
    const mainContent = document.getElementById("mainContent");
    const menuToggle = document.getElementById("menuToggle");

    if (!reportForm) {
      console.warn("reportForm not found on this page");
      return;
    }

    // Open sidebar on desktop if not already set (centralized sidebar.js will also manage state)
    try {
      const stored = localStorage.getItem("sidebarOpen");
      if (window.innerWidth > 768 && (!stored || stored === "true")) {
        if (sidebar && mainContent) {
          sidebar.classList.add("open");
          mainContent.classList.add("shifted");
        }
      } else if (stored === "true") {
        if (sidebar && mainContent) {
          sidebar.classList.add("open");
          mainContent.classList.add("shifted");
        }
      }
    } catch (e) {
      // ignore storage errors
    }

    // File handling state
    let uploadedFilesList = [];

    // Character counter
    if (description && charCount) {
      description.addEventListener("input", function () {
        const count = this.value.length;
        charCount.textContent = count;
        if (count > 900) charCount.style.color = "var(--danger-color)";
        else if (count > 800) charCount.style.color = "var(--warning-color)";
        else charCount.style.color = "var(--medium-text)";
      });
    }

    // Upload button wiring
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }
    if (uploadArea && fileInput) {
      uploadArea.addEventListener("click", (e) => {
        if (!e.target.closest(".upload-btn")) {
          fileInput.click();
        }
      });
      uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadArea.classList.add("dragover");
      });
      uploadArea.addEventListener("dragleave", () => {
        uploadArea.classList.remove("dragover");
      });
      uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadArea.classList.remove("dragover");
        handleFiles(e.dataTransfer.files);
      });
    }

    if (fileInput) {
      fileInput.addEventListener("change", (e) => handleFiles(e.target.files));
    }

    function handleFiles(files) {
      if (!files || !files.length) return;
      for (let file of files) {
        // client validation (server MUST also validate)
        if (file.size > 5 * 1024 * 1024) {
          showNotification(
            `File "${file.name}" is too large. Maximum size is 5MB.`,
            "error"
          );
          continue;
        }
        if (uploadedFilesList.length >= 5) {
          showNotification("Maximum 5 files allowed.", "error");
          break;
        }
        uploadedFilesList.push(file);
        displayUploadedFile(file);
      }
    }

    function displayUploadedFile(file) {
      if (!uploadedFilesContainer) return;
      const fileDiv = document.createElement("div");
      fileDiv.className = "uploaded-file";
      fileDiv.innerHTML = `
      <i class="bi bi-file-earmark" style="color: var(--primary-color);"></i>
      <div class="file-info">
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-size">${formatFileSize(file.size)}</div>
      </div>
      <button type="button" class="remove-file"><i class="bi bi-x"></i></button>
    `;
      const removeBtn = fileDiv.querySelector(".remove-file");
      removeBtn.addEventListener("click", () => {
        uploadedFilesList = uploadedFilesList.filter((f) => f !== file);
        fileDiv.remove();
      });
      uploadedFilesContainer.appendChild(fileDiv);
    }

    function formatFileSize(bytes) {
      if (bytes === 0) return "0 Bytes";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }

    function escapeHtml(str) {
      return String(str).replace(/[&<>"'`=\/]/g, function (s) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[s];
      });
    }

    // Simple user suggestion mock (keep or replace with backend search)
    if (reportedUser && userSuggestions) {
      reportedUser.addEventListener("input", function () {
        const query = this.value.trim();
        if (query.length > 2) {
          const mockUsers = [
            "john.doe@email.com",
            "jane.smith@email.com",
            "mike.wilson@email.com",
            "sarah.jones@email.com",
            "alex.brown@email.com",
            "emily.davis@email.com",
          ].filter(
            (user) =>
              user.toLowerCase().includes(query.toLowerCase()) &&
              !user
                .toLowerCase()
                .includes(CURRENT_SESSION?.user?.toLowerCase() || "")
          );
          if (mockUsers.length > 0) {
            userSuggestions.innerHTML = mockUsers
              .map((u) => `<div class="user-suggestion">${escapeHtml(u)}</div>`)
              .join("");
            userSuggestions.style.display = "block";
            userSuggestions
              .querySelectorAll(".user-suggestion")
              .forEach((node) => {
                node.addEventListener("click", () => {
                  reportedUser.value = node.textContent;
                  userSuggestions.style.display = "none";
                });
              });
          } else {
            userSuggestions.style.display = "none";
          }
        } else {
          userSuggestions.style.display = "none";
        }
      });
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".form-group"))
          userSuggestions.style.display = "none";
      });
    }

    // Submit handler (sends token, server derives reporter from token)
    reportForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Read UI values (defensive)
      const reportTypeEl = document.getElementById("reportType");
      const severityEl = document.getElementById("severity");
      const reportedUserEl = document.getElementById("reportedUser");
      const locationEl = document.getElementById("location");
      const descriptionEl = document.getElementById("description");
      const incidentTimeEl = document.getElementById("incidentTime");
      const anonymousEl = document.getElementById("anonymous");

      if (
        !reportTypeEl ||
        !severityEl ||
        !reportedUserEl ||
        !locationEl ||
        !descriptionEl
      ) {
        showNotification("Form elements missing, cannot submit.", "error");
        return;
      }

      const reportType = reportTypeEl.value.trim();
      const severity = severityEl.value.trim();
      const reportedUserValue = reportedUserEl.value.trim();
      const locationValue = locationEl.value.trim();
      const descriptionValue = descriptionEl.value.trim();
      const incidentTimeValue = incidentTimeEl
        ? incidentTimeEl.value || null
        : null;
      const anonymousChecked = anonymousEl ? anonymousEl.checked : false;

      if (
        !reportType ||
        !severity ||
        !reportedUserValue ||
        !locationValue ||
        !descriptionValue
      ) {
        showNotification("Please fill in all required fields.", "error");
        return;
      }

      // Prevent reporting yourself
      if (
        CURRENT_SESSION &&
        reportedUserValue
          .toLowerCase()
          .includes((CURRENT_SESSION.user || "").toLowerCase())
      ) {
        showNotification("You cannot report yourself.", "error");
        return;
      }

      // UI submit state
      const submitBtn = document.querySelector(".submit-btn");
      const originalText = submitBtn ? submitBtn.innerHTML : "";
      if (submitBtn) {
        submitBtn.innerHTML =
          '<i class="bi bi-arrow-clockwise spinning"></i> Submitting...';
        submitBtn.disabled = true;
      }

      try {
        const user = auth.currentUser;
        if (!user) throw new Error("Not authenticated");

        const token = await user.getIdToken();

        const formData = new FormData();
        formData.append("type", reportType);
        formData.append("severity", severity);
        formData.append("reportedUser", reportedUserValue);
        formData.append("location", locationValue);
        if (incidentTimeValue)
          formData.append("incidentTime", incidentTimeValue);
        formData.append("description", descriptionValue);
        formData.append("anonymous", anonymousChecked);

        // Append files (if any)
        for (const f of uploadedFilesList) formData.append("files", f);

        // POST to backend with Authorization header; server must derive reporterId from token
        const resp = await fetch(`${API_BASE}/api/reports`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            // DO NOT set Content-Type for FormData
          },
          body: formData,
        });

        if (!resp.ok) {
          // try parse server error JSON
          const errBody = await resp.json().catch(() => ({}));
          throw new Error(
            errBody.error || `Failed to submit report (${resp.status})`
          );
        }

        const data = await resp.json();
        const reportIdNode = document.getElementById("reportId");
        if (reportIdNode)
          reportIdNode.textContent = data.id || data.reportId || "—";
        const successModal = document.getElementById("successModal");
        if (successModal) successModal.style.display = "flex";

        // Reset client form UI
        resetForm();
        showNotification(
          `Report ${data.id || "submitted"} successfully!`,
          "success"
        );
        await fetchAndRenderMyReports();
      } catch (err) {
        console.error("Submit report error:", err);
        showNotification(`Failed to submit report: ${err.message}`, "error");
      } finally {
        if (submitBtn) {
          submitBtn.innerHTML = originalText;
          submitBtn.disabled = false;
        }
      }
    });

    // Fetch my reports (protected) - server should use token to identify user
    async function fetchMyReports() {
      try {
        const user = auth.currentUser;
        if (!user) return [];
        const token = await user.getIdToken();
        const resp = await fetch(`${API_BASE}/api/reports?mine=true`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          console.warn("fetchMyReports: server returned", resp.status);
          return [];
        }
        return await resp.json();
      } catch (err) {
        console.error("fetchMyReports error:", err);
        return [];
      }
    }

    // Render recent reports in sidebar
    function renderRecentReportsSidebar(reports) {
      const statusContainer = document.querySelector(".report-status");
      if (!statusContainer) return;
      let html = `<h3 class="section-title"><i class="bi bi-list-check"></i>Your Recent Reports</h3>`;
      if (!reports || reports.length === 0) {
        html += `<div style="text-align:center; color:var(--medium-text); padding:16px;">No reports found.</div>`;
      } else {
        reports.slice(0, 5).forEach((rep) => {
          html += `
          <div class="status-item">
            <div class="status-icon status-${escapeHtml(
              rep.status || "pending"
            )}">
              <i class="bi ${
                rep.status === "pending" ? "bi-clock" : "bi-check"
              }"></i>
            </div>
            <div class="status-content">
              <div class="status-title">Report #${escapeHtml(
                rep.id || rep.reportId || ""
              )}</div>
              <div class="status-time">${formatRelativeTime(rep.timestamp)} • ${
            rep.status === "pending" ? "Under review" : "Action taken"
          }</div>
            </div>
          </div>
        `;
        });
        html += `<div style="text-align:center; margin-top:15px"><a href="#" id="viewAllReportsLink" style="color: var(--primary-color); font-size: 13px; text-decoration: none;">View all reports →</a></div>`;
      }
      statusContainer.innerHTML = html;
      const viewAllLink = document.getElementById("viewAllReportsLink");
      if (viewAllLink) {
        viewAllLink.addEventListener("click", (e) => {
          e.preventDefault();
          showAllReportsModal();
        });
      }
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

    async function fetchAndRenderMyReports() {
      const reports = await fetchMyReports();
      renderRecentReportsSidebar(reports);
    }

    // Modal for all reports (reuses fetchMyReports)
    window.showAllReportsModal = async function () {
      const reports = await fetchMyReports();
      let html = "";
      if (!reports || reports.length === 0) {
        html =
          '<div style="text-align:center; color:var(--medium-text); padding:16px;">No reports found.</div>';
      } else {
        html = reports
          .map(
            (rep) => `
        <div class="status-item" style="margin-bottom:8px;">
          <div class="status-icon status-${escapeHtml(
            rep.status || "pending"
          )}">
            <i class="bi ${
              rep.status === "pending" ? "bi-clock" : "bi-check"
            }"></i>
          </div>
          <div class="status-content">
            <div class="status-title">Report #${escapeHtml(
              rep.id || rep.reportId || ""
            )}</div>
            <div class="status-time">${formatRelativeTime(rep.timestamp)} • ${
              rep.status === "pending" ? "Under review" : "Action taken"
            }</div>
            <div style="font-size:12px;color:var(--medium-text);margin-top:4px;"><b>Type:</b> ${escapeHtml(
              rep.type || ""
            )} &nbsp; | &nbsp; <b>Severity:</b> ${escapeHtml(
              rep.severity || ""
            )}</div>
            <div style="font-size:12px;color:var(--medium-text);margin-top:2px;"><b>Reported User:</b> ${escapeHtml(
              rep.reportedUser || ""
            )}</div>
            <div style="font-size:12px;color:var(--medium-text);margin-top:2px;"><b>Location:</b> ${escapeHtml(
              rep.location || ""
            )}</div>
            <div style="font-size:12px;color:var(--medium-text);margin-top:2px;"><b>Submitted:</b> ${
              rep.timestamp ? new Date(rep.timestamp).toLocaleString() : ""
            }</div>
          </div>
        </div>
      `
          )
          .join("");
      }
      const allReportsList = document.getElementById("allReportsList");
      if (allReportsList) allReportsList.innerHTML = html;
      const allReportsModal = document.getElementById("allReportsModal");
      if (allReportsModal) allReportsModal.style.display = "flex";
    };

    window.closeAllReportsModal = function () {
      const allReportsModal = document.getElementById("allReportsModal");
      if (allReportsModal) allReportsModal.style.display = "none";
    };

    // Reset form util
    window.resetForm = function () {
      reportForm.reset();
      uploadedFilesList = [];
      if (uploadedFilesContainer) uploadedFilesContainer.innerHTML = "";
      if (charCount) {
        charCount.textContent = "0";
        charCount.style.color = "var(--medium-text)";
      }
      if (userSuggestions) userSuggestions.style.display = "none";
    };

    window.closeSuccessModal = function () {
      const successModal = document.getElementById("successModal");
      if (successModal) successModal.style.display = "none";
    };

    // Navigation helper
    window.goToProfile = function () {
      window.location.href = "profile.html";
    };

    // Session validation helper
    function validateUserSession() {
      try {
        if (CURRENT_SESSION) {
          localStorage.setItem("currentUser", CURRENT_SESSION.user);
          localStorage.setItem(
            "currentSession",
            JSON.stringify(CURRENT_SESSION)
          );
          console.log(`✅ User session validated for ${CURRENT_SESSION.user}`);
        }
      } catch (err) {
        console.warn("validateUserSession error:", err);
      }
    }

    // Pre-populate incident time
    function setDefaultIncidentTime() {
      const incidentTimeField = document.getElementById("incidentTime");
      if (!incidentTimeField) return;
      const now = new Date();
      const defaultTime = new Date(now.getTime() - 60 * 60 * 1000);
      incidentTimeField.value = defaultTime.toISOString().slice(0, 16);
    }

    // Initialization tasks (DOM-ready)
    validateUserSession();
    setDefaultIncidentTime();
    fetchAndRenderMyReports();

    // expose for debugging
    window.ReportPage = {
      session: () => CURRENT_SESSION,
      submitReport: () => reportForm.dispatchEvent(new Event("submit")),
      resetForm,
      fetchMyReports,
    };
  } // end initReportUI

  // Run initReportUI after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReportUI);
  } else {
    initReportUI();
  }
}
