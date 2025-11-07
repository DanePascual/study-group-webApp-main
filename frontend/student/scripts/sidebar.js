// frontend/student/scripts/sidebar.js
// Hardened, idempotent sidebar implementation with:
// - shared CSS injection
// - theme toggle wiring (applies across pages)
// - fast-path cached profile render + profile:updated listener
// - auth listener using authFetch for authoritative profile
// - idempotent init guard so module can be included on every page safely
// - admin panel link visibility check

import { onAuthStateChanged, db } from "../../config/firebase.js";
import { authFetch } from "./apiClient.js";
import { adminApiUrl } from "../../config/appConfig.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

/* ----------------------- Helpers ----------------------- */
const el = (id) => document.getElementById(id);

function injectSidebarCss() {
  try {
    if (document.getElementById("sidebar-shared-css")) return;
    const href = "../styles/sidebar.css";
    const link = document.createElement("link");
    link.id = "sidebar-shared-css";
    link.rel = "stylesheet";
    link.href = href;
    const head = document.head || document.getElementsByTagName("head")[0];
    if (head) head.appendChild(link);
  } catch (e) {
    console.warn(
      "Could not inject sidebar CSS:",
      e && e.message ? e.message : e
    );
  }
}

/* ----------------------- Theme (global) ----------------------- */
function applyThemeImmediately() {
  try {
    const savedTheme = localStorage.getItem("theme") || "light";
    const body = document.body;
    const html = document.documentElement;

    if (savedTheme === "dark") {
      body.classList.add("dark-mode");
      html.setAttribute("data-theme", "dark");
    } else {
      body.classList.remove("dark-mode");
      html.setAttribute("data-theme", "light");
    }
  } catch (e) {
    console.warn(
      "applyThemeImmediately error:",
      e && e.message ? e.message : e
    );
  }
}

function applyInitialTheme() {
  try {
    const themeToggle = el("themeToggle");
    const savedTheme = localStorage.getItem("theme") || "light";
    const body = document.body;
    const html = document.documentElement;

    if (savedTheme === "dark") {
      body.classList.add("dark-mode");
      html.setAttribute("data-theme", "dark");
      if (themeToggle) themeToggle.innerHTML = '<i class="bi bi-sun"></i>';
    } else {
      body.classList.remove("dark-mode");
      html.setAttribute("data-theme", "light");
      if (themeToggle) themeToggle.innerHTML = '<i class="bi bi-moon"></i>';
    }
  } catch (e) {
    // no-op
  }
}

function setTheme(isDark) {
  const body = document.body;
  const html = document.documentElement;
  const themeToggle = el("themeToggle");

  if (isDark) {
    body.classList.add("dark-mode");
    html.setAttribute("data-theme", "dark");
    if (themeToggle) themeToggle.innerHTML = '<i class="bi bi-sun"></i>';
    try {
      localStorage.setItem("theme", "dark");
    } catch {}
  } else {
    body.classList.remove("dark-mode");
    html.setAttribute("data-theme", "light");
    if (themeToggle) themeToggle.innerHTML = '<i class="bi bi-moon"></i>';
    try {
      localStorage.setItem("theme", "light");
    } catch {}
  }
}

function wireThemeToggle() {
  const themeToggle = el("themeToggle");
  if (!themeToggle) return;
  themeToggle.addEventListener("click", () => {
    const body = document.body;
    const isDark = !body.classList.contains("dark-mode");
    setTheme(isDark);
    // propagate to other tabs
    try {
      localStorage.setItem("theme-sync", Date.now().toString());
    } catch {}
  });

  // sync theme changes from other tabs
  window.addEventListener("storage", (e) => {
    if (!e.key) return;
    if (e.key === "theme" || e.key === "theme-sync") {
      applyThemeImmediately();
    }
  });
}

/* ----------------------- Admin Panel Visibility ----------------------- */
async function checkAndShowAdminLink(user) {
  try {
    console.log("[sidebar] Checking admin status for user:", user.uid);

    const adminLink = el("adminPanelLink");
    if (!adminLink) {
      console.log("[sidebar] Admin link element not found in sidebar");
      return;
    }

    const token = await user.getIdToken(true);
    console.log("[sidebar] Got user token, checking admin dashboard...");

    // ✅ FIXED: Use adminApiUrl from appConfig instead of hardcoded localhost
    const response = await fetch(adminApiUrl("/api/admin/dashboard"), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    console.log("[sidebar] Admin dashboard response status:", response.status);

    if (response.ok) {
      console.log("[sidebar] ✅ User is admin - showing admin panel link");
      adminLink.style.display = "block";
    } else if (response.status === 403) {
      console.log("[sidebar] ℹ️ User is not an admin (403 Forbidden)");
      adminLink.style.display = "none";
    } else {
      console.warn(`[sidebar] ⚠️ Unexpected status: ${response.status}`);
      adminLink.style.display = "none";
    }
  } catch (err) {
    console.error("[sidebar] ❌ Admin check failed:", err.message);
    const adminLink = el("adminPanelLink");
    if (adminLink) adminLink.style.display = "none";
  }
}

/* ----------------------- Sidebar UI / Profile ----------------------- */
function updateSidebar(profile = {}) {
  try {
    const nameNode = el("sidebarName");
    const courseNode = el("sidebarCourse");
    const avatarNode = el("sidebarAvatar");

    if (nameNode && typeof profile.name === "string")
      nameNode.textContent = profile.name;
    if (courseNode && typeof profile.program === "string")
      courseNode.textContent = profile.program;

    if (avatarNode) {
      // defensive sizing: ensures avatar stays circular even if CSS hasn't loaded yet
      avatarNode.style.minWidth = avatarNode.style.minWidth || "48px";
      avatarNode.style.width = avatarNode.style.width || "48px";
      avatarNode.style.height = avatarNode.style.height || "48px";
      avatarNode.style.borderRadius = avatarNode.style.borderRadius || "50%";
      avatarNode.style.overflow = avatarNode.style.overflow || "hidden";
      avatarNode.style.display = avatarNode.style.display || "inline-flex";
      avatarNode.style.alignItems = avatarNode.style.alignItems || "center";
      avatarNode.style.justifyContent =
        avatarNode.style.justifyContent || "center";

      // clear previous children
      avatarNode.innerHTML = "";

      if (profile.photo) {
        const img = document.createElement("img");
        img.src = profile.photo;
        img.alt = `${profile.name || "User"} avatar`;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.display = "block";
        img.style.borderRadius = "50%";
        avatarNode.appendChild(img);
      } else if (profile.name) {
        const initials = profile.name
          .split(" ")
          .map((n) => (n ? n[0] : ""))
          .join("")
          .slice(0, 2)
          .toUpperCase();
        avatarNode.textContent = initials;
        avatarNode.style.color = "white";
        avatarNode.style.fontWeight = "700";
      } else {
        avatarNode.textContent = "";
      }
    }
  } catch (err) {
    console.warn(
      "updateSidebar failed:",
      err && err.message ? err.message : err
    );
  }
}

function applyCachedProfileIfAny() {
  try {
    const json = localStorage.getItem("userProfile");
    if (!json) return;
    const profile = JSON.parse(json);
    if (profile && typeof profile === "object") updateSidebar(profile);
  } catch (e) {
    // ignore parse errors
  }
}

async function fetchAndUpdateSidebarProfile(user) {
  if (!user || !user.getIdToken) return;
  try {
    const resp = await authFetch("/api/users/profile", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!resp.ok) {
      console.warn("Sidebar profile fetch returned non-ok:", resp.status);
      return;
    }
    const profile = await resp.json();
    updateSidebar(profile);
    try {
      localStorage.setItem("userProfile", JSON.stringify(profile));
    } catch {}
  } catch (err) {
    console.warn(
      "fetchAndUpdateSidebarProfile failed:",
      err && err.message ? err.message : err
    );
  }
}

function setupProfileUpdatedListener() {
  window.addEventListener("profile:updated", (e) => {
    try {
      const profile = e && e.detail ? e.detail : null;
      if (profile) {
        updateSidebar(profile);
        try {
          localStorage.setItem("userProfile", JSON.stringify(profile));
        } catch {}
      }
    } catch (err) {
      console.warn(
        "profile:updated handler error:",
        err && err.message ? err.message : err
      );
    }
  });

  window.addEventListener("storage", (e) => {
    if (!e.key) return;
    if (e.key === "userProfile") {
      try {
        const profile = e.newValue ? JSON.parse(e.newValue) : null;
        if (profile) updateSidebar(profile);
      } catch (err) {}
    }
  });
}

/* ----------------------- Auth / Toggle / Logout / Toggle wiring ----------------------- */
function setupAuthListener() {
  if (!onAuthStateChanged) return;
  onAuthStateChanged(async (user) => {
    if (user) {
      applyCachedProfileIfAny();
      fetchAndUpdateSidebarProfile(user).catch(() => {});

      // ===== NEW: Check admin status =====
      checkAndShowAdminLink(user).catch(() => {});
    } else {
      const nameNode = el("sidebarName");
      const avatarNode = el("sidebarAvatar");
      const courseNode = el("sidebarCourse");
      const adminLink = el("adminPanelLink");

      if (nameNode) nameNode.textContent = "Not signed in";
      if (avatarNode) avatarNode.textContent = "";
      if (courseNode) courseNode.textContent = "";
      if (adminLink) adminLink.style.display = "none";

      try {
        localStorage.removeItem("userProfile");
      } catch {}
    }
  });
}

function applySidebarPreferenceOnLoad() {
  const sidebar = el("sidebar");
  const mainContent = el("mainContent");
  if (!sidebar || !mainContent) return;
  const stored = localStorage.getItem("sidebarOpen");
  if (window.innerWidth > 768) {
    sidebar.classList.add("open");
    mainContent.classList.add("shifted");
    try {
      localStorage.setItem("sidebarOpen", "true");
    } catch {}
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
    sidebar.style.transform = "";
    mainContent.style.marginLeft = "";
  }
}

function wireSidebarToggle() {
  const sidebar = el("sidebar");
  const mainContent = el("mainContent");
  if (!sidebar || !mainContent) return;

  function getSidebarWidth() {
    try {
      const w = sidebar.offsetWidth;
      return w && w > 0 ? w : 250;
    } catch {
      return 250;
    }
  }

  document.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest && e.target.closest("#menuToggle");
    if (toggleBtn) {
      const currentlyOpen = sidebar.classList.contains("open");
      if (currentlyOpen) {
        sidebar.classList.remove("open");
        mainContent.classList.remove("shifted");
      } else {
        sidebar.classList.add("open");
        mainContent.classList.add("shifted");
      }
      const w = getSidebarWidth();
      if (currentlyOpen) {
        sidebar.style.transition = "transform 200ms ease";
        sidebar.style.transform = `translateX(-${w}px)`;
        mainContent.style.transition = "margin-left 200ms ease";
        mainContent.style.marginLeft = "0px";
      } else {
        sidebar.style.transform = "";
        mainContent.style.marginLeft = "";
      }
      const opening = !currentlyOpen;
      try {
        localStorage.setItem("sidebarOpen", opening ? "true" : "false");
      } catch {}
      try {
        toggleBtn.setAttribute("aria-expanded", opening ? "true" : "false");
      } catch {}
      return;
    }

    if (window.innerWidth <= 768) {
      if (
        !sidebar.contains(e.target) &&
        !e.target.closest("#menuToggle") &&
        sidebar.classList.contains("open")
      ) {
        sidebar.classList.remove("open");
        mainContent.classList.remove("shifted");
        sidebar.style.transform = "";
        mainContent.style.marginLeft = "";
        try {
          localStorage.setItem("sidebarOpen", "false");
        } catch {}
      }
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      sidebar.classList.add("open");
      mainContent.classList.add("shifted");
      sidebar.style.transform = "";
      mainContent.style.marginLeft = "";
    }
  });
}

async function logout() {
  const ok = confirm("Are you sure you want to log out?");
  if (!ok) return;
  try {
    if (window.firebase && typeof window.firebase.auth === "function") {
      await window.firebase.auth().signOut();
    }
  } catch {}
  try {
    localStorage.removeItem("userProfile");
    localStorage.removeItem("currentUser");
    localStorage.removeItem("currentSession");
    localStorage.removeItem("sidebarOpen");
    sessionStorage.clear();
  } catch {}
  window.location.replace("login.html");
}

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

/* ----------------------- Init ----------------------- */
function initSidebar() {
  console.info("sidebar: init (idempotent)");
  injectSidebarCss();
  applyInitialTheme();
  wireThemeToggle();
  applyCachedProfileIfAny();
  setupProfileUpdatedListener();
  setupAuthListener();
  applySidebarPreferenceOnLoad();
  wireSidebarToggle();
  wireLogoutUI();
}

/* Guard against double-init */
if (!window.__sidebarInitialized) {
  window.__sidebarInitialized = true;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSidebar);
  } else {
    initSidebar();
  }
} else {
  console.info("sidebar: already initialized - skipping init call");
}

export { initSidebar, fetchAndUpdateSidebarProfile, logout };
