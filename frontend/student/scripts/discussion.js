// frontend/student/scripts/discussion.js
// ✅ PRODUCTION RELEASE:
// - Remove 6-topic pagination limit
// - Load ALL topics with true infinite scroll
// - Search works on ALL topics (NO DUPLICATION)
// - Sort/Category works on ALL topics
// - My Topics shows ALL user topics
// - Tab system fully functional
// - Edit/Delete working properly

import { auth, db } from "../../config/firebase.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import {
  getTopics as apiGetTopics,
  postTopic as apiPostTopic,
  incrementView as apiIncrementView,
} from "./topicsClient.js";
import { apiUrl } from "../../config/appConfig.js";
import { fetchJsonWithAuth, deleteWithAuth } from "./apiClient.js";

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

// ✅ MOVED OUTSIDE: Normalize topic - accessible globally
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

  // ---- Global state ----
  let currentSort = "newest";
  let currentCategory = "all";
  let currentSearch = "";
  let allTopics = [];
  let myTopics = [];
  let currentTab = "all-topics";

  // ✅ REMOVED: TOPICS_PER_LOAD constant (was limiting to 6)
  // ✅ NEW: Track which topics are currently visible (for infinite scroll)
  let visibleTopicsCount = 0;
  let visibleMyTopicsCount = 0;
  const ITEMS_PER_SCROLL_LOAD = 12; // Load 12 more when scrolling

  let isLoadingMore = false;
  let dataFetched = false; // Track if data has been fetched from server

  async function fetchTopicsFromServer() {
    try {
      const data = await apiGetTopics();
      const rows =
        data && data.topics ? data.topics : Array.isArray(data) ? data : [];
      let normalized = (rows || []).map(normalizeTopic);

      // Apply category filter
      if (currentCategory && currentCategory !== "all") {
        normalized = normalized.filter((t) => {
          const c = (t.category || "").toString().toLowerCase();
          return c === currentCategory.toString().toLowerCase();
        });
      }

      // Apply sort
      switch (currentSort) {
        case "newest":
          normalized.sort((a, b) => new Date(b.created) - new Date(a.created));
          break;
        case "oldest":
          normalized.sort((a, b) => new Date(a.created) - new Date(b.created));
          break;
        case "activity":
          normalized.sort((a, b) => (b.postCount || 0) - (a.postCount || 0));
          break;
      }

      await resolveAuthorNames(normalized);

      // ✅ FIXED: Re-filter myTopics after fetching
      allTopics = normalized;
      myTopics = normalized.filter((t) => t.userId === CURRENT_USER_ID);

      console.log(
        `[fetchTopicsFromServer] Fetched ${allTopics.length} total topics, ${myTopics.length} are mine`
      );

      return normalized;
    } catch (err) {
      console.warn("Server topics fetch failed, falling back to local:", err);
      return null;
    }
  }

  const _authorCache = new Map();
  async function resolveAuthorNames(topics) {
    const toResolve = new Set();
    for (const t of topics) {
      if (!t.authorId) continue;
      if (t.author === t.authorId || looksLikeUid(t.author)) {
        if (!_authorCache.has(t.authorId)) toResolve.add(t.authorId);
      }
    }
    if (toResolve.size === 0) return;
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
        const code = err && (err.code || (err.codeName ? err.codeName : ""));
        if (
          code === "permission-denied" ||
          (err && /permission/i.test(err.message || ""))
        ) {
          _authorCache.set(uid, shortId(uid));
        } else {
          console.warn("Failed to resolve user", uid, err);
          _authorCache.set(uid, shortId(uid));
        }
      }
    }
    for (const t of topics) {
      if (t.authorId && _authorCache.has(t.authorId)) {
        t.author = _authorCache.get(t.authorId);
      }
    }
  }

  function looksLikeUid(s) {
    if (!s || typeof s !== "string") return false;
    return s.length > 12 && /[A-Za-z0-9]/.test(s);
  }

  function shortId(id) {
    if (!id) return "unknown";
    return id.length > 10 ? id.slice(0, 6) + "…" + id.slice(-4) : id;
  }

  // ✅ RENDER ALL TOPICS - Show ALL at once with infinite scroll - FIXED DUPLICATION
  async function renderAllTopics() {
    const topicGrid = document.getElementById("topicGrid");

    // ✅ FIXED: If starting fresh (visibleCount = 0), ALWAYS clear grid
    if (visibleTopicsCount === 0) {
      topicGrid.innerHTML = "";

      // Only fetch if data not yet loaded
      if (!dataFetched) {
        topicGrid.innerHTML =
          '<div class="text-center p-5"><i class="bi bi-hourglass-split"></i> Loading topics...</div>';
        try {
          await fetchTopicsFromServer();
          dataFetched = true;
        } catch (error) {
          topicGrid.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon"><i class="bi bi-exclamation-triangle"></i></div>
              <div class="empty-state-text">Error loading topics. Please try again.</div>
            </div>
          `;
          console.error("Error rendering topics:", error);
          return;
        }
        topicGrid.innerHTML = ""; // Clear loading message
      }
    }

    let filteredTopics = allTopics;
    if (currentSearch) {
      const lower = currentSearch.toLowerCase();
      filteredTopics = filteredTopics.filter(
        (t) =>
          (t.title || "").toLowerCase().includes(lower) ||
          (t.description || "").toLowerCase().includes(lower) ||
          (t.tags || []).some((tag) => tag.toLowerCase().includes(lower))
      );
    }

    if (filteredTopics.length === 0) {
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
      return;
    }

    // ✅ INFINITE SCROLL: Calculate how many to show
    const itemsToAdd = Math.min(
      ITEMS_PER_SCROLL_LOAD,
      filteredTopics.length - visibleTopicsCount
    );

    // If no more items to add, return
    if (itemsToAdd <= 0) return;

    // ✅ Add the next batch of topics
    for (let i = visibleTopicsCount; i < visibleTopicsCount + itemsToAdd; i++) {
      const topic = filteredTopics[i];
      const isAuthor = topic.userId === CURRENT_USER_ID;

      const topicHtml = buildTopicCard(topic, isAuthor);
      const el = document.createElement("div");
      el.innerHTML = topicHtml;
      topicGrid.appendChild(el.firstElementChild);
    }

    // ✅ Update visible count
    visibleTopicsCount += itemsToAdd;

    console.log(
      `[renderAllTopics] Now showing ${visibleTopicsCount} of ${filteredTopics.length} topics`
    );

    // Wire view buttons
    document.querySelectorAll(".view-btn").forEach((btn) => {
      btn.removeEventListener("click", handleViewClick);
      btn.addEventListener("click", handleViewClick);
    });
  }

  async function handleViewClick(e) {
    e.preventDefault();
    const id = decodeURIComponent(this.getAttribute("data-id"));
    try {
      await apiIncrementView(id);
    } catch (err) {
      console.warn("incrementView failed (non-fatal):", err);
    }
    window.location.href = this.href;
  }

  // ✅ RENDER MY TOPICS - Show ALL at once with infinite scroll - FIXED DUPLICATION
  async function renderMyTopics() {
    const myTopicsGrid = document.getElementById("myTopicsGrid");
    const myTopicsEmpty = document.getElementById("myTopicsEmpty");

    // ✅ FIXED: Use persistent myTopics array
    if (myTopics.length === 0) {
      myTopicsGrid.innerHTML = "";
      myTopicsEmpty.style.display = "block";
      console.log("[renderMyTopics] No my topics to display");
      return;
    }

    myTopicsEmpty.style.display = "none";

    let filteredMyTopics = myTopics;
    if (currentSearch) {
      const lower = currentSearch.toLowerCase();
      filteredMyTopics = filteredMyTopics.filter(
        (t) =>
          (t.title || "").toLowerCase().includes(lower) ||
          (t.description || "").toLowerCase().includes(lower) ||
          (t.tags || []).some((tag) => tag.toLowerCase().includes(lower))
      );
    }

    // ✅ FIX: Always clear grid when starting fresh
    if (visibleMyTopicsCount === 0) {
      myTopicsGrid.innerHTML = "";
    }

    // ✅ Calculate how many to show
    const itemsToAdd = Math.min(
      ITEMS_PER_SCROLL_LOAD,
      filteredMyTopics.length - visibleMyTopicsCount
    );

    // If no more items to add, return
    if (itemsToAdd <= 0) return;

    // ✅ Add the next batch of topics
    for (
      let i = visibleMyTopicsCount;
      i < visibleMyTopicsCount + itemsToAdd;
      i++
    ) {
      const topic = filteredMyTopics[i];
      const topicHtml = buildTopicCard(topic, true);
      const el = document.createElement("div");
      el.innerHTML = topicHtml;
      myTopicsGrid.appendChild(el.firstElementChild);
    }

    // ✅ Update visible count
    visibleMyTopicsCount += itemsToAdd;

    console.log(
      `[renderMyTopics] Now showing ${visibleMyTopicsCount} of ${filteredMyTopics.length} my topics`
    );

    // Wire view buttons and event listeners
    document.querySelectorAll(".view-btn").forEach((btn) => {
      btn.removeEventListener("click", handleViewClick);
      btn.addEventListener("click", handleViewClick);
    });

    if (filteredMyTopics.length === 0) {
      myTopicsGrid.innerHTML = "";
      myTopicsEmpty.style.display = "block";
    }
  }

  // ✅ BUILD TOPIC CARD
  function buildTopicCard(topic, isAuthor) {
    const isRecent =
      new Date(topic.latestActivity) >
      new Date(Date.now() - 24 * 60 * 60 * 1000);

    // ✅ FIXED: Only show three-dots menu in "My Topics" tab
    const showMenu = isAuthor && currentTab === "my-topics";

    return `
      <div class="topic-card ${topic.pinned ? "pinned" : ""}">
        ${
          showMenu
            ? `
          <div class="topic-options">
            <button class="topic-options-btn" onclick="toggleTopicOptions(event, '${topic.id}')">
              <i class="bi bi-three-dots-vertical"></i>
            </button>
            <div class="topic-dropdown-menu" id="dropdown-${topic.id}">
              <div class="topic-dropdown-item" onclick="showEditTopicModal('${topic.id}')">
                <i class="bi bi-pencil"></i> Edit
              </div>
              <div class="topic-dropdown-item delete" onclick="showDeleteConfirmation('${topic.id}')">
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
            <div><i class="bi bi-person"></i> ${escapeHtml(topic.author)}</div>
            <div><i class="bi bi-calendar3"></i> ${formatRelativeTime(
              topic.created
            )}</div>
          </div>
          <div>
            ${(topic.tags || [])
              .map((tag) => `<span class="topic-tag">${escapeHtml(tag)}</span>`)
              .join("")}
          </div>
          <div class="topic-latest">
            ${escapeHtml(topic.description || "No description provided.")}
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
  }

  // ✅ TAB SWITCHING
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const tabName = this.getAttribute("data-tab");
      switchTab(tabName);
    });
  });

  function switchTab(tabName) {
    currentTab = tabName;

    // ✅ FIXED: Reset visible count for CURRENT tab only
    if (tabName === "all-topics") {
      visibleTopicsCount = 0;
    } else if (tabName === "my-topics") {
      visibleMyTopicsCount = 0;
    }

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.remove("active");
    });

    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
    document.getElementById(`${tabName}-content`).classList.add("active");

    if (tabName === "all-topics") {
      renderAllTopics();
    } else if (tabName === "my-topics") {
      renderMyTopics();
    }

    // ✅ Update badge
    document.getElementById("myTopicsCount").textContent = myTopics.length;
  }

  // ✅ FIXED: Three-dots menu toggle with proper event handling
  window.toggleTopicOptions = function (event, topicId) {
    event.stopPropagation();
    event.preventDefault();
    const dropdown = document.getElementById(`dropdown-${topicId}`);
    if (!dropdown) return;

    // Close all other dropdowns
    document.querySelectorAll(".topic-dropdown-menu.show").forEach((menu) => {
      if (menu.id !== `dropdown-${topicId}`) menu.classList.remove("show");
    });

    // Toggle current dropdown
    dropdown.classList.toggle("show");
  };

  // ✅ FIXED: Close dropdown only when clicking outside button AND menu
  document.addEventListener("click", function (event) {
    if (
      !event.target.closest(".topic-options-btn") &&
      !event.target.closest(".topic-dropdown-menu")
    ) {
      document.querySelectorAll(".topic-dropdown-menu.show").forEach((menu) => {
        menu.classList.remove("show");
      });
    }
  });

  // ✅ EDIT TOPIC
  window.showEditTopicModal = async function (topicId) {
    const topic =
      allTopics.find((t) => t.id === topicId) ||
      myTopics.find((t) => t.id === topicId);
    if (!topic) {
      showNotification("Topic not found", true);
      return;
    }
    if (String(topic.userId) !== String(CURRENT_USER_ID)) {
      showNotification("You can only edit your own topics.", true);
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

  // ✅ DELETE TOPIC
  window.showDeleteConfirmation = function (topicId) {
    document.getElementById("confirmationBackdrop").style.display = "block";
    document.getElementById("deleteConfirmation").style.display = "block";
    document.getElementById("cancelDeleteBtn").onclick = hideDeleteConfirmation;
    document.getElementById("confirmDeleteBtn").onclick = async function () {
      try {
        await deleteTopicServer(topicId);
        hideDeleteConfirmation();

        // ✅ FIXED: Remove from both arrays
        allTopics = allTopics.filter((t) => t.id !== topicId);
        myTopics = myTopics.filter((t) => t.id !== topicId);

        // ✅ Update badge
        document.getElementById("myTopicsCount").textContent = myTopics.length;

        // ✅ Re-render current tab
        if (currentTab === "all-topics") {
          visibleTopicsCount = 0;
          renderAllTopics();
        } else {
          visibleMyTopicsCount = 0;
          renderMyTopics();
        }

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

  // ✅ DELETE TOPIC VIA API
  async function deleteTopicServer(topicId) {
    const topic =
      allTopics.find((t) => t.id === topicId) ||
      myTopics.find((t) => t.id === topicId);
    if (!topic) throw new Error("Topic not found");
    if (String(topic.userId) !== String(CURRENT_USER_ID))
      throw new Error("You can only delete your own topics");

    try {
      console.log(`Deleting topic ${topicId}`);
      await deleteWithAuth(
        apiUrl(`/api/topics/${encodeURIComponent(topicId)}`)
      );
      console.log("Topic deleted from server successfully");
    } catch (apiErr) {
      console.error("API delete failed:", apiErr);
      throw new Error("Failed to delete topic: " + apiErr.message);
    }
  }

  // ---- Modal logic wiring ----
  const createTopicBtn = document.getElementById("createTopicBtn");
  const createTopicBtn2 = document.getElementById("createTopicBtn2");
  const modalBackdrop = document.getElementById("modalBackdrop");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const cancelModalBtn = document.getElementById("cancelModalBtn");
  const topicForm = document.getElementById("topicForm");

  function openCreateModal() {
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
  }

  if (createTopicBtn) {
    createTopicBtn.onclick = openCreateModal;
  }
  if (createTopicBtn2) {
    createTopicBtn2.onclick = openCreateModal;
  }

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

  // ✅ FORM SUBMIT
  topicForm.onsubmit = async function (e) {
    e.preventDefault();
    const title = document.getElementById("topicTitle").value.trim();
    const description = document
      .getElementById("topicDescription")
      .value.trim();
    const category = document.getElementById("topicCategory").value;
    const tagsValue = document.getElementById("selectedTags").value;
    const tags = tagsValue ? tagsValue.split(",").map((t) => t.trim()) : [];
    const isEdit = document.getElementById("isEdit").value === "true";
    const topicId = document.getElementById("topicId").value;

    if (!title) {
      showNotification("Topic title is required", true);
      return;
    }

    try {
      if (isEdit) {
        // ✅ CALL SERVER API FOR EDIT
        try {
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

          // ✅ Update local state in both arrays
          const topic =
            allTopics.find((t) => t.id === topicId) ||
            myTopics.find((t) => t.id === topicId);
          if (topic) {
            topic.title = title;
            topic.description = description;
            topic.category = category;
            topic.tags = tags;
          }
        } catch (serverErr) {
          console.error("API edit failed:", serverErr);
          throw new Error("Failed to update topic: " + serverErr.message);
        }
      } else {
        // ✅ CREATE NEW TOPIC
        try {
          let newTopic = await apiPostTopic(title, description, {
            category,
            tags,
          });

          // ✅ FIXED: Ensure proper normalization
          newTopic = normalizeTopic(newTopic);
          await resolveAuthorNames([newTopic]);

          showNotification("Topic created successfully");

          // ✅ FIXED: Add to both arrays
          allTopics.unshift(newTopic);
          myTopics.unshift(newTopic);

          // ✅ Update badge
          document.getElementById("myTopicsCount").textContent =
            myTopics.length;

          console.log(
            `[CREATE TOPIC] Topic created. allTopics: ${allTopics.length}, myTopics: ${myTopics.length}`
          );
        } catch (serverErr) {
          console.error("API create failed:", serverErr);
          throw new Error("Failed to create topic: " + serverErr.message);
        }
      }

      modalBackdrop.classList.remove("active");
      topicForm.reset();

      // ✅ Re-render current tab
      if (currentTab === "all-topics") {
        visibleTopicsCount = 0;
        renderAllTopics();
      } else {
        visibleMyTopicsCount = 0;
        renderMyTopics();
      }
    } catch (error) {
      showNotification(error.message, true);
    }
  };

  // ✅ INFINITE SCROLL DETECTION - Improved
  window.addEventListener("scroll", () => {
    if (currentTab !== "all-topics") return;

    const scrollLoader = document.getElementById("scrollLoader");
    const scrollPosition = window.scrollY + window.innerHeight;
    const pageHeight = document.documentElement.scrollHeight;

    // When user scrolls to 85% of page (more responsive)
    if (scrollPosition >= pageHeight * 0.85 && !isLoadingMore) {
      let filteredTopics = allTopics;
      if (currentSearch) {
        const lower = currentSearch.toLowerCase();
        filteredTopics = filteredTopics.filter(
          (t) =>
            (t.title || "").toLowerCase().includes(lower) ||
            (t.description || "").toLowerCase().includes(lower) ||
            (t.tags || []).some((tag) => tag.toLowerCase().includes(lower))
        );
      }

      // If more topics to show, load them
      if (visibleTopicsCount < filteredTopics.length) {
        isLoadingMore = true;
        if (scrollLoader) scrollLoader.style.display = "block";

        setTimeout(() => {
          renderAllTopics();
          isLoadingMore = false;
          if (scrollLoader) scrollLoader.style.display = "none";
        }, 300); // Reduced from 500ms for better UX
      }
    }
  });

  // ✅ SEARCH FILTER - Works on ALL topics - FIXED DUPLICATION
  const searchEl = document.getElementById("searchInput");
  if (searchEl) {
    let searchTimeout;
    searchEl.addEventListener("input", function (e) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = e.target.value.trim();

        // ✅ Reset visible count for current tab
        if (currentTab === "all-topics") {
          visibleTopicsCount = 0;
          renderAllTopics();
        } else {
          visibleMyTopicsCount = 0;
          renderMyTopics();
        }
      }, 300);
    });
  }

  // ✅ SORT/CATEGORY FILTERS - Re-fetch and show ALL
  const sortEl = document.getElementById("sortFilter");
  const categoryEl = document.getElementById("categoryFilter");

  if (sortEl) {
    sortEl.addEventListener("change", async (e) => {
      currentSort = e.target.value;
      visibleTopicsCount = 0;
      dataFetched = false; // Force re-fetch

      // ✅ Re-fetch and re-filter with new sort
      await fetchTopicsFromServer();
      renderAllTopics();
    });
  }

  if (categoryEl) {
    categoryEl.addEventListener("change", async (e) => {
      currentCategory = e.target.value;
      visibleTopicsCount = 0;
      dataFetched = false; // Force re-fetch

      // ✅ Re-fetch and re-filter with new category
      await fetchTopicsFromServer();
      renderAllTopics();
    });
  }

  // ✅ INITIAL LOAD
  (async function init() {
    console.log("[INIT] Initializing discussion page...");
    await fetchTopicsFromServer();
    document.getElementById("myTopicsCount").textContent = myTopics.length;
    dataFetched = true;
    visibleTopicsCount = 0;
    renderAllTopics();
    console.log(
      `[INIT] Discussion forum loaded for ${CURRENT_SESSION.user} at ${CURRENT_SESSION.datetime}`
    );
  })();

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
