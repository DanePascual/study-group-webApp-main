// ======= Firebase Auth Dynamic Session for Resources Page =======
// Updated to be defensive with sidebar updates and to rely on centralized sidebar.js
import { auth, db } from "../../config/firebase.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Dynamic session info
let CURRENT_SESSION = null;

// UI State
const state = {
  currentView: "grid",
  currentType: "all",
  currentSort: "newest",
  currentSearch: "",
  tableSort: "newest",
  resources: [],
  editingMode: false,
  editResourceId: null,
};

const API_BASE = "http://localhost:5000/api/resources";

// ===== Firebase Auth =====
// When auth state changes, derive a lightweight CURRENT_SESSION and initialize page UI after DOM ready.
// The centralized sidebar.js will fetch authoritative profile (name/photo) from backend and update the sidebar.
// We make our sidebar updates defensive so we never overwrite an <img> set by sidebar.js.
auth.onAuthStateChanged(async (user) => {
  if (user) {
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

    // Defensive sidebar update so we don't overwrite an image that sidebar.js may set later
    updateSidebarUserInfo();

    // Initialize theme and UI after DOM is ready
    initializeTheme();
    scheduleResourceUIInit();
  } else {
    window.location.href = "login.html";
  }
});

// Update sidebar dynamically (defensive)
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

// ---- Theme toggle ----
function initializeTheme() {
  const themeToggle = document.getElementById("themeToggle");
  const body = document.body;
  if (!themeToggle || !body) return;
  const savedTheme = localStorage.getItem("theme") || "light";
  if (savedTheme === "dark") {
    body.classList.add("dark-mode");
    themeToggle.innerHTML = '<i class="bi bi-sun"></i>';
  } else {
    themeToggle.innerHTML = '<i class="bi bi-moon"></i>';
  }
  themeToggle.addEventListener("click", () => {
    body.classList.toggle("dark-mode");
    const isDark = body.classList.contains("dark-mode");
    themeToggle.innerHTML = isDark
      ? '<i class="bi bi-sun"></i>'
      : '<i class="bi bi-moon"></i>';
    localStorage.setItem("theme", isDark ? "dark" : "light");
  });
}

// ---- Helper: Date Formatting ----
function toJsDate(val) {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  if (typeof val === "object" && "_seconds" in val) {
    return new Date(val._seconds * 1000 + Math.floor(val._nanoseconds / 1e6));
  }
  if (typeof val === "string" || typeof val === "number") return new Date(val);
  return val;
}
function formatDate(dateObj) {
  if (!dateObj) return "";
  const date = toJsDate(dateObj);
  if (!date || isNaN(date.getTime())) return "";
  const options = { year: "numeric", month: "short", day: "numeric" };
  return date.toLocaleDateString(undefined, options);
}
function formatRelativeTime(dateObj) {
  if (!dateObj) return "";
  const date = toJsDate(dateObj);
  if (!date || isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(date);
}

// ====== API Calls ======
async function fetchResources() {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error("Failed to fetch resources");
    state.resources = await res.json();
    applyFiltersAndSort();
    renderFilesTable();
  } catch (err) {
    console.error("Error fetching resources:", err);
    showToast("Unable to load resources.", "error");
  }
}

async function getResourceById(id) {
  try {
    const res = await fetch(`${API_BASE}/${id}`);
    if (!res.ok) throw new Error("Not found");
    return res.json();
  } catch (err) {
    console.error("Error fetching resource by ID:", err);
    throw err;
  }
}

async function uploadResource(formData) {
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Failed to upload resource");
    }
    return res.json();
  } catch (err) {
    console.error("Error uploading resource:", err);
    throw err;
  }
}

async function updateResource(id, update, coverImageFile = null) {
  try {
    let res;
    if (coverImageFile) {
      const formData = new FormData();
      for (const key in update) {
        if (Object.prototype.hasOwnProperty.call(update, key)) {
          if (key === "tags" && Array.isArray(update[key])) {
            formData.append(key, JSON.stringify(update[key]));
          } else {
            formData.append(key, update[key]);
          }
        }
      }
      formData.append("coverImage", coverImageFile);
      res = await fetch(`${API_BASE}/${id}`, {
        method: "PUT",
        body: formData,
      });
    } else {
      res = await fetch(`${API_BASE}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
    }
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `Failed to update resource: ${res.status} ${res.statusText} ${errorText}`
      );
    }
    return res.json();
  } catch (err) {
    console.error("Error updating resource:", err);
    throw err;
  }
}

async function deleteResource(id) {
  try {
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete resource");
    return res.json();
  } catch (err) {
    console.error("Error deleting resource:", err);
    throw err;
  }
}

// ====== UI Rendering ======
function getFileTypeInfo(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  if (ext === "pdf") return { icon: "bi-file-earmark-pdf", color: "#f44336" };
  if (ext === "doc" || ext === "docx")
    return { icon: "bi-file-earmark-word", color: "#2196f3" };
  if (ext === "ppt" || ext === "pptx")
    return { icon: "bi-file-earmark-slides", color: "#ff9800" };
  return { icon: "bi-file-earmark", color: "#607d8b" };
}

function applyFiltersAndSort() {
  let filtered = state.resources;
  if (state.currentType !== "all") {
    filtered = filtered.filter((res) => res.type === state.currentType);
  }
  if (state.currentSearch.length > 0) {
    filtered = filtered.filter(
      (res) =>
        res.title.toLowerCase().includes(state.currentSearch) ||
        (res.desc && res.desc.toLowerCase().includes(state.currentSearch)) ||
        (res.tags || []).some((tag) =>
          tag.toLowerCase().includes(state.currentSearch)
        )
    );
  }
  switch (state.currentSort) {
    case "newest":
      filtered = filtered.sort(
        (a, b) =>
          (toJsDate(b.createdAt)?.getTime() || 0) -
          (toJsDate(a.createdAt)?.getTime() || 0)
      );
      break;
    case "oldest":
      filtered = filtered.sort(
        (a, b) =>
          (toJsDate(a.createdAt)?.getTime() || 0) -
          (toJsDate(b.createdAt)?.getTime() || 0)
      );
      break;
    case "name-asc":
      filtered = filtered.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "name-desc":
      filtered = filtered.sort((a, b) => b.title.localeCompare(a.title));
      break;
    case "popular":
      filtered = filtered.sort(
        (a, b) => (b.downloads || 0) - (a.downloads || 0)
      );
      break;
  }
  if (state.currentView === "grid") {
    const gridEl = document.getElementById("resourcesGrid");
    const listEl = document.getElementById("resourcesList");
    if (gridEl) gridEl.style.display = "grid";
    if (listEl) listEl.style.display = "none";
    renderResourcesGrid(filtered);
  } else {
    const gridEl = document.getElementById("resourcesGrid");
    const listEl = document.getElementById("resourcesList");
    if (gridEl) gridEl.style.display = "none";
    if (listEl) listEl.style.display = "block";
    renderResourcesList(filtered);
  }
}

function renderResourcesGrid(resources) {
  const grid = document.getElementById("resourcesGrid");
  if (!grid) return;
  grid.innerHTML = "";
  if (resources.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon"><i class="bi bi-folder2-open"></i></div>
      <div class="empty-state-text">No resources found</div>
      <button class="upload-btn" onclick="openUploadModal()">
        <i class="bi bi-upload"></i> Upload a Resource
      </button>
    </div>`;
    return;
  }
  resources.forEach((res) => {
    const typeInfo = getFileTypeInfo(res.title + "." + res.type);
    const cover = res.coverImage || "";
    const fileSizeText =
      typeof res.size === "number"
        ? (res.size / 1024 / 1024).toFixed(2) + " MB"
        : "";
    grid.innerHTML += `
      <div class="resource-card" data-id="${res.id}">
        <div class="resource-card-header">
          <img src="${cover}" class="resource-card-img lazy-image" alt="" loading="lazy" />
          <div class="resource-type-badge">
            <i class="bi ${typeInfo.icon}"></i> ${res.type?.toUpperCase() || ""}
          </div>
          <div class="resource-actions">
            <button class="resource-action-btn" onclick="editResourceUI('${
              res.id
            }')">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="resource-action-btn" onclick="confirmDeleteResource('${
              res.id
            }')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
        <div class="resource-card-body">
          <h3 class="resource-card-title">${res.title}</h3>
          <div class="resource-card-tags">
            ${(res.tags || [])
              .map((tag) => `<span class="resource-card-tag">${tag}</span>`)
              .join("")}
          </div>
          <div class="resource-card-desc">${res.desc || ""}</div>
          <a href="${
            res.url
          }" class="resource-download-btn" download title="Download">
            <i class="bi bi-download"></i> Download
          </a>
          <div class="resource-card-footer">
            <span class="resource-card-by">
              <i class="bi bi-person"></i> ${res.by || "Anonymous"}
            </span>
            <span class="resource-card-date">${formatRelativeTime(
              res.createdAt
            )}</span>
            <span class="resource-card-size">${fileSizeText}</span>
          </div>
        </div>
      </div>
    `;
  });
  initLazyLoading();
}

function renderResourcesList(resources) {
  const list = document.getElementById("resourcesList");
  if (!list) return;
  list.innerHTML = "";
  if (resources.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon"><i class="bi bi-folder2-open"></i></div>
      <div class="empty-state-text">No resources found</div>
      <button class="upload-btn" onclick="openUploadModal()">
        <i class="bi bi-upload"></i> Upload a Resource
      </button>
    </div>`;
    return;
  }
  resources.forEach((res) => {
    const typeInfo = getFileTypeInfo(res.title + "." + res.type);
    const fileSizeText =
      typeof res.size === "number"
        ? (res.size / 1024 / 1024).toFixed(2) + " MB"
        : "";
    list.innerHTML += `
      <div class="resource-list-item" data-id="${res.id}">
        <div class="resource-list-icon">
          <i class="bi ${typeInfo.icon}"></i>
        </div>
        <div class="resource-list-info">
          <div class="resource-list-title">${res.title}</div>
          <div class="resource-list-meta">
            <span><i class="bi bi-person"></i> ${res.by}</span>
            <span><i class="bi bi-calendar3"></i> ${formatRelativeTime(
              res.createdAt
            )}</span>
            <span class="resource-list-size">${fileSizeText}</span>
          </div>
          <div class="resource-list-tags">
            ${(res.tags || [])
              .slice(0, 3)
              .map((tag) => `<span class="resource-list-tag">${tag}</span>`)
              .join("")}
          </div>
        </div>
        <div class="resource-list-actions">
          <a href="${
            res.url
          }" class="resource-list-btn" download title="Download">
            <i class="bi bi-download"></i>
          </a>
          <button class="resource-list-btn" onclick="editResourceUI('${
            res.id
          }')" title="Edit resource">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="resource-list-btn" onclick="confirmDeleteResource('${
            res.id
          }')" title="Delete resource">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;
  });
}

function renderFilesTable() {
  const tbody = document.getElementById("resourcesTable");
  if (!tbody) return;
  const sorted = [...state.resources].sort((a, b) => {
    if (state.tableSort === "newest")
      return (
        (toJsDate(b.createdAt)?.getTime() || 0) -
        (toJsDate(a.createdAt)?.getTime() || 0)
      );
    if (state.tableSort === "name-asc") return a.title.localeCompare(b.title);
    if (state.tableSort === "size") return (b.size || 0) - (a.size || 0);
    return 0;
  });
  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No files found</td></tr>`;
    return;
  }
  tbody.innerHTML = sorted
    .map((file) => {
      const sizeText =
        typeof file.size === "number"
          ? (file.size / 1024 / 1024).toFixed(2) + " MB"
          : "";
      return `
      <tr data-id="${file.id}">
        <td>${file.title}</td>
        <td>${file.by || "Anonymous"}</td>
        <td>${formatRelativeTime(file.createdAt)}</td>
        <td>${file.type?.toUpperCase() || ""}</td>
        <td>${sizeText}</td>
        <td>
          <a href="${file.url}" class="download-btn" download title="Download">
            <i class="bi bi-download"></i>
          </a>
          <button class="download-btn" onclick="confirmDeleteResource('${
            file.id
          }')" title="Delete file">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `;
    })
    .join("");
}

function initLazyLoading() {
  const lazyImages = document.querySelectorAll(".lazy-image");
  if (!lazyImages) return;
  if ("IntersectionObserver" in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset && img.dataset.src) img.src = img.dataset.src;
          if (img.src) {
            img.classList.add("loaded");
            imageObserver.unobserve(img);
          }
        }
      });
    });
    lazyImages.forEach((img) => {
      if (img.src && img.src !== window.location.href) {
        img.classList.add("loaded");
      } else {
        imageObserver.observe(img);
      }
      img.addEventListener("load", function () {
        this.classList.add("loaded");
      });
    });
  } else {
    lazyImages.forEach((img) => {
      img.classList.add("loaded");
    });
  }
}

// ---- UI Initialization (binds event listeners) ----
// NOTE: Sidebar toggle/close is handled centrally in sidebar.js. Do NOT add duplicate toggle listeners.
function scheduleResourceUIInit() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeResourceUI);
  } else {
    initializeResourceUI();
  }
}

function initializeResourceUI() {
  // Wire view buttons safely
  const gridBtn = document.getElementById("gridViewBtn");
  const listBtn = document.getElementById("listViewBtn");
  if (gridBtn) gridBtn.addEventListener("click", () => setViewMode("grid"));
  if (listBtn) listBtn.addEventListener("click", () => setViewMode("list"));

  const sortDropdown = document.getElementById("sortDropdown");
  if (sortDropdown)
    sortDropdown.addEventListener("change", function () {
      state.currentSort = this.value;
      applyFiltersAndSort();
    });

  const tableSort = document.getElementById("tableSort");
  if (tableSort)
    tableSort.addEventListener("change", function () {
      state.tableSort = this.value;
      renderFilesTable();
    });

  const searchInput = document.getElementById("resourceSearch");
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      state.currentSearch = this.value.trim().toLowerCase();
      applyFiltersAndSort();
    });
  }

  document.querySelectorAll(".resource-filter-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      document
        .querySelectorAll(".resource-filter-btn")
        .forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      state.currentType = this.getAttribute("data-type");
      applyFiltersAndSort();
    });
  });

  // Tag selection
  document.querySelectorAll(".tag-option").forEach((tagOption) => {
    tagOption.addEventListener("click", function () {
      const selectedTags = document.querySelectorAll(".tag-option.selected");
      if (this.classList.contains("selected")) {
        this.classList.remove("selected");
      } else if (selectedTags.length < 3) {
        this.classList.add("selected");
      } else {
        showToast("You can select up to 3 tags", "error");
      }
      const tags = Array.from(
        document.querySelectorAll(".tag-option.selected")
      ).map((tag) => tag.getAttribute("data-tag"));
      const sel = document.getElementById("selectedTags");
      if (sel) sel.value = JSON.stringify(tags);
    });
  });

  // File input/preview for upload modal
  const fileInput = document.getElementById("fileInput");
  if (fileInput) {
    fileInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (file) {
        const filePreview = document.getElementById("filePreview");
        if (filePreview) filePreview.style.display = "flex";
        const selectedFileName = document.getElementById("selectedFileName");
        if (selectedFileName) selectedFileName.textContent = file.name;
        const fileDropArea = document.getElementById("fileDropArea");
        if (fileDropArea) fileDropArea.classList.add("file-input-hidden");
        // Autofill title
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        const titleEl = document.getElementById("resourceTitle");
        if (titleEl && !titleEl.value) titleEl.value = fileName;
      }
    });
  }

  const coverInput = document.getElementById("coverImageInput");
  if (coverInput) {
    coverInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      const preview = document.getElementById("coverImagePreview");
      if (file && preview) {
        const reader = new FileReader();
        reader.onload = function (ev) {
          preview.src = ev.target.result;
          preview.style.display = "block";
        };
        reader.readAsDataURL(file);
      } else if (preview) {
        preview.style.display = "none";
        preview.src = "";
      }
    });
  }

  const uploadForm = document.getElementById("uploadForm");
  if (uploadForm) {
    uploadForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const editId = this.getAttribute("data-edit-id");
      const isEditing = !!editId || state.editingMode;
      const title = (
        document.getElementById("resourceTitle") || {}
      ).value.trim();
      const desc = (document.getElementById("resourceDesc") || {}).value.trim();
      const category = (document.getElementById("resourceCategory") || {})
        .value;
      const tagsValue =
        (document.getElementById("selectedTags") || {}).value || "";
      let tags = [];
      try {
        tags = JSON.parse(tagsValue);
      } catch {
        tags = tagsValue ? tagsValue.split(",") : [];
      }
      let coverImageFile = (document.getElementById("coverImageInput") || {})
        .files?.[0];

      if (!title) return showToast("Title is required", "error");

      if (isEditing) {
        const resourceId = editId || state.editResourceId;
        if (!resourceId)
          return showToast("Error: No resource ID found for editing", "error");
        const update = { title, desc, category, tags };
        try {
          await updateResource(resourceId, update, coverImageFile);
          showToast("Resource updated successfully", "success");
          closeUploadModal();
          fetchResources();
        } catch (err) {
          showToast(`Failed to update resource: ${err.message}`, "error");
        }
        return;
      }

      // --- New upload ---
      const fileEl = document.getElementById("fileInput");
      const file = fileEl ? fileEl.files[0] : null;
      if (!file) return showToast("Please select a file to upload", "error");

      const formData = new FormData();
      formData.append("title", title);
      formData.append("desc", desc);
      formData.append("category", category);
      formData.append("tags", JSON.stringify(tags));
      formData.append(
        "by",
        (CURRENT_SESSION && CURRENT_SESSION.user) || "Anonymous"
      );
      formData.append("userId", (CURRENT_SESSION && CURRENT_SESSION.uid) || "");
      formData.append("file", file);
      if (coverImageFile) formData.append("coverImage", coverImageFile);

      try {
        await uploadResource(formData);
        showToast("Resource uploaded successfully", "success");
        closeUploadModal();
        fetchResources();
      } catch (err) {
        showToast(`Upload failed: ${err.message}`, "error");
      }
    });
  }

  // Remove selected file in modal
  window.removeSelectedFile = function () {
    const fileInp = document.getElementById("fileInput");
    if (fileInp) fileInp.value = "";
    const preview = document.getElementById("filePreview");
    if (preview) preview.style.display = "none";
    const dropArea = document.getElementById("fileDropArea");
    if (dropArea) dropArea.classList.remove("file-input-hidden");
  };

  // Welcome notification on first visit
  if (!localStorage.getItem("resource_page_visited")) {
    setTimeout(() => {
      showToast(
        "Welcome to the Resources page! You can upload and manage study materials here.",
        "success"
      );
      localStorage.setItem("resource_page_visited", "true");
    }, 1000);
  }

  // Fetch resources on page load
  fetchResources();

  // Modal focus fix
  const uploadModal = document.getElementById("uploadModal");
  if (uploadModal) {
    uploadModal.addEventListener("hidden.bs.modal", function () {
      const main = document.getElementById("mainContent");
      if (main) main.focus();
    });
  }

  // Keyboard shortcut for logout (sidebar.js handles logout; this just triggers the button)
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn) logoutBtn.click();
    }
  });
}

function setViewMode(mode) {
  const gridBtn = document.getElementById("gridViewBtn");
  const listBtn = document.getElementById("listViewBtn");
  if (mode === "grid") {
    if (gridBtn) gridBtn.classList.add("active");
    if (listBtn) listBtn.classList.remove("active");
    state.currentView = "grid";
  } else {
    if (gridBtn) gridBtn.classList.remove("active");
    if (listBtn) listBtn.classList.add("active");
    state.currentView = "list";
  }
  applyFiltersAndSort();
}

window.confirmDeleteResource = function (id) {
  if (confirm("Are you sure you want to delete this resource?")) {
    deleteResource(id)
      .then(() => {
        showToast("Resource deleted successfully", "success");
        fetchResources();
      })
      .catch((err) => {
        showToast("Failed to delete resource", "error");
      });
  }
};

window.editResourceUI = function (id) {
  getResourceById(id)
    .then((resource) => {
      openUploadModal(resource);
    })
    .catch((err) => {
      showToast("Failed to load resource for editing", "error");
    });
};

function openUploadModal(editResource = null) {
  const uploadForm = document.getElementById("uploadForm");
  if (uploadForm) uploadForm.reset();
  const uploadLabel = document.getElementById("uploadModalLabel");
  if (uploadLabel) uploadLabel.textContent = "Upload Resource";
  const filePreview = document.getElementById("filePreview");
  if (filePreview) filePreview.style.display = "none";
  const fileDropArea = document.getElementById("fileDropArea");
  if (fileDropArea) fileDropArea.classList.remove("file-input-hidden");
  const coverPreview = document.getElementById("coverImagePreview");
  if (coverPreview) {
    coverPreview.src = "";
    coverPreview.style.display = "none";
  }
  const coverInput = document.getElementById("coverImageInput");
  if (coverInput) coverInput.value = "";
  state.editingMode = false;
  state.editResourceId = null;
  document
    .querySelectorAll(".tag-option")
    .forEach((tag) => tag.classList.remove("selected"));
  const selTags = document.getElementById("selectedTags");
  if (selTags) selTags.value = "";

  if (editResource) {
    state.editingMode = true;
    state.editResourceId = editResource.id;
    const titleEl = document.getElementById("resourceTitle");
    if (titleEl) titleEl.value = editResource.title || "";
    const descEl = document.getElementById("resourceDesc");
    if (descEl) descEl.value = editResource.desc || "";
    const catEl = document.getElementById("resourceCategory");
    if (catEl) catEl.value = editResource.category || "";
    if (editResource.tags && Array.isArray(editResource.tags)) {
      document.querySelectorAll(".tag-option").forEach((tagOption) => {
        const tagValue = tagOption.getAttribute("data-tag");
        if (editResource.tags.includes(tagValue)) {
          tagOption.classList.add("selected");
        }
      });
      if (selTags) selTags.value = JSON.stringify(editResource.tags);
    }
    if (editResource.coverImage) {
      if (coverPreview) {
        coverPreview.src = editResource.coverImage;
        coverPreview.style.display = "block";
      }
    }
    if (uploadForm) uploadForm.setAttribute("data-edit-id", editResource.id);
    if (uploadLabel) uploadLabel.textContent = "Edit Resource";
    if (fileDropArea) fileDropArea.classList.add("file-input-hidden");
    if (filePreview) filePreview.style.display = "flex";
    const selectedFileName = document.getElementById("selectedFileName");
    if (selectedFileName)
      selectedFileName.textContent =
        editResource.title + "." + (editResource.type || "");
  }

  const uploadModal = document.getElementById("uploadModal");
  if (uploadModal) {
    const bootstrapModal = new bootstrap.Modal(uploadModal);
    bootstrapModal.show();
  }
}
window.openUploadModal = openUploadModal;

function closeUploadModal() {
  const uploadModal = document.getElementById("uploadModal");
  if (!uploadModal) return;
  const inst = bootstrap.Modal.getInstance(uploadModal);
  if (inst) inst.hide();
  state.editingMode = false;
  state.editResourceId = null;
}

// ---- Toast notification ----
function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) return;
  const id = "toast-" + Date.now();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.id = id;
  toast.innerHTML = `
    <div class="toast-icon ${type}">
      <i class="bi bi-${
        type === "success" ? "check-circle" : "exclamation-circle"
      }"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${type === "success" ? "Success" : "Error"}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="closeToast('${id}')">
      <i class="bi bi-x"></i>
    </button>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    closeToast(id);
  }, 5000);
}

window.closeToast = function (id) {
  const toast = document.getElementById(id);
  if (!toast) return;
  toast.style.opacity = "0";
  toast.style.transform = "translateX(100%)";
  setTimeout(() => {
    toast.remove();
  }, 300);
};
