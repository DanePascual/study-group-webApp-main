// frontend/student/scripts/resources.js
// ✅ UPDATED: Removed uploader avatars/initials from Recent Uploads table
// ✅ UPDATED: Removed "View Details" button - only Download button remains
// ✅ FIXED: Downloaded files excluded from "All Resources" tab
// ✅ FIXED: undefined.click error in openUploadModal
// ✅ UPDATED: Removed upload button from empty states
// ✅ NEW: Generate default cover images for resources without custom covers
// ✅ UPDATED: Removed redundant title from default cover image
// ✅ FIXED: Upload button and controls now show when returning from Recent Uploads tab

import { auth, db } from "../../config/firebase.js";
import { apiUrl } from "../../config/appConfig.js";
import fetchWithAuth, {
  fetchJsonWithAuth,
  getIdToken,
  postFormWithAuth,
  putFormWithAuth,
} from "./apiClient.js";

let CURRENT_SESSION = null;

const state = {
  currentView: "grid",
  currentType: "all",
  currentSort: "newest",
  currentSearch: "",
  currentTab: "all",
  resources: [],
  downloadedResourceIds: new Set(),
  editingMode: false,
  editResourceId: null,
  recentUploadsPage: 0,
  recentUploadsPerPage: 10,
};

const API_BASE = apiUrl("/api/resources");

// ===== Firebase Auth =====
auth.onAuthStateChanged(async (user) => {
  if (user) {
    let userProgram = "";
    try {
      const userDocSnap = await getDocSafe(user.uid);
      if (userDocSnap) {
        userProgram = userDocSnap.program || "";
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

    console.log("[auth] ✅ User logged in:", {
      uid: CURRENT_SESSION.uid,
      email: CURRENT_SESSION.email,
      user: CURRENT_SESSION.user,
    });

    updateSidebarUserInfo();
    loadDownloadHistory();
    scheduleResourceUIInit();
  } else {
    window.location.href = "login.html";
  }
});

async function getDocSafe(uid) {
  try {
    if (!db) return null;
    const { doc, getDoc } = await import(
      "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js"
    );
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

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

// ===== DEBUG: Log all resources with their ownership info =====
function debugLogResources() {
  console.log(
    "%c[DEBUG] CURRENT SESSION",
    "background: #ff6b6b; color: white; padding: 5px; border-radius: 3px;",
    {
      uid: CURRENT_SESSION?.uid,
      email: CURRENT_SESSION?.email,
      user: CURRENT_SESSION?.user,
    }
  );

  console.log(
    "%c[DEBUG] ALL RESOURCES",
    "background: #4ecdc4; color: white; padding: 5px; border-radius: 3px;",
    `Total: ${state.resources.length}`
  );

  state.resources.forEach((res, index) => {
    const uidMatch =
      res.ownerId && String(res.ownerId) === String(CURRENT_SESSION?.uid);
    const color = uidMatch ? "#51cf66" : "#ffa94d";

    console.log(
      `%c[${index}] ${res.title || "Untitled"}`,
      `background: ${color}; color: white; padding: 5px; border-radius: 3px;`,
      {
        id: res.id,
        ownerId: res.ownerId,
        ownerId_type: typeof res.ownerId,
        currentUid: CURRENT_SESSION?.uid,
        currentUid_type: typeof CURRENT_SESSION?.uid,
        matches: uidMatch,
        by: res.by,
        userId: res.userId,
        createdAt: res.createdAt,
      }
    );
  });
}

// ===== Enhanced Ownership Check =====
function isResourceOwner(resource) {
  if (!CURRENT_SESSION || !resource) return false;

  // ✅ PRIMARY: Check by ownerId (backend field)
  if (
    resource.ownerId &&
    String(resource.ownerId) === String(CURRENT_SESSION.uid)
  ) {
    return true;
  }

  // Fallback: Check by userId
  if (
    resource.userId &&
    String(resource.userId) === String(CURRENT_SESSION.uid)
  ) {
    return true;
  }

  // Fallback: Check by email
  if (resource.by && resource.by === CURRENT_SESSION.email) {
    return true;
  }

  // Fallback: Check by displayName
  if (resource.by && resource.by === CURRENT_SESSION.user) {
    return true;
  }

  return false;
}

// Download History Management
function loadDownloadHistory() {
  try {
    const userId = CURRENT_SESSION?.uid;
    if (!userId) return;
    const key = `downloads_${userId}`;
    const history = localStorage.getItem(key);
    state.downloadedResourceIds = new Set(history ? JSON.parse(history) : []);
    console.log(
      "[resources] Downloaded resources loaded:",
      state.downloadedResourceIds
    );
  } catch (err) {
    console.error("Error loading download history:", err);
  }
}

function addToDownloadHistory(resourceId) {
  try {
    const userId = CURRENT_SESSION?.uid;
    if (!userId || !resourceId) return;
    state.downloadedResourceIds.add(resourceId);
    const key = `downloads_${userId}`;
    localStorage.setItem(
      key,
      JSON.stringify(Array.from(state.downloadedResourceIds))
    );
    console.log("[resources] Added to download history:", resourceId);
    applyFiltersAndSort();
  } catch (err) {
    console.error("Error saving download history:", err);
  }
}

// Tab Switching
function switchTab(tabName) {
  state.currentTab = tabName;
  state.recentUploadsPage = 0; // Reset pagination
  localStorage.setItem("resources_current_tab", tabName);

  document.querySelectorAll(".resources-tab").forEach((btn) => {
    btn.classList.remove("active");
    if (btn.getAttribute("data-tab") === tabName) {
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
    } else {
      btn.setAttribute("aria-selected", "false");
    }
  });

  console.log(
    `%c[tabs] Switched to tab: ${tabName}`,
    "background: #a8e6cf; color: black; padding: 5px; border-radius: 3px;"
  );
  applyFiltersAndSort();
}

// Utilities
function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeUrl(url) {
  if (!url) return false;
  try {
    if (url.startsWith("/")) return true;
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

// Helper: Get category label
function getCategoryLabel(category) {
  const labels = {
    lecture: "Lecture",
    assignment: "Assignment",
    tutorial: "Tutorial",
    exam: "Exam",
    reference: "Reference",
    other: "Other",
  };
  return labels[category] || (category ? category : "Uncategorized");
}

// ===== UPDATED: Generate default cover image based on file type (NO TITLE) =====
function generateDefaultCover(fileType, title = "Untitled") {
  const colors = {
    pdf: { bg: "#f44336", icon: "bi-file-earmark-pdf" },
    doc: { bg: "#2196f3", icon: "bi-file-earmark-word" },
    docx: { bg: "#2196f3", icon: "bi-file-earmark-word" },
    ppt: { bg: "#ff9800", icon: "bi-file-earmark-slides" },
    pptx: { bg: "#ff9800", icon: "bi-file-earmark-slides" },
  };

  const typeInfo = colors[fileType?.toLowerCase()] || {
    bg: "#607d8b",
    icon: "bi-file-earmark",
  };

  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;

  const ctx = canvas.getContext("2d");

  // Background color
  ctx.fillStyle = typeInfo.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Add gradient overlay
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, typeInfo.bg);
  gradient.addColorStop(1, adjustBrightness(typeInfo.bg, -20));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ✅ UPDATED: Only display file type, no title
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.font = "bold 64px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const displayText = fileType ? fileType.toUpperCase() : "FILE";
  ctx.fillText(displayText, canvas.width / 2, canvas.height / 2);

  // Return as data URL
  return canvas.toDataURL("image/png");
}

// ===== Helper: Adjust color brightness =====
function adjustBrightness(color, percent) {
  const hex = color.replace("#", "");
  const num = parseInt(hex, 16);
  const amt = Math.round(2.55 * percent);

  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) + amt) & 0x00ff));
  const B = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));

  return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// API Calls
async function fetchResources() {
  try {
    const data = await fetchJsonWithAuth(API_BASE);
    state.resources = Array.isArray(data) ? data : [];
    console.log("[resources] Fetched resources:", state.resources.length);

    debugLogResources();
    applyFiltersAndSort();
  } catch (err) {
    console.error("Error fetching resources:", err);
    showToast("Unable to load resources.", "error");
  }
}

async function getResourceById(id) {
  try {
    const data = await fetchJsonWithAuth(
      `${API_BASE}/${encodeURIComponent(id)}`
    );
    return data;
  } catch (err) {
    console.error("Error fetching resource by ID:", err);
    throw err;
  }
}

async function uploadResource(formData) {
  try {
    return await postFormWithAuth(API_BASE, formData);
  } catch (err) {
    console.error("Error uploading resource:", err);
    throw err;
  }
}

async function updateResource(id, update, coverImageFile = null) {
  try {
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
      return await putFormWithAuth(
        `${API_BASE}/${encodeURIComponent(id)}`,
        formData
      );
    } else {
      const result = await fetchJsonWithAuth(
        `${API_BASE}/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        }
      );
      return result;
    }
  } catch (err) {
    console.error("Error updating resource:", err);
    throw err;
  }
}

async function deleteResource(id) {
  try {
    const res = await fetchJsonWithAuth(
      `${API_BASE}/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    return res;
  } catch (err) {
    console.error("Error deleting resource:", err);
    throw err;
  }
}

async function requestSignedDownload(resourceId) {
  try {
    const resp = await fetchJsonWithAuth(
      `${API_BASE}/${encodeURIComponent(resourceId)}/download`,
      {
        method: "POST",
      }
    );
    if (resp && resp.signedUrl) {
      addToDownloadHistory(resourceId);
      return resp.signedUrl;
    }
    throw new Error("Failed to obtain download link");
  } catch (err) {
    console.error("requestSignedDownload error:", err);
    throw err;
  }
}

// UI Rendering
function getFileTypeInfo(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  if (ext === "pdf") return { icon: "bi-file-earmark-pdf", color: "#f44336" };
  if (ext === "doc" || ext === "docx")
    return { icon: "bi-file-earmark-word", color: "#2196f3" };
  if (ext === "ppt" || ext === "pptx")
    return { icon: "bi-file-earmark-slides", color: "#ff9800" };
  return { icon: "bi-file-earmark", color: "#607d8b" };
}

// ===== UPDATED: Filter logic with recent uploads table and FIXED header bar visibility =====
function applyFiltersAndSort() {
  let filtered = state.resources || [];

  console.log(
    `%c[filter] Starting filter - tab: ${state.currentTab}, total resources: ${filtered.length}`,
    "background: #74b9ff; color: black; padding: 5px; border-radius: 3px;"
  );

  // Apply tab filter first
  if (state.currentTab === "downloaded") {
    const before = filtered.length;
    filtered = filtered.filter((res) =>
      state.downloadedResourceIds.has(res.id)
    );
    console.log(
      `%c[filter] Downloaded tab: ${before} -> ${filtered.length} resources`,
      "background: #a29bfe; color: white; padding: 5px; border-radius: 3px;"
    );
  } else if (state.currentTab === "uploaded") {
    const before = filtered.length;
    filtered = filtered.filter((res) => {
      const isOwner =
        res.ownerId && String(res.ownerId) === String(CURRENT_SESSION?.uid);
      return isOwner;
    });
    console.log(
      `%c[filter] Uploaded tab: ${before} -> ${filtered.length} resources`,
      "background: #fdcb6e; color: black; padding: 5px; border-radius: 3px;"
    );
  } else if (state.currentTab === "recent") {
    // Recent uploads - show all, sorted by newest
    console.log(
      `%c[filter] Recent tab: showing table with top 10 resources`,
      "background: #ff7675; color: white; padding: 5px; border-radius: 3px;"
    );
  } else if (state.currentTab === "all") {
    // All Resources - exclude downloaded
    const before = filtered.length;
    filtered = filtered.filter(
      (res) => !state.downloadedResourceIds.has(res.id)
    );
    console.log(
      `%c[filter] All tab: ${before} -> ${filtered.length} resources (excluded downloaded)`,
      "background: #55efc4; color: black; padding: 5px; border-radius: 3px;"
    );
  }

  // Apply type filter (skip for recent tab)
  if (state.currentType !== "all" && state.currentTab !== "recent") {
    filtered = filtered.filter((res) => res.type === state.currentType);
  }

  // Apply search filter
  if (state.currentSearch.length > 0) {
    filtered = filtered.filter(
      (res) =>
        (res.title && res.title.toLowerCase().includes(state.currentSearch)) ||
        (res.desc && res.desc.toLowerCase().includes(state.currentSearch)) ||
        (res.tags || []).some((tag) =>
          tag.toLowerCase().includes(state.currentSearch)
        )
    );
  }

  // Apply sorting
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
      filtered = filtered.sort((a, b) =>
        (a.title || "").localeCompare(b.title || "")
      );
      break;
    case "name-desc":
      filtered = filtered.sort((a, b) =>
        (b.title || "").localeCompare(a.title || "")
      );
      break;
    case "popular":
      filtered = filtered.sort(
        (a, b) => (b.downloads || 0) - (a.downloads || 0)
      );
      break;
  }

  // ✅ FIXED: Show/hide header and sections based on tab
  const headerBar = document.getElementById("resourcesHeaderBar");
  const gridEl = document.getElementById("resourcesGrid");
  const listEl = document.getElementById("resourcesList");
  const recentSection = document.getElementById("recentUploadsSection");

  if (state.currentTab === "recent") {
    // Hide header bar and grid/list views for recent tab
    if (headerBar) headerBar.style.display = "none";
    if (gridEl) gridEl.style.display = "none";
    if (listEl) listEl.style.display = "none";
    if (recentSection) recentSection.style.display = "block";
    renderRecentUploadsTable(filtered);
  } else {
    // ✅ SHOW header bar for all other tabs
    if (headerBar) headerBar.style.display = "flex";
    if (recentSection) recentSection.style.display = "none";

    // For other tabs, use grid/list view
    if (state.currentView === "grid") {
      if (gridEl) gridEl.style.display = "grid";
      if (listEl) listEl.style.display = "none";
      renderResourcesGrid(filtered);
    } else {
      if (gridEl) gridEl.style.display = "none";
      if (listEl) listEl.style.display = "block";
      renderResourcesList(filtered);
    }
  }
}

// ===== NEW: Render Recent Uploads Table - MINIMAL (ONLY DOWNLOAD BUTTON) =====
function renderRecentUploadsTable(allResources) {
  const section = document.getElementById("recentUploadsSection");
  const tbody = document.getElementById("recentUploadsTable");
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  const loadMoreContainer = document.getElementById("loadMoreContainer");
  const emptyState = document.getElementById("recentEmptyState");

  if (!section || !tbody) return;

  // Handle empty state
  if (!allResources || allResources.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) emptyState.style.display = "flex";
    if (loadMoreContainer) loadMoreContainer.style.display = "none";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  // Pagination logic
  const startIdx = state.recentUploadsPage * state.recentUploadsPerPage;
  const endIdx = startIdx + state.recentUploadsPerPage;
  const paginated = allResources.slice(0, endIdx);

  tbody.innerHTML = paginated
    .map((resource) => {
      const categoryLabel = getCategoryLabel(resource.category);
      const sizeText =
        typeof resource.size === "number"
          ? (resource.size / 1024 / 1024).toFixed(2) + " MB"
          : "—";
      const downloadsCount = resource.downloads || 0;

      return `
        <tr data-id="${escapeHtml(resource.id)}">
          <td class="title-cell" title="${escapeHtml(
            resource.title || "Untitled"
          )}">
            <strong>${escapeHtml(resource.title || "Untitled")}</strong>
          </td>
          <td class="uploader-cell">
            ${escapeHtml(resource.by || "Anonymous")}
          </td>
          <td class="date-cell">${escapeHtml(
            formatRelativeTime(resource.createdAt)
          )}</td>
          <td><span class="category-badge">${escapeHtml(
            categoryLabel
          )}</span></td>
          <td class="downloads-cell">${downloadsCount}</td>
          <td class="size-cell">${escapeHtml(sizeText)}</td>
          <td class="actions-cell">
            <button class="action-btn download-action" data-id="${escapeHtml(
              resource.id
            )}" title="Download">
              <i class="bi bi-download"></i>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  // Show/hide load more button
  if (loadMoreContainer) {
    loadMoreContainer.style.display =
      endIdx < allResources.length ? "block" : "none";
  }

  // Attach event listeners for download buttons
  tbody.querySelectorAll(".download-action").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-id");
      btn.disabled = true;
      const originalHtml = btn.innerHTML;
      btn.innerHTML = `<i class="bi bi-hourglass-split"></i>`;
      try {
        const signedUrl = await requestSignedDownload(id);
        if (signedUrl) {
          window.open(signedUrl, "_blank");
        } else {
          showToast("Download link unavailable", "error");
        }
      } catch {
        showToast("Failed to get download link", "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });
  });
}

// ===== UPDATED: Render Resources Grid with default cover image =====
function renderResourcesGrid(resources) {
  const grid = document.getElementById("resourcesGrid");
  if (!grid) return;

  grid.innerHTML = "";

  if (!resources || resources.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="empty-state-icon"><i class="bi bi-folder2-open"></i></div>
      <div class="empty-state-text">No resources found</div>
    `;
    grid.appendChild(empty);
    return;
  }

  resources.forEach((res) => {
    const card = document.createElement("div");
    card.className = "resource-card";
    card.dataset.id = res.id;

    const header = document.createElement("div");
    header.className = "resource-card-header";

    const img = document.createElement("img");
    img.className = "resource-card-img lazy-image";
    img.alt = "";

    // ✅ NEW: Generate default cover if no image is provided
    if (isSafeUrl(res.coverImage)) {
      img.src = res.coverImage;
    } else {
      img.src = generateDefaultCover(res.type, res.title);
    }

    header.appendChild(img);

    const typeBadge = document.createElement("div");
    typeBadge.className = "resource-type-badge";
    const typeInfo = getFileTypeInfo(
      (res.title || "") + "." + (res.type || "")
    );
    typeBadge.innerHTML = `<i class="bi ${typeInfo.icon}"></i> ${escapeHtml(
      (res.type || "").toUpperCase()
    )}`;
    header.appendChild(typeBadge);

    if (state.downloadedResourceIds.has(res.id)) {
      const downloadedBadge = document.createElement("div");
      downloadedBadge.className = "resource-downloaded-badge";
      downloadedBadge.innerHTML = `<i class="bi bi-check-circle-fill"></i> Downloaded`;
      header.appendChild(downloadedBadge);
    }

    // Only show edit/delete if owner
    const isOwner = isResourceOwner(res);
    if (isOwner) {
      const actions = document.createElement("div");
      actions.className = "resource-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "resource-action-btn";
      editBtn.type = "button";
      editBtn.title = "Edit resource";
      editBtn.innerHTML = `<i class="bi bi-pencil"></i>`;
      editBtn.addEventListener("click", () => editResourceUI(res.id));
      actions.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.className = "resource-action-btn";
      delBtn.type = "button";
      delBtn.title = "Delete resource";
      delBtn.innerHTML = `<i class="bi bi-trash"></i>`;
      delBtn.addEventListener("click", () => confirmDeleteResource(res.id));
      actions.appendChild(delBtn);

      header.appendChild(actions);
    }

    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "resource-card-body";

    const titleEl = document.createElement("h3");
    titleEl.className = "resource-card-title";
    titleEl.textContent = res.title || "Untitled";
    body.appendChild(titleEl);

    const tagsContainer = document.createElement("div");
    tagsContainer.className = "resource-card-tags";
    (res.tags || []).forEach((tag) => {
      const t = document.createElement("span");
      t.className = "resource-card-tag";
      t.textContent = tag;
      tagsContainer.appendChild(t);
    });
    body.appendChild(tagsContainer);

    const descEl = document.createElement("div");
    descEl.className = "resource-card-desc";
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
      const safeHtml = DOMPurify.sanitize(res.desc || "");
      descEl.innerHTML = safeHtml;
    } else {
      descEl.textContent = res.desc || "";
    }
    body.appendChild(descEl);

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "resource-download-btn";
    downloadBtn.title = "Download";
    downloadBtn.setAttribute("aria-label", "Download resource");
    downloadBtn.innerHTML = `<i class="bi bi-download"></i> Download`;
    downloadBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      downloadBtn.disabled = true;
      const originalText = downloadBtn.innerHTML;
      downloadBtn.innerHTML = `<span class="spinner"></span> Preparing...`;
      try {
        const signedUrl = await requestSignedDownload(res.id);
        if (signedUrl) {
          window.open(signedUrl, "_blank");
        } else {
          showToast("Download link unavailable", "error");
        }
      } catch (err) {
        showToast("Failed to get download link", "error");
      } finally {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = originalText;
      }
    });
    body.appendChild(downloadBtn);

    const footer = document.createElement("div");
    footer.className = "resource-card-footer";

    const by = document.createElement("span");
    by.className = "resource-card-by";
    by.innerHTML = `<i class="bi bi-person"></i> ${escapeHtml(
      res.by || "Anonymous"
    )}`;
    footer.appendChild(by);

    const dateSpan = document.createElement("span");
    dateSpan.className = "resource-card-date";
    dateSpan.textContent = formatRelativeTime(res.createdAt);
    footer.appendChild(dateSpan);

    const sizeSpan = document.createElement("span");
    sizeSpan.className = "resource-card-size";
    sizeSpan.textContent =
      typeof res.size === "number"
        ? (res.size / 1024 / 1024).toFixed(2) + " MB"
        : "";
    footer.appendChild(sizeSpan);

    body.appendChild(footer);
    card.appendChild(body);

    grid.appendChild(card);
  });
  initLazyLoading();
}

// ===== UPDATED: Render Resources List - NO UPLOAD BUTTON IN EMPTY STATE =====
function renderResourcesList(resources) {
  const list = document.getElementById("resourcesList");
  if (!list) return;

  list.innerHTML = "";

  if (!resources || resources.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="empty-state-icon"><i class="bi bi-folder2-open"></i></div>
      <div class="empty-state-text">No resources found</div>
    `;
    list.appendChild(empty);
    return;
  }

  resources.forEach((res) => {
    const item = document.createElement("div");
    item.className = "resource-list-item";
    item.dataset.id = res.id;

    const icon = document.createElement("div");
    icon.className = "resource-list-icon";
    const typeInfo = getFileTypeInfo(
      (res.title || "") + "." + (res.type || "")
    );
    icon.innerHTML = `<i class="bi ${typeInfo.icon}"></i>`;
    item.appendChild(icon);

    const info = document.createElement("div");
    info.className = "resource-list-info";
    const title = document.createElement("div");
    title.className = "resource-list-title";
    title.textContent = res.title || "Untitled";
    info.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "resource-list-meta";
    meta.innerHTML = `<span><i class="bi bi-person"></i> ${escapeHtml(
      res.by || "Anonymous"
    )}</span>
                      <span><i class="bi bi-calendar3"></i> ${escapeHtml(
                        formatRelativeTime(res.createdAt)
                      )}</span>
                      <span class="resource-list-size">${
                        typeof res.size === "number"
                          ? (res.size / 1024 / 1024).toFixed(2) + " MB"
                          : ""
                      }</span>`;
    info.appendChild(meta);

    const tagWrap = document.createElement("div");
    tagWrap.className = "resource-list-tags";
    (res.tags || []).slice(0, 3).forEach((tag) => {
      const t = document.createElement("span");
      t.className = "resource-list-tag";
      t.textContent = tag;
      tagWrap.appendChild(t);
    });
    info.appendChild(tagWrap);

    item.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "resource-list-actions";

    const aDownload = document.createElement("button");
    aDownload.className = "resource-list-btn";
    aDownload.title = "Download";
    aDownload.innerHTML = `<i class="bi bi-download"></i>`;
    aDownload.addEventListener("click", async (e) => {
      e.preventDefault();
      aDownload.disabled = true;
      try {
        const signedUrl = await requestSignedDownload(res.id);
        if (signedUrl) window.open(signedUrl, "_blank");
        else showToast("Download link unavailable", "error");
      } catch {
        showToast("Failed to get download link", "error");
      } finally {
        aDownload.disabled = false;
      }
    });
    actions.appendChild(aDownload);

    // Only show edit/delete if owner
    const isOwner = isResourceOwner(res);
    if (isOwner) {
      const editBtn2 = document.createElement("button");
      editBtn2.className = "resource-list-btn";
      editBtn2.title = "Edit resource";
      editBtn2.innerHTML = `<i class="bi bi-pencil"></i>`;
      editBtn2.addEventListener("click", () => editResourceUI(res.id));
      actions.appendChild(editBtn2);

      const delBtn2 = document.createElement("button");
      delBtn2.className = "resource-list-btn";
      delBtn2.title = "Delete resource";
      delBtn2.innerHTML = `<i class="bi bi-trash"></i>`;
      delBtn2.addEventListener("click", () => confirmDeleteResource(res.id));
      actions.appendChild(delBtn2);
    }

    item.appendChild(actions);

    list.appendChild(item);
  });
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

function scheduleResourceUIInit() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeResourceUI);
  } else {
    initializeResourceUI();
  }
}

function initializeResourceUI() {
  // Tab switching listeners
  document.querySelectorAll(".resources-tab").forEach((tab) => {
    tab.addEventListener("click", function () {
      const tabName = this.getAttribute("data-tab");
      switchTab(tabName);
    });
  });

  // Load saved tab preference
  const savedTab = localStorage.getItem("resources_current_tab");
  if (savedTab && savedTab !== "all") {
    switchTab(savedTab);
  }

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
      formData.append(
        "userEmail",
        (CURRENT_SESSION && CURRENT_SESSION.email) || ""
      );
      formData.append("file", file);
      if (coverImageFile) formData.append("coverImage", coverImageFile);

      try {
        await uploadResource(formData);
        showToast("Resource uploaded successfully", "success");
        console.log("[upload] ✅ Resource uploaded by:", CURRENT_SESSION.user);
        closeUploadModal();
        fetchResources();
      } catch (err) {
        showToast(`Upload failed: ${err.message}`, "error");
      }
    });
  }

  window.removeSelectedFile = function () {
    const fileInp = document.getElementById("fileInput");
    if (fileInp) fileInp.value = "";
    const preview = document.getElementById("filePreview");
    if (preview) preview.style.display = "none";
    const dropArea = document.getElementById("fileDropArea");
    if (dropArea) dropArea.classList.remove("file-input-hidden");
  };

  // Load More button for recent uploads
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      state.recentUploadsPage += 1;
      applyFiltersAndSort();
    });
  }

  if (!localStorage.getItem("resource_page_visited")) {
    setTimeout(() => {
      showToast(
        "Welcome to the Resources page! You can upload and manage study materials here.",
        "success"
      );
      localStorage.setItem("resource_page_visited", "true");
    }, 1000);
  }

  fetchResources();

  const uploadModal = document.getElementById("uploadModal");
  if (uploadModal) {
    uploadModal.addEventListener("hidden.bs.modal", function () {
      const main = document.getElementById("mainContent");
      if (main) main.focus();
    });
  }

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

function confirmDeleteResource(id) {
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
}
window.confirmDeleteResource = confirmDeleteResource;

function editResourceUI(id) {
  getResourceById(id)
    .then((resource) => {
      openUploadModal(resource);
    })
    .catch((err) => {
      showToast("Failed to load resource for editing", "error");
    });
}
window.editResourceUI = editResourceUI;

// ===== FIXED: openUploadModal with proper null checks =====
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

  // If editing a resource
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

    if (editResource.coverImage && coverPreview) {
      coverPreview.src = editResource.coverImage;
      coverPreview.style.display = "block";
    }

    if (uploadForm) uploadForm.setAttribute("data-edit-id", editResource.id);
    if (uploadLabel) uploadLabel.textContent = "Edit Resource";

    if (fileDropArea) {
      fileDropArea.classList.add("file-input-hidden");
    }

    if (filePreview) filePreview.style.display = "flex";

    const selectedFileName = document.getElementById("selectedFileName");
    if (selectedFileName) {
      selectedFileName.textContent =
        editResource.title + "." + (editResource.type || "");
    }
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
window.closeUploadModal = closeUploadModal;

function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) return;
  const id = "toast-" + Date.now();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.id = id;

  const icon = document.createElement("div");
  icon.className = `toast-icon ${type}`;
  const iconI = document.createElement("i");
  iconI.className = `bi bi-${
    type === "success" ? "check-circle" : "exclamation-circle"
  }`;
  icon.appendChild(iconI);

  const content = document.createElement("div");
  content.className = "toast-content";
  const title = document.createElement("div");
  title.className = "toast-title";
  title.textContent = type === "success" ? "Success" : "Error";
  const msg = document.createElement("div");
  msg.className = "toast-message";
  msg.textContent = message;

  content.appendChild(title);
  content.appendChild(msg);

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.type = "button";
  closeBtn.innerHTML = `<i class="bi bi-x"></i>`;
  closeBtn.addEventListener("click", () => closeToast(id));

  toast.appendChild(icon);
  toast.appendChild(content);
  toast.appendChild(closeBtn);

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

export {
  openUploadModal,
  closeUploadModal,
  editResourceUI,
  confirmDeleteResource,
};

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
