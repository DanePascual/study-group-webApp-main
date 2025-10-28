// frontend/student/scripts/discussion.js
// Updated discussion page logic: resolves author display names when server returns only an author_id (UID).
// - quieter handling of Firestore permission-denied when resolving names client-side
// - uses apiUrl from appConfig for direct fetches when needed
// - uses topicsClient for server interactions (postTopic, getTopics, incrementView)
// - uses apiClient.fetchJsonWithAuth for authenticated JSON PUT (topic edit) instead of manual token+fetch
// - keeps server-backed topics (via topicsClient) and falls back to localStorage if server unavailable
// - ensures sort/category selectors work when server returns full topic list by applying client-side filtering/sorting/pagination

import { auth, db } from "../config/firebase.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import {
  getTopics as apiGetTopics,
  postTopic as apiPostTopic,
  incrementView as apiIncrementView,
} from "./topicsClient.js";
import { apiUrl } from "../config/appConfig.js";
import fetchWithAuth, { fetchJsonWithAuth } from "./apiClient.js";

let CURRENT_SESSION = null;
let CURRENT_USER_ID = null;

// ---- Dynamic session initialization ----
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
      datetime: new Date().toISOString(),
    };
    CURRENT_USER_ID = user.uid;
    updateSidebarUserInfo();
    // theme is handled centrally by sidebar.js — do not re-wire it here
    initializeDiscussionPage();
  } else {
    window.location.href = "login.html";
  }
});

// ---- Update sidebar dynamically (DEFENSIVE) ----
function updateSidebarUserInfo() {
  const avatar = document.getElementById("sidebarAvatar");
  const name = document.getElementById("sidebarName");
  const course = document.getElementById("sidebarCourse");

  try {
    if (avatar) {
      const hasImg =
        typeof avatar.querySelector === "function" &&
        avatar.querySelector("img");
      if (!hasImg && CURRENT_SESSION && CURRENT_SESSION.userAvatar) {
        const current = (avatar.textContent || "").trim();
        if (!current || current === "" || current === "Loading...") {
          avatar.textContent = CURRENT_SESSION.userAvatar.toUpperCase();
        }
      }
    }

    if (name && CURRENT_SESSION && CURRENT_SESSION.user) {
      const currentName = (name.textContent || "").trim();
      const isDefault =
        !currentName ||
        currentName === "" ||
        currentName === "Loading..." ||
        currentName === "Not signed in";
      if (isDefault) name.textContent = CURRENT_SESSION.user;
    }

    if (course) {
      const currentCourse = (course.textContent || "").trim();
      if (
        !currentCourse ||
        currentCourse === "" ||
        currentCourse === "Loading..."
      ) {
        course.textContent = CURRENT_SESSION.userProgram || "";
      }
    }
  } catch (err) {
    console.warn("updateSidebarUserInfo failed:", err);
  }
}

// ---- Main page initialization and UI logic ----
function initializeDiscussionPage() {
  if (initializeDiscussionPage._initialized) {
    return;
  }
  initializeDiscussionPage._initialized = true;

  function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHour = Math.round(diffMin / 60);
    const diffDay = Math.round(diffHour / 24);

    if (isNaN(date.getTime())) return "Invalid Date";
    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin} min${diffMin !== 1 ? "s" : ""} ago`;
    if (diffHour < 24)
      return `${diffHour} hour${diffHour !== 1 ? "s" : ""} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  }

  function showNotification(message, isError = false) {
    const existingNotification = document.querySelector(".notification");
    if (existingNotification) existingNotification.remove();

    const notification = document.createElement("div");
    notification.className = `notification ${isError ? "error" : ""}`;
    notification.innerHTML = `
          <i class="bi bi-${
            isError ? "exclamation-circle" : "check-circle"
          }"></i>
          ${message}
        `;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = "0";
      notification.style.transform = "translateX(100%)";
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---- Server-backed functions via topicsClient (preferred) ----
  // IMPORTANT: when the server returns *all* topics, we still need to apply
  // category/sort/pagination client-side — topicsClient.getTopics currently
  // doesn't accept sort/category parameters. This function applies client-side
  // filtering/sorting/pagination to server results as-needed.
  async function fetchTopicsFromServer(
    page = 1,
    limit = 6,
    sort = "newest",
    category = "all"
  ) {
    try {
      const data = await apiGetTopics(); // expects { topics: [...] } or array
      const rows =
        data && data.topics ? data.topics : Array.isArray(data) ? data : [];
      // normalize topics into the format UI expects
      let normalized = (rows || []).map(normalizeTopic);

      // If server provided pagination, prefer it (pass-through)
      const serverPagination = data && data.pagination ? data.pagination : null;

      // Apply category filter client-side if requested
      if (category && category !== "all") {
        normalized = normalized.filter((t) => {
          // normalize category strings to lower-case for matching
          const c = (t.category || "").toString().toLowerCase();
          return c === category.toString().toLowerCase();
        });
      }

      // Apply sort client-side if server didn't sort or if client explicitly requested
      switch (sort) {
        case "newest":
          normalized.sort((a, b) => new Date(b.created) - new Date(a.created));
          break;
        case "oldest":
          normalized.sort((a, b) => new Date(a.created) - new Date(b.created));
          break;
        case "activity":
          normalized.sort((a, b) => (b.postCount || 0) - (a.postCount || 0));
          break;
        default:
          // leave as-is
          break;
      }

      // If server already provided pagination, honor it; otherwise do client-side pagination
      if (serverPagination) {
        // Resolve author names for the topics included in the server page
        const pageTopics = normalized || [];
        await resolveAuthorNames(pageTopics);
        return { topics: pageTopics, pagination: serverPagination };
      } else {
        const total = normalized.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedTopics = normalized.slice(startIndex, endIndex);
        await resolveAuthorNames(paginatedTopics);
        return {
          topics: paginatedTopics,
          pagination: { page, limit, total, totalPages },
        };
      }
    } catch (err) {
      console.warn("Server topics fetch failed, falling back to local:", err);
      return null;
    }
  }

  // Normalizes server or local topic shapes to fields used by UI
  function normalizeTopic(t) {
    const authorId = t.author_id || t.authorId || t.userId || t.user || null;
    const rawAuthor =
      t.author || (typeof authorId === "string" ? authorId : null) || "system";
    return {
      id: t.id || t._id || t.topic_id,
      title: t.title || t.name || "",
      description: t.content || t.description || "",
      category:
        (t.metadata && t.metadata.category) ||
        t.category ||
        t.type ||
        "discussion",
      tags: (t.metadata && t.metadata.tags) || t.tags || [],
      // keep both author (display string) and authorId (uid) for resolution
      author: rawAuthor,
      authorId: authorId,
      userId: t.author_id || t.userId || t.user || null,
      created:
        t.created_at ||
        t.created ||
        t.latestActivity ||
        t.latest_activity ||
        new Date().toISOString(),
      updated: t.updated_at || t.updated || null,
      postCount: t.post_count || t.postCount || 0,
      viewCount: t.views || t.viewCount || t.view_count || 0,
      pinned: !!t.pinned,
      latestActivity:
        t.latestActivity || t.latest_activity || t.updated || t.created,
    };
  }

  // Resolve author display names by querying Firestore users/{uid}
  const _authorCache = new Map(); // uid -> displayName or email or short id
  async function resolveAuthorNames(topics) {
    const toResolve = new Set();
    for (const t of topics) {
      // If author is already a friendly name, skip.
      if (!t.authorId) continue;
      // If author property is same as authorId (raw), then we need to resolve
      if (t.author === t.authorId || looksLikeUid(t.author)) {
        if (!_authorCache.has(t.authorId)) toResolve.add(t.authorId);
      }
    }
    if (toResolve.size === 0) return;
    // Batch fetch (sequential to keep code simple)
    for (const uid of Array.from(toResolve)) {
      try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const name =
            data.displayName ||
            data.name ||
            data.fullName ||
            data.email ||
            shortId(uid);
          _authorCache.set(uid, name);
        } else {
          _authorCache.set(uid, shortId(uid));
        }
      } catch (err) {
        // Handle permission-denied quietly (expected if Firestore rules block reading other users)
        const code = err && (err.code || (err.codeName ? err.codeName : ""));
        if (
          code === "permission-denied" ||
          (err && /permission/i.test(err.message || ""))
        ) {
          // quietly fallback to short id — do not spam console for expected security behavior
          _authorCache.set(uid, shortId(uid));
        } else {
          // Unexpected errors: log for debugging but still fallback
          console.warn("Failed to resolve user", uid, err);
          _authorCache.set(uid, shortId(uid));
        }
      }
    }
    // Apply resolved names
    for (const t of topics) {
      if (t.authorId && _authorCache.has(t.authorId)) {
        t.author = _authorCache.get(t.authorId);
      }
    }
  }

  function looksLikeUid(s) {
    // simple heuristic: firebase UIDs are long, alphanumeric, often contain '-' or sequences
    if (!s || typeof s !== "string") return false;
    return s.length > 12 && /[A-Za-z0-9]/.test(s);
  }

  function shortId(id) {
    if (!id) return "unknown";
    return id.length > 10 ? id.slice(0, 6) + "…" + id.slice(-4) : id;
  }

  // ---- LocalStorage fallback topic store (kept for offline/dev fallback) ----
  async function getTopicsLocal(
    page = 1,
    limit = 6,
    sort = "newest",
    category = "all"
  ) {
    await delay(100);
    let topics = JSON.parse(localStorage.getItem("topics") || "[]");
    if (category !== "all") {
      topics = topics.filter((t) => t.category === category);
    }
    switch (sort) {
      case "newest":
        topics.sort((a, b) => new Date(b.created) - new Date(a.created));
        break;
      case "oldest":
        topics.sort((a, b) => new Date(a.created) - new Date(b.created));
        break;
      case "activity":
        topics.sort((a, b) => (b.postCount || 0) - (a.postCount || 0));
        break;
    }
    const total = topics.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTopics = topics.slice(startIndex, endIndex);
    // ensure authors resolved for local topics as well (they usually already contain author name)
    await resolveAuthorNames(paginatedTopics);
    return {
      topics: paginatedTopics,
      pagination: { page, limit, total, totalPages },
    };
  }

  async function createTopicLocal(topicData) {
    await delay(100);
    let topics = JSON.parse(localStorage.getItem("topics") || "[]");
    const now = new Date();
    const newTopic = {
      id: Date.now().toString(),
      title: topicData.title,
      description: topicData.description || "",
      category: topicData.category || "discussion",
      tags: topicData.tags || [],
      userId: CURRENT_USER_ID,
      author: CURRENT_SESSION.user,
      authorId: CURRENT_USER_ID,
      created: now.toISOString(),
      updated: now.toISOString(),
      pinned: false,
      postCount: 0,
      viewCount: 0,
      latestPost: null,
      latestActivity: now.toISOString(),
    };
    topics.unshift(newTopic);
    localStorage.setItem("topics", JSON.stringify(topics));
    return newTopic;
  }

  // Keep update/delete/pin as local features for now (server equivalents may be added later)
  async function updateTopicLocal(topicId, topicData) {
    await delay(100);
    let topics = JSON.parse(localStorage.getItem("topics") || "[]");
    const index = topics.findIndex((t) => t.id === topicId);
    if (index === -1) throw new Error("Topic not found");
    if (topics[index].userId !== CURRENT_USER_ID)
      throw new Error("You can only edit your own topics");
    topics[index] = {
      ...topics[index],
      title: topicData.title,
      description: topicData.description || topics[index].description,
      category: topicData.category || topics[index].category,
      tags: topicData.tags || topics[index].tags,
      updated: new Date().toISOString(),
    };
    localStorage.setItem("topics", JSON.stringify(topics));
    return topics[index];
  }

  async function deleteTopicLocal(topicId) {
    await delay(100);
    let topics = JSON.parse(localStorage.getItem("topics") || "[]");
    const index = topics.findIndex((t) => t.id === topicId);
    if (index === -1) throw new Error("Topic not found");
    if (topics[index].userId !== CURRENT_USER_ID)
      throw new Error("You can only delete your own topics");
    topics.splice(index, 1);
    localStorage.setItem("topics", JSON.stringify(topics));
    localStorage.removeItem("posts_" + topicId);
    return true;
  }

  async function togglePinTopicLocal(topicId) {
    await delay(100);
    let topics = JSON.parse(localStorage.getItem("topics") || "[]");
    const index = topics.findIndex((t) => t.id === topicId);
    if (index === -1) throw new Error("Topic not found");
    topics[index].pinned = !topics[index].pinned;
    localStorage.setItem("topics", JSON.stringify(topics));
    return topics[index];
  }

  // Global state
  let currentPage = 1;
  let currentSort = "newest";
  let currentCategory = "all";
  let currentSearch = "";

  // Render topic grid — prefers server, falls back to local
  async function renderTopics() {
    const topicGrid = document.getElementById("topicGrid");
    topicGrid.innerHTML =
      '<div class="text-center p-5"><i class="bi bi-hourglass-split"></i> Loading...</div>';
    try {
      let result = await fetchTopicsFromServer(
        currentPage,
        6,
        currentSort,
        currentCategory
      );
      if (!result) {
        // fallback to local
        result = await getTopicsLocal(
          currentPage,
          6,
          currentSort,
          currentCategory
        );
      }
      let { topics, pagination } = result;
      // If search is active, filter client-side for either source
      if (currentSearch) {
        const lower = currentSearch.toLowerCase();
        topics = topics.filter(
          (t) =>
            (t.title || "").toLowerCase().includes(lower) ||
            (t.description || "").toLowerCase().includes(lower) ||
            (t.tags || []).some((tag) => tag.toLowerCase().includes(lower))
        );
        // adjust pagination for client-side search (optional)
        pagination = {
          page: 1,
          limit: topics.length || 1,
          total: topics.length || 0,
          totalPages: 1,
        };
      }
      if (!topics || topics.length === 0) {
        topicGrid.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon"><i class="bi bi-chat-square-text"></i></div>
              <div class="empty-state-text">No topics found${
                currentSearch ? " matching your search" : ""
              }. Start a new discussion!</div>
              <button class="create-topic-btn" onclick="document.getElementById('createTopicBtn').click()">
                <i class="bi bi-plus-circle"></i> Create New Topic
              </button>
            </div>
          `;
      } else {
        topicGrid.innerHTML = topics
          .map((topic) => {
            const isRecent =
              new Date(topic.latestActivity) >
              new Date(Date.now() - 24 * 60 * 60 * 1000);
            const isAuthor = topic.userId === CURRENT_USER_ID;
            return `
              <div class="topic-card ${topic.pinned ? "pinned" : ""}">
                ${
                  isAuthor
                    ? `
                  <div class="topic-options">
                    <button class="topic-options-btn" onclick="toggleTopicOptions(event, '${
                      topic.id
                    }')">
                      <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <div class="topic-dropdown-menu" id="dropdown-${topic.id}">
                      <div class="topic-dropdown-item" onclick="showEditTopicModal('${
                        topic.id
                      }')">
                        <i class="bi bi-pencil"></i> Edit
                      </div>
                      <div class="topic-dropdown-item" onclick="togglePinTopic('${
                        topic.id
                      }')">
                        <i class="bi bi-pin"></i> ${
                          topic.pinned ? "Unpin" : "Pin"
                        }
                      </div>
                      <div class="topic-dropdown-item delete" onclick="showDeleteConfirmation('${
                        topic.id
                      }')">
                        <i class="bi bi-trash"></i> Delete
                      </div>
                    </div>
                  </div>
                `
                    : ""
                }
                <div class="topic-card-content">
                  <div class="topic-title">${escapeHtml(topic.title)}</div>
                  <div class="topic-meta">
                    <div><i class="bi bi-person"></i> ${escapeHtml(
                      topic.author
                    )}</div>
                    <div><i class="bi bi-calendar3"></i> ${formatRelativeTime(
                      topic.created
                    )}</div>
                  </div>
                  <div>
                    ${(topic.tags || [])
                      .map(
                        (tag) =>
                          `<span class="topic-tag">${escapeHtml(tag)}</span>`
                      )
                      .join("")}
                  </div>
                  <div class="topic-latest">
                    ${escapeHtml(
                      topic.description || "No description provided."
                    )}
                  </div>
                  <div class="topic-actions">
                    <div class="topic-activity">
                      <span class="activity-indicator ${
                        isRecent ? "recent" : ""
                      }"></span>
                      <span class="activity-text">
                        ${topic.postCount || 0} post${
              topic.postCount !== 1 ? "s" : ""
            } • ${topic.viewCount || 0} view${topic.viewCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <a href="topic.html?id=${encodeURIComponent(
                      topic.id
                    )}" class="view-btn" data-id="${encodeURIComponent(
              topic.id
            )}">View</a>
                  </div>
                </div>
              </div>
            `;
          })
          .join("");
      }
      renderPagination(pagination || { page: currentPage, totalPages: 1 });
      // Wire view buttons to increment view before navigation (server-backed)
      document.querySelectorAll(".view-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          const id = decodeURIComponent(btn.getAttribute("data-id"));
          try {
            // try server increment; ignore errors
            await apiIncrementView(id);
          } catch (err) {
            console.warn("incrementView failed (non-fatal):", err);
          }
          // follow the link
          window.location.href = btn.href;
        });
      });
    } catch (error) {
      topicGrid.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon"><i class="bi bi-exclamation-triangle"></i></div>
            <div class="empty-state-text">Error loading topics. Please try again.</div>
          </div>
        `;
      console.error("Error rendering topics:", error);
    }
  }

  function renderPagination(pagination) {
    const paginationControls = document.getElementById("paginationControls");
    const page = (pagination && pagination.page) || currentPage;
    const totalPages = (pagination && pagination.totalPages) || 1;
    if (totalPages <= 1) {
      paginationControls.innerHTML = "";
      return;
    }
    let paginationHTML = `
        <button class="pagination-btn ${page === 1 ? "disabled" : ""}" ${
      page === 1 ? "disabled" : ""
    } onclick="changePage(${page - 1})">
          <i class="bi bi-chevron-left"></i>
        </button>
      `;
    const maxVisiblePages = 5;
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    for (let i = startPage; i <= endPage; i++) {
      paginationHTML += `
          <button class="pagination-btn ${
            i === page ? "active" : ""
          }" onclick="changePage(${i})">
            ${i}
          </button>
        `;
    }
    paginationHTML += `
        <button class="pagination-btn ${
          page === totalPages ? "disabled" : ""
        }" ${page === totalPages ? "disabled" : ""} onclick="changePage(${
      page + 1
    })">
          <i class="bi bi-chevron-right"></i>
        </button>
      `;
    paginationControls.innerHTML = paginationHTML;
  }

  window.changePage = function (page) {
    currentPage = page;
    renderTopics();
    document.getElementById("topicGrid").scrollIntoView({ behavior: "smooth" });
  };

  window.toggleTopicOptions = function (event, topicId) {
    event.stopPropagation();
    const dropdown = document.getElementById(`dropdown-${topicId}`);
    document.querySelectorAll(".topic-dropdown-menu.show").forEach((menu) => {
      if (menu.id !== `dropdown-${topicId}`) menu.classList.remove("show");
    });
    dropdown.classList.toggle("show");
  };

  document.addEventListener("click", function (event) {
    if (!event.target.closest(".topic-options-btn")) {
      document.querySelectorAll(".topic-dropdown-menu.show").forEach((menu) => {
        menu.classList.remove("show");
      });
    }
  });

  window.togglePinTopic = async function (topicId) {
    try {
      const topic = await togglePinTopicLocal(topicId);
      renderTopics();
      showNotification(
        `Topic ${topic.pinned ? "pinned" : "unpinned"} successfully`
      );
    } catch (error) {
      showNotification(error.message, true);
    }
  };

  window.showDeleteConfirmation = function (topicId) {
    document.getElementById("confirmationBackdrop").style.display = "block";
    document.getElementById("deleteConfirmation").style.display = "block";
    document.getElementById("cancelDeleteBtn").onclick = hideDeleteConfirmation;
    document.getElementById("confirmDeleteBtn").onclick = async function () {
      try {
        await deleteTopicLocal(topicId);
        hideDeleteConfirmation();
        renderTopics();
        showNotification("Topic deleted successfully");
      } catch (error) {
        hideDeleteConfirmation();
        showNotification(error.message, true);
      }
    };
  };

  function hideDeleteConfirmation() {
    document.getElementById("confirmationBackdrop").style.display = "none";
    document.getElementById("deleteConfirmation").style.display = "none";
  }

  window.showEditTopicModal = async function (topicId) {
    const topics = JSON.parse(localStorage.getItem("topics") || "[]");
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) {
      showNotification("Topic not found", true);
      return;
    }
    document.getElementById("modalTitle").textContent = "Edit Topic";
    document.getElementById("topicTitle").value = topic.title;
    document.getElementById("topicDescription").value = topic.description || "";
    document.getElementById("topicCategory").value =
      topic.category || "discussion";
    document.getElementById("topicId").value = topicId;
    document.getElementById("isEdit").value = "true";
    document.getElementById("saveTopicBtn").textContent = "Save Changes";
    document.querySelectorAll(".tag-option").forEach((tag) => {
      tag.classList.remove("selected");
    });
    if (topic.tags && topic.tags.length) {
      document.getElementById("selectedTags").value = topic.tags.join(",");
      topic.tags.forEach((tag) => {
        const tagElement = document.querySelector(
          `.tag-option[data-tag="${tag}"]`
        );
        if (tagElement) tagElement.classList.add("selected");
      });
    } else {
      document.getElementById("selectedTags").value = "";
    }
    document.getElementById("modalBackdrop").classList.add("active");
  };

  // Modal logic wiring
  const createTopicBtn = document.getElementById("createTopicBtn");
  const modalBackdrop = document.getElementById("modalBackdrop");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const cancelModalBtn = document.getElementById("cancelModalBtn");
  const topicForm = document.getElementById("topicForm");

  createTopicBtn.onclick = function () {
    document.getElementById("modalTitle").textContent = "Create New Topic";
    document.getElementById("topicId").value = "";
    document.getElementById("isEdit").value = "false";
    document.getElementById("saveTopicBtn").textContent = "Create";
    document.getElementById("topicForm").reset();
    document.querySelectorAll(".tag-option").forEach((tag) => {
      tag.classList.remove("selected");
    });
    document.getElementById("selectedTags").value = "";
    modalBackdrop.classList.add("active");
  };

  closeModalBtn.onclick = cancelModalBtn.onclick = () => {
    modalBackdrop.classList.remove("active");
    topicForm.reset();
  };

  modalBackdrop.onclick = (e) => {
    if (e.target === modalBackdrop) {
      modalBackdrop.classList.remove("active");
      topicForm.reset();
    }
  };

  // Tag selection logic
  document.querySelectorAll(".tag-option").forEach((tagOption) => {
    tagOption.addEventListener("click", function () {
      const selectedTags = document.querySelectorAll(".tag-option.selected");
      const tag = this.getAttribute("data-tag");
      if (this.classList.contains("selected")) {
        this.classList.remove("selected");
      } else if (selectedTags.length < 3) {
        this.classList.add("selected");
      } else {
        showNotification("You can select up to 3 tags", true);
      }
      const tags = [];
      document.querySelectorAll(".tag-option.selected").forEach((selected) => {
        tags.push(selected.getAttribute("data-tag"));
      });
      document.getElementById("selectedTags").value = tags.join(",");
    });
  });

  // Create/Edit topic form submit (uses server when available, fallback to local)
  topicForm.onsubmit = async function (e) {
    e.preventDefault();
    const title = document.getElementById("topicTitle").value.trim();
    const description = document
      .getElementById("topicDescription")
      .value.trim();
    const category = document.getElementById("topicCategory").value;
    const tagsValue = document.getElementById("selectedTags").value;
    const tags = tagsValue ? tagsValue.split(",") : [];
    const isEdit = document.getElementById("isEdit").value === "true";
    const topicId = document.getElementById("topicId").value;
    if (!title) {
      showNotification("Topic title is required", true);
      return;
    }
    try {
      if (isEdit) {
        // Try server-side update if endpoint exists; otherwise fallback to local update
        try {
          // Use centralized fetchJsonWithAuth so token handling and error parsing are consistent
          await fetchJsonWithAuth(
            apiUrl(`/api/topics/${encodeURIComponent(topicId)}`),
            {
              method: "PUT",
              body: JSON.stringify({
                title,
                content: description,
                metadata: { category, tags },
              }),
            }
          );
          showNotification("Topic updated successfully");
        } catch (serverErr) {
          // fallback to local
          await updateTopicLocal(topicId, {
            title,
            description,
            category,
            tags,
          });
          showNotification("Topic updated locally");
        }
      } else {
        // Create: prefer server
        try {
          await apiPostTopic(title, description, { category, tags });
          showNotification("Topic created successfully");
        } catch (serverErr) {
          // fallback to local storage creation
          await createTopicLocal({ title, description, category, tags });
          showNotification("Topic created locally (server unreachable)");
        }
      }
      modalBackdrop.classList.remove("active");
      topicForm.reset();
      renderTopics();
    } catch (error) {
      showNotification(error.message, true);
    }
  };

  // Safe wiring for selects and search (do this after DOM is ready)
  const sortEl = document.getElementById("sortFilter");
  const categoryEl = document.getElementById("categoryFilter");
  const searchEl = document.getElementById("searchInput");

  // Initialize select UI values from state
  if (sortEl) {
    sortEl.value = currentSort || "newest";
    sortEl.addEventListener("change", (e) => {
      console.debug("sort changed to", e.target.value);
      currentSort = e.target.value;
      currentPage = 1;
      renderTopics();
    });
  } else {
    console.warn("sortFilter element not found; skipping wiring.");
  }

  if (categoryEl) {
    categoryEl.value = currentCategory || "all";
    categoryEl.addEventListener("change", (e) => {
      console.debug("category changed to", e.target.value);
      currentCategory = e.target.value;
      currentPage = 1;
      renderTopics();
    });
  } else {
    console.warn("categoryFilter element not found; skipping wiring.");
  }

  if (searchEl) {
    let searchTimeout;
    searchEl.addEventListener("input", function (e) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        renderTopics();
      }, 300);
    });
  } else {
    console.warn("searchInput element not found; skipping wiring.");
  }

  // Initialize sample data if local empty (keeps previous behavior for offline/dev)
  async function initializeSampleData() {
    const topics = JSON.parse(localStorage.getItem("topics") || "[]");
    if (topics.length === 0) {
      const sampleTopics = [
        {
          title: "Tips for Effective Study Habits",
          description:
            "Share your best practices for maintaining focus and productivity during study sessions.",
          category: "discussion",
          tags: ["resource", "productivity"],
        },
        {
          title: "Calculus Integration Problem Help",
          description:
            "I'm stuck on this particular integration by parts question. Can someone help?",
          category: "question",
          tags: ["math", "science"],
        },
        {
          title: "Literature Essay Writing Techniques",
          description:
            "Looking for advice on structuring analytical essays for 19th-century novels.",
          category: "question",
          tags: ["english", "arts"],
        },
        {
          title: "Python Programming Study Group",
          description:
            "Weekly online sessions to practice coding problems together. All levels welcome!",
          category: "announcement",
          tags: ["programming", "science"],
        },
        {
          title: "History Exam Preparation Resources",
          description:
            "Collection of study materials for the upcoming Ancient Civilizations exam.",
          category: "resource",
          tags: ["history", "resource"],
        },
      ];
      for (const topic of sampleTopics) {
        await createTopicLocal(topic);
      }
    }
  }

  (async function init() {
    await initializeSampleData();
    await renderTopics();
    console.log(
      `Discussion forum loaded for ${CURRENT_SESSION.user} at ${CURRENT_SESSION.datetime}`
    );
  })();

  // small helper:
  function escapeHtml(s) {
    return String(s || "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  }
}

// ---- LOGOUT IS HANDLED BY SIDEBAR.JS GLOBALLY ----
