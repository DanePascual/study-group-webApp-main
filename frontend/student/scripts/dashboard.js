// UPDATED: Current Session Info with latest timestamp
const CURRENT_SESSION = {
  utcTime: "2025-08-29 16:00:02", // UTC time
  philippinesTime: "2025-08-30 00:00:02", // Philippines time (UTC+8)
  datetime: "2025-08-30 00:00:02", // Local Philippines time for compatibility
  user: "DanePascual",
  userAvatar: "DP",
  userProgram: "BSIT",
  timezone: "Asia/Manila",
};

// Theme management
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

  console.log(
    `Theme switched to ${isDark ? "dark" : "light"} mode by ${
      CURRENT_SESSION.user
    }`
  );
});

// Enhanced sidebar functionality
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const mainContent = document.getElementById("mainContent");

menuToggle.addEventListener("click", function () {
  sidebar.classList.toggle("open");
  mainContent.classList.toggle("shifted");

  // Save sidebar state
  localStorage.setItem("sidebarOpen", sidebar.classList.contains("open"));
});

// Load saved sidebar state
document.addEventListener("DOMContentLoaded", () => {
  const sidebarOpen = localStorage.getItem("sidebarOpen") === "true";
  if (sidebarOpen && window.innerWidth > 768) {
    sidebar.classList.add("open");
    mainContent.classList.add("shifted");
  }

  // ADDED: Force the profile link to use direct navigation
  document
    .getElementById("profileLink")
    .addEventListener("click", function (e) {
      console.log("Profile link clicked - ensuring navigation to profile.html");
      window.location.href = "profile.html";
    });
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

// Enhanced search functionality with suggestions
const searchInput = document.querySelector(".search-input");
let searchTimeout;

searchInput.addEventListener("input", function (e) {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();

  if (query.length > 1) {
    searchTimeout = setTimeout(() => {
      performSearch(query);
    }, 300);
  }
});

function performSearch(query) {
  // Mock search functionality - replace with actual API call
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
      item.description.toLowerCase().includes(query.toLowerCase())
  );

  console.log("Search results for:", query, filtered);
}

// Function for joining rooms
function joinRoom(roomType) {
  const rooms = {
    cs: "CS Study Room",
    "web-dev": "Web Development Study",
    database: "Database Design",
  };

  // Simulate joining
  setTimeout(() => {
    window.location.href = `study-room-inside.html?room=${roomType}`;
  }, 500);
}

// Modified to not show notifications
function showNotification(message, type = "info") {
  // Log to console instead
  console.log(`${type}: ${message}`);
}

// Enhanced Todo Management
let editingTodoIndex = -1;
let todos = JSON.parse(localStorage.getItem("studyTasks") || "[]");

// Initialize with some sample todos if empty
if (todos.length === 0) {
  todos = [
    {
      id: Date.now() - 1000,
      text: "Complete React tutorial from CS Study Room",
      completed: false,
      reminder: null,
      created: new Date().toISOString(),
      priority: "high",
    },
    {
      id: Date.now() - 2000,
      text: "Review database normalization concepts",
      completed: true,
      reminder: null,
      created: new Date().toISOString(),
      priority: "medium",
    },
    {
      id: Date.now() - 3000,
      text: "Prepare for algorithms quiz on Friday",
      completed: false,
      reminder: "2025-08-31T14:00",
      created: new Date().toISOString(),
      priority: "high",
    },
  ];
  localStorage.setItem("studyTasks", JSON.stringify(todos));
}

function openTodoModal() {
  document.getElementById("todoModal").style.display = "block";
  document.getElementById("todoText").value = "";
  document.getElementById("todoReminder").value = "";
  editingTodoIndex = -1;
  document.querySelector(".modal-title").textContent =
    "Add Study Task & Reminder";
  document.getElementById("todoText").focus();
}

function closeTodoModal() {
  document.getElementById("todoModal").style.display = "none";
}

function saveTodo() {
  const text = document.getElementById("todoText").value.trim();
  const reminder = document.getElementById("todoReminder").value;

  if (!text) {
    showNotification("Please enter a task description!", "error");
    return;
  }

  const todo = {
    id: Date.now(),
    text: text,
    completed: false,
    reminder: reminder,
    created: new Date().toISOString(),
    priority: "medium",
  };

  if (editingTodoIndex >= 0) {
    todos[editingTodoIndex] = {
      ...todos[editingTodoIndex],
      text: text,
      reminder: reminder,
    };
    showNotification("Task updated successfully!", "success");
  } else {
    todos.unshift(todo);
    showNotification("New task added!", "success");
  }

  localStorage.setItem("studyTasks", JSON.stringify(todos));
  renderTodos();
  closeTodoModal();
}

function renderTodos() {
  const todoList = document.getElementById("todoList");

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

function toggleTodo(index) {
  todos[index].completed = !todos[index].completed;
  localStorage.setItem("studyTasks", JSON.stringify(todos));
  renderTodos();

  const action = todos[index].completed ? "completed" : "reopened";
  showNotification(`Task ${action}!`, "success");
}

function editTodo(index) {
  editingTodoIndex = index;
  const todo = todos[index];
  document.getElementById("todoText").value = todo.text;
  document.getElementById("todoReminder").value = todo.reminder || "";
  document.querySelector(".modal-title").textContent = "Edit Study Task";
  document.getElementById("todoModal").style.display = "block";
  document.getElementById("todoText").focus();
}

function deleteTodo(index) {
  if (confirm("Are you sure you want to delete this task?")) {
    todos.splice(index, 1);
    localStorage.setItem("studyTasks", JSON.stringify(todos));
    renderTodos();
    showNotification("Task deleted!", "info");
  }
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

// Todo Form Submit
document.getElementById("todoForm").addEventListener("submit", function (e) {
  e.preventDefault();
  saveTodo();
});

// Close modal when clicking outside
document.getElementById("todoModal").addEventListener("click", function (e) {
  if (e.target === this) {
    closeTodoModal();
  }
});

// Keyboard shortcuts
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
    searchInput.focus();
  }

  if ((e.ctrlKey || e.metaKey) && e.key === "t") {
    e.preventDefault();
    themeToggle.click();
  }
});

// Real-time participant count updates (simulated)
function updateParticipantCounts() {
  const rooms = ["cs", "web-dev", "database"];
  rooms.forEach((room) => {
    const countElement = document.getElementById(`${room}-count`);
    if (countElement) {
      const currentCount = parseInt(countElement.textContent);
      const variation = Math.floor(Math.random() * 3) - 1;
      const newCount = Math.max(0, currentCount + variation);
      countElement.textContent = newCount;
    }
  });
}

setInterval(updateParticipantCounts, 30000);

// User session validation
function validateUserSession() {
  localStorage.setItem("currentUser", CURRENT_SESSION.user);
  localStorage.setItem("currentSession", JSON.stringify(CURRENT_SESSION));
  console.log(`Dashboard session validated for ${CURRENT_SESSION.user}`);
}

// Initialize dashboard
document.addEventListener("DOMContentLoaded", function () {
  // Validate user session
  validateUserSession();

  // Render todos
  renderTodos();

  // Animate elements on load
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

  // Update search placeholder for mobile
  function updateSearchPlaceholder() {
    const width = window.innerWidth;
    if (width <= 360) {
      searchInput.placeholder = "Search...";
    } else if (width <= 480) {
      searchInput.placeholder = "Search...";
    } else {
      searchInput.placeholder = "Search dashboard...";
    }
  }

  // Initial call and setup resize listener
  updateSearchPlaceholder();
  window.addEventListener("resize", updateSearchPlaceholder);

  console.log(`Dashboard ready for ${CURRENT_SESSION.user}`);
});

// Export functions for potential use by other scripts
window.StudyDashboard = {
  showNotification,
  openTodoModal,
  closeTodoModal,
  joinRoom,
  validateUserSession,
  currentUser: CURRENT_SESSION.user,
  currentSession: CURRENT_SESSION.datetime,
};
