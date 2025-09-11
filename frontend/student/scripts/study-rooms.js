// Current Session Info - Updated to current date from user input
const CURRENT_SESSION = {
  utcTime: "2025-08-29 16:10:26", // UTC time
  philippinesTime: "2025-08-30 00:10:26", // Philippines time (UTC+8)
  user: "DanePascual",
  timezone: "Asia/Manila",
};

// Global variables
let createRoomModal;
let roomCounter = 0;
const currentUser = CURRENT_SESSION.user;
const currentDateTime = CURRENT_SESSION.philippinesTime;

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

  showToast(`Theme switched to ${isDark ? "dark" : "light"} mode!`, "success");

  console.log(
    `🎨 Theme switched to ${isDark ? "dark" : "light"} mode by ${
      CURRENT_SESSION.user
    } at ${CURRENT_SESSION.philippinesTime} Philippines Time`
  );
});

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  console.log(
    `📚 Study Rooms page initialized for ${CURRENT_SESSION.user} at ${CURRENT_SESSION.philippinesTime} Philippines Time`
  );

  // Initialize Bootstrap Modal
  const modalElement = document.getElementById("createRoomModal");
  createRoomModal = new bootstrap.Modal(modalElement);

  // Initialize all event listeners
  initializeEventListeners();

  // Initialize sidebar
  initializeSidebar();

  // Initialize Bootstrap tooltips
  initializeTooltips();

  // Update current time every second
  updateCurrentTime();
  setInterval(updateCurrentTime, 1000);

  // Show welcome message
  setTimeout(() => {
    showToast(
      `Welcome, ${currentUser}! Create your first study room to get started.`,
      "info"
    );
  }, 1000);

  // Update search placeholder for mobile
  function updateSearchPlaceholder() {
    const width = window.innerWidth;
    const searchInput = document.getElementById("searchInput");
    if (width <= 480) {
      searchInput.placeholder = "Search...";
    } else {
      searchInput.placeholder = "Search study rooms...";
    }
  }

  // Initial call and setup resize listener
  updateSearchPlaceholder();
  window.addEventListener("resize", updateSearchPlaceholder);
});

function initializeEventListeners() {
  // Create Room button events
  document
    .getElementById("createRoomButton")
    .addEventListener("click", openCreateRoomModal);
  document
    .getElementById("createFirstRoomButton")
    .addEventListener("click", openCreateRoomModal);
  document
    .getElementById("createRoomBtn")
    .addEventListener("click", handleCreateRoom);

  // Tag selection
  document.querySelectorAll(".tag-option").forEach((tagOption) => {
    tagOption.addEventListener("click", handleTagSelection);
  });

  // Filter buttons
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", handleFilterClick);
  });

  // Search functionality
  document
    .getElementById("searchInput")
    .addEventListener("input", handleSearch);
}

function initializeSidebar() {
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

  // Open sidebar by default on desktop
  if (window.innerWidth > 768) setSidebar(true);

  menuToggle.addEventListener("click", () => {
    setSidebar(!sidebar.classList.contains("open"));
  });

  // Hide sidebar on click outside on mobile
  document.addEventListener("click", function (e) {
    if (window.innerWidth <= 768) {
      if (
        !sidebar.contains(e.target) &&
        !menuToggle.contains(e.target) &&
        sidebar.classList.contains("open")
      ) {
        setSidebar(false);
      }
    }
  });
}

function initializeTooltips() {
  var tooltipTriggerList = [].slice.call(
    document.querySelectorAll('[data-bs-toggle="tooltip"]')
  );
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
}

function updateCurrentTime() {
  // Update to Philippines time format
  const now = new Date();
  const philippinesTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
  const timeStr =
    philippinesTime.toISOString().slice(0, 19).replace("T", " ") +
    " Philippines";
  const timeElement = document.getElementById("currentTime");
  if (timeElement) {
    timeElement.textContent = timeStr;
  }
}

function openCreateRoomModal() {
  console.log("Opening create room modal");
  createRoomModal.show();
}

function handleCreateRoom() {
  console.log("Create Room button clicked");

  const roomName = document.getElementById("roomName").value.trim();
  const description = document.getElementById("roomDescription").value.trim();
  const subject = document.getElementById("subjectArea").value;
  const tags = document.getElementById("selectedTags").value;

  if (!roomName || !subject) {
    showToast("Please fill in all required fields", "error");
    return;
  }

  // Create the room
  createNewRoom(roomName, description, subject, tags);

  // Close modal and reset form
  createRoomModal.hide();
  resetCreateRoomForm();

  // Show success message
  showToast("Study room created successfully!", "success");
}

function createNewRoom(name, description, subject, tags) {
  roomCounter++;
  const roomId = "room-" + Date.now();
  const tagArray = tags ? tags.split(",") : [];

  // Store room data in localStorage with Philippines time
  const roomData = {
    id: roomId,
    name: name,
    description: description,
    subject: subject,
    tags: tagArray,
    creator: currentUser,
    createdAt: currentDateTime,
    participants: [currentUser],
    isActive: true,
    timezone: CURRENT_SESSION.timezone,
  };

  // Store in allRoomsData
  const allRoomsData = JSON.parse(localStorage.getItem("allRoomsData") || "{}");
  allRoomsData[roomId] = roomData;
  localStorage.setItem("allRoomsData", JSON.stringify(allRoomsData));

  // Store room name separately for quick access
  localStorage.setItem(`roomName_${roomId}`, name);

  // Remove empty state if it exists
  const emptyState = document.getElementById("emptyState");
  if (emptyState) {
    emptyState.remove();
  }

  // Create room grid if it doesn't exist
  let roomGrid = document.querySelector(".room-grid");
  if (!roomGrid) {
    roomGrid = document.createElement("div");
    roomGrid.className = "room-grid";
    roomGrid.id = "roomGrid";
    document.getElementById("roomContainer").appendChild(roomGrid);
  }

  // Create new room card
  const newRoom = document.createElement("div");
  newRoom.className = "room-card";
  newRoom.setAttribute("data-tags", tags);
  newRoom.setAttribute("data-subject", subject);

  newRoom.innerHTML = `
          <div class="room-status active" title="Active room"></div>
          <div class="room-header">
            <div>
              <h3 class="room-title">${name}</h3>
              <p class="room-description">
                ${description || "No description provided."}
              </p>
            </div>
          </div>
          <div class="room-tags">
            ${tagArray
              .map((tag) => `<span class="room-tag">${tag}</span>`)
              .join("")}
          </div>
          <div class="room-footer">
            <span class="participant-count">
              <i class="bi bi-people"></i>
              1 participant
            </span>
            <button class="join-btn" onclick="enterRoom('${roomId}')">
              Enter Now
            </button>
          </div>
        `;

  roomGrid.appendChild(newRoom);

  // Update statistics
  updateStats();

  // Store room in localStorage
  const userRooms = JSON.parse(localStorage.getItem("userRooms") || "[]");
  userRooms.push(roomId);
  localStorage.setItem("userRooms", JSON.stringify(userRooms));

  console.log(
    `🏠 Study room "${name}" created by ${currentUser} at ${currentDateTime} Philippines Time`
  );
}

function updateStats() {
  document.getElementById("activeRoomsCount").textContent = roomCounter;
  document.getElementById("yourRoomsCount").textContent = roomCounter;

  // Update stat messages with Philippines time context
  document.querySelector(".stat-card:nth-child(1) .stat-change").textContent =
    roomCounter === 1
      ? "Your first room is active!"
      : `${roomCounter} active rooms`;
  document.querySelector(
    ".stat-card:nth-child(2) .stat-change"
  ).textContent = `Created on August 29, 2025 (Philippines)`;
}

function resetCreateRoomForm() {
  document.getElementById("createRoomForm").reset();
  document
    .querySelectorAll(".tag-option")
    .forEach((tag) => tag.classList.remove("selected"));
  document.getElementById("selectedTags").value = "";
}

function handleTagSelection() {
  const selectedTags = document.querySelectorAll(".tag-option.selected");

  if (this.classList.contains("selected")) {
    this.classList.remove("selected");
  } else if (selectedTags.length < 3) {
    this.classList.add("selected");
  } else {
    showToast("You can select up to 3 tags", "error");
    return;
  }

  // Update hidden field with selected tags
  const tags = Array.from(
    document.querySelectorAll(".tag-option.selected")
  ).map((tag) => tag.getAttribute("data-tag"));
  document.getElementById("selectedTags").value = tags.join(",");
}

function handleFilterClick() {
  // Update active state
  document
    .querySelectorAll(".filter-btn")
    .forEach((b) => b.classList.remove("active"));
  this.classList.add("active");

  const filter = this.getAttribute("data-filter");
  filterRooms(filter);
}

function filterRooms(filter) {
  const rooms = document.querySelectorAll(".room-card");

  if (rooms.length === 0) {
    showToast(
      `No ${filter === "all" ? "" : filter + " "}study rooms found`,
      "info"
    );
    return;
  }

  rooms.forEach((room) => {
    const tags = room.getAttribute("data-tags") || "";
    const subject = room.getAttribute("data-subject") || "";

    if (filter === "all" || tags.includes(filter) || subject === filter) {
      room.style.display = "block";
    } else {
      room.style.display = "none";
    }
  });
}

function handleSearch() {
  const searchTerm = this.value.trim().toLowerCase();
  const rooms = document.querySelectorAll(".room-card");

  if (rooms.length === 0 && searchTerm.length > 0) {
    showToast("No study rooms match your search", "info");
    return;
  }

  rooms.forEach((room) => {
    const title = room.querySelector(".room-title").textContent.toLowerCase();
    const description = room
      .querySelector(".room-description")
      .textContent.toLowerCase();

    if (title.includes(searchTerm) || description.includes(searchTerm)) {
      room.style.display = "block";
    } else {
      room.style.display = "none";
    }
  });
}

function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toastContainer");
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
            <div class="toast-message">${message}</div>
          </div>
          <div class="toast-close" onclick="closeToast('${toastId}')">
            <i class="bi bi-x"></i>
          </div>
        `;

  toastContainer.appendChild(toast);

  // Auto remove after 5 seconds
  setTimeout(() => {
    closeToast(toastId);
  }, 5000);
}

function closeToast(toastId) {
  const toast = document.getElementById(toastId);
  if (toast) {
    toast.style.opacity = "0";
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }
}

function enterRoom(roomId) {
  // Store the room ID in local storage to allow access
  const userRooms = JSON.parse(localStorage.getItem("userRooms") || "[]");
  if (!userRooms.includes(roomId)) {
    userRooms.push(roomId);
    localStorage.setItem("userRooms", JSON.stringify(userRooms));
  }

  showToast("Entering study room...", "info");
  // Navigate to study room
  setTimeout(() => {
    window.location.href = "study-room-inside.html?room=" + roomId;
  }, 1000);
}

// FIXED: Use direct navigation instead of a function
window.goToProfile = function () {
  window.location.href = "profile.html";
};

// Keyboard shortcuts
document.addEventListener("keydown", function (e) {
  if (e.ctrlKey && e.key === "t") {
    e.preventDefault();
    themeToggle.click();
  }
  if (e.ctrlKey && e.key === "n") {
    e.preventDefault();
    openCreateRoomModal();
  }
  if (e.key === "Escape") {
    if (createRoomModal._isShown) {
      createRoomModal.hide();
    }
  }
});

// Export for debugging
window.StudyRooms = {
  showToast,
  closeToast,
  enterRoom,
  openCreateRoomModal,
  currentUser: CURRENT_SESSION.user,
  currentSession: CURRENT_SESSION.philippinesTime,
};

// Make functions globally available
window.showToast = showToast;
window.closeToast = closeToast;
window.enterRoom = enterRoom;

// Final initialization log
console.log(
  `🎉 Study Rooms page ready for ${CURRENT_SESSION.user} at ${CURRENT_SESSION.philippinesTime} Philippines Time`
);
console.log(`🌙 Late evening session - perfect time for study planning!`);
console.log(`🎨 Dark mode toggle available for night viewing`);
