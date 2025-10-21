// frontend/student/scripts/sidebar.js
// Centralized sidebar, auth listener and logout handling
// Improved toggle robustness: ensures inline styles are cleared/restored so open/close works
// even if other scripts previously set inline transforms/margins.

const API_BASE = "http://localhost:5000";

// Module imports (used if modular Firebase is available)
import { auth as importedAuth } from "../../config/firebase.js";
import { onAuthStateChanged as importedOnAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

let auth = null;
let onAuthStateChangedFn = null;

// Detect which Firebase auth to use (compat/global or modular import)
function initializeAuth() {
  if (window.firebase && typeof window.firebase.auth === "function") {
    try {
      auth = window.firebase.auth();
      onAuthStateChangedFn = (a, cb) => a.onAuthStateChanged(cb);
      return;
    } catch (e) {
      // fall back to modular import below
    }
  }
  auth = importedAuth;
  onAuthStateChangedFn = importedOnAuthStateChanged;
}

initializeAuth();

// Safe DOM helper
function el(id) {
  return document.getElementById(id);
}

// Update sidebar UI with profile object (server-provided)
function updateSidebar(profile = {}) {
  try {
    const nameNode = el("sidebarName");
    const courseNode = el("sidebarCourse");
    const avatarNode = el("sidebarAvatar");

    if (nameNode && profile.name) nameNode.textContent = profile.name;
    if (courseNode && profile.program) courseNode.textContent = profile.program;

    if (avatarNode) {
      if (profile.photo) {
        avatarNode.innerHTML = `<img src="${profile.photo}" alt="${
          (profile.name || "User") + " avatar"
        }">`;
      } else if (profile.name) {
        const initials = profile.name
          .split(" ")
          .map((n) => (n ? n[0] : ""))
          .join("")
          .slice(0, 2)
          .toUpperCase();
        avatarNode.textContent = initials;
      }
    }
  } catch (err) {
    console.warn("updateSidebar: could not update DOM", err && err.message);
  }
}

// Fetch profile from backend using ID token
async function fetchAndUpdateSidebarProfile(user) {
  if (!user || !user.getIdToken) return;
  try {
    const token = await user.getIdToken();
    const resp = await fetch(`${API_BASE}/api/users/profile`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!resp.ok) {
      console.warn("Sidebar profile fetch returned non-ok:", resp.status);
      return;
    }
    const profile = await resp.json();
    updateSidebar(profile);
  } catch (err) {
    console.warn("fetchAndUpdateSidebarProfile failed:", err && err.message);
  }
}

// Listen for auth state changes and update sidebar when user signs in
function setupAuthListener() {
  if (!auth || !onAuthStateChangedFn) return;

  onAuthStateChangedFn(auth, async (user) => {
    if (user) {
      // Try to update sidebar from backend but don't block UI if it fails
      fetchAndUpdateSidebarProfile(user).catch(() => {});
    } else {
      const nameNode = el("sidebarName");
      const avatarNode = el("sidebarAvatar");
      const courseNode = el("sidebarCourse");
      if (nameNode) nameNode.textContent = "Not signed in";
      if (avatarNode) avatarNode.textContent = "";
      if (courseNode) courseNode.textContent = "";
    }
  });
}

// Apply initial sidebar preference on load
function applySidebarPreferenceOnLoad() {
  const sidebar = el("sidebar");
  const mainContent = el("mainContent");
  if (!sidebar || !mainContent) return;

  const stored = localStorage.getItem("sidebarOpen");
  if (window.innerWidth > 768) {
    sidebar.classList.add("open");
    mainContent.classList.add("shifted");
    localStorage.setItem("sidebarOpen", "true");
    // ensure inline fallback cleared
    sidebar.style.transform = "";
    mainContent.style.marginLeft = "";
  } else if (stored === "true") {
    sidebar.classList.add("open");
    mainContent.classList.add("shifted");
    sidebar.style.transform = "";
    mainContent.style.marginLeft = "";
  } else {
    sidebar.classList.remove("open");
    mainContent.classList.remove("shifted");
    // ensure inline fallback cleared on load
    sidebar.style.transform = "";
    mainContent.style.marginLeft = "";
  }
}

// Robust delegated toggle wiring — listens at document level and uses closest()
// Also ensures inline styles are set/cleared consistently so repeated open/close works.
function wireSidebarToggle() {
  const sidebar = el("sidebar");
  const mainContent = el("mainContent");
  if (!sidebar || !mainContent) return;

  // compute sidebar width once (fallback if 0)
  function getSidebarWidth() {
    try {
      const w = sidebar.offsetWidth;
      return w && w > 0 ? w : 250;
    } catch (e) {
      return 250;
    }
  }

  document.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest && e.target.closest("#menuToggle");
    if (toggleBtn) {
      // Determine current open state BEFORE toggling
      const currentlyOpen = sidebar.classList.contains("open");

      // Toggle classes
      if (currentlyOpen) {
        sidebar.classList.remove("open");
        mainContent.classList.remove("shifted");
      } else {
        sidebar.classList.add("open");
        mainContent.classList.add("shifted");
      }

      // Ensure inline styles reflect the visual state — clear inline transform when opening.
      const w = getSidebarWidth();
      if (currentlyOpen) {
        // Was open -> now closing
        // Move sidebar off-screen to the left and reset main margin
        sidebar.style.transition = "transform 200ms ease";
        sidebar.style.transform = `translateX(-${w}px)`;
        mainContent.style.transition = "margin-left 200ms ease";
        mainContent.style.marginLeft = "0px";
      } else {
        // Was closed -> now opening
        // Clear any inline transform/margin so CSS handles layout (important if previous script set inline)
        sidebar.style.transform = "";
        mainContent.style.marginLeft = "";
      }

      // Persist preference
      const opening = !currentlyOpen;
      try {
        localStorage.setItem("sidebarOpen", opening ? "true" : "false");
      } catch (err) {}

      try {
        toggleBtn.setAttribute("aria-expanded", opening ? "true" : "false");
      } catch (err) {}

      // Debug logs help diagnosing issues
      console.log("Sidebar toggle:", opening ? "OPEN" : "CLOSED");
      console.log("sidebar.className:", sidebar.className);
      console.log("mainContent.className:", mainContent.className);
      console.log("sidebar.style.transform:", sidebar.style.transform);
      console.log(
        "mainContent.style.marginLeft:",
        mainContent.style.marginLeft
      );
      return;
    }

    // Close sidebar on outside click for small screens
    if (window.innerWidth <= 768) {
      if (
        !sidebar.contains(e.target) &&
        !e.target.closest("#menuToggle") &&
        sidebar.classList.contains("open")
      ) {
        sidebar.classList.remove("open");
        mainContent.classList.remove("shifted");
        // keep inline values reset
        sidebar.style.transform = "";
        mainContent.style.marginLeft = "";
        localStorage.setItem("sidebarOpen", "false");
      }
    }
  });

  // Ensure desktop always opens on resize back to large width
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      sidebar.classList.add("open");
      mainContent.classList.add("shifted");
      sidebar.style.transform = "";
      mainContent.style.marginLeft = "";
    }
  });
}

// Centralized logout handler
async function logout() {
  const ok = confirm("Are you sure you want to log out?");
  if (!ok) return;

  try {
    if (auth && typeof auth.signOut === "function") {
      await auth.signOut();
    }
  } catch (err) {
    console.warn("Logout: firebase signOut failed (continuing cleanup)");
  }

  try {
    localStorage.removeItem("userProfile");
    localStorage.removeItem("currentUser");
    localStorage.removeItem("currentSession");
    localStorage.removeItem("sidebarOpen");
    sessionStorage.clear();
  } catch (e) {}

  window.location.replace("login.html");
}

// Wire logout UI and keyboard shortcut
function wireLogoutUI() {
  const logoutBtn = el("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  const userInfo = document.querySelector(".sidebar-footer .user-info");
  if (userInfo) {
    userInfo.addEventListener("click", () => {
      window.location.href = "profile.html";
    });
    userInfo.style.cursor = "pointer";
    userInfo.setAttribute("role", "button");
    userInfo.setAttribute("aria-label", "Open Profile");
  }

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      logout();
    }
  });
}

// Initialize everything (deferred until DOM ready)
function initSidebar() {
  setupAuthListener();
  applySidebarPreferenceOnLoad();
  wireSidebarToggle();
  wireLogoutUI();
}

// Defer initialization until DOMContentLoaded so elements exist and handlers attach reliably
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSidebar);
} else {
  initSidebar();
}

export { initSidebar, fetchAndUpdateSidebarProfile, logout };
