// frontend/student/scripts/report.js
// SECURITY HARDENED VERSION:
// - Fetches real users for suggestions (from backend)
// - Confirmation dialog before submitting report
// - Stronger self-report prevention (case-insensitive, normalized)
// - XSS prevention on all user inputs
// - Input sanitization for descriptions
// - Rate limit feedback to user
// - Security logging

import { auth } from "../../config/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { apiUrl } from "../../config/appConfig.js";
import { postFormWithAuth, fetchJsonWithAuth } from "./apiClient.js";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "text/plain",
]);

let CURRENT_SESSION = null;
let ALL_USERS = []; // ← Cache of all users for suggestions

// ===== SECURITY: Logging helper =====
function logSecurityEvent(eventType, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY] ${timestamp} | Event: ${eventType} | Details:`,
    details
  );
}

// ===== SECURITY: Sanitization helpers =====
function sanitizeString(str, maxLength = 255) {
  if (typeof str !== "string") return "";
  return str.trim().substring(0, maxLength);
}

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeEmail(email) {
  return (email || "").toLowerCase().trim();
}

// ===== Notification helper =====
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

// ===== Fetch all users for suggestions =====
async function fetchAllUsers() {
  try {
    const data = await fetchJsonWithAuth("/api/users/all", { method: "GET" });
    if (Array.isArray(data)) {
      ALL_USERS = data.map((u) => ({
        email: normalizeEmail(u.email || ""),
        name: sanitizeString(u.name || "", 100),
      }));
    }
  } catch (err) {
    console.warn("Could not fetch users list:", err && err.message);
    ALL_USERS = [];
  }
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
      email: normalizeEmail(profile.email || user.email),
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila",
      datetime: new Date().toISOString(),
    };

    updateSidebarUserInfo();
    syncThemeUI();

    // ===== Fetch users for suggestions =====
    await fetchAllUsers();

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

// ===== Main page init =====
function initializeReportPage() {
  function initReportUI() {
    const reportForm = document.getElementById("reportForm");
    const fileInput = document.getElementById("fileInput");
    const uploadArea = document.getElementById("uploadArea");
    const uploadBtn = document.getElementById("uploadBtn");
    const uploadedFilesContainer = document.getElementById("uploadedFiles");
    const description = document.getElementById("description");
    const charCount = document.getElementById("charCount");
    const reportedUser = document.getElementById("reportedUser");
    const userSuggestions = document.getElementById("userSuggestions");

    if (!reportForm) {
      console.warn("reportForm not found");
      return;
    }

    let uploadedFilesList = [];

    // ===== Character counter =====
    if (description && charCount) {
      description.addEventListener("input", function () {
        const count = this.value.length;
        charCount.textContent = count;
        if (count > 900) charCount.style.color = "var(--danger-color)";
        else if (count > 800) charCount.style.color = "var(--warning-color)";
        else charCount.style.color = "var(--medium-text)";
      });
    }

    // ===== File upload handlers =====
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }
    if (uploadArea && fileInput) {
      uploadArea.addEventListener("click", (e) => {
        if (!e.target.closest(".upload-btn")) fileInput.click();
      });
      uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadArea.classList.add("dragover");
      });
      uploadArea.addEventListener("dragleave", () =>
        uploadArea.classList.remove("dragover")
      );
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
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) {
          showNotification(
            `File "${file.name}" is too large. Maximum size is 5MB.`,
            "error"
          );
          continue;
        }
        if (!ALLOWED_MIME.has(file.type)) {
          showNotification(
            `File "${file.name}" has unsupported type.`,
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

    // ===== User suggestions (fetch real users) =====
    if (reportedUser && userSuggestions) {
      reportedUser.addEventListener("input", function () {
        const q = normalizeEmail(this.value).trim();
        if (q.length > 2) {
          const filtered = ALL_USERS.filter((u) => {
            const matches =
              u.email.includes(q) ||
              (u.name && u.name.toLowerCase().includes(q));
            const notSelf = u.email !== CURRENT_SESSION?.email;
            return matches && notSelf;
          });

          if (filtered.length) {
            userSuggestions.innerHTML = filtered
              .slice(0, 10) // Limit to 10 suggestions
              .map(
                (u) =>
                  `<div class="user-suggestion" data-email="${escapeHtml(
                    u.email
                  )}">${escapeHtml(u.email)} ${
                    u.name ? `<small>(${escapeHtml(u.name)})</small>` : ""
                  }</div>`
              )
              .join("");
            userSuggestions.style.display = "block";
            userSuggestions
              .querySelectorAll(".user-suggestion")
              .forEach((node) =>
                node.addEventListener("click", () => {
                  reportedUser.value = node.getAttribute("data-email");
                  userSuggestions.style.display = "none";
                })
              );
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

    // ===== Submit handler with confirmation =====
    reportForm.addEventListener("submit", async (e) => {
      e.preventDefault();

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
      const reportedUserValue = normalizeEmail(reportedUserEl.value);
      const locationValue = sanitizeString(locationEl.value, 300);
      const descriptionValue = sanitizeString(descriptionEl.value, 1000);
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

      // ===== SECURITY: Stronger self-report prevention =====
      if (
        CURRENT_SESSION &&
        normalizeEmail(CURRENT_SESSION.email) === reportedUserValue
      ) {
        logSecurityEvent("SELF_REPORT_ATTEMPT", {
          reporter: CURRENT_SESSION.email,
          reported: reportedUserValue,
        });
        showNotification(
          "You cannot report yourself. If you have a concern, please contact support.",
          "error"
        );
        return;
      }

      // ===== SECURITY: Confirmation dialog =====
      const confirmed = confirm(
        `Are you sure you want to report "${escapeHtml(
          reportedUserValue
        )}" for "${escapeHtml(
          reportType
        )}"?\n\nPlease ensure all information is accurate and complete.`
      );

      if (!confirmed) {
        logSecurityEvent("REPORT_CANCELLED_BY_USER", {});
        return;
      }

      const submitBtn = document.querySelector(".submit-btn");
      const originalText = submitBtn ? submitBtn.innerHTML : "";
      if (submitBtn) {
        submitBtn.innerHTML =
          '<i class="bi bi-arrow-clockwise spinning"></i> Submitting...';
        submitBtn.disabled = true;
      }

      try {
        const formData = new FormData();
        formData.append("type", reportType);
        formData.append("severity", severity);
        formData.append("reportedUser", reportedUserValue);
        formData.append("location", locationValue);
        if (incidentTimeValue)
          formData.append("incidentTime", incidentTimeValue);
        formData.append("description", descriptionValue);
        formData.append("anonymous", anonymousChecked ? "true" : "false");

        for (const f of uploadedFilesList) formData.append("files", f);

        const resp = await postFormWithAuth("/api/reports", formData, {
          timeoutMs: 60000,
        });

        const reportIdNode = document.getElementById("reportId");
        if (reportIdNode)
          reportIdNode.textContent = resp.id || resp.reportId || "—";
        const successModal = document.getElementById("successModal");
        if (successModal) successModal.style.display = "flex";

        resetFormInternal();
        showNotification(
          `Report ${resp.id || "submitted"} successfully!`,
          "success"
        );

        logSecurityEvent("REPORT_SUBMITTED_SUCCESS", {
          reportId: resp.id,
          reportedUser: reportedUserValue,
        });

        await fetchAndRenderMyReports();
      } catch (err) {
        console.error("Submit report error:", err);
        logSecurityEvent("REPORT_SUBMISSION_FAILED", {
          error: err && err.message ? err.message : "Unknown",
        });

        let message = "Failed to submit report.";
        if (err && err.body && (err.body.error || err.body.message)) {
          message = err.body.error || err.body.message;
        } else if (err && err.message) {
          message = err.message;
        }

        showNotification(message, "error");
      } finally {
        if (submitBtn) {
          submitBtn.innerHTML = originalText;
          submitBtn.disabled = false;
        }
      }
    });

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
                <div class="status-time">${formatRelativeTime(
                  rep.timestamp
                )} • ${
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

    // ===== Modal for all reports =====
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

    // ===== Reset form =====
    function resetFormInternal() {
      reportForm.reset();
      uploadedFilesList = [];
      if (uploadedFilesContainer) uploadedFilesContainer.innerHTML = "";
      if (charCount) {
        charCount.textContent = "0";
        charCount.style.color = "var(--medium-text)";
      }
      if (userSuggestions) userSuggestions.style.display = "none";
    }
    window.resetForm = resetFormInternal;

    window.closeSuccessModal = function () {
      const successModal = document.getElementById("successModal");
      if (successModal) successModal.style.display = "none";
    };

    // ===== Pre-populate incident time =====
    function setDefaultIncidentTime() {
      const incidentTimeField = document.getElementById("incidentTime");
      if (!incidentTimeField) return;
      const now = new Date();
      const defaultTime = new Date(now.getTime() - 60 * 60 * 1000);
      incidentTimeField.value = defaultTime.toISOString().slice(0, 16);
    }

    setDefaultIncidentTime();
    fetchAndRenderMyReports();

    window.ReportPage = {
      session: () => CURRENT_SESSION,
      submitReport: () => reportForm.dispatchEvent(new Event("submit")),
      resetForm: resetFormInternal,
      fetchMyReports,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReportUI);
  } else {
    initReportUI();
  }
}
