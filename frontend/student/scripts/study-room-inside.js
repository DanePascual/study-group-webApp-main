/**
 * StudyGroup - Virtual Study Room with Picture-in-Picture Video Call
 *
 * Features:
 * - Draggable, resizable video container
 * - Chat-focused interface with floating video
 * - Dark mode support
 * - Responsive design
 */

// Current Session Info
const CURRENT_SESSION = {
  utcTime: "2025-07-11 11:15:22", // Updated UTC time
  philippinesTime: "2025-07-11 19:15:22", // Updated Philippines time (UTC+8)
  user: "DanePascual",
  timezone: "Asia/Manila",
};

// Global variables
let currentRoomData = null;
let isOwner = false;
let participants = [];
let messages = [];
let sharedFiles = [];
let isInCall = false;
let isMuted = false;
let isCameraOff = false;
let isScreenSharing = false;
let videoMinimized = false;
let videoMaximized = false;
let dragStartX, dragStartY;
let dragOffsetX, dragOffsetY;

// Initialize on page load
document.addEventListener("DOMContentLoaded", function () {
  console.log(
    `📹 Study Room loaded for ${CURRENT_SESSION.user} at ${CURRENT_SESSION.philippinesTime} Philippines Time`
  );

  initializeRoomData();
  initializeTheme();
  initializeChat();
  initializeParticipants();
  initializeVideoPiP();

  if (currentRoomData) {
    updateRoomDisplay();
    if (isOwner) {
      initializeOwnerSettings();
    }
  }

  // Add keyboard shortcuts
  setupKeyboardShortcuts();
});

// Theme management
function initializeTheme() {
  const themeToggle = document.getElementById("themeToggle");
  const body = document.body;

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

    showToast(`Theme switched to ${isDark ? "dark" : "light"} mode`, "info");
  });
}

// Initialize room data
function initializeRoomData() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get("room");

  if (!roomId) {
    window.location.href = "study-rooms.html";
    return;
  }

  const allRoomsData = JSON.parse(localStorage.getItem("allRoomsData") || "{}");

  if (allRoomsData[roomId]) {
    currentRoomData = allRoomsData[roomId];
  } else {
    currentRoomData = {
      id: roomId,
      name: "Study Room",
      description: "A collaborative study room",
      creator: CURRENT_SESSION.user,
      createdAt: CURRENT_SESSION.utcTime,
      participants: [CURRENT_SESSION.user],
      isActive: true,
      timezone: CURRENT_SESSION.timezone,
    };

    // Save new room
    allRoomsData[roomId] = currentRoomData;
    localStorage.setItem("allRoomsData", JSON.stringify(allRoomsData));
  }

  isOwner = currentRoomData.creator === CURRENT_SESSION.user;

  // Initialize participants
  participants = [
    {
      id: CURRENT_SESSION.user,
      name: CURRENT_SESSION.user,
      avatar: "DP",
      status: "online",
      isHost: isOwner,
      inCall: false,
    },
  ];
}

// Update room display
function updateRoomDisplay() {
  document.getElementById("roomNameDisplay").textContent = currentRoomData.name;
  document.getElementById(
    "pageTitle"
  ).textContent = `${currentRoomData.name} - StudyGroup`;
  document.getElementById("roomTitleDisplay").textContent =
    currentRoomData.name;
  document.getElementById(
    "roomCreatedTime"
  ).textContent = `Created on ${currentRoomData.createdAt} UTC`;
  document.getElementById("participantCount").textContent = participants.length;

  const baseUrl = window.location.origin + window.location.pathname;
  const inviteUrl = `${baseUrl}?room=${currentRoomData.id}&invite=true`;
  document.getElementById("inviteLink").value = inviteUrl;
}

// Initialize PiP video functionality
function initializeVideoPiP() {
  const videoCallBtn = document.getElementById("videoCallBtn");
  const videoContainer = document.getElementById("videoContainer");
  const videoHeader = document.getElementById("videoHeader");
  const minimizeBtn = document.getElementById("minimizeBtn");
  const maximizeBtn = document.getElementById("maximizeBtn");
  const closeVideoBtn = document.getElementById("closeVideoBtn");
  const micBtn = document.getElementById("micBtn");
  const cameraBtn = document.getElementById("cameraBtn");
  const screenShareBtn = document.getElementById("screenShareBtn");
  const leaveCallBtn = document.getElementById("leaveCallBtn");
  const callIndicator = document.getElementById("callIndicator");

  // Start/end call
  videoCallBtn.addEventListener("click", () => {
    if (!isInCall) {
      startVideoCall();
    } else {
      // If call is active but container is not visible, show it
      if (!videoContainer.classList.contains("active")) {
        videoContainer.classList.add("active");
      } else {
        endVideoCall();
      }
    }
  });

  // Window controls
  minimizeBtn.addEventListener("click", () => {
    videoMinimized = !videoMinimized;
    videoContainer.classList.toggle("minimized", videoMinimized);
    videoMaximized = false;
    videoContainer.classList.remove("maximized");
    minimizeBtn.innerHTML = videoMinimized
      ? '<i class="bi bi-arrows-angle-expand"></i>'
      : '<i class="bi bi-dash-lg"></i>';
    minimizeBtn.title = videoMinimized ? "Restore" : "Minimize";

    // Update maximize button when we minimize
    maximizeBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';
    maximizeBtn.title = "Maximize (Alt+Up)";
  });

  // Updated maximize function for true fullscreen
  maximizeBtn.addEventListener("click", () => {
    videoMaximized = !videoMaximized;
    videoContainer.classList.toggle("maximized", videoMaximized);
    videoMinimized = false;
    videoContainer.classList.remove("minimized");

    if (videoMaximized) {
      // True fullscreen mode
      videoContainer.style.position = "fixed";
      videoContainer.style.top = "0";
      videoContainer.style.left = "0";
      videoContainer.style.width = "100%";
      videoContainer.style.height = "100%";
      videoContainer.style.zIndex = "2000";
      videoContainer.style.borderRadius = "0";
      videoContainer.style.border = "none";

      maximizeBtn.innerHTML = '<i class="bi bi-fullscreen-exit"></i>';
      maximizeBtn.title = "Exit Fullscreen (Alt+Down)";
    } else {
      // Restore to normal floating window
      videoContainer.style.position = "fixed";
      videoContainer.style.width = "360px";
      videoContainer.style.height = "240px";
      videoContainer.style.bottom = "100px";
      videoContainer.style.right = "30px";
      videoContainer.style.top = "auto";
      videoContainer.style.left = "auto";
      videoContainer.style.zIndex = "1000";
      videoContainer.style.borderRadius = "12px";
      videoContainer.style.border = "2px solid var(--primary-color)";

      maximizeBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';
      maximizeBtn.title = "Maximize (Alt+Up)";
    }

    minimizeBtn.innerHTML = '<i class="bi bi-dash-lg"></i>';
    minimizeBtn.title = "Minimize (Alt+Down)";
  });

  closeVideoBtn.addEventListener("click", endVideoCall);

  // Call controls
  micBtn.addEventListener("click", () => toggleMicrophone());
  cameraBtn.addEventListener("click", () => toggleCamera());
  screenShareBtn.addEventListener("click", () => toggleScreenShare());
  leaveCallBtn.addEventListener("click", endVideoCall);

  // Double-click header to toggle maximize
  videoHeader.addEventListener("dblclick", (e) => {
    videoMaximized = !videoMaximized;
    if (videoMaximized) {
      // Call the maximize function directly
      maximizeBtn.click();
    } else {
      // Call the restore function
      maximizeBtn.click();
    }
  });

  // Make video container draggable
  videoHeader.addEventListener("mousedown", startDrag);
  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", endDrag);

  // Touch support for mobile
  videoHeader.addEventListener("touchstart", startDragTouch);
  document.addEventListener("touchmove", dragTouch);
  document.addEventListener("touchend", endDrag);

  // Prevent defaults on header to enable drag
  videoHeader.addEventListener("dragstart", (e) => e.preventDefault());
}

// Dragging functionality - IMPROVED
function startDrag(e) {
  const videoContainer = document.getElementById("videoContainer");

  // If maximized, restore to normal size first when user tries to drag
  if (videoMaximized) {
    videoMaximized = false;
    videoContainer.classList.remove("maximized");

    // Update maximize button appearance
    const maximizeBtn = document.getElementById("maximizeBtn");
    maximizeBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';
    maximizeBtn.title = "Maximize (Alt+Up)";

    // Position the container near the cursor for better UX
    videoContainer.style.position = "fixed";
    videoContainer.style.width = "360px";
    videoContainer.style.height = "240px";
    videoContainer.style.bottom = "auto";
    videoContainer.style.right = "auto";
    videoContainer.style.top = e.clientY - 30 + "px";
    videoContainer.style.left = e.clientX - 100 + "px";
    videoContainer.style.zIndex = "1000";
    videoContainer.style.borderRadius = "12px";
    videoContainer.style.border = "2px solid var(--primary-color)";

    // Add a slight delay before starting the drag to avoid visual jump
    setTimeout(() => {
      const rect = videoContainer.getBoundingClientRect();
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragOffsetX = rect.left;
      dragOffsetY = rect.top;
      videoContainer.classList.add("dragging");
    }, 10);
  } else {
    // Normal drag behavior for non-maximized window
    const rect = videoContainer.getBoundingClientRect();
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOffsetX = rect.left;
    dragOffsetY = rect.top;
    videoContainer.classList.add("dragging");
  }

  e.preventDefault();
}

// Improved drag function that works regardless of maximize state
function drag(e) {
  if (!dragStartX || !dragStartY) return;

  const videoContainer = document.getElementById("videoContainer");
  const rect = videoContainer.getBoundingClientRect();

  const deltaX = e.clientX - dragStartX;
  const deltaY = e.clientY - dragStartY;

  // Constrain to viewport
  let newLeft = dragOffsetX + deltaX;
  let newTop = dragOffsetY + deltaY;

  // Keep within viewport bounds
  newLeft = Math.max(0, Math.min(window.innerWidth - rect.width, newLeft));
  newTop = Math.max(0, Math.min(window.innerHeight - rect.height, newTop));

  videoContainer.style.left = newLeft + "px";
  videoContainer.style.top = newTop + "px";
  videoContainer.style.right = "auto";
  videoContainer.style.bottom = "auto";

  e.preventDefault();
}

// Touch support - IMPROVED
function startDragTouch(e) {
  const videoContainer = document.getElementById("videoContainer");
  const touch = e.touches[0];

  // If maximized, restore to normal size first
  if (videoMaximized) {
    videoMaximized = false;
    videoContainer.classList.remove("maximized");

    // Update maximize button appearance
    const maximizeBtn = document.getElementById("maximizeBtn");
    maximizeBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';
    maximizeBtn.title = "Maximize (Alt+Up)";

    // Position the container near the touch point
    videoContainer.style.position = "fixed";
    videoContainer.style.width = "360px";
    videoContainer.style.height = "240px";
    videoContainer.style.bottom = "auto";
    videoContainer.style.right = "auto";
    videoContainer.style.top = touch.clientY - 30 + "px";
    videoContainer.style.left = touch.clientX - 100 + "px";
    videoContainer.style.zIndex = "1000";
    videoContainer.style.borderRadius = "12px";
    videoContainer.style.border = "2px solid var(--primary-color)";

    setTimeout(() => {
      const rect = videoContainer.getBoundingClientRect();
      dragStartX = touch.clientX;
      dragStartY = touch.clientY;
      dragOffsetX = rect.left;
      dragOffsetY = rect.top;
      videoContainer.classList.add("dragging");
    }, 10);
  } else {
    const rect = videoContainer.getBoundingClientRect();
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
    dragOffsetX = rect.left;
    dragOffsetY = rect.top;
    videoContainer.classList.add("dragging");
  }

  e.preventDefault();
}

function dragTouch(e) {
  if (!dragStartX || !dragStartY) return;

  const videoContainer = document.getElementById("videoContainer");
  const rect = videoContainer.getBoundingClientRect();
  const touch = e.touches[0];

  const deltaX = touch.clientX - dragStartX;
  const deltaY = touch.clientY - dragStartY;

  // Constrain to viewport
  let newLeft = dragOffsetX + deltaX;
  let newTop = dragOffsetY + deltaY;

  // Keep within viewport bounds
  newLeft = Math.max(0, Math.min(window.innerWidth - rect.width, newLeft));
  newTop = Math.max(0, Math.min(window.innerHeight - rect.height, newTop));

  videoContainer.style.left = newLeft + "px";
  videoContainer.style.top = newTop + "px";
  videoContainer.style.right = "auto";
  videoContainer.style.bottom = "auto";

  e.preventDefault();
}

function endDrag() {
  const videoContainer = document.getElementById("videoContainer");
  videoContainer.classList.remove("dragging");
  dragStartX = null;
  dragStartY = null;
}

// Video call management
function startVideoCall() {
  isInCall = true;

  // Update UI
  const videoCallBtn = document.getElementById("videoCallBtn");
  const videoContainer = document.getElementById("videoContainer");
  const callIndicator = document.getElementById("callIndicator");

  videoCallBtn.classList.add("active");
  videoCallBtn.innerHTML = '<i class="bi bi-telephone-x-fill"></i>';
  videoCallBtn.title = "End Call";

  videoContainer.classList.add("active");
  callIndicator.style.display = "block";

  // Show loading indicator first
  document.getElementById("videoPlaceholder").innerHTML = `
          <div class="spinner-border text-light" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <div style="margin-top: 15px;">Connecting to call...</div>
        `;

  // Simulate connection delay
  setTimeout(() => {
    // Hide placeholder, show video grid
    document.getElementById("videoPlaceholder").style.display = "none";
    document.getElementById("videoGrid").style.display = "grid";

    // Add self to video grid
    const videoGrid = document.getElementById("videoGrid");
    videoGrid.innerHTML = `
            <div class="video-participant" id="self-video">
              <i class="bi bi-person-circle" style="font-size: 36px;"></i>
              <div class="participant-label">${CURRENT_SESSION.user} (You)</div>
            </div>
          `;

    // Update participant status
    updateParticipantCallStatus(CURRENT_SESSION.user, true);

    showToast("Joined video call", "success");

    // Only show essential system messages
    addChatMessage("system", `${CURRENT_SESSION.user} joined the call`, true);
  }, 1500);
}

function endVideoCall() {
  isInCall = false;

  // Update UI
  const videoCallBtn = document.getElementById("videoCallBtn");
  const videoContainer = document.getElementById("videoContainer");
  const callIndicator = document.getElementById("callIndicator");

  videoCallBtn.classList.remove("active");
  videoCallBtn.innerHTML = '<i class="bi bi-camera-video-fill"></i>';
  videoCallBtn.title = "Start Video Call";

  videoContainer.classList.remove("active", "minimized", "maximized");
  callIndicator.style.display = "none";

  // Reset video container
  document.getElementById("videoPlaceholder").style.display = "flex";
  document.getElementById("videoPlaceholder").innerHTML = `
          <i class="bi bi-camera-video" style="font-size: 32px;"></i>
          <div>Starting video call...</div>
        `;
  document.getElementById("videoGrid").style.display = "none";

  // Reset container style to default
  videoContainer.style.position = "fixed";
  videoContainer.style.width = "360px";
  videoContainer.style.height = "240px";
  videoContainer.style.bottom = "100px";
  videoContainer.style.right = "30px";
  videoContainer.style.top = "auto";
  videoContainer.style.left = "auto";
  videoContainer.style.zIndex = "1000";
  videoContainer.style.borderRadius = "12px";
  videoContainer.style.border = "2px solid var(--primary-color)";

  // Reset controls
  document.getElementById("minimizeBtn").innerHTML =
    '<i class="bi bi-dash-lg"></i>';
  document.getElementById("minimizeBtn").title = "Minimize (Alt+Down)";
  document.getElementById("maximizeBtn").innerHTML =
    '<i class="bi bi-arrows-angle-expand"></i>';
  document.getElementById("maximizeBtn").title = "Maximize (Alt+Up)";

  isMuted = false;
  isCameraOff = false;
  isScreenSharing = false;
  videoMinimized = false;
  videoMaximized = false;
  updateVideoControls();

  // Update participant status
  updateParticipantCallStatus(CURRENT_SESSION.user, false);

  showToast("Left video call", "info");

  // Only show essential system messages
  addChatMessage("system", `${CURRENT_SESSION.user} left the call`, true);
}

function toggleMicrophone() {
  isMuted = !isMuted;
  updateVideoControls();

  const status = isMuted ? "muted" : "unmuted";
  showToast(`Microphone ${status}`, "info");

  // No chat message for microphone changes - cleaner chat experience
}

function toggleCamera() {
  isCameraOff = !isCameraOff;
  updateVideoControls();

  // Update video display
  const selfVideo = document.getElementById("self-video");
  if (selfVideo) {
    if (isCameraOff) {
      selfVideo.innerHTML = `
              <i class="bi bi-person-circle" style="font-size: 36px;"></i>
              <div class="participant-label">${CURRENT_SESSION.user} (You)</div>
            `;
    } else {
      selfVideo.innerHTML = `
              <div style="font-size: 14px;">Camera On</div>
              <div class="participant-label">${CURRENT_SESSION.user} (You)</div>
            `;
    }
  }

  const status = isCameraOff ? "turned off" : "turned on";
  showToast(`Camera ${status}`, "info");

  // No chat message for camera changes - cleaner chat experience
}

function toggleScreenShare() {
  isScreenSharing = !isScreenSharing;
  updateVideoControls();

  // Update video display if sharing
  const selfVideo = document.getElementById("self-video");
  if (selfVideo && isScreenSharing) {
    selfVideo.innerHTML = `
            <div style="text-align: center;">
              <i class="bi bi-display" style="font-size: 24px;"></i>
              <div style="font-size: 12px;">Screen sharing active</div>
            </div>
            <div class="participant-label">${CURRENT_SESSION.user} (You)</div>
          `;
  } else if (selfVideo) {
    // Return to normal view based on camera state
    selfVideo.innerHTML = isCameraOff
      ? `<i class="bi bi-person-circle" style="font-size: 36px;"></i>
             <div class="participant-label">${CURRENT_SESSION.user} (You)</div>`
      : `<div style="font-size: 14px;">Camera On</div>
             <div class="participant-label">${CURRENT_SESSION.user} (You)</div>`;
  }

  const status = isScreenSharing
    ? "started sharing your screen"
    : "stopped sharing your screen";
  showToast(`You ${status}`, "info");

  // No chat message for screen sharing changes - cleaner chat experience
}

function updateVideoControls() {
  const micBtn = document.getElementById("micBtn");
  const cameraBtn = document.getElementById("cameraBtn");
  const screenShareBtn = document.getElementById("screenShareBtn");

  // Update microphone button
  if (isMuted) {
    micBtn.classList.remove("active");
    micBtn.innerHTML = '<i class="bi bi-mic-mute-fill"></i>';
    micBtn.title = "Unmute (Alt+M)";
  } else {
    micBtn.classList.add("active");
    micBtn.innerHTML = '<i class="bi bi-mic-fill"></i>';
    micBtn.title = "Mute (Alt+M)";
  }

  // Update camera button
  if (isCameraOff) {
    cameraBtn.classList.remove("active");
    cameraBtn.innerHTML = '<i class="bi bi-camera-video-off-fill"></i>';
    cameraBtn.title = "Turn Camera On (Alt+V)";
  } else {
    cameraBtn.classList.add("active");
    cameraBtn.innerHTML = '<i class="bi bi-camera-video-fill"></i>';
    cameraBtn.title = "Turn Camera Off (Alt+V)";
  }

  // Update screen share button
  if (isScreenSharing) {
    screenShareBtn.classList.add("active");
    screenShareBtn.title = "Stop Sharing (Alt+S)";
  } else {
    screenShareBtn.classList.remove("active");
    screenShareBtn.title = "Share Screen (Alt+S)";
  }
}

// Initialize chat functionality
function initializeChat() {
  const messageInput = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendMessageBtn");
  const attachBtn = document.getElementById("attachBtn");
  const fileInput = document.getElementById("fileInput");

  // Send message on Enter key
  messageInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", sendMessage);

  // Attach file functionality
  attachBtn.addEventListener("click", function () {
    fileInput.click();
  });

  fileInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    // Show loading indicator
    showToast(`Uploading ${file.name}...`, "info");

    // Determine file type
    const isImage = file.type.startsWith("image/");
    const isPDF = file.type === "application/pdf";
    const isDoc = file.name.endsWith(".doc") || file.name.endsWith(".docx");
    const isPPT = file.name.endsWith(".ppt") || file.name.endsWith(".pptx");
    const isExcel = file.name.endsWith(".xls") || file.name.endsWith(".xlsx");

    // Get file extension
    const fileExt = file.name.split(".").pop().toLowerCase();

    // Simulate upload delay
    setTimeout(() => {
      if (isImage) {
        sendImageMessage(file);
      } else if (isPDF || isDoc || isPPT || isExcel) {
        sendDocumentMessage(file, fileExt);
      } else {
        showToast("Unsupported file format", "error");
      }
      fileInput.value = "";
    }, 800);
  });

  // Add this new function to handle document files
  function sendDocumentMessage(file, fileExt) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const fileUrl = e.target.result;
      const fileType = getFileType(fileExt);
      const fileIcon = getFileIcon(fileExt);

      // Add to shared files
      addSharedFile({
        name: file.name,
        url: fileUrl,
        type: fileType,
        size: formatFileSize(file.size),
        extension: fileExt,
      });

      // Add document message
      const chatMessages = document.getElementById("chatMessages");

      // Remove empty state if it exists
      const emptyState = chatMessages.querySelector(".empty-state");
      if (emptyState) {
        emptyState.remove();
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      const messageElement = document.createElement("div");
      messageElement.className = "chat-message self";

      messageElement.innerHTML = `
      <div class="message-avatar">DP</div>
      <div>
        <div class="message-bubble">
          <div class="message-content">
            <div class="d-flex align-items-center gap-2 mb-1">
              <i class="${fileIcon} fs-4"></i>
              <div>
                <div style="font-weight: 500;">${file.name}</div>
                <div style="font-size: 12px; color: var(--medium-text);">${formatFileSize(
                  file.size
                )}</div>
              </div>
            </div>
            <a href="${fileUrl}" download="${
        file.name
      }" class="btn btn-sm btn-outline-success mt-2">
              <i class="bi bi-download"></i> Download
            </a>
          </div>
          <div class="message-meta">
            <span>You</span>
            <span>${timeStr}</span>
          </div>
        </div>
      </div>
    `;

      chatMessages.appendChild(messageElement);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Store message
      messages.push({
        id: Date.now(),
        author: CURRENT_SESSION.user,
        fileUrl: fileUrl,
        fileName: file.name,
        fileType: fileType,
        fileSize: formatFileSize(file.size),
        timestamp: now.toISOString(),
      });

      showToast(`${fileType} file shared successfully`, "success");
    };
    reader.readAsDataURL(file);
  }

  // Helper function to determine file type
  function getFileType(ext) {
    switch (ext.toLowerCase()) {
      case "pdf":
        return "PDF";
      case "doc":
      case "docx":
        return "Word";
      case "ppt":
      case "pptx":
        return "PowerPoint";
      case "xls":
      case "xlsx":
        return "Excel";
      default:
        return "Document";
    }
  }

  // Helper function to get appropriate icon
  function getFileIcon(ext) {
    switch (ext.toLowerCase()) {
      case "pdf":
        return "bi bi-file-earmark-pdf text-danger";
      case "doc":
      case "docx":
        return "bi bi-file-earmark-word text-primary";
      case "ppt":
      case "pptx":
        return "bi bi-file-earmark-slides text-warning";
      case "xls":
      case "xlsx":
        return "bi bi-file-earmark-spreadsheet text-success";
      default:
        return "bi bi-file-earmark text-secondary";
    }
  }

  // Helper function to format file size
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " bytes";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    else return (bytes / 1048576).toFixed(1) + " MB";
  }

  // Update the updateFilesListInSettings function to handle different file types
  function updateFilesListInSettings() {
    const filesListElement = document.getElementById("filesList");
    if (!filesListElement) return;

    if (sharedFiles.length === 0) {
      filesListElement.innerHTML = `
      <div class="text-center p-4 text-muted">
        <i class="bi bi-file-earmark-x" style="font-size: 2rem;"></i>
        <p class="mt-2">No files have been shared in this session</p>
      </div>
    `;
      return;
    }

    filesListElement.innerHTML = sharedFiles
      .map((file) => {
        const date = new Date(file.timestamp);
        const formattedDate = date.toLocaleString();
        let fileIcon = "bi bi-file-earmark-image text-primary";

        if (file.type !== "image") {
          fileIcon = getFileIcon(file.extension || "");
        }

        return `
      <div class="card mb-2">
        <div class="card-body p-2">
          <div class="d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-2">
              <i class="${fileIcon}" style="font-size: 1.5rem;"></i>
              <div>
                <div class="fw-bold">${file.name}</div>
                <small class="text-muted">Shared by ${file.sender} • ${formattedDate}</small>
              </div>
            </div>
            <a href="${file.url}" class="btn btn-sm btn-outline-primary" download="${file.name}">
              <i class="bi bi-download"></i>
            </a>
          </div>
        </div>
      </div>
    `;
      })
      .join("");
  }
}

function sendMessage() {
  const messageInput = document.getElementById("messageInput");
  const text = messageInput.value.trim();

  if (!text) return;

  addChatMessage(CURRENT_SESSION.user, text);
  messageInput.value = "";
  messageInput.focus();
}

function sendImageMessage(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const imageUrl = e.target.result;

    // Add to shared files
    addSharedFile({
      name: file.name || `Image ${new Date().toLocaleTimeString()}`,
      url: imageUrl,
      type: "image",
      size: file.size,
    });

    // Send to chat as before
    addChatMessage(CURRENT_SESSION.user, "", false, imageUrl);
  };
  reader.readAsDataURL(file);
}

function addSharedFile(file) {
  sharedFiles.push({
    id: Date.now(),
    name: file.name,
    url: file.url,
    type: file.type || "image",
    sender: CURRENT_SESSION.user,
    timestamp: new Date().toISOString(),
  });

  // Update files list in settings if it's open
  updateFilesListInSettings();
}

function updateFilesListInSettings() {
  const filesListElement = document.getElementById("filesList");
  if (!filesListElement) return;

  if (sharedFiles.length === 0) {
    filesListElement.innerHTML = `
            <div class="text-center p-4 text-muted">
              <i class="bi bi-file-earmark-x" style="font-size: 2rem;"></i>
              <p class="mt-2">No files have been shared in this session</p>
            </div>
          `;
    return;
  }

  filesListElement.innerHTML = sharedFiles
    .map((file) => {
      const date = new Date(file.timestamp);
      const formattedDate = date.toLocaleString();
      return `
            <div class="card mb-2">
              <div class="card-body p-2">
                <div class="d-flex justify-content-between align-items-center">
                  <div class="d-flex align-items-center gap-2">
                    <i class="bi bi-file-earmark-image text-primary" style="font-size: 1.5rem;"></i>
                    <div>
                      <div class="fw-bold">${file.name}</div>
                      <small class="text-muted">Shared by ${file.sender} • ${formattedDate}</small>
                    </div>
                  </div>
                  <a href="${file.url}" class="btn btn-sm btn-outline-primary" download="${file.name}">
                    <i class="bi bi-download"></i>
                  </a>
                </div>
              </div>
            </div>
          `;
    })
    .join("");
}

function addChatMessage(author, text, isSystem = false, imageUrl = null) {
  const chatMessages = document.getElementById("chatMessages");

  // Remove empty state if it exists
  const emptyState = chatMessages.querySelector(".empty-state");
  if (emptyState) {
    emptyState.remove();
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const messageElement = document.createElement("div");

  if (isSystem) {
    messageElement.className = "chat-message";
    messageElement.innerHTML = `
            <div class="message-avatar" style="background: #999;">
              <i class="bi bi-info-circle"></i>
            </div>
            <div>
              <div class="message-bubble">
                <div class="message-content" style="font-style: italic; color: var(--medium-text);">${text}</div>
                <div class="message-meta">
                  <span>System</span>
                  <span>${timeStr}</span>
                </div>
              </div>
            </div>
          `;
  } else {
    const isOwnMessage = author === CURRENT_SESSION.user;
    const avatar = isOwnMessage ? "DP" : author.substring(0, 2).toUpperCase();

    messageElement.className = `chat-message ${isOwnMessage ? "self" : ""}`;

    let contentHtml = "";
    if (imageUrl) {
      contentHtml = `<img src="${imageUrl}" alt="Shared image" class="message-image" onclick="openImageModal('${imageUrl}')">`;
    } else {
      contentHtml = text;
    }

    messageElement.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div>
              <div class="message-bubble">
                <div class="message-content">${contentHtml}</div>
                <div class="message-meta">
                  <span>${isOwnMessage ? "You" : author}</span>
                  <span>${timeStr}</span>
                </div>
              </div>
            </div>
          `;
  }

  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Store message
  messages.push({
    id: Date.now(),
    author,
    text,
    imageUrl,
    timestamp: now.toISOString(),
    isSystem,
  });
}

// Initialize participants
function initializeParticipants() {
  updateParticipantsList();
}

function updateParticipantsList() {
  const participantsList = document.getElementById("participantsList");

  participantsList.innerHTML = participants
    .map((participant) => {
      const canKick = isOwner && participant.id !== CURRENT_SESSION.user;

      return `
            <div class="participant-item" data-user="${participant.id}">
              <div class="participant-avatar">${participant.avatar}
                <div class="status-indicator ${
                  participant.inCall ? "status-in-call" : "status-online"
                }"></div>
              </div>
              <div class="participant-info">
                <div class="participant-name">${participant.name}${
        participant.id === CURRENT_SESSION.user ? " (You)" : ""
      }</div>
                <div class="participant-status">${
                  participant.isHost
                    ? "Host"
                    : participant.inCall
                    ? "In Call"
                    : "Online"
                }</div>
              </div>
              ${
                canKick
                  ? `
                <div class="participant-actions">
                  <button class="kick-btn" onclick="kickParticipant('${participant.id}')" title="Kick user">
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
              `
                  : ""
              }
            </div>
          `;
    })
    .join("");

  document.getElementById("participantCount").textContent = participants.length;
}

function updateParticipantCallStatus(userId, inCall) {
  const participant = participants.find((p) => p.id === userId);
  if (participant) {
    participant.inCall = inCall;
    updateParticipantsList();
  }
}

// Owner settings functionality
function initializeOwnerSettings() {
  const settingsBtn = document.getElementById("settingsBtn");
  settingsBtn.style.display = "block";

  settingsBtn.addEventListener("click", () => {
    openSettingsModal();
  });

  document.getElementById("saveSettingsBtn").addEventListener("click", () => {
    saveRoomSettings();
  });
}

function openSettingsModal() {
  const modal = new bootstrap.Modal(document.getElementById("settingsModal"));

  // Populate current values
  document.getElementById("roomNameInput").value = currentRoomData.name;
  document.getElementById("roomDescInput").value =
    currentRoomData.description || "";

  // Populate participants list for management
  const participantsList2 = document.getElementById("participantsList2");
  participantsList2.innerHTML = participants
    .map(
      (participant) => `
          <div class="d-flex justify-content-between align-items-center p-2 border rounded mb-2">
            <div class="d-flex align-items-center gap-2">
              <div class="participant-avatar" style="width: 24px; height: 24px; font-size: 12px;">${
                participant.avatar
              }</div>
              <span>${participant.name}${
        participant.id === CURRENT_SESSION.user ? " (You)" : ""
      }</span>
              ${
                participant.isHost
                  ? '<span class="badge bg-primary">Host</span>'
                  : ""
              }
            </div>
            ${
              participant.id !== CURRENT_SESSION.user
                ? `
              <button class="btn btn-outline-danger btn-sm" onclick="kickParticipant('${participant.id}')">
                <i class="bi bi-x-lg"></i> Kick
              </button>
            `
                : ""
            }
          </div>
        `
    )
    .join("");

  // Update files list
  updateFilesListInSettings();

  modal.show();
}

function saveRoomSettings() {
  const newName = document.getElementById("roomNameInput").value.trim();
  const newDesc = document.getElementById("roomDescInput").value.trim();

  if (!newName) {
    showToast("Room name cannot be empty", "error");
    return;
  }

  // Update room data
  currentRoomData.name = newName;
  currentRoomData.description = newDesc;

  // Update display
  updateRoomDisplay();

  // Save to localStorage
  const allRoomsData = JSON.parse(localStorage.getItem("allRoomsData") || "{}");
  allRoomsData[currentRoomData.id] = currentRoomData;
  localStorage.setItem("allRoomsData", JSON.stringify(allRoomsData));

  // Close modal
  const modal = bootstrap.Modal.getInstance(
    document.getElementById("settingsModal")
  );
  modal.hide();

  showToast("Room settings updated", "success");
  addChatMessage("system", `Room name changed to "${newName}"`, true);
}

// Kick participant (owner only)
window.kickParticipant = function (userId) {
  if (!isOwner) {
    showToast("Only the room owner can kick participants", "error");
    return;
  }

  if (userId === CURRENT_SESSION.user) {
    showToast("You cannot kick yourself", "error");
    return;
  }

  if (confirm(`Are you sure you want to kick ${userId} from the room?`)) {
    // Remove participant
    participants = participants.filter((p) => p.id !== userId);
    updateParticipantsList();

    showToast(`${userId} has been kicked from the room`, "success");
    addChatMessage("system", `${userId} was kicked from the room`, true);
  }
};

// Open image in modal
window.openImageModal = function (imageUrl) {
  // Create a simple image modal
  const modal = document.createElement("div");
  modal.className = "modal fade";
  modal.innerHTML = `
          <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Image</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body text-center">
                <img src="${imageUrl}" alt="Shared image" style="max-width: 100%; height: auto;">
              </div>
              <div class="modal-footer">
                <a href="${imageUrl}" class="btn btn-outline-primary" download target="_blank">
                  <i class="bi bi-download"></i> Download
                </a>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              </div>
            </div>
          </div>
        `;
  document.body.appendChild(modal);

  const bootstrapModal = new bootstrap.Modal(modal);
  bootstrapModal.show();

  modal.addEventListener("hidden.bs.modal", () => {
    modal.remove();
  });
};

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", function (e) {
    // Alt+M to toggle microphone when in call
    if (e.altKey && e.key === "m" && isInCall) {
      e.preventDefault();
      toggleMicrophone();
    }

    // Alt+V to toggle camera when in call
    if (e.altKey && e.key === "v" && isInCall) {
      e.preventDefault();
      toggleCamera();
    }

    // Alt+S to toggle screen share when in call
    if (e.altKey && e.key === "s" && isInCall) {
      e.preventDefault();
      toggleScreenShare();
    }

    // Alt+J to join call when not in call
    if (e.altKey && e.key === "j" && !isInCall) {
      e.preventDefault();
      startVideoCall();
    }

    // Alt+L to leave call when in call
    if (e.altKey && e.key === "l" && isInCall) {
      e.preventDefault();
      endVideoCall();
    }

    // Alt+Up to maximize video window
    if (e.altKey && e.key === "ArrowUp" && isInCall && !videoMaximized) {
      e.preventDefault();
      document.getElementById("maximizeBtn").click();
    }

    // Alt+Down to minimize/restore video window
    if (e.altKey && e.key === "ArrowDown" && isInCall && videoMaximized) {
      e.preventDefault();
      document.getElementById("maximizeBtn").click();
    } else if (
      e.altKey &&
      e.key === "ArrowDown" &&
      isInCall &&
      !videoMinimized
    ) {
      e.preventDefault();
      document.getElementById("minimizeBtn").click();
    }

    // Escape to close sidebar on mobile or restore video from maximized
    if (e.key === "Escape") {
      const sidebar = document.getElementById("sidebar");
      if (window.innerWidth <= 768 && sidebar.classList.contains("open")) {
        setSidebar(false);
      } else if (isInCall && videoMaximized) {
        // If video is maximized, restore it
        document.getElementById("maximizeBtn").click();
      }
    }
  });
}

// Initialize invite system
document.getElementById("inviteBtn").addEventListener("click", function () {
  const modal = new bootstrap.Modal(document.getElementById("inviteModal"));
  modal.show();
});

document.getElementById("copyLinkBtn").addEventListener("click", function () {
  const inviteLink = document.getElementById("inviteLink");
  inviteLink.select();
  navigator.clipboard
    .writeText(inviteLink.value)
    .then(() => {
      showToast("Invite link copied to clipboard", "success");
    })
    .catch(() => {
      document.execCommand("copy");
      showToast("Invite link copied to clipboard", "success");
    });
});

// Sidebar functionality
const sidebar = document.getElementById("sidebar");
const mainContent = document.getElementById("mainContent");
const menuToggle = document.getElementById("menuToggle");

function setSidebar(open) {
  if (open) {
    sidebar.classList.add("open");
    mainContent.classList.add("shifted");
  } else {
    sidebar.classList.remove("open");
    mainContent.classList.remove("shifted");
  }
}

if (window.innerWidth > 768) setSidebar(true);

menuToggle.addEventListener("click", function () {
  setSidebar(!sidebar.classList.contains("open"));
});

window.goToProfile = function () {
  window.location.href = "profile.html";
};

// Toast notification system
function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toastContainer");
  const toastId = "toast-" + Date.now();

  const iconMap = {
    success: "bi-check-circle-fill",
    error: "bi-exclamation-circle-fill",
    info: "bi-info-circle-fill",
  };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.id = toastId;

  toast.innerHTML = `
          <div class="toast-icon">
            <i class="bi ${iconMap[type]}"></i>
          </div>
          <div class="toast-content">
            <div class="toast-title">${
              type.charAt(0).toUpperCase() + type.slice(1)
            }</div>
            <div class="toast-message">${message}</div>
          </div>
          <div class="toast-close" onclick="this.parentElement.style.opacity = 0; setTimeout(() => this.parentElement.remove(), 300);">
            <i class="bi bi-x"></i>
          </div>
        `;

  toastContainer.appendChild(toast);

  // Auto hide after 4 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}

// Handle window resize for responsive layout
window.addEventListener("resize", function () {
  if (window.innerWidth > 768) {
    if (!sidebar.classList.contains("open")) {
      setSidebar(true);
    }
  } else {
    if (sidebar.classList.contains("open")) {
      setSidebar(false);
    }
  }
});

// Auto-save room data
const autoSaveInterval = setInterval(() => {
  if (currentRoomData) {
    const allRoomsData = JSON.parse(
      localStorage.getItem("allRoomsData") || "{}"
    );
    allRoomsData[currentRoomData.id] = {
      ...currentRoomData,
      lastActivity: new Date().toISOString(),
    };
    localStorage.setItem("allRoomsData", JSON.stringify(allRoomsData));
    console.log("Room data auto-saved: " + new Date().toLocaleTimeString());
  }
}, 30000);

// Clean up interval when leaving page
window.addEventListener("beforeunload", () => {
  clearInterval(autoSaveInterval);

  // Leave call if active
  if (isInCall) {
    // In a real app, you would signal to other users that you've left
    updateParticipantCallStatus(CURRENT_SESSION.user, false);
  }
});

// Initial welcome message
setTimeout(() => {
  showToast(
    `Welcome to ${currentRoomData ? currentRoomData.name : "the study room"}!`,
    "success"
  );
  if (currentRoomData && isOwner) {
    addChatMessage("system", `Room created by ${CURRENT_SESSION.user}`, true);
  }

  // More concise welcome message
  addChatMessage(
    "system",
    "Click the camera button to start a video call. Double-click the video header for fullscreen mode.",
    true
  );
}, 1000);

console.log(
  `Study Room ready for ${CURRENT_SESSION.user} at ${CURRENT_SESSION.philippinesTime} Philippines Time`
);
console.log(`Current session: ${CURRENT_SESSION.utcTime} UTC`);
console.log(`Tip: Access shared files through the Settings > Files tab`);
