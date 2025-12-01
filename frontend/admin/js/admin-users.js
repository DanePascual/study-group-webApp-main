// frontend/admin/js/admin-users.js
// Handles admin users management

let currentPage = 1;
let currentLimit = 10;
let currentStatus = "";
let currentSearch = "";
let currentBanningUserId = null;
let currentUnbanningUserId = null;
let allUsers = [];
let activeCustomSelect = null;

// ===== LISTEN: Wait for adminUser to be available =====
let adminUserReady = false;
window.addEventListener("adminUserReady", () => {
  adminUserReady = true;
  console.log("[admin-users] ✅ adminUser is ready");
});

// ===== Initialize on page load =====
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[admin-users] Initializing...");

  // Setup event listeners immediately
  setupEventListeners();

  // Wait for admin user to be set with token
  let attempts = 0;
  const checkAdminInterval = setInterval(() => {
    attempts++;

    if (window.adminUser && window.adminUser.token) {
      clearInterval(checkAdminInterval);
      console.log(
        "[admin-users] Admin user ready with token, loading users..."
      );
      loadUsers();
    } else {
      console.log(
        `[admin-users] Waiting for admin user... (attempt ${attempts})`
      );

      if (attempts > 100) {
        clearInterval(checkAdminInterval);
        console.error("[admin-users] Admin user not ready after 10 seconds");
        console.error("[admin-users] Failed to initialize admin session");
      }
    }
  }, 100);
});

// ===== Setup event listeners =====
function setupEventListeners() {
  console.log("[admin-users] Setting up event listeners...");

  // Search input with debounce
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = e.target.value;
        currentPage = 1;
        loadUsers();
      }, 300);
    });
  }

  // Pagination
  const prevBtn = document.getElementById("prevBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        loadUsers();
        scrollToTop();
      }
    });
  }

  const nextBtn = document.getElementById("nextBtn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const totalPages = Math.ceil(allUsers.length / currentLimit);
      if (currentPage < totalPages) {
        currentPage++;
        loadUsers();
        scrollToTop();
      }
    });
  }

  console.log("[admin-users] Event listeners setup complete");
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
  }

  activeCustomSelect = null;
  currentPage = 1;
  loadUsers();
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

// ===== Load users =====
async function loadUsers() {
  try {
    console.log("[admin-users] Fetching users...");
    const usersList = document.getElementById("usersList");
    const emptyState = document.getElementById("emptyState");

    // Show loading state
    usersList.innerHTML = `
      <tr>
        <td colspan="6" class="loading">
          <div class="spinner"></div>
          <span>Loading users...</span>
        </td>
      </tr>
    `;
    emptyState.style.display = "none";

    const params = new URLSearchParams({
      page: 1,
      limit: 1000, // Fetch all for client-side filtering
      status: currentStatus,
      search: currentSearch,
      sort: "newest",
    });

    const response = await window.adminFetch(`/api/admin/users?${params}`);

    console.log("[admin-users] Users fetched:", response);

    allUsers = response.users || [];
    displayUsers();
    updatePaginationInfo();
  } catch (err) {
    console.error("[admin-users] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to load users: ${err.message}`);
    }
    document.getElementById("usersList").innerHTML =
      '<tr><td colspan="6" class="error-message">Error loading users. Please try again.</td></tr>';
  }
}

// ===== Display users in table =====
function displayUsers() {
  const tbody = document.getElementById("usersList");
  const emptyState = document.getElementById("emptyState");
  const paginatedUsers = getPaginatedUsers();

  if (!paginatedUsers || paginatedUsers.length === 0) {
    tbody.innerHTML = "";
    emptyState.style.display = "flex";
    console.log("[admin-users] No users to display");
    return;
  }

  emptyState.style.display = "none";
  tbody.innerHTML = paginatedUsers
    .map((user) => {
      const statusClass = user.isBanned ? "status-banned" : "status-active";
      const statusText = user.isBanned ? "Banned" : "Active";

      return `
        <tr>
          <td>${escapeHtml(user.name)}</td>
          <td>${escapeHtml(user.email)}</td>
          <td>${escapeHtml(user.program || "N/A")}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td>${window.formatDate(user.createdAt)}</td>
          <td>
            <div class="action-buttons">
              <button
                class="action-link"
                onclick="window.openViewUserModal('${escapeHtml(user.uid)}')"
                title="View user details"
              >
                View
              </button>
              ${
                user.isBanned
                  ? `<button
                      class="action-link"
                      onclick="window.openUnbanModal('${escapeHtml(
                        user.uid
                      )}', '${escapeHtml(user.name)}')"
                      title="Unban user"
                    >
                      Unban
                    </button>`
                  : `<button
                      class="action-link"
                      onclick="window.openBanModal('${escapeHtml(
                        user.uid
                      )}', '${escapeHtml(user.name)}')"
                      title="Ban user"
                    >
                      Ban
                    </button>`
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  console.log(
    `[admin-users] Displayed ${paginatedUsers.length} users on page ${currentPage}`
  );
}

// ===== Get paginated users =====
function getPaginatedUsers() {
  const start = (currentPage - 1) * currentLimit;
  const end = start + currentLimit;
  return allUsers.slice(start, end);
}

// ===== Update pagination info =====
function updatePaginationInfo() {
  const pageInfo = document.getElementById("pageInfo");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  const totalPages = Math.ceil(allUsers.length / currentLimit);

  if (pageInfo) {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
  }

  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
  }

  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
  }

  console.log(
    `[admin-users] Pagination: Page ${currentPage}/${totalPages}, Total: ${allUsers.length}`
  );
}

// ===== Clear all filters =====
function clearAllFilters() {
  document.getElementById("statusValue").textContent = "All Users";
  document.getElementById("searchInput").value = "";

  currentStatus = "";
  currentSearch = "";
  currentPage = 1;

  loadUsers();
  console.log("[admin-users] All filters cleared");
}

// ===== Change page size =====
function changePageSize() {
  const limitSelect = document.getElementById("limitSelect");
  currentLimit = parseInt(limitSelect.value);
  currentPage = 1;
  displayUsers();
  updatePaginationInfo();
  console.log(`[admin-users] Page size changed to ${currentLimit}`);
}

// ===== Open view user modal =====
async function openViewUserModal(uid) {
  try {
    console.log(`[admin-users] Viewing user ${uid} details...`);

    const user = allUsers.find((u) => u.uid === uid);
    if (!user) {
      if (window.showError) {
        window.showError("User not found");
      }
      return;
    }

    // Populate modal fields
    document.getElementById("detailName").textContent = user.name || "N/A";
    document.getElementById("detailEmail").textContent = user.email || "N/A";
    document.getElementById("detailProgram").textContent =
      user.program || "N/A";
    document.getElementById("detailYearLevel").textContent =
      user.yearLevel || "N/A";
    document.getElementById("detailStudentNumber").textContent =
      user.studentNumber || "N/A";

    // Status
    const statusElement = document.getElementById("detailStatus");
    if (user.isBanned) {
      statusElement.innerHTML =
        '<span class="status-badge status-banned">Banned</span>';
    } else {
      statusElement.innerHTML =
        '<span class="status-badge status-active">Active</span>';
    }

    document.getElementById("detailJoined").textContent = window.formatDateTime(
      user.createdAt
    );

    // Banned info (if applicable)
    const bannedAtContainer = document.getElementById("bannedAtContainer");
    const banReasonContainer = document.getElementById("banReasonContainer");

    if (user.isBanned) {
      bannedAtContainer.style.display = "block";
      banReasonContainer.style.display = "block";
      document.getElementById("detailBannedAt").textContent =
        window.formatDateTime(user.bannedAt);
      document.getElementById("detailBanReason").textContent =
        user.bannedReason || "No reason provided";
    } else {
      bannedAtContainer.style.display = "none";
      banReasonContainer.style.display = "none";
    }

    // Show modal
    openModal("viewUserModal");
  } catch (err) {
    console.error("[admin-users] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to load user details: ${err.message}`);
    }
  }
}

// ===== Open ban modal =====
function openBanModal(uid, userName) {
  currentBanningUserId = uid;
  document.getElementById("banUserName").textContent = userName;
  document.getElementById("banReason").value =
    "Violation of community guidelines";
  openModal("banUserModal");
}

// ===== Confirm ban user =====
async function confirmBanUser() {
  const reason = document.getElementById("banReason").value.trim();

  if (!reason) {
    if (window.showError) {
      window.showError("Please enter a ban reason");
    }
    return;
  }

  try {
    console.log(`[admin-users] Banning user ${currentBanningUserId}...`);

    const response = await window.adminFetch(
      `/api/admin/users/${currentBanningUserId}/ban`,
      {
        method: "PUT",
        body: JSON.stringify({
          reason,
          duration: "permanent",
        }),
      }
    );

    console.log("[admin-users] User banned:", response);
    if (window.showSuccess) {
      window.showSuccess(`User banned successfully. Reason: ${reason}`);
    }
    closeModal("banUserModal");
    currentBanningUserId = null;
    currentPage = 1;
    loadUsers();
  } catch (err) {
    console.error("[admin-users] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to ban user: ${err.message}`);
    }
  }
}

// ===== Open unban confirmation modal =====
function openUnbanModal(uid, userName) {
  currentUnbanningUserId = uid;
  document.getElementById("unbanUserName").textContent = userName;
  openModal("unbanConfirmModal");
}

// ===== Confirm unban user =====
async function confirmUnbanUser() {
  try {
    console.log(`[admin-users] Unbanning user ${currentUnbanningUserId}...`);

    const response = await window.adminFetch(
      `/api/admin/users/${currentUnbanningUserId}/unban`,
      {
        method: "PUT",
      }
    );

    console.log("[admin-users] User unbanned:", response);
    if (window.showSuccess) {
      window.showSuccess("User unbanned successfully");
    }
    closeModal("unbanConfirmModal");
    currentUnbanningUserId = null;
    currentPage = 1;
    loadUsers();
  } catch (err) {
    console.error("[admin-users] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to unban user: ${err.message}`);
    }
  }
}

// ===== Modal functions =====
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    console.log(`[admin-users] Opened modal: ${modalId}`);
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active");
    console.log(`[admin-users] Closed modal: ${modalId}`);
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

// ===== Utility: Escape HTML =====
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

// ===== Utility: Scroll to top =====
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ===== Make functions globally available =====
// ✅ FIXED: Added closeModal and openModal to window global object
window.openModal = openModal;
window.closeModal = closeModal;
window.openViewUserModal = openViewUserModal;
window.openBanModal = openBanModal;
window.confirmBanUser = confirmBanUser;
window.openUnbanModal = openUnbanModal;
window.confirmUnbanUser = confirmUnbanUser;
window.clearAllFilters = clearAllFilters;
window.changePageSize = changePageSize;
window.toggleCustomSelect = toggleCustomSelect;
window.selectCustomOption = selectCustomOption;

console.log("[admin-users] Module loaded ✅");
