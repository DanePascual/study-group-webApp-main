// frontend/admin/js/admin-auth.js
// Handles admin authentication and navigation with role-based access control

import { adminApiUrl } from "../../config/appConfig.js";

// ===== GLOBAL: Make adminUser globally available =====
window.adminUser = null;

// ===== Initialize on page load =====
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[admin-auth] Initializing...");

  // Wait for Firebase to be ready
  if (typeof window.firebase === "undefined") {
    console.error("[admin-auth] Firebase not loaded");
    setTimeout(() => (location.href = "/student/pages/login.html"), 2000);
    return;
  }

  // Check if user is logged in
  window.firebase.onAuthStateChanged(async (user) => {
    if (!user) {
      console.warn("[admin-auth] No user logged in, redirecting to login...");
      location.href = "/student/pages/login.html";
      return;
    }

    try {
      // Get user's ID token
      const token = await user.getIdToken(true);
      console.log("[admin-auth] Got user token for:", user.email);

      // ✅ UPDATED: Use imported adminApiUrl
      const response = await fetch(adminApiUrl("/api/admin/dashboard"), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("[admin-auth] Dashboard response status:", response.status);

      if (!response.ok) {
        if (response.status === 403) {
          console.error("[admin-auth] User is not an admin");
          setTimeout(() => (location.href = "/student/pages/login.html"), 2000);
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const dashboardData = await response.json();
      console.log("[admin-auth] Dashboard data received:", dashboardData);

      // Verify admin object exists and has role
      if (!dashboardData.admin) {
        console.error("[admin-auth] No admin object in dashboard response");
        throw new Error("Admin data not found in response");
      }

      // ===== GLOBAL: Set global adminUser =====
      window.adminUser = {
        uid: user.uid,
        email: user.email,
        name: user.displayName || dashboardData.admin.name || "Admin",
        token: token,
        role: dashboardData.admin.role || "moderator",
        status: dashboardData.admin.status || "active",
        promotedAt: dashboardData.admin.promotedAt || null,
      };

      console.log("[admin-auth] ✅ Admin user authenticated:", {
        uid: window.adminUser.uid,
        email: window.adminUser.email,
        name: window.adminUser.name,
        role: window.adminUser.role,
        status: window.adminUser.status,
      });

      // ===== BROADCAST: Dispatch adminUserReady event =====
      window.dispatchEvent(new Event("adminUserReady"));
      console.log("[admin-auth] ✅ Broadcasting adminUserReady event");

      // Display admin info
      updateAdminDisplay();

      // Setup logout button
      setupLogoutButton();

      // Setup leave admin button
      setupLeaveAdminButton();

      // Check page-specific access after a small delay to ensure DOM is ready
      setTimeout(() => {
        checkPageAccess();
      }, 100);
    } catch (err) {
      console.error("[admin-auth] Error verifying admin:", err.message);
      setTimeout(() => (location.href = "/student/pages/login.html"), 3000);
    }
  });
});

// ===== Check page-specific access =====
function checkPageAccess() {
  if (!window.adminUser) {
    console.warn("[admin-auth] adminUser not set, cannot check page access");
    return false;
  }

  const currentPath = window.location.pathname;
  console.log("[admin-auth] Checking page access...");
  console.log("[admin-auth] Current path:", currentPath);
  console.log("[admin-auth] User role:", window.adminUser.role);

  // Pages restricted to superadmin only
  const superadminOnlyPages = [
    "admins.html",
    "/admin/admins.html",
    "/frontend/admin/admins.html",
  ];

  // Check if current page is superadmin-only
  const isSuperadminPage = superadminOnlyPages.some((page) => {
    const matches = currentPath.includes(page);
    console.log(`[admin-auth] Checking if path includes '${page}': ${matches}`);
    return matches;
  });

  console.log("[admin-auth] Is superadmin-only page:", isSuperadminPage);

  if (isSuperadminPage) {
    console.log("[admin-auth] This is a superadmin-only page");
    console.log("[admin-auth] User role:", window.adminUser.role);

    if (window.adminUser.role !== "superadmin") {
      console.warn(
        "[admin-auth] ❌ Access denied - user role is:",
        window.adminUser.role
      );
      showAccessDeniedModal();
      return false;
    } else {
      console.log("[admin-auth] ✅ Superadmin access granted");
      showAdminContent();
      return true;
    }
  }

  console.log("[admin-auth] Not a restricted page, showing content");
  showAdminContent();
  return true;
}

// ===== Show admin content =====
function showAdminContent() {
  const adminContent = document.getElementById("adminContent");

  if (adminContent) {
    adminContent.style.display = "block";
    console.log("[admin-auth] ✅ Showing admin content");
  }
}

// ===== Show access denied modal =====
function showAccessDeniedModal() {
  const modal = document.getElementById("accessDeniedModal");

  if (modal) {
    modal.classList.add("active");
    console.log("[admin-auth] ❌ Showing access denied modal");
  } else {
    console.warn("[admin-auth] Access denied modal not found in DOM");
  }
}

// ===== Handle access denied modal close =====
function closeAccessDeniedModal() {
  const modal = document.getElementById("accessDeniedModal");
  if (modal) {
    modal.classList.remove("active");
  }
  // Redirect to welcome page
  console.log("[admin-auth] Redirecting to welcome page");
  location.href = "index.html";
}

// ===== Update admin display =====
function updateAdminDisplay() {
  const adminNameElements = document.querySelectorAll("#adminName");
  const welcomeNameElement = document.getElementById("welcomeName");

  const displayName = window.adminUser.name || window.adminUser.email;

  adminNameElements.forEach((el) => {
    el.textContent = displayName;
  });

  if (welcomeNameElement) {
    welcomeNameElement.textContent = displayName;
  }

  console.log("[admin-auth] Admin display updated with:", displayName);
}

// ===== Setup logout button =====
function setupLogoutButton() {
  const logoutBtns = document.querySelectorAll("#logoutBtn");

  logoutBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      console.log("[admin-auth] Logging out...");
      try {
        await window.firebase.auth.signOut();
        console.log("[admin-auth] ✅ Logged out successfully");
        location.href = "/student/pages/login.html";
      } catch (err) {
        console.error("[admin-auth] Logout error:", err);
      }
    });
  });
}

// ===== Setup leave admin button =====
function setupLeaveAdminButton() {
  const leaveAdminBtns = document.querySelectorAll("#leaveAdminBtn");

  leaveAdminBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      console.log("[admin-auth] Leaving admin panel...");
      try {
        console.log("[admin-auth] Redirecting to student dashboard");
        location.href = "/student/pages/dashboard.html";
      } catch (err) {
        console.error("[admin-auth] Leave admin error:", err);
      }
    });
  });
}

// ===== Get admin token =====
async function getAdminToken() {
  if (!window.adminUser) {
    throw new Error("Admin user not authenticated");
  }
  return window.adminUser.token;
}

// ===== API Helper =====
// ✅ UPDATED: Use imported adminApiUrl
async function adminFetch(endpoint, options = {}) {
  try {
    const token = await getAdminToken();

    const response = await fetch(adminApiUrl(endpoint), {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error(`[adminFetch] Error on ${endpoint}:`, err.message);
    throw err;
  }
}

// ===== Show error message =====
function showError(message) {
  console.error("[admin-auth] Error:", message);
  // Removed alert() - use modals instead
}

// ===== Show success message =====
function showSuccess(message) {
  console.log("[admin-auth] Success:", message);
  alert(`Success: ${message}`);
}

// ===== Format date =====
function formatDate(date) {
  if (!date) return "N/A";

  try {
    let d;

    // Handle Firestore Timestamp objects
    if (date && typeof date === "object" && "_seconds" in date) {
      d = new Date(date._seconds * 1000);
    } else if (typeof date === "string") {
      // Replace space with T for ISO format compatibility
      const isoString = date.replace(" ", "T");
      d = new Date(isoString);
    } else if (typeof date === "number") {
      // Handle Unix timestamps (in milliseconds)
      d = new Date(date);
    } else {
      d = new Date(date);
    }

    // Check if date is valid
    if (isNaN(d.getTime())) {
      console.warn("[admin-auth] Invalid date:", date);
      return "N/A";
    }

    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch (err) {
    console.error("[admin-auth] Date parsing error:", err, date);
    return "N/A";
  }
}

// ===== Format date and time =====
function formatDateTime(date) {
  if (!date) return "N/A";

  try {
    // Handle various date formats
    let d;

    // Handle Firestore Timestamp objects
    if (date && typeof date === "object" && "_seconds" in date) {
      d = new Date(date._seconds * 1000);
    } else if (typeof date === "string") {
      // Replace space with T for ISO format compatibility
      const isoString = date.replace(" ", "T");
      d = new Date(isoString);
    } else if (typeof date === "number") {
      // Handle Unix timestamps (in milliseconds)
      d = new Date(date);
    } else {
      d = new Date(date);
    }

    // Check if date is valid
    if (isNaN(d.getTime())) {
      console.warn("[admin-auth] Invalid date:", date);
      return "N/A";
    }

    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch (err) {
    console.error("[admin-auth] Date parsing error:", err, date);
    return "N/A";
  }
}

// ===== Format time ago =====
function formatTimeAgo(date) {
  if (!date) return "N/A";

  try {
    let d;

    // Handle Firestore Timestamp objects
    if (date && typeof date === "object" && "_seconds" in date) {
      d = new Date(date._seconds * 1000);
    } else if (typeof date === "string") {
      // Replace space with T for ISO format compatibility
      const isoString = date.replace(" ", "T");
      d = new Date(isoString);
    } else if (typeof date === "number") {
      // Handle Unix timestamps (in milliseconds)
      d = new Date(date);
    } else {
      d = new Date(date);
    }

    // Check if date is valid
    if (isNaN(d.getTime())) {
      console.warn("[admin-auth] Invalid date:", date);
      return "N/A";
    }

    const now = new Date();
    const seconds = Math.floor((now - d) / 1000);

    if (seconds < 0) return "just now";
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return formatDate(d);
  } catch (err) {
    console.error("[admin-auth] Time ago parsing error:", err, date);
    return "N/A";
  }
}

// ===== Make functions globally available =====
window.adminFetch = adminFetch;
window.showError = showError;
window.showSuccess = showSuccess;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.formatTimeAgo = formatTimeAgo;
window.closeAccessDeniedModal = closeAccessDeniedModal;

console.log("[admin-auth] Module loaded ✅");
