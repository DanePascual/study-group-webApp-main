// frontend/student/scripts/dashboard.js
// Updated dashboard script to use apiClient JSON helpers (fetchJsonWithAuth / postJsonWithAuth / patchJsonWithAuth / deleteWithAuth)
// - Replaces raw authFetch calls with the higher-level helpers for consistent error handling and parsing.
// - Keeps behavior otherwise unchanged (sidebar integration, theme, DOM handling).
// Save as: frontend/student/scripts/dashboard.js

import { auth, db, onAuthStateChanged } from "../config/firebase.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import fetchWithAuth, {
  fetchJsonWithAuth,
  postJsonWithAuth,
  patchJsonWithAuth,
  deleteWithAuth,
} from "./apiClient.js";
import { apiUrl } from "../config/appConfig.js";

// Wait for Firebase Authentication to load and set CURRENT_SESSION dynamically
let CURRENT_SESSION = null;

onAuthStateChanged(async (user) => {
  if (user) {
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

    // Update sidebar client area, but do it defensively so centralized sidebar.js (which fetches backend profile)
    // can later overwrite with the authoritative name/photo.
    updateSidebarUserInfo();

    validateUserSession();

    // Only initialize page UI that depends on DOM after DOM is ready.
    scheduleUIInit();
    console.log(`Dashboard ready for ${CURRENT_SESSION.user}`);
  } else {
    console.log("No user is signed in.");
    // Redirect to login (relative to pages directory)
    window.location.href = "login.html";
    console.log("Redirecting to login: login.html");
  }
});

/**
 * Defensive sidebar update:
 * - Only writes a temporary name/initials if sidebar is still in a default/loading state.
 * - Does NOT overwrite a photo <img> that may be set by centralized sidebar.js after it fetches the user's backend profile.
 */
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

    // Only set initials if there's no <img> already present (so we don't overwrite server-provided photo)
    if (avatar) {
      const hasImg = avatar.querySelector && avatar.querySelector("img");
      if (!hasImg) {
        // Only set initials when avatar area is empty or in default state
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

// Use apiUrl to resolve runtime API base for local vs production
const STUDY_GROUPS_API = apiUrl("/api/study-groups");

// Utility: safe query selectors used after DOM ready
function $(sel) {
  return document.querySelector(sel);
}

// Schedule UI initialization after DOMContentLoaded (if not yet loaded)
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

// Theme: centralized in sidebar.js
// NOTE: theme initialization and toggle are handled by sidebar.js (single source of truth).
// Dashboard will not initialize or bind the toggle to avoid duplicate listeners.

// Theme, search, todo, etc. wired here (DOM-ready)
function initDashboardUI() {
  // Sidebar state: watch for class changes (sidebar.js controls toggle)
  watchSidebarToggle();

  // Wire profileLink if present
  const profileLink = document.getElementById("profileLink");
  if (profileLink) {
    profileLink.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = "profile.html";
    });
  }

  // Wire search input
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

  // Wire Todo form and modal behaviors
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

  // Initialize keyboard + UI events that depend on DOM
  initUIEvents();

  // Fetch rooms and todos now that DOM is ready
  fetchAndRenderRooms();
  fetchTodos();
  // renderTodos will be called from fetchTodos when data loads
}

// Observe sidebar class changes and re-render room grid responsively
function watchSidebarToggle() {
  const sidebarEl = document.getElementById("sidebar");
  if (!sidebarEl) return;
  let lastOpen = sidebarEl.classList.contains("open");
  const observer = new MutationObserver(() => {
    const nowOpen = sidebarEl.classList.contains("open");
    if (nowOpen !== lastOpen) {
      lastOpen = nowOpen;
      // roomsPerPage changed — re-render page
      renderRoomPageDebounced();
    }
  });
  observer.observe(sidebarEl, { attributes: true, attributeFilter: ["class"] });
}

// Sidebar-influenced logic for rooms per page
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

function joinRoom(roomId) {
  setTimeout(() => {
    window.location.href = `study-room-inside.html?room=${roomId}`;
  }, 500);
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
            <input type="checkbox" class="todo-checkbox" $ ${
              todo.completed ? "checked" : ""
            } onchange="toggleTodo(${originalIndex})">
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
              <button class="todo-action-btn" onclick="editTodo(${originalIndex})" title="Edit task">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="todo-action-btn" onclick="deleteTodo(${originalIndex})" title="Delete task">
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

  // sidebar.js provides logout handling - no double binding required
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    console.log("Logout button detected - using sidebar.js logout function");
  }
}

function updateParticipantCounts() {
  const rooms = ["cs", "web-dev", "database"];
  rooms.forEach((room) => {
    const countElement = document.getElementById(`${room}-count`);
    if (countElement) {
      const currentCount = parseInt(countElement.textContent) || 0;
      const variation = Math.floor(Math.random() * 3) - 1;
      const newCount = Math.max(0, currentCount + variation);
      countElement.textContent = newCount;
    }
  });
}
setInterval(updateParticipantCounts, 30000);

function validateUserSession() {
  if (CURRENT_SESSION)
    console.log(`Dashboard session validated for ${CURRENT_SESSION.user}`);
}

// ====================
// Room Pagination Logic (Responsive to Sidebar)
// ====================
async function fetchAndRenderRooms() {
  const roomGrid = document.getElementById("roomGrid");
  const paginationDivId = "roomPagination";
  let paginationDiv = document.getElementById(paginationDivId);
  if (paginationDiv) paginationDiv.remove();

  if (!roomGrid) return;
  roomGrid.innerHTML = `<div style="text-align:center;">Loading rooms...</div>`;
  try {
    // Public endpoint - resolved via apiUrl
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

// Room rendering without creator display
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
    const card = document.createElement("div");
    card.className = "room-card";
    card.innerHTML = `
      <div class="room-header">
        <div>
          <h3 class="room-title">${room.name}</h3>
          <p class="room-description">${
            room.description || "No description"
          }</p>
        </div>
      </div>
      <div class="room-tags">
        ${(room.tags || [])
          .map((tag) => `<span class="room-tag">${tag}</span>`)
          .join("")}
      </div>
      <div class="room-footer">
        <span class="participant-count">
          <i class="bi bi-people"></i>
          ${room.participants ? room.participants.length : 1} participants
        </span>
        <button class="join-btn" onclick="joinRoom('${room.id}')">
          Join Now
        </button>
      </div>
    `;
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

  // Animate the room cards after rendering
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

// ========== Todos Backend (use apiClient helpers) ==========
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
    reminder,
    created: new Date().toISOString(),
    priority: "medium",
  };

  try {
    if (editingTodoIndex >= 0) {
      const id = todos[editingTodoIndex].id;
      await patchJsonWithAuth(`/api/todos/${encodeURIComponent(id)}`, {
        ...todos[editingTodoIndex],
        text,
        reminder,
      });
      showNotification("Task updated successfully!", "success");
    } else {
      await postJsonWithAuth("/api/todos", todo);
      showNotification("New task added!", "success");
    }
    closeTodoModal();
    fetchTodos();
  } catch (err) {
    console.error("Error: Could not save task.", err);
    showNotification("Could not save task.", "error");
  }
}

async function toggleTodo(index) {
  const todo = todos[index];
  if (!todo) return;
  todo.completed = !todo.completed;

  try {
    await patchJsonWithAuth(`/api/todos/${encodeURIComponent(todo.id)}`, todo);
    fetchTodos();
    showNotification(
      `Task ${todo.completed ? "completed" : "reopened"}!`,
      "success"
    );
  } catch (err) {
    console.error("Error: Could not update task.", err);
    showNotification("Could not update task.", "error");
  }
}

async function deleteTodo(index) {
  const todo = todos[index];
  if (!todo) return;

  if (!confirm("Are you sure you want to delete this task?")) return;

  try {
    await deleteWithAuth(`/api/todos/${encodeURIComponent(todo.id)}`);
    fetchTodos();
    showNotification("Task deleted!", "info");
  } catch (err) {
    console.error("Error: Could not delete task.", err);
    showNotification("Could not delete task.", "error");
  }
}

// Expose for global use
window.StudyDashboard = {
  showNotification,
  openTodoModal,
  closeTodoModal,
  joinRoom,
  validateUserSession,
  currentUser: () => (CURRENT_SESSION ? CURRENT_SESSION.user : ""),
  currentSession: () => (CURRENT_SESSION ? CURRENT_SESSION.datetime : ""),
};

window.openTodoModal = openTodoModal;
window.closeTodoModal = closeTodoModal;
window.editTodo = editTodo;
window.deleteTodo = deleteTodo;
window.toggleTodo = toggleTodo;
window.joinRoom = joinRoom;
