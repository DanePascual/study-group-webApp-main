// frontend/admin/js/admin-admins.js
// Handles admin management

let allAdmins = [];
let activeModalCustomSelect = null;
let pendingAction = null;

// ===== LISTEN: Wait for adminUser to be available =====
let adminUserReady = false;
window.addEventListener("adminUserReady", () => {
  adminUserReady = true;
  console.log("[admin-admins] ✅ adminUser is ready");
});

// ===== Initialize on page load =====
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[admin-admins] Initializing...");

  // Setup event listeners immediately
  setupEventListeners();

  // Wait for admin user to be set
  const checkAdminInterval = setInterval(() => {
    if (window.adminUser) {
      clearInterval(checkAdminInterval);
      loadAdmins();
    }
  }, 100);
});

// ===== Setup event listeners =====
function setupEventListeners() {
  console.log("[admin-admins] Setting up event listeners...");

  // Modal custom select
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-select-wrapper-modal")) {
      document
        .querySelectorAll(".custom-select-dropdown-modal.active")
        .forEach((el) => {
          el.classList.remove("active");
        });
      document
        .querySelectorAll(".custom-select-trigger-modal.active")
        .forEach((el) => {
          el.classList.remove("active");
        });
      activeModalCustomSelect = null;
    }
  });

  console.log("[admin-admins] Event listeners setup complete");
}

// ===== MODAL CUSTOM SELECT FUNCTIONS =====
function toggleModalCustomSelect(type) {
  const dropdown = document.getElementById(type + "Dropdown");
  const trigger = document.getElementById(type + "Trigger");

  // Close other dropdowns
  if (activeModalCustomSelect && activeModalCustomSelect !== type) {
    document
      .getElementById(activeModalCustomSelect + "Dropdown")
      ?.classList.remove("active");
    document
      .getElementById(activeModalCustomSelect + "Trigger")
      ?.classList.remove("active");
  }

  dropdown.classList.toggle("active");
  trigger.classList.toggle("active");
  activeModalCustomSelect = dropdown.classList.contains("active") ? type : null;
}

// ✅ FIXED: Updated to correctly update both the display text and hidden input value
function selectModalCustomOption(type, value, label) {
  if (type === "promoteRole") {
    // Update hidden input with the actual value
    const hiddenInput = document.getElementById("promoteRoleValue");
    if (hiddenInput) {
      hiddenInput.value = value;
    }

    // Update the display text in the span
    const displaySpan = document.querySelector(".custom-select-value-modal");
    if (displaySpan) {
      displaySpan.textContent = label;
    }

    // Close the dropdown
    const dropdown = document.getElementById("promoteRoleDropdown");
    const trigger = document.getElementById("promoteRoleTrigger");
    if (dropdown) dropdown.classList.remove("active");
    if (trigger) trigger.classList.remove("active");
  }

  activeModalCustomSelect = null;
}

// ===== Load admins =====
async function loadAdmins() {
  try {
    console.log("[admin-admins] Fetching admins...");

    const response = await window.adminFetch("/api/admin/admins");

    console.log("[admin-admins] ✅ Admins fetched:", response);

    allAdmins = response.admins || [];

    // ✅ FIXED: Filter out removed admins before displaying
    const activeAdmins = allAdmins.filter(
      (admin) => admin.status !== "removed"
    );

    console.log(
      `[admin-admins] Total admins: ${allAdmins.length}, Active admins: ${activeAdmins.length}`
    );

    displayAdmins(activeAdmins);
  } catch (err) {
    console.error("[admin-admins] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to load admins: ${err.message}`);
    }
    document.getElementById("adminsList").innerHTML =
      '<tr><td colspan="6" class="error-message">Error loading admins. Please try again.</td></tr>';
  }
}

// ===== Display admins in table =====
function displayAdmins(admins) {
  const tbody = document.getElementById("adminsList");
  const emptyState = document.getElementById("emptyState");

  if (!admins || admins.length === 0) {
    tbody.innerHTML = "";
    emptyState.style.display = "flex";
    console.log("[admin-admins] No admins to display");
    return;
  }

  emptyState.style.display = "none";
  tbody.innerHTML = admins
    .map((admin) => {
      const statusClass = `status-${admin.status}`;
      const isCurrentAdmin = admin.uid === window.adminUser.uid;

      return `
        <tr data-admin-id="${escapeHtml(admin.uid)}">
          <td>${escapeHtml(admin.name || "Unknown")} ${
        isCurrentAdmin ? "(You)" : ""
      }</td>
          <td>${escapeHtml(admin.email || "N/A")}</td>
          <td><strong>${admin.role || "moderator"}</strong></td>
          <td>
            <span class="status-badge ${statusClass}">
              ${admin.status || "active"}
            </span>
          </td>
          <td>${window.formatDate(admin.promotedAt)}</td>
          <td>
            <div class="action-buttons">
              <button
                class="action-link"
                onclick="window.viewAdminDetails('${escapeHtml(admin.uid)}')"
              >
                View
              </button>
              ${
                !isCurrentAdmin
                  ? `
                  ${
                    admin.status === "suspended"
                      ? `<button class="action-link" onclick="window.confirmUnsuspendAdmin('${admin.uid}')">Unsuspend</button>`
                      : `<button class="action-link" onclick="window.confirmSuspendAdmin('${admin.uid}')">Suspend</button>`
                  }
                  <button class="action-link" onclick="window.confirmRemoveAdmin('${
                    admin.uid
                  }')">Remove</button>
                `
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  console.log(`[admin-admins] Displayed ${admins.length} admins`);
}

// ===== View admin details =====
async function viewAdminDetails(uid) {
  try {
    console.log(`[admin-admins] Fetching admin ${uid} details...`);

    const response = await window.adminFetch(`/api/admin/admins/${uid}`);

    console.log("[admin-admins] ✅ Admin details:", response);

    // Populate modal
    document.getElementById("detailName").textContent = response.name || "-";
    document.getElementById("detailEmail").textContent = response.email || "-";
    document.getElementById("detailRole").textContent = response.role || "-";
    document.getElementById(
      "detailStatus"
    ).innerHTML = `<span class="status-badge status-${response.status}">${response.status}</span>`;
    document.getElementById("detailPromotedAt").textContent =
      window.formatDateTime(response.promotedAt) || "-";
    document.getElementById("detailPromotedBy").textContent =
      response.promotedBy || "N/A";
    document.getElementById("detailTotalActions").textContent =
      response.stats?.totalActions || "0";
    document.getElementById("detailLastActive").textContent =
      window.formatDateTime(response.stats?.lastActive) || "N/A";

    // Recent actions
    const recentActionsList = document.getElementById("detailRecentActions");
    if (response.recentActions && response.recentActions.length > 0) {
      recentActionsList.innerHTML = response.recentActions
        .slice(0, 5)
        .map(
          (action) => `
        <div class="action-item">
          <strong>${formatActionLabel(action.action)}</strong>
          <span class="time-ago">${window.formatTimeAgo(
            action.timestamp
          )}</span>
        </div>
      `
        )
        .join("");
    } else {
      recentActionsList.innerHTML =
        '<p class="no-actions">No recent actions</p>';
    }

    openModal("viewAdminModal");
  } catch (err) {
    console.error("[admin-admins] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to load admin details: ${err.message}`);
    }
  }
}

// ===== Confirm promote user =====
async function confirmPromoteUser() {
  try {
    const email = document.getElementById("promoteEmail").value.trim();
    const role = document.getElementById("promoteRoleValue").value;
    const reason =
      document.getElementById("promoteReason").value.trim() ||
      "Promoting qualified user";

    if (!email) {
      if (window.showError) {
        window.showError("Please enter user email");
      }
      return;
    }

    if (!role) {
      if (window.showError) {
        window.showError("Please select a role");
      }
      return;
    }

    console.log(`[admin-admins] Promoting user ${email} to ${role}...`);

    const response = await window.adminFetch("/api/admin/admins/promote-user", {
      method: "POST",
      body: JSON.stringify({
        email, // Send email - backend will convert to uid
        role,
        reason,
        permissions: {
          banUsers: true,
          manageReports: true,
          manageAdmins: role === "superadmin",
          viewAuditLogs: true,
        },
      }),
    });

    console.log("[admin-admins] ✅ User promoted:", response);
    if (window.showSuccess) {
      window.showSuccess(`User promoted to ${role} successfully!`);
    }
    closeModal("promoteUserModal");
    resetPromoteForm();
    loadAdmins();
  } catch (err) {
    console.error("[admin-admins] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to promote user: ${err.message}`);
    }
  }
}

// ===== Reset promote form =====
function resetPromoteForm() {
  document.getElementById("promoteEmail").value = "";
  document.getElementById("promoteRoleValue").value = "";
  document.querySelector(".custom-select-value-modal").textContent =
    "-- Select Role --";
  document.getElementById("promoteReason").value = "";
}

// ===== Confirm suspend admin =====
function confirmSuspendAdmin(uid) {
  pendingAction = {
    type: "suspend",
    uid: uid,
  };

  document.getElementById("confirmTitle").textContent = "Suspend Admin";
  document.getElementById("confirmMessage").textContent =
    "Are you sure you want to suspend this admin?";
  document.getElementById("confirmActionBtn").className = "btn btn-secondary";
  document.getElementById("confirmActionBtn").textContent = "Suspend";

  openModal("confirmActionModal");
}

// ===== Confirm unsuspend admin =====
function confirmUnsuspendAdmin(uid) {
  pendingAction = {
    type: "unsuspend",
    uid: uid,
  };

  document.getElementById("confirmTitle").textContent = "Unsuspend Admin";
  document.getElementById("confirmMessage").textContent =
    "Are you sure you want to unsuspend this admin?";
  document.getElementById("confirmActionBtn").className = "btn btn-secondary";
  document.getElementById("confirmActionBtn").textContent = "Unsuspend";

  openModal("confirmActionModal");
}

// ===== Confirm remove admin =====
function confirmRemoveAdmin(uid) {
  pendingAction = {
    type: "remove",
    uid: uid,
  };

  document.getElementById("confirmTitle").textContent = "Remove Admin";
  document.getElementById("confirmMessage").textContent =
    "Are you sure you want to remove this admin? This action is irreversible.";
  document.getElementById("confirmActionBtn").className = "btn btn-danger";
  document.getElementById("confirmActionBtn").textContent = "Remove";

  openModal("confirmActionModal");
}

// ===== Execute confirmed action =====
async function executeConfirmedAction() {
  if (!pendingAction) return;

  const { type, uid } = pendingAction;

  try {
    if (type === "suspend") {
      await suspendAdmin(uid);
    } else if (type === "unsuspend") {
      await unsuspendAdmin(uid);
    } else if (type === "remove") {
      await removeAdmin(uid);
    }

    closeModal("confirmActionModal");
    pendingAction = null;
  } catch (err) {
    console.error("[admin-admins] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to execute action: ${err.message}`);
    }
  }
}

// ===== Suspend admin =====
async function suspendAdmin(uid) {
  try {
    console.log(`[admin-admins] Suspending admin ${uid}...`);

    const response = await window.adminFetch(
      `/api/admin/admins/${uid}/suspend`,
      {
        method: "PUT",
        body: JSON.stringify({
          duration: "7 days",
          reason: "Suspended by admin",
        }),
      }
    );

    console.log("[admin-admins] ✅ Admin suspended:", response);
    if (window.showSuccess) {
      window.showSuccess("Admin suspended successfully");
    }
    loadAdmins();
  } catch (err) {
    console.error("[admin-admins] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to suspend admin: ${err.message}`);
    }
  }
}

// ===== Unsuspend admin =====
async function unsuspendAdmin(uid) {
  try {
    console.log(`[admin-admins] Unsuspending admin ${uid}...`);

    const response = await window.adminFetch(
      `/api/admin/admins/${uid}/unsuspend`,
      {
        method: "PUT",
      }
    );

    console.log("[admin-admins] ✅ Admin unsuspended:", response);
    if (window.showSuccess) {
      window.showSuccess("Admin unsuspended successfully");
    }
    loadAdmins();
  } catch (err) {
    console.error("[admin-admins] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to unsuspend admin: ${err.message}`);
    }
  }
}

// ===== Remove admin =====
async function removeAdmin(uid) {
  try {
    console.log(`[admin-admins] Removing admin ${uid}...`);

    const response = await window.adminFetch(`/api/admin/admins/${uid}`, {
      method: "DELETE",
      body: JSON.stringify({
        reason: "Removed by admin",
      }),
    });

    console.log("[admin-admins] ✅ Admin removed:", response);
    if (window.showSuccess) {
      window.showSuccess("Admin removed successfully");
    }
    loadAdmins();
  } catch (err) {
    console.error("[admin-admins] Error:", err.message);
    if (window.showError) {
      window.showError(`Failed to remove admin: ${err.message}`);
    }
  }
}

// ===== Modal functions =====
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    console.log(`[admin-admins] Opened modal: ${modalId}`);
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active");
    console.log(`[admin-admins] Closed modal: ${modalId}`);
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

// ===== Format action label =====
function formatActionLabel(action) {
  if (!action) return "Unknown";

  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ===== Escape HTML to prevent XSS =====
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

// ===== Make functions globally available =====
window.viewAdminDetails = viewAdminDetails;
window.confirmPromoteUser = confirmPromoteUser;
window.executeConfirmedAction = executeConfirmedAction;
window.confirmSuspendAdmin = confirmSuspendAdmin;
window.confirmUnsuspendAdmin = confirmUnsuspendAdmin;
window.confirmRemoveAdmin = confirmRemoveAdmin;
window.toggleModalCustomSelect = toggleModalCustomSelect;
window.selectModalCustomOption = selectModalCustomOption;
window.openModal = openModal;
window.closeModal = closeModal;
window.resetPromoteForm = resetPromoteForm;

console.log("[admin-admins] Module loaded ✅");
