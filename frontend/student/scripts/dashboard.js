// frontend/student/scripts/dashboard.js
// ✅ CLEANED: Removed admin panel check (moved to sidebar.js)
// ✅ UPDATED: Active Study Rooms now match study-rooms.js design
// ✅ FIXED: Use fetchJsonWithAuth instead of plain fetch for study rooms
// ✅ IMPROVED: New todo modal with priority, presets, and smart reminder options
// ✅ IMPLEMENTED: Full search experience with real-time filtering
// ✅ REMOVED: All console.log statements (production-safe)
// ✅ REMOVED: Keyboard shortcuts (simplified UX)

import { auth, db, onAuthStateChanged } from "../../config/firebase.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import fetchWithAuth, {
  fetchJsonWithAuth,
  postJsonWithAuth,
  putJsonWithAuth,
  deleteWithAuth,
} from "./apiClient.js";
import { apiUrl } from "../../config/appConfig.js";

// Wait for Firebase Authentication to load and set CURRENT_SESSION dynamically
let CURRENT_SESSION = null;
let passwordModal = null;
let pendingPrivateRoomId = null;

onAuthStateChanged(async (user) => {
  if (user) {
    // ===== Check if user is banned =====
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));

      if (userDoc.exists()) {
        const userData = userDoc.data();

        if (userData.isBanned === true) {
          // Show error message
          const errorDiv = document.createElement("div");
          errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #ef4444;
            color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 500px;
            text-align: center;
            font-size: 16px;
            font-weight: 600;
          `;
          errorDiv.innerHTML = `
            🚫 Your account has been banned and you cannot access this page. You are being logged out...
          `;
          document.body.appendChild(errorDiv);

          // Sign out
          await auth.signOut();
          sessionStorage.removeItem("idToken");
          sessionStorage.removeItem("uid");

          // Redirect to login
          setTimeout(() => {
            window.location.href = "login.html";
          }, 2000);

          return;
        }
      }
    } catch (err) {
      console.error("[dashboard] Error checking ban status:", err);
      // Continue anyway on error
    }

    // Fetch user program from Firestore (keyed by UID)
    let userProgram = "";
    try {
      const userDocSnap = await getDoc(doc(db, "users", user.uid));
      if (userDocSnap.exists()) {
        userProgram = userDocSnap.data().program || "";
      }
    } catch (e) {
      console.error("Could not fetch user program:", e);
    }

    CURRENT_SESSION = {
      uid: user.uid,
      datetime: new Date().toISOString(),
      user: user.displayName || user.email,
      userAvatar: user.displayName
        ? user.displayName[0]
        : user.email
        ? user.email[0]
        : "U",
      userProgram: userProgram,
      email: user.email,
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila",
    };

    updateSidebarUserInfo();
    validateUserSession();
    scheduleUIInit();

    // After login, show a small banner reminder once per login
    try {
      const userDocSnap = await getDoc(doc(db, "users", user.uid));
      const profile = userDocSnap.exists() ? userDocSnap.data() : {};
      const completion = computeProfileCompletionPercent(profile);
      if (completion < 100) {
        showProfileCompletionBanner(completion);
      }
    } catch (e) {
      // ignore reminder errors
    }
  } else {
    window.location.href = "login.html";
  }
});

function computeProfileCompletionPercent(p = {}) {
  // Required fields for completion: name, studentNumber, program
  const required = [
    Boolean(p && typeof p.name === "string" && p.name.trim()),
    Boolean(p && typeof p.studentNumber === "string" && p.studentNumber.trim()),
    Boolean(p && typeof p.program === "string" && p.program.trim()),
  ];
  const total = required.length;
  const done = required.filter(Boolean).length;
  // optional bonus (kept simple): institution, yearLevel, specialization, graduation, photo, bio
  const optionalKeys = [
    "institution",
    "yearLevel",
    "specialization",
    "graduation",
    "photo",
    "bio",
  ];
  const optionalTotal = optionalKeys.length;
  const optionalDone = optionalKeys.reduce(
    (acc, k) => acc + (p && p[k] ? 1 : 0),
    0
  );
  const pct = Math.round(
    (done / total) * 80 +
      (optionalTotal ? (optionalDone / optionalTotal) * 20 : 0)
  );
  return Math.max(0, Math.min(100, pct));
}

function showProfileCompletionBanner(percent) {
  if (document.getElementById("profileCompletionBanner")) return;

  const banner = document.createElement("div");
  banner.id = "profileCompletionBanner";
  banner.style.cssText = `
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    width: min(840px, 94%);
    background: var(--primary-light, #f3fbf4);
    color: var(--dark-text, #1b1b1b);
    border: 1px solid var(--border-light, #e0e0e0);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,.08);
    z-index: 2000;
    padding: 10px 14px; display:flex; align-items:center; gap:12px;`;

  const icon = document.createElement("i");
  icon.className = "bi bi-person-check";
  icon.style.cssText = "font-size:18px;color:var(--primary-color,#2e7d32);";

  const text = document.createElement("div");
  text.style.cssText = "flex:1; font-size:14px;";
  text.innerHTML = `Your profile is <strong>${percent}%</strong> complete. Finish your profile to unlock all features.`;

  const later = document.createElement("button");
  later.textContent = "Later";
  later.style.cssText = `
    border: 1px solid var(--border-light, #d0d0d0);
    background: #fff; color: var(--dark-text, #1b1b1b);
    padding: 6px 10px; border-radius: 8px; cursor: pointer; font-weight:600;`;
  later.onclick = () => banner.remove();

  const ok = document.createElement("button");
  ok.textContent = "Okay";
  ok.style.cssText = `
    border: 0; background: var(--primary-color,#2e7d32); color:#fff;
    padding: 6px 12px; border-radius: 8px; cursor: pointer; font-weight:700;`;
  ok.onclick = () => {
    window.location.href = "profile.html";
  };

  banner.appendChild(icon);
  banner.appendChild(text);
  banner.appendChild(later);
  banner.appendChild(ok);
  document.body.appendChild(banner);
}

async function ensureProfileReminderOnce() {
  try {
    const existingBanner = document.getElementById("profileCompletionBanner");
    if (existingBanner) return;
    const user = auth && auth.currentUser;
    if (!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    const profile = snap.exists() ? snap.data() : {};
    const percent = computeProfileCompletionPercent(profile);
    if (percent < 100) {
      showProfileCompletionBanner(percent);
    }
  } catch (err) {
    // Silent fail
  }
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

    if (nameNode && nameIsDefault && CURRENT_SESSION && CURRENT_SESSION.user) {
      nameNode.textContent = CURRENT_SESSION.user;
    }

    const currentCourse = courseNode ? courseNode.textContent.trim() : "";
    const courseIsDefault =
      !currentCourse || currentCourse === "" || currentCourse === "Loading...";
    if (courseNode && courseIsDefault) {
      courseNode.textContent =
        (CURRENT_SESSION && CURRENT_SESSION.userProgram) || "";
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

// ========== Dynamic Room Pagination Vars ==========
let allRooms = [];
let currentRoomPage = 1;
let roomsPerPage = 9;
let searchActive = false;

const STUDY_GROUPS_API = apiUrl("/api/study-groups");

function $(sel) {
  return document.querySelector(sel);
}

function scheduleUIInit() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDashboardUI);
  } else {
    initDashboardUI();
  }
}

let renderDebounceTimer = null;
function renderRoomPageDebounced() {
  if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
  renderDebounceTimer = setTimeout(() => {
    renderRoomPage();
  }, 120);
}

function initDashboardUI() {
  watchSidebarToggle();

  const profileLink = document.getElementById("profileLink");
  if (profileLink) {
    profileLink.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = "profile.html";
    });
  }

  // ===== SEARCH FUNCTIONALITY =====
  const searchInput = document.querySelector(".search-input");
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();

      // Search with debounce (300ms delay)
      searchTimeout = setTimeout(() => {
        performSearch(query);
      }, 300);
    });

    // Clear search on ESC key
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        clearSearch();
      }
    });
  }

  const todoForm = document.getElementById("todoForm");
  const todoModal = document.getElementById("todoModal");
  if (todoForm) {
    todoForm.addEventListener("submit", function (e) {
      e.preventDefault();
      saveTodo();
    });
  }
  if (todoModal) {
    todoModal.addEventListener("click", function (e) {
      if (e.target === this) {
        closeTodoModal();
      }
    });
  }

  // Initialize password modal
  initPasswordModal();

  // Initialize password toggle
  initializePasswordToggles();

  // Initialize new todo features
  initPrioritySelector();
  initPresetReminders();
  initReminderToggle();

  initUIEvents();
  fetchAndRenderRooms();
  fetchTodos();

  // Fallback: ensure reminder appears if still logged in and banner missing
  ensureProfileReminderOnce();
}

function watchSidebarToggle() {
  const sidebarEl = document.getElementById("sidebar");
  if (!sidebarEl) return;
  let lastOpen = sidebarEl.classList.contains("open");
  const observer = new MutationObserver(() => {
    const nowOpen = sidebarEl.classList.contains("open");
    if (nowOpen !== lastOpen) {
      lastOpen = nowOpen;
      renderRoomPageDebounced();
    }
  });
  observer.observe(sidebarEl, { attributes: true, attributeFilter: ["class"] });
}

function getRoomsPerPage() {
  const sidebarEl = document.getElementById("sidebar");
  return sidebarEl && sidebarEl.classList.contains("open") ? 9 : 12;
}

// ===== SEARCH FUNCTIONALITY =====
function performSearch(query) {
  const trimmedQuery = query.trim();

  // If empty, reset to all rooms
  if (!trimmedQuery) {
    searchActive = false;
    renderRoomPage(); // Show all rooms again
    return;
  }

  // Search in study rooms
  const matchedRooms = allRooms.filter(
    (room) =>
      room.name.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
      (room.description &&
        room.description.toLowerCase().includes(trimmedQuery.toLowerCase()))
  );

  searchActive = true;
  renderSearchResults(trimmedQuery, matchedRooms);
}

function renderSearchResults(query, matchedRooms) {
  const roomGrid = document.getElementById("roomGrid");
  if (!roomGrid) return;

  if (matchedRooms.length === 0) {
    roomGrid.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--medium-text);">
        <i class="bi bi-search" style="font-size: 48px; margin-bottom: 15px; display: block; opacity: 0.5;"></i>
        <p>No rooms found matching "<strong>${escapeHtml(query)}</strong>"</p>
        <p style="font-size: 12px; margin-top: 10px;">Try searching for different keywords</p>
      </div>
    `;
    return;
  }

  roomGrid.innerHTML = "";
  matchedRooms.forEach((room) => {
    const card = createRoomCardElement(room);
    roomGrid.appendChild(card);
  });

  // Show result count
  const resultText =
    matchedRooms.length === 1
      ? "1 room found"
      : `${matchedRooms.length} rooms found`;
  showToast(`Search: ${resultText}`, "info");

  animateRoomCards();
}

function clearSearch() {
  const searchInput = document.querySelector(".search-input");
  if (searchInput) {
    searchInput.value = "";
  }
  searchActive = false;
  renderRoomPage(); // Reset to all rooms
}

// ===== PASSWORD VISIBILITY TOGGLE =====
function initializePasswordToggles() {
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
}

// ===== SECURITY: Utilities =====
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

function showToast(message, type = "success") {
  showNotification(message, type);
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

  // Remove error when user starts typing
  const clearError = function () {
    inputElement.classList.remove("is-invalid");
    inputElement.style.borderColor = "";
    const hint = container.querySelector(".password-error-hint");
    if (hint) hint.remove();
    inputElement.removeEventListener("input", clearError);
  };

  inputElement.addEventListener("input", clearError);
}

// ===== PRIVATE ROOM PASSWORD MODAL =====
function initPasswordModal() {
  try {
    const modalElement = document.getElementById("privateRoomPasswordModal");
    if (!modalElement) {
      console.error("Private room password modal not found in DOM");
      return;
    }
    passwordModal = new bootstrap.Modal(modalElement);
  } catch (err) {
    console.error("Failed to initialize password modal:", err);
  }
}

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

    // Reset toggle button to show eye icon
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

      if (passwordModal) passwordModal.hide();
      passwordInput.value = "";

      await fetchAndRenderRooms();

      setTimeout(() => {
        enterRoom(pendingPrivateRoomId);
      }, 500);
    } else {
      showToast("Incorrect password", "error");
      // Show error hint near password field BEFORE clearing input
      showPasswordError(passwordInput, "Incorrect password. Please try again.");
      passwordInput.value = "";
    }
  } catch (err) {
    console.error("Error verifying password:", err);
    let msg = "Incorrect password. Please try again.";
    // Check for specific error messages from API
    if (err && err.message) {
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
  } finally {
    const submitBtn = document.getElementById("submitPrivateRoomPassword");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> Verify Password';
    }
  }
}

// ===== ROOM CARD FACTORY WITH PRIVACY BADGES =====
function createRoomCardElement(room) {
  const privacyBadgeHtml =
    room.privacy === "private"
      ? `<span class="privacy-badge private"><i class="bi bi-lock-fill"></i> Private</span>`
      : `<span class="privacy-badge public"><i class="bi bi-globe"></i> Public</span>`;

  const roomNameEscaped = escapeHtml(room.name);
  const roomDescEscaped = escapeHtml(
    room.description || "No description provided."
  );

  const card = document.createElement("div");
  card.className = "room-card";
  card.setAttribute("data-room-id", room.id);
  card.innerHTML = `
    <div class="room-header">
      <div class="room-header-content">
        <h3 class="room-title">${roomNameEscaped}</h3>
        <p class="room-description">${roomDescEscaped}</p>
      </div>
      <div class="privacy-badge-container">
        ${privacyBadgeHtml}
      </div>
    </div>
    <div class="room-footer">
      <span class="participant-count"><i class="bi bi-people"></i> ${
        room.participants ? room.participants.length : 1
      } participant${
    room.participants && room.participants.length > 1 ? "s" : ""
  }</span>
      <button class="join-btn" onclick="window.handleDashboardRoomJoin('${escapeHtml(
        room.id
      )}', '${escapeHtml(room.name)}', '${room.privacy}')">Enter Now</button>
    </div>
  `;
  return card;
}

// ===== HANDLE ROOM JOIN (with privacy check) =====
export function handleDashboardRoomJoin(roomId, roomName, privacy) {
  const room = allRooms.find((r) => String(r.id) === String(roomId));
  if (!room) {
    showToast("Room not found", "error");
    return;
  }

  const currentUserId = CURRENT_SESSION?.uid;
  if (!currentUserId) {
    showToast("User not authenticated", "error");
    return;
  }

  const isAlreadyMember = (room.participants || []).includes(currentUserId);

  // If private room AND user is NOT already a member → require password
  if (privacy === "private" && !isAlreadyMember) {
    openPrivateRoomPasswordModal(roomId, roomName);
  } else if (privacy === "private" && isAlreadyMember) {
    // Already a member of private room → enter directly
    enterRoom(roomId);
  } else if (privacy === "public") {
    if (isAlreadyMember) {
      // Already a member → enter directly
      enterRoom(roomId);
    } else {
      // Not a member yet → attempt to join public room
      attemptJoinPublicRoom(roomId);
    }
  }
}

async function attemptJoinPublicRoom(roomId) {
  try {
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
      await fetchAndRenderRooms();

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

function enterRoom(roomId) {
  try {
    showToast("Entering study room...", "info");
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

function showNotification(message, type = "info") {
  // Silently log errors for debugging, but don't spam console
  if (type === "error") {
    console.error(message);
  }
}

// ===== TO-DO MANAGEMENT - IMPROVED =====
let editingTodoIndex = -1;
let todos = [];

// ===== IMPROVED TODO MODAL HANDLING =====
function openTodoModal() {
  const modal = document.getElementById("todoModal");
  if (modal) {
    modal.classList.add("open");
    const todoText = document.getElementById("todoText");
    if (todoText) {
      todoText.value = "";
      setTimeout(() => todoText.focus(), 100);
    }
    const todoReminder = document.getElementById("todoReminder");
    if (todoReminder) todoReminder.value = "";
    const todoPriority = document.getElementById("todoPriority");
    if (todoPriority) todoPriority.value = "low";
    const enableReminder = document.getElementById("enableReminder");
    if (enableReminder) enableReminder.checked = false;
    resetReminderOptions();
    editingTodoIndex = -1;
    const title = document.querySelector(".modal-title");
    if (title) title.textContent = "New Study Task";
  }
}

function closeTodoModal() {
  const modal = document.getElementById("todoModal");
  if (modal) modal.classList.remove("open");
}

function resetReminderOptions() {
  const reminderOptions = document.getElementById("reminderOptions");
  const enableReminder = document.getElementById("enableReminder");
  const reminderDate = document.getElementById("reminderDate");
  const reminderTime = document.getElementById("reminderTime");

  if (enableReminder) enableReminder.checked = false;
  if (reminderOptions) reminderOptions.style.display = "none";
  if (reminderDate) reminderDate.value = "";
  if (reminderTime) reminderTime.value = "09:00";
}

// Initialize priority selector
function initPrioritySelector() {
  document.querySelectorAll(".priority-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      document
        .querySelectorAll(".priority-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const priority = btn.getAttribute("data-priority");
      document.getElementById("todoPriority").value = priority;
    });
  });
}

// Initialize preset buttons
function initPresetReminders() {
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const preset = btn.getAttribute("data-preset");
      applyPreset(preset);

      document
        .querySelectorAll(".preset-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

function applyPreset(preset) {
  const reminderDate = document.getElementById("reminderDate");
  const reminderTime = document.getElementById("reminderTime");
  const now = new Date();

  if (preset === "today") {
    reminderDate.value = now.toISOString().split("T")[0];
    reminderTime.value = "17:00"; // 5 PM
  } else if (preset === "tomorrow") {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    reminderDate.value = tomorrow.toISOString().split("T")[0];
    reminderTime.value = "09:00"; // 9 AM
  } else if (preset === "week") {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    reminderDate.value = nextWeek.toISOString().split("T")[0];
    reminderTime.value = "09:00"; // 9 AM
  }
}

// Initialize reminder toggle
function initReminderToggle() {
  const enableReminder = document.getElementById("enableReminder");
  const reminderOptions = document.getElementById("reminderOptions");

  if (enableReminder) {
    enableReminder.addEventListener("change", () => {
      if (enableReminder.checked) {
        reminderOptions.style.display = "block";
      } else {
        reminderOptions.style.display = "none";
        document.getElementById("todoReminder").value = "";
      }
    });
  }
}

// Edit todo
async function editTodo(index) {
  editingTodoIndex = index;
  const todo = todos[index];
  const todoText = document.getElementById("todoText");
  const todoReminder = document.getElementById("todoReminder");
  const todoPriority = document.getElementById("todoPriority");

  if (todoText) todoText.value = todo.text;
  if (todoReminder) todoReminder.value = todo.reminder || "";
  if (todoPriority) todoPriority.value = todo.priority || "medium";

  const title = document.querySelector(".modal-title");
  if (title) title.textContent = "Edit Study Task";

  const modal = document.getElementById("todoModal");
  if (modal) modal.classList.add("open");
  if (todoText) todoText.focus();
}

function renderTodos() {
  const todoList = document.getElementById("todoList");
  if (!todoList) return;
  if (todos.length === 0) {
    todoList.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--medium-text);">
        <i class="bi bi-journal-text" style="font-size: 48px; margin-bottom: 15px; display: block; opacity: 0.5;"></i>
        <p>No study tasks yet.</p>
        <p style="font-size: 12px;">Click "New Task" to create your first reminder!</p>
      </div>
    `;
    return;
  }
  const sortedTodos = [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed - b.completed;
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (a.priority !== b.priority)
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    return new Date(b.created) - new Date(a.created);
  });

  todoList.innerHTML = sortedTodos
    .map((todo, index) => {
      const originalIndex = todos.findIndex((t) => t.id === todo.id);
      const priorityColor =
        todo.priority === "high"
          ? "#f44336"
          : todo.priority === "medium"
          ? "#ff9800"
          : "#4caf50";
      return `
        <div class="todo-item ${
          todo.completed ? "completed" : ""
        }" style="border-left-color: ${priorityColor}">
          <div class="todo-content">
            <input type="checkbox" class="todo-checkbox" ${
              todo.completed ? "checked" : ""
            } onchange="window.toggleTodo(${originalIndex})">
            <div class="todo-text ${todo.completed ? "completed" : ""}">${
        todo.text
      }</div>
          </div>
          <div class="todo-meta">
            <div class="todo-reminder">
              <i class="bi bi-clock"></i>
              <span>${
                todo.reminder
                  ? formatReminderDate(todo.reminder)
                  : "No reminder"
              }</span>
            </div>
            <div class="todo-actions">
              <button class="todo-action-btn" onclick="window.editTodo(${originalIndex})" title="Edit task">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="todo-action-btn" onclick="window.deleteTodo(${originalIndex})" title="Delete task">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function formatReminderDate(dateString) {
  if (!dateString) return "No reminder";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 0) {
    return "Overdue";
  } else if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `${diffMins} mins`;
  } else if (diffHours < 24) {
    return `${Math.floor(diffHours)}h`;
  } else {
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  }
}

function initUIEvents() {
  // Password modal submit handler
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
}

function validateUserSession() {
  if (CURRENT_SESSION) {
    // Session validation successful
  }
}

// ====================
// Room Pagination Logic
// ====================
// ✅ FIXED: Use fetchJsonWithAuth instead of plain fetch for authenticated requests
async function fetchAndRenderRooms() {
  const roomGrid = document.getElementById("roomGrid");
  const paginationDivId = "roomPagination";
  let paginationDiv = document.getElementById(paginationDivId);
  if (paginationDiv) paginationDiv.remove();

  if (!roomGrid) return;
  roomGrid.innerHTML = `<div style="text-align:center;">Loading rooms...</div>`;
  try {
    // ✅ FIXED: Changed from fetch() to fetchJsonWithAuth() to include auth token
    allRooms = await fetchJsonWithAuth(STUDY_GROUPS_API);

    if (!Array.isArray(allRooms) || allRooms.length === 0) {
      roomGrid.innerHTML = `<div style="text-align:center; color:var(--medium-text);">No active study rooms yet.</div>`;
      return;
    }

    renderRoomPage();
  } catch (err) {
    roomGrid.innerHTML = `<div style="text-align:center; color:red;">Could not load rooms.</div>`;
    console.error("Error: Failed to fetch study rooms.", err);
  }
}

function renderRoomPage() {
  const roomGrid = document.getElementById("roomGrid");
  const paginationDivId = "roomPagination";
  let paginationDiv = document.getElementById(paginationDivId);
  if (!roomGrid) return;
  if (paginationDiv) paginationDiv.remove();

  roomsPerPage = getRoomsPerPage();
  const totalPages = Math.ceil(allRooms.length / roomsPerPage);
  if (currentRoomPage > totalPages) currentRoomPage = totalPages || 1;
  const start = (currentRoomPage - 1) * roomsPerPage;
  const end = start + roomsPerPage;
  const roomsToShow = allRooms.slice(start, end);

  roomGrid.innerHTML = "";

  roomsToShow.forEach((room) => {
    const card = createRoomCardElement(room);
    roomGrid.appendChild(card);
  });

  if (totalPages > 1) {
    const pagination = document.createElement("div");
    pagination.className = "pagination-controls";
    pagination.id = paginationDivId;

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "Previous";
    prevBtn.disabled = currentRoomPage === 1;
    prevBtn.onclick = () => {
      if (currentRoomPage > 1) {
        currentRoomPage--;
        renderRoomPage();
      }
    };
    pagination.appendChild(prevBtn);

    const pageIndicator = document.createElement("span");
    pageIndicator.style.cssText =
      "margin: 0 12px; font-weight: 500; color: var(--dark-text);";
    pageIndicator.textContent = `Page ${currentRoomPage} of ${totalPages}`;
    pagination.appendChild(pageIndicator);

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next";
    nextBtn.disabled = currentRoomPage === totalPages;
    nextBtn.onclick = () => {
      if (currentRoomPage < totalPages) {
        currentRoomPage++;
        renderRoomPage();
      }
    };
    pagination.appendChild(nextBtn);

    roomGrid.parentNode.appendChild(pagination);
  }

  animateRoomCards();
}

function animateRoomCards() {
  const animatedElements = document.querySelectorAll(".room-card");
  animatedElements.forEach((element, index) => {
    element.style.opacity = "0";
    element.style.transform = "translateY(20px)";
    setTimeout(() => {
      element.style.transition = "all 0.6s ease-out";
      element.style.opacity = "1";
      element.style.transform = "translateY(0)";
    }, index * 100);
  });
}

// ========== Todos Backend ==========
async function fetchTodos() {
  try {
    const data = await fetchJsonWithAuth("/api/todos");
    todos = Array.isArray(data) ? data : [];
    renderTodos();
  } catch (err) {
    if (err && err.status === 401) {
      todos = [];
      renderTodos();
      return;
    }
    console.error("Error: Failed to fetch todos", err);
    showNotification("Could not load todos!", "error");
  }
}

// Update saveTodo to handle new reminder format
async function saveTodo() {
  const textEl = document.getElementById("todoText");
  const priorityEl = document.getElementById("todoPriority");
  const enableReminder = document.getElementById("enableReminder");
  const reminderDate = document.getElementById("reminderDate");
  const reminderTime = document.getElementById("reminderTime");

  const text = textEl ? textEl.value.trim() : "";
  const priority = priorityEl ? priorityEl.value : "medium";

  if (!text) {
    showNotification("Please enter a task description!", "error");
    return;
  }

  let reminder = null;
  if (enableReminder && enableReminder.checked) {
    if (!reminderDate.value) {
      showNotification("Please select a reminder date!", "error");
      return;
    }
    const dateTimeString = `${reminderDate.value}T${reminderTime.value}`;
    reminder = new Date(dateTimeString).toISOString();
  }

  const todo = {
    text,
    completed: false,
    reminder: reminder,
    created: new Date().toISOString(),
    priority: priority,
  };

  try {
    if (editingTodoIndex >= 0) {
      const id = todos[editingTodoIndex].id;
      const updatedTodo = {
        ...todos[editingTodoIndex],
        text,
        reminder,
        priority,
      };
      await putJsonWithAuth(
        `/api/todos/${encodeURIComponent(id)}`,
        updatedTodo
      );
      todos[editingTodoIndex] = updatedTodo;
      showNotification("Task updated!", "success");
    } else {
      const response = await postJsonWithAuth("/api/todos", todo);
      todos.push(response);
      showNotification("Task added!", "success");
    }
    closeTodoModal();
    renderTodos();
  } catch (err) {
    console.error("Error saving task:", err);
    showNotification("Could not save task.", "error");
  }
}

async function toggleTodo(index) {
  const todo = todos[index];
  if (!todo) return;

  todo.completed = !todo.completed;
  renderTodos();

  try {
    await putJsonWithAuth(`/api/todos/${encodeURIComponent(todo.id)}`, todo);
    showNotification(
      `Task ${todo.completed ? "completed" : "reopened"}!`,
      "success"
    );
  } catch (err) {
    console.error("Error: Could not update task.", err);
    todo.completed = !todo.completed;
    renderTodos();
    showNotification("Could not update task.", "error");
  }
}

async function deleteTodo(index) {
  const todo = todos[index];
  if (!todo) return;

  if (!confirm("Are you sure you want to delete this task?")) return;

  const removedTodo = todos.splice(index, 1)[0];
  renderTodos();

  try {
    await deleteWithAuth(`/api/todos/${encodeURIComponent(removedTodo.id)}`);
    showNotification("Task deleted!", "info");
  } catch (err) {
    console.error("Error: Could not delete task.", err);
    todos.splice(index, 0, removedTodo);
    renderTodos();
    showNotification("Could not delete task.", "error");
  }
}

// Expose for global use
window.StudyDashboard = {
  showNotification,
  openTodoModal,
  closeTodoModal,
  validateUserSession,
  currentUser: () => (CURRENT_SESSION ? CURRENT_SESSION.user : ""),
  currentSession: () => (CURRENT_SESSION ? CURRENT_SESSION.datetime : ""),
};

window.openTodoModal = openTodoModal;
window.closeTodoModal = closeTodoModal;
window.editTodo = editTodo;
window.deleteTodo = deleteTodo;
window.toggleTodo = toggleTodo;
window.handleDashboardRoomJoin = handleDashboardRoomJoin;
window.handlePrivateRoomPasswordSubmit = handlePrivateRoomPasswordSubmit;
