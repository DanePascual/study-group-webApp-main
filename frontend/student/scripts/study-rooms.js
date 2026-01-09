// ===== study-rooms.js (COMPLETE CORRECTED - With Room Deactivation) =====
// - Input sanitization on all user inputs (XSS prevention)
// - Smart tab-based filtering with proper state management
// - Privacy indicators and password protection for private rooms
// - Complete room state management
// - SIMPLIFIED: Removed tags, schedule session, subject area
// - FIXED: Skip password prompt if user is already a member of private room
// - FIXED: Load all rooms at once, not in batches
// - FIXED: Card layout with full text wrapping (no tooltips)
// - FIXED: Footer (participant count + Enter Now button) at bottom of card
// - ADDED: Password visibility toggle with eye icon
// - ADDED: Real-time password requirements validation
// - ADDED: Room deactivation check - prevents actions on deactivated rooms

import { auth, db } from "../../config/firebase.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { apiUrl } from "../../config/appConfig.js";
import { postJsonWithAuth, fetchJsonWithAuth } from "./apiClient.js";

const STUDY_GROUPS_API = apiUrl("/api/study-groups");

// ===== SECURITY: Constants =====
const MAX_ROOM_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

// ===== STATE MANAGEMENT =====
let CURRENT_SESSION = null;
let createRoomModal;
let passwordModal;
let deactivationModal;
let allRooms = [];
let filteredRooms = [];
let displayedRooms = [];
let currentTab = "all-rooms";
let pendingPrivateRoomId = null;

// ===== ONLINE PRESENCE TRACKING =====
let roomOnlineCounts = new Map(); // Map of roomId -> online count
let presenceListeners = new Map(); // Map of roomId -> listener unsubscribe function
let database = null; // Firebase Realtime Database reference

/* ===== SECURITY: Utilities ===== */
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"'`=\/]/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "/": "&#x2F;",
      "`": "&#x60;",
      "=": "&#x3D;",
    }[c];
  });
}

function sanitizeString(str, maxLength = 255) {
  if (typeof str !== "string") return "";
  return str.trim().substring(0, maxLength);
}

function logSecurityEvent(eventType, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY] ${timestamp} | Event: ${eventType} | Details:`,
    details
  );
}

function debugLog(msg, data = null) {
  console.log(
    `%c[STUDY_ROOMS] ${msg}`,
    "color: #4caf50; font-weight: bold;",
    data || ""
  );
}

/* ===== ONLINE PRESENCE TRACKING FUNCTIONS ===== */
function initializePresenceDatabase() {
  try {
    if (typeof firebase !== "undefined" && firebase.database) {
      database = firebase.database();
      debugLog("Firebase Realtime Database initialized for presence tracking");
      return true;
    }
    console.warn("[presence] Firebase Realtime Database not available");
    return false;
  } catch (err) {
    console.error("[presence] Error initializing database:", err);
    return false;
  }
}

function subscribeToRoomPresence(roomId) {
  if (!database) {
    debugLog(`[presence] No database, cannot subscribe to room ${roomId}`);
    return;
  }
  if (presenceListeners.has(roomId)) {
    debugLog(`[presence] Already subscribed to room ${roomId}`);
    return;
  }

  debugLog(`[presence] Subscribing to room presence: ${roomId}`);
  const roomPresenceRef = database.ref(`rooms/${roomId}/presence`);

  const handler = roomPresenceRef.on("value", (snapshot) => {
    const presenceData = snapshot.val() || {};
    let onlineCount = 0;

    for (const userId in presenceData) {
      if (presenceData[userId]?.online === true) {
        onlineCount++;
      }
    }

    debugLog(`[presence] Room ${roomId} has ${onlineCount} online`);
    roomOnlineCounts.set(roomId, onlineCount);
    updateRoomCardOnlineCount(roomId, onlineCount);
  }, (error) => {
    console.error(`[presence] Error reading presence for room ${roomId}:`, error);
  });
  });

  presenceListeners.set(roomId, () => {
    roomPresenceRef.off("value", handler);
  });
}

function unsubscribeFromRoomPresence(roomId) {
  const unsubscribe = presenceListeners.get(roomId);
  if (unsubscribe) {
    unsubscribe();
    presenceListeners.delete(roomId);
  }
  roomOnlineCounts.delete(roomId);
}

function unsubscribeFromAllRoomPresence() {
  presenceListeners.forEach((unsubscribe) => unsubscribe());
  presenceListeners.clear();
  roomOnlineCounts.clear();
}

function updateRoomCardOnlineCount(roomId, onlineCount) {
  const roomCard = document.querySelector(
    `.room-card[data-room-id="${roomId}"]`
  );
  if (!roomCard) return;

  const participantCountEl = roomCard.querySelector(".participant-count");
  if (participantCountEl) {
    participantCountEl.innerHTML = `<i class="bi bi-people"></i> <span class="online-count">${onlineCount}</span> Online`;
  }
}

function subscribeToAllDisplayedRoomsPresence() {
  debugLog(`[presence] subscribeToAllDisplayedRoomsPresence called, ${displayedRooms.length} rooms`);
  
  if (!database) {
    const initialized = initializePresenceDatabase();
    debugLog(`[presence] Database initialized: ${initialized}`);
  }

  if (!database) {
    debugLog("[presence] Database still not available, cannot subscribe");
    return;
  }

  // Unsubscribe from previous listeners
  unsubscribeFromAllRoomPresence();

  // Subscribe to all displayed rooms
  displayedRooms.forEach((room) => {
    subscribeToRoomPresence(room.id);
  });
  
  debugLog(`[presence] Subscribed to ${displayedRooms.length} rooms`);
}

/* ===== ROOM DEACTIVATION MODAL ===== */
function showRoomDeactivatedModal() {
  try {
    const modalElement = document.getElementById("roomDeactivatedModal");
    if (!modalElement) {
      console.error("Deactivation modal not found");
      showToast("This room has been deactivated by an admin", "error");
      return;
    }

    if (!deactivationModal) {
      deactivationModal = new bootstrap.Modal(modalElement);
    }

    deactivationModal.show();
  } catch (err) {
    console.error("Failed to show deactivation modal:", err);
    showToast("This room has been deactivated by an admin", "error");
  }
}

function closeDeactivationModal() {
  if (deactivationModal) {
    deactivationModal.hide();
  }
  // Redirect back to study rooms
  window.location.href = "study-rooms.html";
}

/* ===== PASSWORD VISIBILITY TOGGLE ===== */
function initializePasswordToggles() {
  const passwordToggleBtn = document.getElementById("passwordToggleBtn");
  const roomPassword = document.getElementById("roomPassword");

  if (passwordToggleBtn && roomPassword) {
    passwordToggleBtn.addEventListener("click", function (e) {
      e.preventDefault();
      togglePasswordVisibility(roomPassword, passwordToggleBtn);
    });
  }

  const accessPasswordToggleBtn = document.getElementById(
    "accessPasswordToggleBtn"
  );
  const privateRoomPassword = document.getElementById("privateRoomPassword");

  if (accessPasswordToggleBtn && privateRoomPassword) {
    accessPasswordToggleBtn.addEventListener("click", function (e) {
      e.preventDefault();
      togglePasswordVisibility(privateRoomPassword, accessPasswordToggleBtn);
    });
  }
}

function togglePasswordVisibility(inputElement, toggleButton) {
  const isPassword = inputElement.type === "password";
  inputElement.type = isPassword ? "text" : "password";

  const icon = toggleButton.querySelector("i");
  if (icon) {
    icon.classList.toggle("bi-eye");
    icon.classList.toggle("bi-eye-slash");
  }

  debugLog(`Password visibility toggled: ${isPassword ? "visible" : "hidden"}`);
}

/* ===== PASSWORD REQUIREMENTS VALIDATION ===== */
function initializePasswordRequirements() {
  const roomPassword = document.getElementById("roomPassword");

  if (roomPassword) {
    roomPassword.addEventListener("input", function () {
      validatePasswordRequirements(this.value);
    });
  }
}

function validatePasswordRequirements(password) {
  const lengthReq = document.getElementById("req-length");
  const hasLength = password.length >= 8;
  updateRequirementStatus(lengthReq, hasLength);

  const uppercaseReq = document.getElementById("req-uppercase");
  const hasUppercase = /[A-Z]/.test(password);
  updateRequirementStatus(uppercaseReq, hasUppercase);

  const lowercaseReq = document.getElementById("req-lowercase");
  const hasLowercase = /[a-z]/.test(password);
  updateRequirementStatus(lowercaseReq, hasLowercase);

  const numberReq = document.getElementById("req-number");
  const hasNumber = /[0-9]/.test(password);
  updateRequirementStatus(numberReq, hasNumber);

  debugLog("Password requirements validated", {
    length: hasLength,
    uppercase: hasUppercase,
    lowercase: hasLowercase,
    number: hasNumber,
  });
}

function updateRequirementStatus(element, isMet) {
  if (!element) return;

  const icon = element.querySelector("i");
  if (!icon) return;

  if (isMet) {
    element.classList.add("met");
    element.classList.remove("unmet");
    icon.classList.remove("bi-circle");
    icon.classList.add("bi-check-circle-fill");
  } else {
    element.classList.remove("met");
    element.classList.add("unmet");
    icon.classList.remove("bi-check-circle-fill");
    icon.classList.add("bi-circle");
  }
}

/* ===== PRIVATE ROOM PASSWORD MODAL ===== */
function openPrivateRoomPasswordModal(roomId, roomName) {
  try {
    const modalElement = document.getElementById("privateRoomPasswordModal");
    if (!modalElement) {
      console.error("Private room password modal not found");
      showToast("Cannot verify password - modal missing", "error");
      return;
    }

    if (!passwordModal) {
      passwordModal = new bootstrap.Modal(modalElement);
    }

    const roomNameEl = document.getElementById("privateRoomName");
    if (roomNameEl) {
      roomNameEl.textContent = escapeHtml(roomName);
    }

    const passwordInput = document.getElementById("privateRoomPassword");
    if (passwordInput) {
      passwordInput.value = "";
      passwordInput.type = "password";
    }

    const toggleBtn = document.getElementById("accessPasswordToggleBtn");
    if (toggleBtn) {
      const icon = toggleBtn.querySelector("i");
      if (icon) {
        icon.classList.remove("bi-eye-slash");
        icon.classList.add("bi-eye");
      }
    }

    pendingPrivateRoomId = roomId;
    passwordModal.show();
  } catch (err) {
    console.error("Failed to open password modal:", err);
    showToast("Cannot open password verification", "error");
  }
}

async function handlePrivateRoomPasswordSubmit() {
  const passwordInput = document.getElementById("privateRoomPassword");
  if (!passwordInput) {
    showToast("Password input not found", "error");
    return;
  }

  const password = sanitizeString(passwordInput.value, 100);
  if (!password) {
    showToast("Please enter the room password", "error");
    return;
  }

  if (!pendingPrivateRoomId) {
    showToast("Room ID missing", "error");
    return;
  }

  try {
    const submitBtn = document.getElementById("submitPrivateRoomPassword");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML =
        '<i class="bi bi-arrow-clockwise spinning"></i> Verifying...';
    }

    const response = await postJsonWithAuth(
      `${STUDY_GROUPS_API}/${encodeURIComponent(pendingPrivateRoomId)}/join`,
      { password }
    );

    if (response && response.success) {
      showToast("Password verified! Entering room...", "success");
      logSecurityEvent("PRIVATE_ROOM_ACCESS_GRANTED", {
        roomId: pendingPrivateRoomId,
      });

      if (passwordModal) passwordModal.hide();
      passwordInput.value = "";

      await fetchAndRenderStudyRooms();

      setTimeout(() => {
        enterRoom(pendingPrivateRoomId);
      }, 500);
    } else {
      showToast("Incorrect password", "error");
      logSecurityEvent("PRIVATE_ROOM_ACCESS_DENIED", {
        roomId: pendingPrivateRoomId,
      });
      // Show error hint near password field BEFORE clearing input
      showPasswordError(passwordInput, "Incorrect password. Please try again.");
      passwordInput.value = "";
    }
  } catch (err) {
    console.error("Error verifying password:", err);
    let msg = "Incorrect password. Please try again.";
    // Check for specific error messages from API
    if (err && err.message) {
      // Use the error message from API (e.g., "Password must be at least 8 characters", "Incorrect password")
      msg = err.message;
    } else if (err && err.body && err.body.error) {
      msg = err.body.error;
    }
    showToast(msg, "error");
    // Show error hint near password field
    const passwordInput = document.getElementById("privateRoomPassword");
    if (passwordInput) {
      showPasswordError(passwordInput, msg);
      passwordInput.value = "";
    }
    logSecurityEvent("PRIVATE_ROOM_PASSWORD_ERROR", {
      error: err?.message,
    });
  } finally {
    const submitBtn = document.getElementById("submitPrivateRoomPassword");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> Verify Password';
    }
  }
}

/* ===== ROOM CARD FACTORY - NO TOOLTIPS ===== */
function createRoomCardElement(room) {
  const privacyBadgeHtml =
    room.privacy === "private"
      ? `<span class="privacy-badge private"><i class="bi bi-lock-fill"></i> Private</span>`
      : `<span class="privacy-badge public"><i class="bi bi-globe"></i> Public</span>`;

  const roomNameEscaped = escapeHtml(room.name);
  const roomDescEscaped = escapeHtml(
    room.description || "No description provided."
  );

  const newRoom = document.createElement("div");
  newRoom.className = "room-card";
  newRoom.setAttribute("data-room-id", room.id);
  newRoom.setAttribute("data-is-active", room.isActive);
  newRoom.innerHTML = `
    <div class="room-header">
      <div class="room-header-content">
        <h3 class="room-title">
          ${roomNameEscaped}
        </h3>
        <p class="room-description">
          ${roomDescEscaped}
        </p>
      </div>
      <div class="privacy-badge-container">
        ${privacyBadgeHtml}
      </div>
    </div>
    <div class="room-footer">
      <span class="participant-count"><i class="bi bi-people"></i> <span class="online-count">0</span> Online</span>
      <button class="join-btn" onclick="window.handleRoomJoin('${escapeHtml(
        room.id
      )}', '${escapeHtml(room.name)}', '${room.privacy}', ${
    room.isActive
  })">Enter Now</button>
    </div>
  `;
  return newRoom;
}

/* ===== HANDLE ROOM JOIN (with privacy check, membership check, and deactivation check) ===== */
export function handleRoomJoin(roomId, roomName, privacy, isActive) {
  debugLog(
    `Join attempt | Room: ${roomName} | Privacy: ${privacy} | Active: ${isActive}`
  );

  // ===== CHECK IF ROOM IS DEACTIVATED =====
  if (!isActive) {
    logSecurityEvent("DEACTIVATED_ROOM_JOIN_ATTEMPT", {
      roomId,
      roomName,
    });
    showRoomDeactivatedModal();
    return;
  }

  const room = allRooms.find((r) => String(r.id) === String(roomId));
  if (!room) {
    debugLog(`Room not found in allRooms: ${roomId}`);
    showToast("Room not found", "error");
    return;
  }

  const currentUserId = CURRENT_SESSION?.uid;
  if (!currentUserId) {
    showToast("User not authenticated", "error");
    return;
  }

  const isAlreadyMember = (room.participants || []).includes(currentUserId);

  debugLog(
    `User ${currentUserId} | Already member: ${isAlreadyMember} | Privacy: ${privacy}`
  );

  if (privacy === "private" && !isAlreadyMember) {
    logSecurityEvent("PRIVATE_ROOM_JOIN_ATTEMPT", {
      roomId,
      roomName,
      userId: currentUserId,
    });
    openPrivateRoomPasswordModal(roomId, roomName);
  } else if (privacy === "private" && isAlreadyMember) {
    debugLog(`User is already member of private room ${roomId}`);
    logSecurityEvent("PRIVATE_ROOM_REENTRY", {
      roomId,
      userId: currentUserId,
    });
    enterRoom(roomId);
  } else if (privacy === "public") {
    if (isAlreadyMember) {
      debugLog(`User is already member of public room ${roomId}`);
      enterRoom(roomId);
    } else {
      attemptJoinPublicRoom(roomId);
    }
  }
}

/* ===== ATTEMPT TO JOIN PUBLIC ROOM ===== */
async function attemptJoinPublicRoom(roomId) {
  try {
    debugLog(`Attempting to join public room: ${roomId}`);

    const submitBtn = document.querySelector(
      `[data-room-id="${roomId}"] .join-btn`
    );
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML =
        '<i class="bi bi-arrow-clockwise spinning"></i> Joining...';
    }

    const response = await postJsonWithAuth(
      `${STUDY_GROUPS_API}/${encodeURIComponent(roomId)}/join`,
      {}
    );

    if (response && response.success) {
      showToast("Joined room successfully!", "success");
      logSecurityEvent("PUBLIC_ROOM_JOINED", { roomId });

      await fetchAndRenderStudyRooms();

      setTimeout(() => {
        enterRoom(roomId);
      }, 500);
    }
  } catch (err) {
    console.error("Error joining public room:", err);
    let msg = "Could not join room";
    if (err && err.body && err.body.error) {
      msg = err.body.error;
    }
    showToast(msg, "error");
    logSecurityEvent("PUBLIC_ROOM_JOIN_ERROR", {
      roomId,
      error: err?.message,
    });
  } finally {
    const submitBtn = document.querySelector(
      `[data-room-id="${roomId}"] .join-btn`
    );
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "Enter Now";
    }
  }
}

/* ===== TAB FILTERING LOGIC ===== */
function filterRoomsByTab(tab) {
  if (!Array.isArray(allRooms)) {
    debugLog("allRooms is not an array");
    return [];
  }

  const currentUserId = auth.currentUser?.uid;
  debugLog(`Filtering by tab: ${tab} | Total rooms: ${allRooms.length}`);

  let filtered = [];

  switch (tab) {
    case "all-rooms":
      filtered = allRooms;
      break;

    case "public-rooms":
      filtered = allRooms.filter((room) => room.privacy === "public");
      break;

    case "private-rooms":
      filtered = allRooms.filter((room) => room.privacy === "private");
      break;

    case "joined-rooms":
      filtered = allRooms.filter((room) => {
        const participants = room.participants || [];
        const createdBy = room.creator || room.createdBy;
        return (
          participants.includes(currentUserId) && createdBy !== currentUserId
        );
      });
      break;

    case "created-rooms":
      filtered = allRooms.filter((room) => {
        const createdBy = room.creator || room.createdBy;
        return createdBy === currentUserId;
      });
      break;

    default:
      filtered = allRooms;
  }

  debugLog(`Filtered results: ${filtered.length} rooms for tab ${tab}`);
  return filtered;
}

/* ===== RENDER ALL ROOMS AT ONCE ===== */
function renderAllRooms() {
  debugLog("Rendering all rooms");

  const roomsContainer = document.getElementById("roomContainer");
  if (!roomsContainer) {
    console.error("Room container not found");
    return;
  }

  let roomGrid = document.getElementById("roomGrid");
  if (roomGrid) {
    debugLog("Removing old roomGrid");
    roomGrid.remove();
  }

  hideLoadingIndicator();
  hideEndOfListMessage();
  const emptyState = document.getElementById("emptyState");
  if (emptyState) {
    debugLog("Removing old empty state");
    emptyState.remove();
  }

  if (filteredRooms.length === 0) {
    debugLog("No filtered rooms - showing empty state");
    const emptyStateDiv = document.createElement("div");
    emptyStateDiv.className = "empty-state";
    emptyStateDiv.id = "emptyState";
    emptyStateDiv.innerHTML = `
      <div class="empty-state-icon"><i class="bi bi-door-closed"></i></div>
      <h3>No Study Rooms</h3>
      <p>No rooms match the selected filter. Try selecting a different tab or create a new room.</p>
      <div class="empty-state-action">
        <button class="btn btn-success" id="createFirstRoomButton"><i class="bi bi-plus-lg"></i> Create Room</button>
      </div>
    `;
    roomsContainer.appendChild(emptyStateDiv);

    const createFirstRoomBtn = document.getElementById("createFirstRoomButton");
    if (createFirstRoomBtn) {
      createFirstRoomBtn.addEventListener("click", openCreateRoomModal);
    }
    return;
  }

  roomGrid = document.createElement("div");
  roomGrid.className = "room-grid";
  roomGrid.id = "roomGrid";
  roomsContainer.appendChild(roomGrid);

  debugLog(`Rendering ${filteredRooms.length} rooms`);

  filteredRooms.forEach((room) => {
    const cardElement = createRoomCardElement(room);
    roomGrid.appendChild(cardElement);
    displayedRooms.push(room);
  });

  debugLog(
    `Grid now has ${roomGrid.children.length} room cards | Total displayed: ${displayedRooms.length}`
  );

  // Subscribe to presence updates for all displayed rooms
  subscribeToAllDisplayedRoomsPresence();
}

/* ===== LOADING INDICATORS ===== */
function showLoadingIndicator() {
  let loader = document.getElementById("roomGridLoader");
  if (!loader) {
    const roomsContainer = document.getElementById("roomContainer");
    if (!roomsContainer) return;

    loader = document.createElement("div");
    loader.id = "roomGridLoader";
    loader.className = "room-grid-loader";
    loader.innerHTML = `
      <div class="loader-spinner">
        <i class="bi bi-arrow-clockwise spinning"></i>
      </div>
      <p>Loading rooms...</p>
    `;
    roomsContainer.appendChild(loader);
    debugLog("Created loading indicator");
  }
  loader.style.display = "flex";
}

function hideLoadingIndicator() {
  const loader = document.getElementById("roomGridLoader");
  if (loader) {
    loader.style.display = "none";
  }
}

function showEndOfListMessage() {
  let endMessage = document.getElementById("roomGridEndMessage");
  if (!endMessage) {
    const roomsContainer = document.getElementById("roomContainer");
    if (!roomsContainer) return;

    endMessage = document.createElement("div");
    endMessage.id = "roomGridEndMessage";
    endMessage.className = "room-grid-end-message";
    endMessage.innerHTML = `
      <div class="end-message-content">
        <i class="bi bi-check-circle-fill"></i>
        <p>You've reached the end!</p>
        <small>All rooms loaded</small>
      </div>
    `;
    roomsContainer.appendChild(endMessage);
    debugLog("Created end-of-list message");
  }
  endMessage.style.display = "block";
}

function hideEndOfListMessage() {
  const endMessage = document.getElementById("roomGridEndMessage");
  if (endMessage) {
    endMessage.style.display = "none";
  }
}

/* ===== TAB SYSTEM ===== */
function applyTabFilter(tab) {
  debugLog(`Applying tab filter: ${tab}`);

  currentTab = tab;
  displayedRooms = [];
  filteredRooms = filterRoomsByTab(tab);

  debugLog(`Filtered rooms count: ${filteredRooms.length} for tab ${tab}`);

  try {
    localStorage.setItem("lastActiveTab", tab);
  } catch {}

  renderAllRooms();
}

/* ===== Notifications ===== */
export function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) return;
  const toastId = "toast-" + Date.now();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.id = toastId;
  let iconClass = "bi-check-circle-fill";
  if (type === "error") iconClass = "bi-exclamation-circle-fill";
  if (type === "info") iconClass = "bi-info-circle-fill";
  toast.innerHTML = `
    <div class="toast-icon ${type}">
      <i class="bi ${iconClass}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${
        type.charAt(0).toUpperCase() + type.slice(1)
      }</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <div class="toast-close" onclick="window.closeToast('${toastId}')">
      <i class="bi bi-x"></i>
    </div>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => closeToast(toastId), 5000);
}

/* ===== Show password error hint ===== */
function showPasswordError(inputElement, message) {
  if (!inputElement) return;

  // Find the container (mb-3 div that contains the password-input-wrapper)
  const container =
    inputElement.closest(".mb-3") || inputElement.parentElement?.parentElement;
  if (!container) return;

  // Remove any existing error message
  const existingError = container.querySelector(".password-error-hint");
  if (existingError) {
    existingError.remove();
  }

  // Add error class to input
  inputElement.classList.add("is-invalid");
  inputElement.style.borderColor = "#dc3545";

  // Create error message element
  const errorHint = document.createElement("div");
  errorHint.className = "password-error-hint";
  errorHint.style.cssText =
    "color: #dc3545; font-size: 13px; margin-top: 8px; display: flex; align-items: center; gap: 5px;";
  errorHint.innerHTML = `<i class="bi bi-exclamation-circle-fill"></i> ${escapeHtml(
    message
  )}`;

  // Insert after the password-input-wrapper
  const wrapper = container.querySelector(".password-input-wrapper");
  if (wrapper) {
    wrapper.insertAdjacentElement("afterend", errorHint);
  } else {
    container.appendChild(errorHint);
  }

  // Remove error when user starts typing (using a named function to properly remove)
  const clearError = function () {
    inputElement.classList.remove("is-invalid");
    inputElement.style.borderColor = "";
    const hint = container.querySelector(".password-error-hint");
    if (hint) hint.remove();
    inputElement.removeEventListener("input", clearError);
  };

  inputElement.addEventListener("input", clearError);
}

export function closeToast(toastId) {
  const toast = document.getElementById(toastId);
  if (toast) {
    toast.style.opacity = "0";
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }
}

/* ===== DOM Init ===== */
document.addEventListener("DOMContentLoaded", function () {
  debugLog("DOM loaded - initializing");
  syncThemeUI();

  try {
    const createRoomModalElement = document.getElementById("createRoomModal");
    if (createRoomModalElement) {
      createRoomModal = new bootstrap.Modal(createRoomModalElement);
    }

    const passwordModalElement = document.getElementById(
      "privateRoomPasswordModal"
    );
    if (passwordModalElement) {
      passwordModal = new bootstrap.Modal(passwordModalElement);
    }

    const deactivationModalElement = document.getElementById(
      "roomDeactivatedModal"
    );
    if (deactivationModalElement) {
      deactivationModal = new bootstrap.Modal(deactivationModalElement);
    }

    initializeTooltips();
  } catch (err) {
    console.error("Error initializing Bootstrap components:", err);
  }

  initializePasswordToggles();
  initializePasswordRequirements();

  initializeTabSystem();

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      handleSearch.call(this, e);
    });
  }

  const submitPasswordBtn = document.getElementById(
    "submitPrivateRoomPassword"
  );
  if (submitPasswordBtn) {
    submitPasswordBtn.addEventListener(
      "click",
      handlePrivateRoomPasswordSubmit
    );
  }

  const passwordInput = document.getElementById("privateRoomPassword");
  if (passwordInput) {
    passwordInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        handlePrivateRoomPasswordSubmit();
      }
    });
  }

  checkAuth();
});

/* ===== Tab System Initialization ===== */
function initializeTabSystem() {
  const tabButtons = document.querySelectorAll(".room-tab");
  if (tabButtons.length === 0) {
    console.warn("No tab buttons found");
    return;
  }

  const lastTab = localStorage.getItem("lastActiveTab") || "all-rooms";
  debugLog(`Initializing tabs with last active: ${lastTab}`);

  tabButtons.forEach((btn) => {
    const tabId = btn.getAttribute("data-tab");

    btn.addEventListener("click", function () {
      debugLog(`Tab clicked: ${tabId}`);
      tabButtons.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      this.classList.add("active");
      this.setAttribute("aria-selected", "true");

      applyTabFilter(tabId);
    });

    if (tabId === lastTab) {
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      currentTab = lastTab;
    }
  });
}

function checkAuth() {
  debugLog("Checking authentication");
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      debugLog(`User authenticated: ${user.email}`);
      await loadUserData(user);
      initializeAuthenticatedUI();
    } else {
      debugLog("User not authenticated - redirecting to login");
      const currentPath = window.location.pathname;
      const pathParts = currentPath.split("/");
      const loginPath =
        pathParts.slice(0, pathParts.length - 1).join("/") + "/login.html";
      window.location.href = window.location.origin + loginPath;
    }
  });
}

async function loadUserData(user) {
  let userProgram = "";
  let userName = user.displayName || "";
  try {
    const userDocSnap = await getDoc(doc(db, "users", user.uid));
    if (userDocSnap.exists()) {
      userProgram = userDocSnap.data().program || "";
      userName = userDocSnap.data().name || userName || user.email;
    }
  } catch (e) {
    console.error("Could not fetch user program:", e);
  }

  CURRENT_SESSION = {
    datetime: new Date().toISOString(),
    user: userName || user.email,
    userAvatar: userName ? userName[0] : user.email ? user.email[0] : "U",
    userProgram: userProgram,
    email: user.email,
    uid: user.uid,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila",
  };

  updateSidebarUserInfo();
}

function updateSidebarUserInfo() {
  try {
    const avatar = document.getElementById("sidebarAvatar");
    const nameNode = document.getElementById("sidebarName");
    const courseNode = document.getElementById("sidebarCourse");

    const currentName = nameNode ? nameNode.textContent.trim() : "";
    const nameIsDefault =
      !currentName ||
      currentName === "" ||
      currentName === "Loading..." ||
      currentName === "Not signed in";

    if (nameNode && nameIsDefault && CURRENT_SESSION?.user) {
      nameNode.textContent = CURRENT_SESSION.user;
    }

    const currentCourse = courseNode ? courseNode.textContent.trim() : "";
    const courseIsDefault =
      !currentCourse || currentCourse === "" || currentCourse === "Loading...";
    if (courseNode && courseIsDefault) {
      courseNode.textContent = CURRENT_SESSION.userProgram || "";
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

/* ===== Theme ===== */
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
    // no-op
  }
}

/* ===== Bootstrap & Tooltips ===== */
function initializeTooltips() {
  try {
    var tooltipTriggerList = [].slice.call(
      document.querySelectorAll('[data-bs-toggle="tooltip"]')
    );
    tooltipTriggerList.map(function (tooltipTriggerEl) {
      return new bootstrap.Tooltip(tooltipTriggerEl);
    });
  } catch (err) {
    console.error("Error initializing tooltips:", err);
  }
}

/* ===== Authenticated UI ===== */
function initializeAuthenticatedUI() {
  debugLog("Initializing authenticated UI");

  const createRoomButton = document.getElementById("createRoomButton");
  if (createRoomButton) {
    createRoomButton.addEventListener("click", openCreateRoomModal);
  }

  const createFirstRoomButton = document.getElementById(
    "createFirstRoomButton"
  );
  if (createFirstRoomButton) {
    createFirstRoomButton.addEventListener("click", openCreateRoomModal);
  }

  const createRoomBtn = document.getElementById("createRoomBtn");
  if (createRoomBtn) {
    createRoomBtn.addEventListener("click", handleCreateRoom);
  }

  fetchAndRenderStudyRooms();

  setTimeout(() => {
    showToast(
      `Welcome, ${
        CURRENT_SESSION?.user || "User"
      }! Create your first study room to get started.`,
      "info"
    );
  }, 1000);
}

/* ===== Create Room ===== */
function openCreateRoomModal() {
  try {
    const modalElement = document.getElementById("createRoomModal");
    if (!modalElement) {
      showToast(
        "Cannot open create room modal — DOM element missing.",
        "error"
      );
      return;
    }

    if (!createRoomModal) {
      createRoomModal = new bootstrap.Modal(modalElement);
    }

    createRoomModal.show();
  } catch (err) {
    console.error("Failed to open create room modal:", err);
    showToast("Cannot open create room modal", "error");
  }
}

async function handleCreateRoom() {
  const roomNameEl = document.getElementById("roomName");
  const roomDescEl = document.getElementById("roomDescription");
  const privacyEl = document.querySelector('input[name="privacy"]:checked');
  const roomPasswordEl = document.getElementById("roomPassword");

  if (!roomNameEl) {
    showToast("Form elements not found", "error");
    return;
  }

  const roomName = sanitizeString(roomNameEl.value, MAX_ROOM_NAME_LENGTH);
  const description = sanitizeString(
    roomDescEl ? roomDescEl.value : "",
    MAX_DESCRIPTION_LENGTH
  );
  const privacy = privacyEl ? privacyEl.value : "public";
  const password = roomPasswordEl ? roomPasswordEl.value : null;

  if (!roomName) {
    showToast("Room name is required", "error");
    return;
  }

  if (roomName.length === 0) {
    showToast("Room name cannot be empty", "error");
    return;
  }

  if (privacy === "private") {
    if (!password || password.trim().length === 0) {
      showToast("Private room password is required", "error");
      return;
    }

    if (password.length < 8) {
      showToast("Password must be at least 8 characters", "error");
      return;
    }

    if (password.length > 100) {
      showToast("Password must be 100 characters or less", "error");
      return;
    }

    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasUppercase || !hasLowercase || !hasNumber) {
      showToast(
        "Password must contain uppercase, lowercase, and numbers",
        "error"
      );
      return;
    }
  }

  const confirmed = confirm(
    `Are you sure you want to create room "${escapeHtml(
      roomName
    )}"?\n\nPrivacy: ${privacy}${
      privacy === "private" ? "\nPassword Protected: Yes" : ""
    }`
  );

  if (!confirmed) {
    logSecurityEvent("ROOM_CREATION_CANCELLED", {});
    return;
  }

  try {
    const payload = {
      name: roomName,
      description: description,
      privacy: privacy,
    };

    if (privacy === "private" && password) {
      payload.password = password;
    }

    debugLog("Creating room with payload:", payload);

    const createBtn = document.getElementById("createRoomBtn");
    if (createBtn) {
      createBtn.disabled = true;
      createBtn.innerHTML =
        '<i class="bi bi-arrow-clockwise spinning"></i> Creating...';
    }

    const response = await postJsonWithAuth(STUDY_GROUPS_API, payload);

    debugLog("Room created successfully:", response);

    showToast("Study room created successfully!", "success");
    logSecurityEvent("ROOM_CREATED", {
      roomName,
      privacy,
      hasPassword: privacy === "private",
    });

    if (createRoomModal) createRoomModal.hide();

    resetCreateRoomForm();
    fetchAndRenderStudyRooms();
  } catch (err) {
    console.error("Error creating room:", err);
    logSecurityEvent("ROOM_CREATION_FAILED", {
      error: err && err.message ? err.message : "Unknown",
    });

    let msg = "Could not create room. Please try again later.";
    if (err && err.body && (err.body.error || err.body.message)) {
      msg = err.body.error || err.body.message;
    } else if (err && err.body && err.body.details) {
      msg = err.body.details.join(", ");
    } else if (err && err.message) {
      msg = err.message;
    }
    showToast(msg, "error");
  } finally {
    const createBtn = document.getElementById("createRoomBtn");
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.innerHTML = '<i class="bi bi-plus-lg"></i> Create Room';
    }
  }
}

function resetCreateRoomForm() {
  const form = document.getElementById("createRoomForm");
  if (form) form.reset();

  const passwordField = document.getElementById("privateRoomPasswordField");
  if (passwordField) {
    passwordField.style.display = "none";
  }

  const toggleBtn = document.getElementById("passwordToggleBtn");
  if (toggleBtn) {
    const icon = toggleBtn.querySelector("i");
    if (icon) {
      icon.classList.remove("bi-eye-slash");
      icon.classList.add("bi-eye");
    }
  }

  const reqElements = document.querySelectorAll(".requirement-item");
  reqElements.forEach((req) => {
    req.classList.remove("met");
    req.classList.add("unmet");
    const icon = req.querySelector("i");
    if (icon) {
      icon.classList.remove("bi-check-circle-fill");
      icon.classList.add("bi-circle");
    }
  });
}

/* ===== Search ===== */
function handleSearch() {
  const searchTerm = this.value.trim().toLowerCase();
  const roomCards = document.querySelectorAll(".room-card");
  if (roomCards.length === 0) return;

  roomCards.forEach((room) => {
    const titleEl = room.querySelector(".room-title");
    const descEl = room.querySelector(".room-description");
    const title = titleEl ? titleEl.textContent.toLowerCase() : "";
    const description = descEl ? descEl.textContent.toLowerCase() : "";

    if (title.includes(searchTerm) || description.includes(searchTerm)) {
      room.style.display = "block";
    } else {
      room.style.display = "none";
    }
  });
}

/* ===== Fetch & Render ===== */
async function fetchAndRenderStudyRooms() {
  try {
    showLoadingIndicator();
    debugLog("Fetching rooms from API");
    const rooms = await fetchJsonWithAuth(STUDY_GROUPS_API, { method: "GET" });
    allRooms = Array.isArray(rooms) ? rooms : [];

    debugLog(`Fetched ${allRooms.length} total rooms`, allRooms);

    applyTabFilter(currentTab);

    window._backendRooms = allRooms;
    hideLoadingIndicator();
  } catch (err) {
    console.error("Error fetching rooms:", err);
    showToast("Unable to load study rooms. Please try again later.", "error");
    hideLoadingIndicator();
  }
}

/* ===== Keyboard Shortcuts ===== */
document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
    e.preventDefault();
    const themeToggle = document.getElementById("themeToggle");
    if (themeToggle) themeToggle.click();
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
    e.preventDefault();
    openCreateRoomModal();
  }

  if (e.key === "Escape") {
    if (
      createRoomModal &&
      typeof createRoomModal._isShown === "boolean" &&
      createRoomModal._isShown
    ) {
      createRoomModal.hide();
    }
  }
});

/* ===== Enter Room ===== */
export function enterRoom(roomId) {
  try {
    showToast("Entering study room...", "info");
    logSecurityEvent("ROOM_ENTERED", { roomId });
    setTimeout(() => {
      window.location.href = `study-room-inside.html?room=${encodeURIComponent(
        roomId
      )}`;
    }, 800);
  } catch (err) {
    console.error("enterRoom error:", err);
    showToast("Could not enter room.", "error");
  }
}

/* ===== Logout ===== */
export function logout() {
  if (confirm("Are you sure you want to log out?")) {
    try {
      signOut(auth).catch((err) =>
        console.error("Error signing out from Firebase:", err)
      );
    } catch (err) {
      console.error("Error during logout:", err);
    }

    try {
      localStorage.removeItem("userSession");
    } catch {}

    const logoutMessage = document.createElement("div");
    logoutMessage.className = "logout-message";
    logoutMessage.innerHTML = `
      <div class="logout-message-content">
        <i class="bi bi-check-circle-fill"></i>
        <p>You have been successfully logged out.</p>
        <p class="redirect-text">Redirecting to login page...</p>
      </div>
    `;
    document.body.appendChild(logoutMessage);

    setTimeout(() => {
      const currentPath = window.location.pathname;
      const pathParts = currentPath.split("/");
      const loginPath =
        pathParts.slice(0, pathParts.length - 1).join("/") + "/login.html";
      window.location.href = window.location.origin + loginPath;
    }, 1200);
  }
}

/* ===== Window Bridge ===== */
window.enterRoom = enterRoom;
window.showToast = showToast;
window.closeToast = closeToast;
window.logout = logout;
window.handleRoomJoin = handleRoomJoin;
window.closeDeactivationModal = closeDeactivationModal;
