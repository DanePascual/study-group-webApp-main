// ======= Firebase Auth Dynamic Session (Modern Modular Pattern) =======
// Uses modular Firebase imports, dynamic session/Firestore user info, and global sidebar.js logout

import { auth, db } from "../../config/firebase.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

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
    initializeTheme();
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
    // Only set initials if there is no <img> inside avatar (don't overwrite server-provided photo)
    if (avatar) {
      const hasImg =
        typeof avatar.querySelector === "function" &&
        avatar.querySelector("img");
      if (!hasImg && CURRENT_SESSION.userAvatar) {
        const current = (avatar.textContent || "").trim();
        if (!current || current === "" || current === "Loading...") {
          avatar.textContent = CURRENT_SESSION.userAvatar.toUpperCase();
        }
      }
    }

    // Only overwrite name if sidebar still shows default text
    if (name && CURRENT_SESSION.user) {
      const currentName = (name.textContent || "").trim();
      const isDefault =
        !currentName ||
        currentName === "" ||
        currentName === "Loading..." ||
        currentName === "Not signed in";
      if (isDefault) name.textContent = CURRENT_SESSION.user;
    }

    // Course/program
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

// ---- Theme toggle ----
function initializeTheme() {
  const themeToggle = document.getElementById("themeToggle");
  const body = document.body;
  const savedTheme = localStorage.getItem("theme") || "light";
  if (savedTheme === "dark") {
    body.classList.add("dark-mode");
    if (themeToggle) themeToggle.innerHTML = '<i class="bi bi-sun"></i>';
  }
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      body.classList.toggle("dark-mode");
      const isDark = body.classList.contains("dark-mode");
      themeToggle.innerHTML = isDark
        ? '<i class="bi bi-sun"></i>'
        : '<i class="bi bi-moon"></i>';
      localStorage.setItem("theme", isDark ? "dark" : "light");
    });
  }
}

// ---- Main page initialization and UI logic ----
function initializeDiscussionPage() {
  // Guard: run initialization only once to avoid duplicate listeners
  if (initializeDiscussionPage._initialized) {
    console.log(
      "initializeDiscussionPage already run, skipping duplicate init"
    );
    return;
  }
  initializeDiscussionPage._initialized = true;

  // NOTE: Sidebar toggle wiring removed from this page to avoid conflict
  // with centralized sidebar.js. sidebar.js now controls open/close and
  // persistence for the sidebar across all pages.

  // Format relative time
  function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHour = Math.round(diffMin / 60);
    const diffDay = Math.round(diffHour / 24);

    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin} min${diffMin !== 1 ? "s" : ""} ago`;
    if (diffHour < 24)
      return `${diffHour} hour${diffHour !== 1 ? "s" : ""} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  }

  // Show notification
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

  // Simulate an API delay
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Topic CRUD using localStorage
  async function getTopics(
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
    return {
      topics: paginatedTopics,
      pagination: { page, limit, total, totalPages },
    };
  }

  async function createTopic(topicData) {
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

  async function updateTopic(topicId, topicData) {
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

  async function deleteTopic(topicId) {
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

  async function togglePinTopic(topicId) {
    await delay(100);
    let topics = JSON.parse(localStorage.getItem("topics") || "[]");
    const index = topics.findIndex((t) => t.id === topicId);
    if (index === -1) throw new Error("Topic not found");
    topics[index].pinned = !topics[index].pinned;
    localStorage.setItem("topics", JSON.stringify(topics));
    return topics[index];
  }

  async function searchTopics(
    term,
    page = 1,
    limit = 6,
    sort = "newest",
    category = "all"
  ) {
    const result = await getTopics(1, 1000, sort, category);
    const allTopics = result.topics;
    if (!term) return getTopics(page, limit, sort, category);
    const filteredTopics = allTopics.filter(
      (t) =>
        t.title.toLowerCase().includes(term.toLowerCase()) ||
        t.description.toLowerCase().includes(term.toLowerCase()) ||
        t.tags.some((tag) => tag.toLowerCase().includes(term.toLowerCase()))
    );
    const total = filteredTopics.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTopics = filteredTopics.slice(startIndex, endIndex);
    return {
      topics: paginatedTopics,
      pagination: { page, limit, total, totalPages },
    };
  }

  // Global state
  let currentPage = 1;
  let currentSort = "newest";
  let currentCategory = "all";
  let currentSearch = "";

  // Render topic grid
  async function renderTopics() {
    const topicGrid = document.getElementById("topicGrid");
    topicGrid.innerHTML =
      '<div class="text-center p-5"><i class="bi bi-hourglass-split"></i> Loading...</div>';
    try {
      const result = await searchTopics(
        currentSearch,
        currentPage,
        6,
        currentSort,
        currentCategory
      );
      const { topics, pagination } = result;
      if (topics.length === 0) {
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
                  <div class="topic-title">${topic.title}</div>
                  <div class="topic-meta">
                    <div><i class="bi bi-person"></i> ${topic.author}</div>
                    <div><i class="bi bi-calendar3"></i> ${formatRelativeTime(
                      topic.created
                    )}</div>
                  </div>
                  <div>
                    ${(topic.tags || [])
                      .map((tag) => `<span class="topic-tag">${tag}</span>`)
                      .join("")}
                  </div>
                  <div class="topic-latest">
                    ${topic.description || "No description provided."}
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
                    <a href="topic.html?id=${
                      topic.id
                    }" class="view-btn">View</a>
                  </div>
                </div>
              </div>
            `;
          })
          .join("");
      }
      renderPagination(pagination);
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

  // Render pagination controls
  function renderPagination(pagination) {
    const paginationControls = document.getElementById("paginationControls");
    const { page, totalPages } = pagination;
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

  // Change page
  window.changePage = function (page) {
    currentPage = page;
    renderTopics();
    document.getElementById("topicGrid").scrollIntoView({ behavior: "smooth" });
  };

  // Toggle topic dropdown menu
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
      const topic = await togglePinTopic(topicId);
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
        await deleteTopic(topicId);
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

  // Modal logic
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

  // Create/Edit topic form submit
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
        await updateTopic(topicId, { title, description, category, tags });
        showNotification("Topic updated successfully");
      } else {
        await createTopic({ title, description, category, tags });
        showNotification("Topic created successfully");
      }
      modalBackdrop.classList.remove("active");
      topicForm.reset();
      renderTopics();
    } catch (error) {
      showNotification(error.message, true);
    }
  };

  // Search input handler
  let searchTimeout;
  document
    .getElementById("searchInput")
    .addEventListener("input", function (e) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        renderTopics();
      }, 300);
    });

  document
    .getElementById("sortFilter")
    .addEventListener("change", function (e) {
      currentSort = e.target.value;
      currentPage = 1;
      renderTopics();
    });

  document
    .getElementById("categoryFilter")
    .addEventListener("change", function (e) {
      currentCategory = e.target.value;
      currentPage = 1;
      renderTopics();
    });

  // Generate some sample topics if none exist
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
        await createTopic(topic);
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
}

// ---- LOGOUT IS HANDLED BY SIDEBAR.JS GLOBALLY ----
// No local logout handler here; sidebar.js (imported as type="module") handles global logout for all users.
