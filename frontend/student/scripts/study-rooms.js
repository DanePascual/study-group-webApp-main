// ===== study-rooms.js (SECURITY HARDENED) =====
// - Input sanitization on all user inputs (XSS prevention)
// - Input validation (lengths, required fields)
// - Confirmation dialog before creating room
// - Rate limiting feedback
// - Privacy & session scheduling support
// - Security logging

import { auth, db } from "../config/firebase.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { apiUrl } from "../config/appConfig.js";
import { postJsonWithAuth, fetchJsonWithAuth } from "./apiClient.js";

const STUDY_GROUPS_API = apiUrl("/api/study-groups");

// ===== SECURITY: Constants =====
const MAX_ROOM_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_TAGS = 3;

let CURRENT_SESSION = null;
let createRoomModal;
let allRooms = [];
let currentRoomPage = 1;
let roomsPerPage = 9;

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
  console.log("DOM loaded - initializing basic UI");
  syncThemeUI();

  try {
    const modalElement = document.getElementById("createRoomModal");
    if (modalElement) {
      createRoomModal = new bootstrap.Modal(modalElement);
    }
    initializeTooltips();
  } catch (err) {
    console.error("Error initializing Bootstrap components:", err);
  }

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", function (e) {
      handleFilterClick.call(this, e);
    });
  });

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      handleSearch.call(this, e);
    });
  }

  checkAuth();
});

function checkAuth() {
  console.log("Checking authentication status");
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("User is authenticated:", user.email);
      await loadUserData(user);
      initializeAuthenticatedUI();
    } else {
      console.log("User is not authenticated, redirecting to login");
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

function updateCurrentTime() {
  const now = new Date();
  const philippinesTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const timeStr =
    philippinesTime.toISOString().slice(0, 19).replace("T", " ") +
    " Philippines";
  const timeElement = document.getElementById("currentTime");
  if (timeElement) {
    timeElement.textContent = timeStr;
  }
}

/* ===== Authenticated UI ===== */
function initializeAuthenticatedUI() {
  console.log("Initializing authenticated UI");

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

  document.querySelectorAll(".tag-option").forEach((tagOption) => {
    tagOption.addEventListener("click", function (e) {
      handleTagSelection.call(this, e);
    });
  });

  updateCurrentTime();
  setInterval(updateCurrentTime, 1000);

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
  console.log("Opening create room modal");
  try {
    const modalElement = document.getElementById("createRoomModal");
    if (!modalElement) {
      console.error("createRoomModal element not found in DOM");
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
  const subjectEl = document.getElementById("subjectArea");
  const privacyEl = document.querySelector('input[name="privacy"]:checked');
  const sessionDateEl = document.getElementById("sessionDate");
  const sessionTimeEl = document.getElementById("sessionTime");
  const selectedTagsEl = document.getElementById("selectedTags");

  if (!roomNameEl || !subjectEl) {
    showToast("Form elements not found", "error");
    return;
  }

  const roomName = sanitizeString(roomNameEl.value, MAX_ROOM_NAME_LENGTH);
  const description = sanitizeString(
    roomDescEl ? roomDescEl.value : "",
    MAX_DESCRIPTION_LENGTH
  );
  const subject = subjectEl.value;
  const privacy = privacyEl ? privacyEl.value : "public";
  const sessionDate = sessionDateEl ? sessionDateEl.value || null : null;
  const sessionTime = sessionTimeEl ? sessionTimeEl.value || null : null;
  const tagsStr = selectedTagsEl ? selectedTagsEl.value : "";

  // ===== SECURITY: Validation =====
  if (!roomName) {
    showToast("Room name is required", "error");
    return;
  }

  if (roomName.length === 0) {
    showToast("Room name cannot be empty", "error");
    return;
  }

  if (!subject) {
    showToast("Please select a subject area", "error");
    return;
  }

  // ===== SECURITY: Confirmation dialog =====
  const confirmed = confirm(
    `Are you sure you want to create room "${escapeHtml(
      roomName
    )}"?\n\nSubject: ${escapeHtml(subject)}\nPrivacy: ${privacy}`
  );

  if (!confirmed) {
    logSecurityEvent("ROOM_CREATION_CANCELLED", {});
    return;
  }

  try {
    const tagArray = tagsStr
      ? tagsStr
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const payload = {
      name: roomName,
      description: description,
      subject: subject,
      tags: tagArray,
      privacy: privacy,
      sessionDate: sessionDate,
      sessionTime: sessionTime,
    };

    const createBtn = document.getElementById("createRoomBtn");
    if (createBtn) {
      createBtn.disabled = true;
      createBtn.innerHTML =
        '<i class="bi bi-arrow-clockwise spinning"></i> Creating...';
    }

    await postJsonWithAuth(STUDY_GROUPS_API, payload);

    showToast("Study room created successfully!", "success");
    logSecurityEvent("ROOM_CREATED", { roomName, privacy });

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
  document
    .querySelectorAll(".tag-option")
    .forEach((tag) => tag.classList.remove("selected"));
  const selectedTagsEl = document.getElementById("selectedTags");
  if (selectedTagsEl) selectedTagsEl.value = "";
}

function handleTagSelection() {
  const selectedTags = document.querySelectorAll(".tag-option.selected");
  if (this.classList.contains("selected")) {
    this.classList.remove("selected");
  } else if (selectedTags.length < MAX_TAGS) {
    this.classList.add("selected");
  } else {
    showToast(`You can select up to ${MAX_TAGS} tags`, "error");
    return;
  }

  const tags = Array.from(document.querySelectorAll(".tag-option.selected"))
    .map((tag) => tag.getAttribute("data-tag"))
    .filter(Boolean);
  const selectedTagsEl = document.getElementById("selectedTags");
  if (selectedTagsEl) selectedTagsEl.value = tags.join(",");
}

/* ===== Filters & Search ===== */
function handleFilterClick() {
  document
    .querySelectorAll(".filter-btn")
    .forEach((b) => b.classList.remove("active"));
  this.classList.add("active");
  const filter = this.getAttribute("data-filter");
  filterRooms(filter);
}

function filterRooms(filter) {
  const roomCards = document.querySelectorAll(".room-card");
  if (roomCards.length === 0) return;
  roomCards.forEach((room) => {
    const tags = room.getAttribute("data-tags") || "";
    const subject = room.getAttribute("data-subject") || "";
    if (filter === "all" || tags.includes(filter) || subject === filter)
      room.style.display = "block";
    else room.style.display = "none";
  });
}

function handleSearch() {
  const searchTerm = this.value.trim().toLowerCase();
  const roomCards = document.querySelectorAll(".room-card");
  if (roomCards.length === 0) return;
  roomCards.forEach((room) => {
    const titleEl = room.querySelector(".room-title");
    const descEl = room.querySelector(".room-description");
    const title = titleEl ? titleEl.textContent.toLowerCase() : "";
    const description = descEl ? descEl.textContent.toLowerCase() : "";
    if (title.includes(searchTerm) || description.includes(searchTerm))
      room.style.display = "block";
    else room.style.display = "none";
  });
}

/* ===== Fetch & Render ===== */
async function fetchAndRenderStudyRooms() {
  try {
    const rooms = await fetchJsonWithAuth(STUDY_GROUPS_API, { method: "GET" });
    allRooms = Array.isArray(rooms) ? rooms : [];

    const emptyState = document.getElementById("emptyState");
    if (emptyState && allRooms.length > 0) emptyState.remove();

    renderRoomPage();

    window._backendRooms = allRooms;

    const activeRoomsCount = document.getElementById("activeRoomsCount");
    const yourRoomsCount = document.getElementById("yourRoomsCount");
    if (activeRoomsCount) activeRoomsCount.textContent = allRooms.length;
    if (yourRoomsCount) yourRoomsCount.textContent = allRooms.length;
  } catch (err) {
    console.error("Error fetching rooms:", err);
    showToast("Unable to load study rooms. Please try again later.", "error");
  }
}

function renderRoomPage() {
  const roomsContainer = document.getElementById("roomContainer");
  if (!roomsContainer) {
    console.error("Room container not found");
    return;
  }

  let roomGrid = document.getElementById("roomGrid");
  if (!roomGrid) {
    roomGrid = document.createElement("div");
    roomGrid.className = "room-grid";
    roomGrid.id = "roomGrid";
    roomsContainer.appendChild(roomGrid);
  }
  roomGrid.innerHTML = "";

  if (allRooms.length === 0) {
    roomGrid.innerHTML = `<div class="empty-state" id="emptyState">
      <div class="empty-state-icon"><i class="bi bi-door-closed"></i></div>
      <h3>No Study Rooms Yet</h3>
      <p>Create your first study room to collaborate with other students on projects, assignments, or exam prep.</p>
      <div class="empty-state-action">
        <button class="btn btn-success" id="createFirstRoomButton"><i class="bi bi-plus-lg"></i> Create Your First Room</button>
      </div>
    </div>`;
    const createFirstRoomBtn = document.getElementById("createFirstRoomButton");
    if (createFirstRoomBtn)
      createFirstRoomBtn.addEventListener("click", openCreateRoomModal);
    return;
  }

  roomsPerPage = getRoomsPerPage();
  const totalPages = Math.ceil(allRooms.length / roomsPerPage);
  if (currentRoomPage > totalPages) currentRoomPage = totalPages || 1;
  const start = (currentRoomPage - 1) * roomsPerPage;
  const end = start + roomsPerPage;
  const roomsToShow = allRooms.slice(start, end);

  roomsToShow.forEach((room) => {
    const newRoom = document.createElement("div");
    newRoom.className = "room-card";
    newRoom.setAttribute("data-tags", (room.tags || []).join(","));
    newRoom.setAttribute("data-subject", room.subject || "");
    newRoom.innerHTML = `
      <div class="room-status ${
        room.isActive ? "active" : ""
      }" title="Active room"></div>
      <div class="room-header">
        <div>
          <h3 class="room-title">${escapeHtml(room.name)}</h3>
          <p class="room-description">${escapeHtml(
            room.description || "No description provided."
          )}</p>
        </div>
      </div>
      <div class="room-tags">
        ${(room.tags || [])
          .map((tag) => `<span class="room-tag">${escapeHtml(tag)}</span>`)
          .join("")}
      </div>
      <div class="room-footer">
        <span class="participant-count"><i class="bi bi-people"></i> ${
          room.participants ? room.participants.length : 1
        } participant${
      room.participants && room.participants.length > 1 ? "s" : ""
    }</span>
        <button class="join-btn" onclick="window.enterRoom('${escapeHtml(
          room.id
        )}')">Enter Now</button>
      </div>
    `;
    roomGrid.appendChild(newRoom);
  });

  let paginationDiv = document.getElementById("roomPagination");
  if (paginationDiv) paginationDiv.remove();

  if (totalPages > 1) {
    paginationDiv = document.createElement("div");
    paginationDiv.className = "pagination-controls";
    paginationDiv.id = "roomPagination";

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "Previous";
    prevBtn.disabled = currentRoomPage === 1;
    prevBtn.onclick = () => {
      if (currentRoomPage > 1) {
        currentRoomPage--;
        renderRoomPage();
      }
    };
    paginationDiv.appendChild(prevBtn);

    const pageInfo = document.createElement("span");
    pageInfo.style.cssText =
      "margin: 0 12px; font-weight: 500; color: var(--dark-text);";
    pageInfo.textContent = `Page ${currentRoomPage} of ${totalPages}`;
    paginationDiv.appendChild(pageInfo);

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next";
    nextBtn.disabled = currentRoomPage === totalPages;
    nextBtn.onclick = () => {
      if (currentRoomPage < totalPages) {
        currentRoomPage++;
        renderRoomPage();
      }
    };
    paginationDiv.appendChild(nextBtn);

    roomGrid.parentNode.appendChild(paginationDiv);
  }
}

function getRoomsPerPage() {
  const sidebar = document.getElementById("sidebar");
  return sidebar && sidebar.classList.contains("open") ? 9 : 12;
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
