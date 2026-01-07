// frontend/student/scripts/reportModal.js
// Reusable contextual report modal component
// Auto-captures: who (reported user/content), when (timestamp), context (location)
// User provides: report type, description, optional evidence

import { postFormWithAuth } from "./apiClient.js";

// Report types available
const REPORT_TYPES = [
  { value: "harassment", label: "Harassment/Bullying" },
  { value: "inappropriate", label: "Inappropriate Content" },
  { value: "cheating", label: "Academic Dishonesty/Cheating" },
  { value: "spam", label: "Spam/Off-topic Content" },
  { value: "privacy", label: "Privacy Violation" },
  { value: "threat", label: "Threats/Violence" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Other Violation" },
];

// Context types for "Where did it happen?"
const CONTEXT_TYPES = {
  study_room: "Study Room",
  topic: "Discussion Topic",
  post: "Discussion Post",
  comment: "Comment",
  user_profile: "User Profile",
  other: "Other",
};

let modalInstance = null;
let currentReportContext = null;

// ===== Notification helper =====
function showNotification(message, type = "info") {
  const existing = document.querySelectorAll(".report-notification");
  existing.forEach((n) => n.remove());
  const n = document.createElement("div");
  n.className = `report-notification report-notification-${type}`;
  n.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === "success" ? "#4caf50" : type === "error" ? "#f44336" : "#2196f3"};
    color: white;
    padding: 12px 18px;
    border-radius: 8px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.12);
    z-index: 10001;
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

// ===== Create modal HTML =====
function createReportModal() {
  if (document.getElementById("contextualReportModal")) {
    return document.getElementById("contextualReportModal");
  }

  const modal = document.createElement("div");
  modal.id = "contextualReportModal";
  modal.className = "report-modal-overlay";
  modal.innerHTML = `
    <div class="report-modal">
      <div class="report-modal-header">
        <h3><i class="bi bi-flag"></i> Report</h3>
        <button class="report-modal-close" id="reportModalClose" aria-label="Close">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <div class="report-modal-body">
        <!-- Auto-detected context info (read-only) -->
        <div class="report-context-info" id="reportContextInfo">
          <div class="context-item">
            <span class="context-label"><i class="bi bi-person"></i> Reporting:</span>
            <span class="context-value" id="reportTargetName">-</span>
          </div>
          <div class="context-item">
            <span class="context-label"><i class="bi bi-geo-alt"></i> Location:</span>
            <span class="context-value" id="reportLocation">-</span>
          </div>
          <div class="context-item">
            <span class="context-label"><i class="bi bi-clock"></i> Reported at:</span>
            <span class="context-value" id="reportTimestamp">-</span>
          </div>
        </div>

        <form id="contextualReportForm">
          <!-- Report Type -->
          <div class="report-form-group">
            <label for="reportTypeSelect">
              Report Type <span class="required">*</span>
            </label>
            <select id="reportTypeSelect" required>
              <option value="">Select Report Type</option>
              ${REPORT_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}
            </select>
          </div>

          <!-- Description -->
          <div class="report-form-group">
            <label for="reportDescription">
              Describe the issue <span class="required">*</span>
            </label>
            <textarea
              id="reportDescription"
              placeholder="Please describe what happened in detail..."
              rows="4"
              maxlength="1000"
              required
            ></textarea>
            <small class="char-counter"><span id="reportDescCharCount">0</span>/1000</small>
          </div>

          <!-- Evidence Upload (Optional) -->
          <div class="report-form-group">
            <label for="reportEvidence">
              Attach Evidence <span class="optional">(optional)</span>
            </label>
            <div class="report-upload-area" id="reportUploadArea">
              <i class="bi bi-cloud-upload"></i>
              <p>Drag files here or click to browse</p>
              <small>Max 5 files, 5MB each (images, PDF, text)</small>
              <input
                type="file"
                id="reportFileInput"
                multiple
                accept="image/jpeg,image/png,image/gif,application/pdf,text/plain"
                hidden
              />
            </div>
            <div class="report-uploaded-files" id="reportUploadedFiles"></div>
          </div>

          <!-- Submit -->
          <div class="report-form-actions">
            <button type="button" class="report-btn-cancel" id="reportCancelBtn">Cancel</button>
            <button type="submit" class="report-btn-submit" id="reportSubmitBtn">
              <i class="bi bi-send"></i> Submit Report
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  injectReportModalStyles();
  bindModalEvents(modal);
  return modal;
}

// ===== Inject modal styles =====
function injectReportModalStyles() {
  if (document.getElementById("reportModalStyles")) return;

  const styles = document.createElement("style");
  styles.id = "reportModalStyles";
  styles.textContent = `
    .report-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
    }
    .report-modal-overlay.active {
      display: flex;
    }
    .report-modal {
      background: var(--card-bg, #fff);
      border-radius: 12px;
      max-width: 500px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    }
    .report-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color, #e0e0e0);
    }
    .report-modal-header h3 {
      margin: 0;
      font-size: 18px;
      color: var(--dark-text, #1b1b1b);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .report-modal-header h3 i {
      color: var(--danger-color, #f44336);
    }
    .report-modal-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: var(--medium-text, #666);
      padding: 4px;
      border-radius: 4px;
      transition: background 0.2s;
    }
    .report-modal-close:hover {
      background: var(--hover-bg, #f0f0f0);
    }
    .report-modal-body {
      padding: 20px;
    }
    .report-context-info {
      background: var(--bg-secondary, #f8f9fa);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
    }
    .context-item {
      display: flex;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .context-item:last-child {
      margin-bottom: 0;
    }
    .context-label {
      color: var(--medium-text, #666);
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 100px;
    }
    .context-value {
      color: var(--dark-text, #1b1b1b);
      font-weight: 500;
    }
    .report-form-group {
      margin-bottom: 16px;
    }
    .report-form-group label {
      display: block;
      margin-bottom: 6px;
      font-size: 14px;
      font-weight: 500;
      color: var(--dark-text, #1b1b1b);
    }
    .report-form-group .required {
      color: var(--danger-color, #f44336);
    }
    .report-form-group .optional {
      color: var(--medium-text, #666);
      font-weight: normal;
    }
    .report-form-group select,
    .report-form-group textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border-color, #ddd);
      border-radius: 8px;
      font-size: 14px;
      background: var(--input-bg, #fff);
      color: var(--dark-text, #1b1b1b);
      transition: border-color 0.2s;
    }
    .report-form-group select:focus,
    .report-form-group textarea:focus {
      outline: none;
      border-color: var(--primary-color, #2e7d32);
    }
    .report-form-group textarea {
      resize: vertical;
      min-height: 100px;
    }
    .char-counter {
      display: block;
      text-align: right;
      font-size: 12px;
      color: var(--medium-text, #666);
      margin-top: 4px;
    }
    .report-upload-area {
      border: 2px dashed var(--border-color, #ddd);
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .report-upload-area:hover,
    .report-upload-area.dragover {
      border-color: var(--primary-color, #2e7d32);
      background: var(--primary-light, #f3fbf4);
    }
    .report-upload-area i {
      font-size: 32px;
      color: var(--primary-color, #2e7d32);
      margin-bottom: 8px;
    }
    .report-upload-area p {
      margin: 0 0 4px;
      font-size: 14px;
      color: var(--dark-text, #1b1b1b);
    }
    .report-upload-area small {
      color: var(--medium-text, #666);
    }
    .report-uploaded-files {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .report-file-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: var(--bg-secondary, #f8f9fa);
      border-radius: 6px;
      font-size: 13px;
    }
    .report-file-item .file-name {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--dark-text, #1b1b1b);
    }
    .report-file-item .file-remove {
      background: none;
      border: none;
      color: var(--danger-color, #f44336);
      cursor: pointer;
      padding: 4px;
    }
    .report-form-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color, #e0e0e0);
    }
    .report-btn-cancel {
      padding: 10px 20px;
      border: 1px solid var(--border-color, #ddd);
      background: var(--card-bg, #fff);
      color: var(--dark-text, #1b1b1b);
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }
    .report-btn-cancel:hover {
      background: var(--hover-bg, #f0f0f0);
    }
    .report-btn-submit {
      padding: 10px 24px;
      border: none;
      background: var(--danger-color, #f44336);
      color: white;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .report-btn-submit:hover:not(:disabled) {
      background: #d32f2f;
      transform: translateY(-1px);
    }
    .report-btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* 3-dot menu button for triggering reports */
    .report-menu-btn {
      background: none;
      border: none;
      padding: 4px 8px;
      cursor: pointer;
      color: var(--medium-text, #666);
      border-radius: 4px;
      transition: all 0.2s;
    }
    .report-menu-btn:hover {
      background: var(--hover-bg, #f0f0f0);
      color: var(--dark-text, #1b1b1b);
    }
    .report-dropdown {
      position: absolute;
      right: 0;
      top: 100%;
      background: var(--card-bg, #fff);
      border: 1px solid var(--border-color, #ddd);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      min-width: 150px;
      z-index: 100;
      display: none;
    }
    .report-dropdown.active {
      display: block;
    }
    .report-dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      cursor: pointer;
      font-size: 14px;
      color: var(--dark-text, #1b1b1b);
      transition: background 0.2s;
    }
    .report-dropdown-item:hover {
      background: var(--hover-bg, #f0f0f0);
    }
    .report-dropdown-item.danger {
      color: var(--danger-color, #f44336);
    }
    .report-dropdown-item.danger:hover {
      background: #ffebee;
    }

    /* Dark mode */
    body.dark-mode .report-modal {
      background: var(--card-bg, #1e1e1e);
    }
    body.dark-mode .report-modal-header {
      border-color: var(--border-color, #333);
    }
    body.dark-mode .report-modal-header h3 {
      color: var(--light-text, #fff);
    }
    body.dark-mode .report-context-info {
      background: var(--bg-secondary, #2a2a2a);
    }
    body.dark-mode .context-value {
      color: var(--light-text, #fff);
    }
    body.dark-mode .report-form-group label {
      color: var(--light-text, #fff);
    }
    body.dark-mode .report-form-group select,
    body.dark-mode .report-form-group textarea {
      background: var(--input-bg, #2a2a2a);
      border-color: var(--border-color, #444);
      color: var(--light-text, #fff);
    }
    body.dark-mode .report-upload-area {
      border-color: var(--border-color, #444);
    }
    body.dark-mode .report-file-item {
      background: var(--bg-secondary, #2a2a2a);
    }
    body.dark-mode .report-btn-cancel {
      background: var(--card-bg, #2a2a2a);
      border-color: var(--border-color, #444);
      color: var(--light-text, #fff);
    }
    body.dark-mode .report-form-actions {
      border-color: var(--border-color, #333);
    }
  `;
  document.head.appendChild(styles);
}

// ===== Bind modal events =====
function bindModalEvents(modal) {
  const closeBtn = modal.querySelector("#reportModalClose");
  const cancelBtn = modal.querySelector("#reportCancelBtn");
  const form = modal.querySelector("#contextualReportForm");
  const description = modal.querySelector("#reportDescription");
  const charCount = modal.querySelector("#reportDescCharCount");
  const uploadArea = modal.querySelector("#reportUploadArea");
  const fileInput = modal.querySelector("#reportFileInput");
  const uploadedFilesContainer = modal.querySelector("#reportUploadedFiles");

  let uploadedFiles = [];

  // Close handlers
  closeBtn.addEventListener("click", closeReportModal);
  cancelBtn.addEventListener("click", closeReportModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeReportModal();
  });

  // Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      closeReportModal();
    }
  });

  // Character counter
  description.addEventListener("input", () => {
    charCount.textContent = description.value.length;
  });

  // File upload
  uploadArea.addEventListener("click", () => fileInput.click());
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
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  function handleFiles(files) {
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
      "text/plain",
    ]);
    for (const file of files) {
      if (uploadedFiles.length >= 5) {
        showNotification("Maximum 5 files allowed.", "error");
        break;
      }
      if (file.size > 5 * 1024 * 1024) {
        showNotification(`File "${file.name}" is too large (max 5MB).`, "error");
        continue;
      }
      if (!allowed.has(file.type)) {
        showNotification(`File "${file.name}" has unsupported type.`, "error");
        continue;
      }
      uploadedFiles.push(file);
      renderUploadedFiles();
    }
  }

  function renderUploadedFiles() {
    uploadedFilesContainer.innerHTML = uploadedFiles
      .map(
        (f, i) => `
      <div class="report-file-item">
        <span class="file-name">
          <i class="bi bi-file-earmark"></i>
          ${escapeHtml(f.name)}
        </span>
        <button type="button" class="file-remove" data-index="${i}">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    `
      )
      .join("");

    uploadedFilesContainer.querySelectorAll(".file-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.index, 10);
        uploadedFiles.splice(idx, 1);
        renderUploadedFiles();
      });
    });
  }

  // Form submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitReport(uploadedFiles);
  });

  // Store reset function
  modal._resetForm = () => {
    form.reset();
    charCount.textContent = "0";
    uploadedFiles = [];
    uploadedFilesContainer.innerHTML = "";
  };
}

// ===== Submit report =====
async function submitReport(files) {
  const modal = document.getElementById("contextualReportModal");
  const submitBtn = modal.querySelector("#reportSubmitBtn");
  const typeSelect = modal.querySelector("#reportTypeSelect");
  const description = modal.querySelector("#reportDescription");

  if (!currentReportContext) {
    showNotification("Missing report context.", "error");
    return;
  }

  const type = typeSelect.value;
  const desc = description.value.trim();

  if (!type) {
    showNotification("Please select a report type.", "error");
    return;
  }
  if (!desc || desc.length < 10) {
    showNotification("Please provide a detailed description (at least 10 characters).", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Submitting...';

  try {
    const formData = new FormData();
    formData.append("type", type);
    formData.append("description", desc);
    formData.append("severity", "medium"); // Default severity

    // Auto-detected fields
    formData.append("reportedUser", currentReportContext.targetEmail || currentReportContext.targetId || "");
    formData.append("reportedUserId", currentReportContext.targetId || "");
    formData.append("reportedUserName", currentReportContext.targetName || "");
    formData.append("contextType", currentReportContext.contextType || "other");
    formData.append("contextId", currentReportContext.contextId || "");
    formData.append("contextName", currentReportContext.contextName || "");
    formData.append("location", formatLocation(currentReportContext));
    formData.append("incidentTime", currentReportContext.timestamp || new Date().toISOString());

    // Optional content reference (for posts/comments)
    if (currentReportContext.contentId) {
      formData.append("contentId", currentReportContext.contentId);
      formData.append("contentType", currentReportContext.contentType || "");
    }

    // Attach files
    for (const file of files) {
      formData.append("files", file);
    }

    const result = await postFormWithAuth("/api/reports", formData);

    if (result && (result.success || result.id)) {
      showNotification("Report submitted successfully. Thank you!", "success");
      closeReportModal();
    } else {
      throw new Error(result?.error || "Failed to submit report.");
    }
  } catch (err) {
    console.error("Report submission error:", err);
    showNotification(err.message || "Failed to submit report. Please try again.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="bi bi-send"></i> Submit Report';
  }
}

// ===== Format location string =====
function formatLocation(ctx) {
  const parts = [];
  if (ctx.contextType && CONTEXT_TYPES[ctx.contextType]) {
    parts.push(CONTEXT_TYPES[ctx.contextType]);
  }
  if (ctx.contextName) {
    parts.push(`"${ctx.contextName}"`);
  }
  return parts.join(": ") || "Unknown location";
}

// ===== Escape HTML =====
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===== Open report modal =====
export function openReportModal(context) {
  /*
   * context object:
   * {
   *   targetId: string,       // UID of reported user
   *   targetEmail: string,    // Email of reported user
   *   targetName: string,     // Display name of reported user
   *   contextType: string,    // "study_room" | "topic" | "post" | "comment" | "user_profile"
   *   contextId: string,      // ID of the room/topic/post where this happened
   *   contextName: string,    // Name of room/topic/post
   *   contentId?: string,     // Optional: specific content ID (e.g., message ID)
   *   contentType?: string,   // Optional: type of content
   *   timestamp?: string,     // Optional: when the incident occurred (auto-set if not provided)
   * }
   */
  currentReportContext = {
    ...context,
    timestamp: context.timestamp || new Date().toISOString(),
  };

  const modal = createReportModal();
  modal._resetForm();

  // Populate context info
  modal.querySelector("#reportTargetName").textContent =
    context.targetName || context.targetEmail || "Unknown user";
  modal.querySelector("#reportLocation").textContent = formatLocation(context);
  modal.querySelector("#reportTimestamp").textContent = new Date(
    currentReportContext.timestamp
  ).toLocaleString();

  modal.classList.add("active");
  document.body.style.overflow = "hidden";

  // Focus first input
  setTimeout(() => {
    modal.querySelector("#reportTypeSelect").focus();
  }, 100);
}

// ===== Close report modal =====
export function closeReportModal() {
  const modal = document.getElementById("contextualReportModal");
  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "";
    currentReportContext = null;
  }
}

// ===== Helper: Create a 3-dot menu button with report option =====
export function createReportMenuButton(context, additionalOptions = []) {
  /*
   * Returns a DOM element with a 3-dot button that shows a dropdown with "Report" option
   * context: same as openReportModal
   * additionalOptions: array of { label, icon, onClick, className } for extra menu items
   */
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.display = "inline-block";

  const btn = document.createElement("button");
  btn.className = "report-menu-btn";
  btn.innerHTML = '<i class="bi bi-three-dots-vertical"></i>';
  btn.title = "More options";
  btn.setAttribute("aria-label", "More options");

  const dropdown = document.createElement("div");
  dropdown.className = "report-dropdown";

  // Additional options first
  additionalOptions.forEach((opt) => {
    const item = document.createElement("div");
    item.className = `report-dropdown-item ${opt.className || ""}`;
    item.innerHTML = `<i class="bi ${opt.icon || "bi-circle"}"></i> ${escapeHtml(opt.label)}`;
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.remove("active");
      if (opt.onClick) opt.onClick();
    });
    dropdown.appendChild(item);
  });

  // Report option
  const reportItem = document.createElement("div");
  reportItem.className = "report-dropdown-item danger";
  reportItem.innerHTML = '<i class="bi bi-flag"></i> Report';
  reportItem.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.remove("active");
    openReportModal(context);
  });
  dropdown.appendChild(reportItem);

  // Toggle dropdown
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Close other dropdowns
    document.querySelectorAll(".report-dropdown.active").forEach((d) => {
      if (d !== dropdown) d.classList.remove("active");
    });
    dropdown.classList.toggle("active");
  });

  // Close on outside click
  document.addEventListener("click", () => {
    dropdown.classList.remove("active");
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(dropdown);
  return wrapper;
}

// Export for use in other modules
export { REPORT_TYPES, CONTEXT_TYPES };
