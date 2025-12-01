// frontend/admin/js/admin-study-rooms.js
// Handles admin study rooms management

let currentPage = 1;
let currentLimit = 10;
let currentStatus = "";
let currentPrivacy = "";
let currentSearch = "";
let allRooms = [];
let currentViewingRoomId = null;
let activeCustomSelect = null;
let userCache = {}; // Cache to store user data by UID

// ===== LISTEN: Wait for adminUser to be available =====
let adminUserReady = false;
window.addEventListener("adminUserReady", () => {
  adminUserReady = true;
  console.log("[admin-study-rooms] ✅ adminUser is ready");
});

// ===== Initialize on page load =====
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[admin-study-rooms] Initializing...");

  // Setup event listeners immediately
  setupEventListeners();

  // Wait for admin user to be set
  let attempts = 0;
  const checkAdminInterval = setInterval(() => {
    attempts++;
    if (window.adminUser) {
      clearInterval(checkAdminInterval);
      loadRooms();
    } else if (attempts > 50) {
      clearInterval(checkAdminInterval);
      console.error("[admin-study-rooms] Admin user not loaded");
    }
  }, 100);
});

// ===== Setup event listeners =====
function setupEventListeners() {
  console.log("[admin-study-rooms] Setting up event listeners...");

  // Search input with debounce
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = e.target.value;
        currentPage = 1;
        loadRooms();
      }, 300);
    });
  }

  // Pagination
  const prevBtn = document.getElementById("prevBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        loadRooms();
        scrollToTop();
      }
    });
  }

  const nextBtn = document.getElementById("nextBtn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const totalPages = Math.ceil(allRooms.length / currentLimit);
      if (currentPage < totalPages) {
        currentPage++;
        loadRooms();
        scrollToTop();
      }
    });
  }

  console.log("[admin-study-rooms] Event listeners setup complete");
}

// ===== CUSTOM SELECT FUNCTIONS =====
function toggleCustomSelect(type) {
  const dropdown = document.getElementById(type + "Dropdown");
  const trigger = document.getElementById(type + "Trigger");

  // Close other dropdowns
  if (activeCustomSelect && activeCustomSelect !== type) {
    document
      .getElementById(activeCustomSelect + "Dropdown")
      ?.classList.remove("active");
    document
      .getElementById(activeCustomSelect + "Trigger")
      ?.classList.remove("active");
  }

  dropdown.classList.toggle("active");
  trigger.classList.toggle("active");
  activeCustomSelect = dropdown.classList.contains("active") ? type : null;
}

function selectCustomOption(type, value, label) {
  if (type === "status") {
    currentStatus = value;
    document.getElementById("statusValue").textContent = label;
    document.getElementById("statusDropdown").classList.remove("active");
    document.getElementById("statusTrigger").classList.remove("active");
  } else if (type === "privacy") {
    currentPrivacy = value;
    document.getElementById("privacyValue").textContent = label;
    document.getElementById("privacyDropdown").classList.remove("active");
    document.getElementById("privacyTrigger").classList.remove("active");
  }

  activeCustomSelect = null;
  currentPage = 1;
  loadRooms();
}

// Close dropdowns when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".custom-select-wrapper")) {
    document
      .querySelectorAll(".custom-select-dropdown.active")
      .forEach((el) => {
        el.classList.remove("active");
      });
    document.querySelectorAll(".custom-select-trigger.active").forEach((el) => {
      el.classList.remove("active");
    });
    activeCustomSelect = null;
  }
});

// ===== Helper: Fetch user data by UID =====
async function getUserData(uid) {
  // Check cache first
  if (userCache[uid]) {
    console.log(`[admin-study-rooms] Using cached data for ${uid}`);
    return userCache[uid];
  }

  try {
    console.log(`[admin-study-rooms] Fetching user data for ${uid}...`);
    const response = await window.adminFetch(`/api/admin/users/${uid}`);

    if (response) {
      const userData = {
        name: response.name || "Unknown",
        email: response.email || "Unknown",
      };
      userCache[uid] = userData;
      console.log(`[admin-study-rooms] ✅ Cached user ${uid}:`, userData);
      return userData;
    }

    // Cache even on failure to avoid repeated failed requests
    userCache[uid] = { name: "Unknown", email: "Unknown" };
    return userCache[uid];
  } catch (err) {
    console.warn(
      `[admin-study-rooms] Could not fetch user ${uid}:`,
      err.message
    );
    // Cache the error result
    userCache[uid] = { name: "Unknown", email: "Unknown" };
    return userCache[uid];
  }
}

// ===== Load rooms =====
async function loadRooms() {
  try {
    console.log("[admin-study-rooms] Fetching study rooms...");
    const roomsList = document.getElementById("roomsList");
    const emptyState = document.getElementById("emptyState");

    // Show loading state
    roomsList.innerHTML = `
      <tr>
        <td colspan="7" class="loading">
          <div class="spinner"></div>
          <span>Loading study rooms...</span>
        </td>
      </tr>
    `;
    emptyState.style.display = "none";

    const params = new URLSearchParams({
      page: 1,
      limit: 1000, // Fetch all for client-side filtering
      status: currentStatus,
      privacy: currentPrivacy,
      search: currentSearch,
    });

    const response = await window.adminFetch(
      `/api/admin/study-rooms?${params}`
    );
    console.log("[admin-study-rooms] ✅ Rooms fetched:", response);

    allRooms = response.rooms || [];
    displayRooms();
    updatePaginationInfo();
    updateStatistics(response.stats);
  } catch (err) {
    console.error("[admin-study-rooms] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to load study rooms: ${err.message}`);
    }
    document.getElementById("roomsList").innerHTML =
      '<tr><td colspan="7" class="error-message">Error loading study rooms. Please try again.</td></tr>';
  }
}

// ===== Display rooms in table =====
function displayRooms() {
  const tbody = document.getElementById("roomsList");
  const emptyState = document.getElementById("emptyState");
  const paginatedRooms = getPaginatedRooms();

  if (!paginatedRooms || paginatedRooms.length === 0) {
    tbody.innerHTML = "";
    emptyState.style.display = "flex";
    console.log("[admin-study-rooms] No rooms to display");
    return;
  }

  emptyState.style.display = "none";
  tbody.innerHTML = paginatedRooms
    .map((room) => {
      const privacyClass = `privacy-${room.privacy || "public"}`;
      const statusClass = `status-${room.isActive ? "active" : "inactive"}`;
      const privacyLabel = room.privacy === "private" ? "Private" : "Public";
      const statusLabel = room.isActive ? "ACTIVE" : "INACTIVE";

      return `
        <tr data-room-id="${escapeHtml(room.id)}">
          <td>
            <span class="room-name">${escapeHtml(
              room.name || "Untitled Room"
            )}</span>
          </td>
          <td>
            <span>${escapeHtml(room.creatorName || "Unknown")}</span>
          </td>
          <td>
            <span class="participant-count">${
              (room.participants || []).length
            }</span>
            <span class="participant-count-small">participants</span>
          </td>
          <td>
            <span class="privacy-badge ${privacyClass}">${privacyLabel}</span>
          </td>
          <td>
            <span class="status-badge ${statusClass}">${statusLabel}</span>
          </td>
          <td>
            <span>${window.formatDate(room.createdAt)}</span>
          </td>
          <td>
            <div class="action-buttons">
              <button
                class="action-link"
                onclick="window.viewRoomDetails('${escapeHtml(room.id)}')"
                title="View room details"
              >
                View
              </button>
              ${
                room.isActive
                  ? `<button class="action-link" onclick="window.deactivateRoom('${escapeHtml(
                      room.id
                    )}')" title="Deactivate room">Deactivate</button>`
                  : `<button class="action-link" onclick="window.activateRoom('${escapeHtml(
                      room.id
                    )}')" title="Activate room">Activate</button>`
              }
              <button
                class="action-link"
                onclick="window.deleteRoom('${escapeHtml(room.id)}')"
                title="Delete room"
              >
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  console.log(
    `[admin-study-rooms] Displayed ${paginatedRooms.length} rooms on page ${currentPage}`
  );
}

// ===== Get paginated rooms =====
function getPaginatedRooms() {
  const start = (currentPage - 1) * currentLimit;
  const end = start + currentLimit;
  return allRooms.slice(start, end);
}

// ===== Update pagination info =====
function updatePaginationInfo() {
  const pageInfo = document.getElementById("pageInfo");
  const roomCount = document.getElementById("roomCount");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  const totalPages = Math.ceil(allRooms.length / currentLimit);

  if (pageInfo) {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
  }

  if (roomCount) {
    const start =
      allRooms.length === 0 ? 0 : (currentPage - 1) * currentLimit + 1;
    const end = Math.min(currentPage * currentLimit, allRooms.length);
    roomCount.textContent = `(${start}-${end} of ${allRooms.length} rooms)`;
  }

  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
  }

  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
  }

  console.log(
    `[admin-study-rooms] Pagination: Page ${currentPage}/${totalPages}, Total: ${allRooms.length}`
  );
}

// ===== Update statistics =====
function updateStatistics(stats) {
  if (!stats) return;

  document.getElementById("totalRoomsCard").textContent =
    stats.totalRooms || "0";
  document.getElementById("activeRoomsCard").textContent =
    stats.activeRooms || "0";
  document.getElementById("publicRoomsCard").textContent =
    stats.publicRooms || "0";
  document.getElementById("privateRoomsCard").textContent =
    stats.privateRooms || "0";
}

// ===== Clear all filters =====
function clearAllFilters() {
  document.getElementById("statusValue").textContent = "All Rooms";
  document.getElementById("privacyValue").textContent = "All Privacy";
  document.getElementById("searchInput").value = "";

  currentStatus = "";
  currentPrivacy = "";
  currentSearch = "";
  currentPage = 1;

  loadRooms();
  console.log("[admin-study-rooms] All filters cleared");
}

// ===== Change page size =====
function changePageSize() {
  const limitSelect = document.getElementById("limitSelect");
  currentLimit = parseInt(limitSelect.value);
  currentPage = 1;
  loadRooms();
  console.log(`[admin-study-rooms] Page size changed to ${currentLimit}`);
}

// ===== View room details =====
async function viewRoomDetails(roomId) {
  try {
    console.log(`[admin-study-rooms] Viewing room ${roomId} details...`);

    const room = allRooms.find((r) => r.id === roomId);
    if (!room) {
      if (window.showError) {
        window.showError("Room not found");
      }
      return;
    }

    currentViewingRoomId = roomId;

    console.log("[admin-study-rooms] Room details:", room);

    // Populate basic room info
    document.getElementById("detailRoomId").textContent = escapeHtml(
      room.id || "-"
    );
    document.getElementById("detailRoomName").textContent = escapeHtml(
      room.name || "Untitled Room"
    );
    document.getElementById("detailDescription").textContent = escapeHtml(
      room.description || "-"
    );
    document.getElementById("detailPrivacy").textContent = escapeHtml(
      room.privacy === "private" ? "Private" : "Public"
    );
    document.getElementById("detailStatus").textContent = escapeHtml(
      room.isActive ? "ACTIVE" : "INACTIVE"
    );

    // Creator information - Use fetched data from backend
    const creatorName = room.creatorName || "Unknown";
    const creatorEmail = room.creatorEmail || "-";

    document.getElementById("detailCreatorName").textContent =
      escapeHtml(creatorName);
    document.getElementById("detailCreatorEmail").textContent =
      escapeHtml(creatorEmail);
    document.getElementById("detailCreatedAt").textContent = escapeHtml(
      window.formatDateTime(room.createdAt) || "-"
    );

    console.log("[admin-study-rooms] Creator:", {
      name: creatorName,
      email: creatorEmail,
    });

    // Participants
    const participantCount = room.participants ? room.participants.length : 0;
    document.getElementById("detailParticipantCount").textContent =
      participantCount;

    // Fetch participant names
    const participantsList = document.getElementById("detailParticipantsList");
    if (participantCount > 0) {
      console.log(
        "[admin-study-rooms] Fetching participant names for",
        room.participants
      );

      // Show loading state while fetching participant details
      participantsList.innerHTML =
        '<p style="color: var(--text-secondary); margin: 0;">Loading participants...</p>';

      const participantPromises = room.participants.map(async (uid) => {
        const userData = await getUserData(uid);
        return {
          uid,
          name: userData.name,
          email: userData.email,
        };
      });

      const participants = await Promise.all(participantPromises);

      participantsList.innerHTML = participants
        .map(
          (p) => `
        <div class="participant-item">
          <strong>${escapeHtml(p.name)}</strong>
          <span style="color: var(--text-secondary); font-size: 12px;">
            ${escapeHtml(p.email)}
          </span>
        </div>
      `
        )
        .join("");

      console.log("[admin-study-rooms] ✅ Participants loaded:", participants);
    } else {
      participantsList.innerHTML =
        '<p style="color: var(--text-secondary); margin: 0;">No participants yet</p>';
    }

    // Open modal
    openModal("viewRoomModal");
  } catch (err) {
    console.error("[admin-study-rooms] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to load room details: ${err.message}`);
    }
  }
}

// ===== Deactivate room =====
function deactivateRoom(roomId) {
  const room = allRooms.find((r) => r.id === roomId);
  if (!room) return;

  document.getElementById("deactivateRoomName").textContent = escapeHtml(
    room.name || "this room"
  );
  currentViewingRoomId = roomId;
  openModal("deactivateRoomModal");
}

// ===== Confirm deactivate room =====
async function confirmDeactivateRoom() {
  try {
    if (!currentViewingRoomId) return;

    console.log(
      `[admin-study-rooms] Deactivating room ${currentViewingRoomId}...`
    );

    const response = await window.adminFetch(
      `/api/admin/study-rooms/${currentViewingRoomId}/deactivate`,
      { method: "PUT" }
    );

    console.log("[admin-study-rooms] ✅ Room deactivated:", response);

    if (window.showSuccess) {
      window.showSuccess("Room deactivated successfully");
    }

    closeModal("deactivateRoomModal");
    loadRooms();
  } catch (err) {
    console.error("[admin-study-rooms] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to deactivate room: ${err.message}`);
    }
  }
}

// ===== Activate room =====
function activateRoom(roomId) {
  const room = allRooms.find((r) => r.id === roomId);
  if (!room) return;

  currentViewingRoomId = roomId;
  confirmActivateRoom();
}

// ===== Confirm activate room =====
async function confirmActivateRoom() {
  try {
    if (!currentViewingRoomId) return;

    console.log(
      `[admin-study-rooms] Activating room ${currentViewingRoomId}...`
    );

    const response = await window.adminFetch(
      `/api/admin/study-rooms/${currentViewingRoomId}/activate`,
      { method: "PUT" }
    );

    console.log("[admin-study-rooms] ✅ Room activated:", response);

    if (window.showSuccess) {
      window.showSuccess("Room activated successfully");
    }

    loadRooms();
  } catch (err) {
    console.error("[admin-study-rooms] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to activate room: ${err.message}`);
    }
  }
}

// ===== Delete room =====
function deleteRoom(roomId) {
  const room = allRooms.find((r) => r.id === roomId);
  if (!room) return;

  document.getElementById("deleteRoomName").textContent = escapeHtml(
    room.name || "this room"
  );
  currentViewingRoomId = roomId;
  openModal("deleteRoomModal");
}

// ===== Confirm delete room =====
async function confirmDeleteRoom() {
  try {
    if (!currentViewingRoomId) return;

    console.log(`[admin-study-rooms] Deleting room ${currentViewingRoomId}...`);

    const response = await window.adminFetch(
      `/api/admin/study-rooms/${currentViewingRoomId}`,
      { method: "DELETE" }
    );

    console.log("[admin-study-rooms] ✅ Room deleted:", response);

    if (window.showSuccess) {
      window.showSuccess("Room deleted successfully");
    }

    closeModal("deleteRoomModal");
    loadRooms();
  } catch (err) {
    console.error("[admin-study-rooms] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to delete room: ${err.message}`);
    }
  }
}

// ===== Modal functions =====
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    console.log(`[admin-study-rooms] Opened modal: ${modalId}`);
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active");
    console.log(`[admin-study-rooms] Closed modal: ${modalId}`);
  }
}

// Close modal when clicking outside
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal")) {
    e.target.classList.remove("active");
  }
});

// Close modal with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal.active").forEach((modal) => {
      modal.classList.remove("active");
    });
  }
});

// ===== Escape HTML =====
function escapeHtml(text) {
  if (!text) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// ===== Scroll to top =====
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ===== Make functions globally available =====
window.viewRoomDetails = viewRoomDetails;
window.deactivateRoom = deactivateRoom;
window.confirmDeactivateRoom = confirmDeactivateRoom;
window.activateRoom = activateRoom;
window.confirmActivateRoom = confirmActivateRoom;
window.deleteRoom = deleteRoom;
window.confirmDeleteRoom = confirmDeleteRoom;
window.clearAllFilters = clearAllFilters;
window.changePageSize = changePageSize;
window.toggleCustomSelect = toggleCustomSelect;
window.selectCustomOption = selectCustomOption;
window.closeModal = closeModal;
window.openModal = openModal;

console.log("[admin-study-rooms] Module loaded ✅");
