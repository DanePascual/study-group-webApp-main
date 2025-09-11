// Current Session Info - 2025-07-05 12:39:59 UTC
const CURRENT_SESSION = {
  datetime: "2025-07-05 12:39:59",
  user: "DanePascual",
  userAvatar: "DP",
  userProgram: "BSIT",
};

// Theme management (same as dashboard)
const themeToggle = document.getElementById("themeToggle");
const body = document.body;

// Load saved theme
const savedTheme = localStorage.getItem("theme") || "light";
if (savedTheme === "dark") {
  body.classList.add("dark-mode");
  themeToggle.innerHTML = '<i class="bi bi-sun"></i>';
}

themeToggle.addEventListener("click", () => {
  body.classList.toggle("dark-mode");
  const isDark = body.classList.contains("dark-mode");
  themeToggle.innerHTML = isDark
    ? '<i class="bi bi-sun"></i>'
    : '<i class="bi bi-moon"></i>';
  localStorage.setItem("theme", isDark ? "dark" : "light");

  // Log theme change with current session
  console.log(
    `🎨 Theme switched to ${isDark ? "dark" : "light"} mode by ${
      CURRENT_SESSION.user
    } at ${CURRENT_SESSION.datetime} UTC`
  );
});

// Sidebar functionality (same as dashboard)
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const mainContent = document.getElementById("mainContent");

menuToggle.addEventListener("click", function () {
  sidebar.classList.toggle("open");
  mainContent.classList.toggle("shifted");

  // Save sidebar state
  localStorage.setItem("sidebarOpen", sidebar.classList.contains("open"));
});

// Load saved sidebar state - set to open by default
document.addEventListener("DOMContentLoaded", () => {
  // Always open sidebar by default
  sidebar.classList.add("open");
  mainContent.classList.add("shifted");
  localStorage.setItem("sidebarOpen", "true");
});

// Close sidebar when clicking outside on mobile
document.addEventListener("click", function (event) {
  if (window.innerWidth <= 768) {
    if (
      !sidebar.contains(event.target) &&
      !menuToggle.contains(event.target) &&
      sidebar.classList.contains("open")
    ) {
      sidebar.classList.remove("open");
      mainContent.classList.remove("shifted");
    }
  }
});

// Report Form Functionality
const reportForm = document.getElementById("reportForm");
const fileInput = document.getElementById("fileInput");
const uploadArea = document.getElementById("uploadArea");
const uploadBtn = document.getElementById("uploadBtn");
const uploadedFiles = document.getElementById("uploadedFiles");
const description = document.getElementById("description");
const charCount = document.getElementById("charCount");

let uploadedFilesList = [];

// Character counter
description.addEventListener("input", function () {
  const count = this.value.length;
  charCount.textContent = count;

  if (count > 900) {
    charCount.style.color = "var(--danger-color)";
  } else if (count > 800) {
    charCount.style.color = "var(--warning-color)";
  } else {
    charCount.style.color = "var(--medium-text)";
  }
});

// File upload functionality - FIX FOR DOUBLE CLICK ISSUE
uploadBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // Prevent event from bubbling up to uploadArea
  fileInput.click();
});

uploadArea.addEventListener("click", (e) => {
  // Only trigger fileInput.click() if the click wasn't on the upload button
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
  const files = e.dataTransfer.files;
  handleFiles(files);
});

fileInput.addEventListener("change", (e) => {
  handleFiles(e.target.files);
});

function handleFiles(files) {
  for (let file of files) {
    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit
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
  const fileDiv = document.createElement("div");
  fileDiv.className = "uploaded-file";
  fileDiv.innerHTML = `
          <i class="bi bi-file-earmark" style="color: var(--primary-color);"></i>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-size">${formatFileSize(file.size)}</div>
          </div>
          <button type="button" class="remove-file" onclick="removeFile('${
            file.name
          }', this)">
            <i class="bi bi-x"></i>
          </button>
        `;
  uploadedFiles.appendChild(fileDiv);
}

function removeFile(fileName, button) {
  uploadedFilesList = uploadedFilesList.filter(
    (file) => file.name !== fileName
  );
  button.closest(".uploaded-file").remove();
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// User search suggestions
const reportedUser = document.getElementById("reportedUser");
const userSuggestions = document.getElementById("userSuggestions");

reportedUser.addEventListener("input", function () {
  const query = this.value.trim();
  if (query.length > 2) {
    // Mock user suggestions (excluding current user DanePascual)
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
        !user.toLowerCase().includes("danepascual")
    );

    if (mockUsers.length > 0) {
      userSuggestions.innerHTML = mockUsers
        .map(
          (user) =>
            `<div class="user-suggestion" onclick="selectUser('${user}')">${user}</div>`
        )
        .join("");
      userSuggestions.style.display = "block";
    } else {
      userSuggestions.style.display = "none";
    }
  } else {
    userSuggestions.style.display = "none";
  }
});

function selectUser(user) {
  reportedUser.value = user;
  userSuggestions.style.display = "none";
}

// Hide suggestions when clicking outside
document.addEventListener("click", function (e) {
  if (!e.target.closest(".form-group")) {
    userSuggestions.style.display = "none";
  }
});

// Form submission
reportForm.addEventListener("submit", function (e) {
  e.preventDefault();

  // Validate form
  const reportType = document.getElementById("reportType").value;
  const severity = document.getElementById("severity").value;
  const reportedUserValue = document
    .getElementById("reportedUser")
    .value.trim();
  const location = document.getElementById("location").value.trim();
  const descriptionValue = document.getElementById("description").value.trim();

  if (
    !reportType ||
    !severity ||
    !reportedUserValue ||
    !location ||
    !descriptionValue
  ) {
    showNotification("Please fill in all required fields.", "error");
    return;
  }

  // Prevent self-reporting
  if (
    reportedUserValue.toLowerCase().includes("danepascual") ||
    reportedUserValue.toLowerCase().includes("dane.pascual")
  ) {
    showNotification("You cannot report yourself.", "error");
    return;
  }

  // Show loading state
  const submitBtn = document.querySelector(".submit-btn");
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML =
    '<i class="bi bi-arrow-clockwise spinning"></i> Submitting...';
  submitBtn.disabled = true;

  // Simulate API call
  setTimeout(() => {
    // Generate report ID based on current timestamp
    const now = new Date();
    const reportId =
      "RPT" +
      now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0");

    // Store report data
    const reportData = {
      id: reportId,
      type: reportType,
      severity: severity,
      reportedUser: reportedUserValue,
      location: location,
      description: descriptionValue,
      incidentTime: document.getElementById("incidentTime").value || null,
      anonymous: document.getElementById("anonymous").checked,
      files: uploadedFilesList.map((f) => ({
        name: f.name,
        size: f.size,
      })),
      timestamp: CURRENT_SESSION.datetime,
      reporter: CURRENT_SESSION.user,
      status: "pending",
      sessionInfo: CURRENT_SESSION,
    };

    // Save to localStorage for tracking
    const existingReports = JSON.parse(
      localStorage.getItem("userReports") || "[]"
    );
    existingReports.unshift(reportData);
    localStorage.setItem(
      "userReports",
      JSON.stringify(existingReports.slice(0, 10))
    ); // Keep last 10

    console.log(`📋 Report submitted by ${CURRENT_SESSION.user}:`, reportData);

    // Show success
    document.getElementById("reportId").textContent = reportId;
    document.getElementById("successModal").style.display = "flex";

    // Reset form
    resetForm();

    // Reset button
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;

    showNotification(`Report ${reportId} submitted successfully!`, "success");

    // Log successful submission
    console.log(
      `✅ Report ${reportId} successfully submitted by ${CURRENT_SESSION.user} at ${CURRENT_SESSION.datetime} UTC`
    );
  }, 2000);
});

// Reset form
function resetForm() {
  reportForm.reset();
  uploadedFilesList = [];
  uploadedFiles.innerHTML = "";
  charCount.textContent = "0";
  charCount.style.color = "var(--medium-text)";
  userSuggestions.style.display = "none";
}

// Success modal
function closeSuccessModal() {
  document.getElementById("successModal").style.display = "none";
}

// Navigation
function goToProfile() {
  window.location.href = "profile.html";
}

// Enhanced notification system
function showNotification(message, type = "info") {
  // Only show notifications for form submissions and errors
  // This skips the welcome notification
  if (type === "error" || type === "success") {
    const existingNotifications = document.querySelectorAll(".notification");
    existingNotifications.forEach((n) => n.remove());

    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${
              type === "success"
                ? "#4caf50"
                : type === "error"
                ? "#f44336"
                : "#2196f3"
            };
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            animation: slideInRight 0.3s ease-out;
            max-width: 350px;
            font-size: 14px;
            line-height: 1.4;
          `;

    // Create animation styles if not exists
    if (!document.querySelector("#notification-styles")) {
      const style = document.createElement("style");
      style.id = "notification-styles";
      style.textContent = `
              @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
              }
              @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
              }
            `;
      document.head.appendChild(style);
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Auto remove after 4 seconds
    setTimeout(() => {
      notification.style.animation = "slideOutRight 0.3s ease-in";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, 4000);
  }
}

// User session validation
function validateUserSession() {
  // Set current user info
  localStorage.setItem("currentUser", CURRENT_SESSION.user);
  localStorage.setItem("currentSession", JSON.stringify(CURRENT_SESSION));

  console.log(`✅ User session validated for ${CURRENT_SESSION.user}`);
  console.log(`📅 Current session time: ${CURRENT_SESSION.datetime} UTC`);
}

// Auto-populate current time in incident time field
function setDefaultIncidentTime() {
  const incidentTimeField = document.getElementById("incidentTime");
  const now = new Date("2025-07-05T12:39:59Z");
  // Set to 1 hour ago as default
  const defaultTime = new Date(now.getTime() - 60 * 60 * 1000);
  const formattedTime = defaultTime.toISOString().slice(0, 16);
  incidentTimeField.value = formattedTime;
}

// Initialize report page
document.addEventListener("DOMContentLoaded", function () {
  // Validate user session
  validateUserSession();

  // Set default incident time
  setDefaultIncidentTime();

  // Initialize sidebar to be open by default
  sidebar.classList.add("open");
  mainContent.classList.add("shifted");
  localStorage.setItem("sidebarOpen", "true");

  // Log page initialization
  console.log(
    `🚩 Report page initialized for ${CURRENT_SESSION.user} at ${CURRENT_SESSION.datetime} UTC`
  );
  console.log(
    `👤 User: ${CURRENT_SESSION.user} (${CURRENT_SESSION.userProgram})`
  );
  console.log(`🕐 Session timestamp: ${CURRENT_SESSION.datetime} UTC`);

  // Initialize any saved reports display
  const savedReports = JSON.parse(localStorage.getItem("userReports") || "[]");
  if (savedReports.length > 0) {
    console.log(
      `📋 Found ${savedReports.length} previous reports for ${CURRENT_SESSION.user}`
    );
  }
});

// Export for debugging
window.ReportPage = {
  session: CURRENT_SESSION,
  showNotification,
  resetForm,
  validateUserSession,
  submitReport: () => reportForm.dispatchEvent(new Event("submit")),
};
