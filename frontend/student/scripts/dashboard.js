// frontend/student/scripts/dashboard.js
// ✅ CLEANED: Removed admin panel check (moved to sidebar.js)
// ✅ UPDATED: Active Study Rooms now match study-rooms.js design

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
      console.log("[dashboard] Checking ban status for user:", user.uid);

      const userDoc = await getDoc(doc(db, "users", user.uid));

      if (userDoc.exists()) {
        const userData = userDoc.data();

        if (userData.isBanned === true) {
          console.warn("[dashboard] ❌ User is banned!");
          console.warn("[dashboard] Ban reason:", userData.bannedReason);
          console.warn("[dashboard] Banned at:", userData.bannedAt);

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

      console.log("[dashboard] ✅ User is not banned - access allowed");
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
    console.log(`Dashboard ready for ${CURRENT_SESSION.user}`);
  } else {
    console.log("No user is signed in.");
    window.location.href = "login.html";
  }
});

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

  const searchInput = document.querySelector(".search-input");
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();
      if (query.length > 1) {
        searchTimeout = setTimeout(() => {
          performSearch(query);
        }, 300);
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

  initUIEvents();
  fetchAndRenderRooms();
  fetchTodos();
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

function performSearch(query) {
  const mockResults = [
    {
      type: "room",
      name: "CS Study Room",
      description: "Algorithms and data structures",
    },
    { type: "user", name: "John Doe", description: "BSIT Student" },
    {
      type: "resource",
      name: "React Tutorial",
      description: "Frontend development guide",
    },
  ];
  const filtered = mockResults.filter(
    (item) =>
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      (item.description &&
        item.description.toLowerCase().includes(query.toLowerCase()))
  );
  console.log("Search results for:", query, filtered);
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
  console.log(`${type}: ${message}`);
  showNotification(message, type);
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
      passwordInput.value = "";
    }
  } catch (err) {
    console.error("Error verifying password:", err);
    let msg = "Password verification failed";
    if (err && err.body && err.body.error) {
      msg = err.body.error;
    }
    showToast(msg, "error");
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
  console.log(`Join attempt | Room: ${roomName} | Privacy: ${privacy}`);

  const room = allRooms.find((r) => String(r.id) === String(roomId));
  if (!room) {
    console.log(`Room not found: ${roomId}`);
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
    console.log(`Attempting to join public room: ${roomId}`);

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
  console.log(`${type}: ${message}`);
}

// ===== To-Do Management =====
let editingTodoIndex = -1;
let todos = [];

function openTodoModal() {
  const modal = document.getElementById("todoModal");
  if (modal) {
    modal.style.display = "block";
    const todoText = document.getElementById("todoText");
    if (todoText) todoText.value = "";
    const todoReminder = document.getElementById("todoReminder");
    if (todoReminder) todoReminder.value = "";
    editingTodoIndex = -1;
    const title = document.querySelector(".modal-title");
    if (title) title.textContent = "Add Study Task & Reminder";
    if (todoText) todoText.focus();
  }
}

function closeTodoModal() {
  const modal = document.getElementById("todoModal");
  if (modal) modal.style.display = "none";
}

async function editTodo(index) {
  editingTodoIndex = index;
  const todo = todos[index];
  const todoText = document.getElementById("todoText");
  const todoReminder = document.getElementById("todoReminder");
  if (todoText) todoText.value = todo.text;
  if (todoReminder) todoReminder.value = todo.reminder || "";
  const title = document.querySelector(".modal-title");
  if (title) title.textContent = "Edit Study Task";
  const modal = document.getElementById("todoModal");
  if (modal) modal.style.display = "block";
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
        <p style="font-size: 12px;">Click "Add Task" to create your first reminder!</p>
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
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      openTodoModal();
    }
    if (e.key === "Escape") {
      closeTodoModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      const searchInput = document.querySelector(".search-input");
      if (searchInput) searchInput.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "t") {
      e.preventDefault();
      const themeToggle = document.getElementById("themeToggle");
      if (themeToggle) themeToggle.click();
    }
  });

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
  if (CURRENT_SESSION)
    console.log(`Dashboard session validated for ${CURRENT_SESSION.user}`);
}

// ====================
// Room Pagination Logic
// ====================
async function fetchAndRenderRooms() {
  const roomGrid = document.getElementById("roomGrid");
  const paginationDivId = "roomPagination";
  let paginationDiv = document.getElementById(paginationDivId);
  if (paginationDiv) paginationDiv.remove();

  if (!roomGrid) return;
  roomGrid.innerHTML = `<div style="text-align:center;">Loading rooms...</div>`;
  try {
    const response = await fetch(STUDY_GROUPS_API);
    if (!response.ok) throw new Error("Failed to fetch study rooms.");
    allRooms = await response.json();

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
      console.warn("fetchTodos: unauthenticated");
      todos = [];
      renderTodos();
      return;
    }
    console.error("Error: Failed to fetch todos", err);
    showNotification("Could not load todos!", "error");
  }
}

async function saveTodo() {
  const textEl = document.getElementById("todoText");
  const reminderEl = document.getElementById("todoReminder");
  const text = textEl ? textEl.value.trim() : "";
  const reminder = reminderEl ? reminderEl.value : "";

  if (!text) {
    showNotification("Please enter a task description!", "error");
    return;
  }

  const todo = {
    text,
    completed: false,
    reminder: reminder || null,
    created: new Date().toISOString(),
    priority: "medium",
  };

  try {
    if (editingTodoIndex >= 0) {
      const id = todos[editingTodoIndex].id;
      const updatedTodo = {
        ...todos[editingTodoIndex],
        text,
        reminder: reminder || null,
      };

      await putJsonWithAuth(
        `/api/todos/${encodeURIComponent(id)}`,
        updatedTodo
      );
      todos[editingTodoIndex] = updatedTodo;
      console.log(`[dashboard] ✅ Todo updated: ${id}`);
      showNotification("Task updated successfully!", "success");
    } else {
      const response = await postJsonWithAuth("/api/todos", todo);
      todos.push(response);
      console.log("[dashboard] ✅ New todo created");
      showNotification("New task added!", "success");
    }
    closeTodoModal();
    renderTodos();
  } catch (err) {
    console.error("Error: Could not save task.", err);
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
    console.log(`[dashboard] ✅ Todo toggled: ${todo.id} = ${todo.completed}`);
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
    console.log(`[dashboard] ✅ Todo deleted: ${removedTodo.id}`);
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
