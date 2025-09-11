// Current session information
const CURRENT_SESSION = {
  utcTime: "2025-08-31 13:28:07", // Updated UTC time
  user: "DanePascual",
  timezone: "UTC",
};

// Current user ID (normally from auth system)
const CURRENT_USER_ID = "user_dane_pascual"; // Simulate the current user

// ---- Backend-ready API simulation ----

// Simulate an API delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? "s" : ""} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

// Show notification
function showNotification(message, isError = false) {
  // Remove any existing notification
  const existingNotification = document.querySelector(".notification");
  if (existingNotification) existingNotification.remove();

  const notification = document.createElement("div");
  notification.className = `notification ${isError ? "error" : ""}`;
  notification.innerHTML = `
        <i class="bi bi-${isError ? "exclamation-circle" : "check-circle"}"></i>
        ${message}
      `;
  document.body.appendChild(notification);

  // Auto remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = "0";
    notification.style.transform = "translateX(100%)";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Get all topics with pagination
async function getTopics(
  page = 1,
  limit = 6,
  sort = "newest",
  category = "all"
) {
  await delay(100); // Simulate network latency
  let topics = JSON.parse(localStorage.getItem("topics") || "[]");

  // Apply category filter
  if (category !== "all") {
    topics = topics.filter((t) => t.category === category);
  }

  // Apply sorting
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

  // Calculate pagination
  const total = topics.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedTopics = topics.slice(startIndex, endIndex);

  return {
    topics: paginatedTopics,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

// Create a topic
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
    author: CURRENT_SESSION.user, // Updated to use CURRENT_SESSION.user
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

// Update a topic
async function updateTopic(topicId, topicData) {
  await delay(100);
  let topics = JSON.parse(localStorage.getItem("topics") || "[]");
  const index = topics.findIndex((t) => t.id === topicId);

  if (index === -1) {
    throw new Error("Topic not found");
  }

  // Check if current user is the author
  if (topics[index].userId !== CURRENT_USER_ID) {
    throw new Error("You can only edit your own topics");
  }

  // Update the topic
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

// Delete a topic
async function deleteTopic(topicId) {
  await delay(100);
  let topics = JSON.parse(localStorage.getItem("topics") || "[]");
  const index = topics.findIndex((t) => t.id === topicId);

  if (index === -1) {
    throw new Error("Topic not found");
  }

  // Check if current user is the author
  if (topics[index].userId !== CURRENT_USER_ID) {
    throw new Error("You can only delete your own topics");
  }

  // Delete the topic
  topics.splice(index, 1);
  localStorage.setItem("topics", JSON.stringify(topics));

  // Also delete associated posts and comments
  localStorage.removeItem("posts_" + topicId);
  return true;
}

// Toggle pin status
async function togglePinTopic(topicId) {
  await delay(100);
  let topics = JSON.parse(localStorage.getItem("topics") || "[]");
  const index = topics.findIndex((t) => t.id === topicId);

  if (index === -1) {
    throw new Error("Topic not found");
  }

  // Toggle pin status
  topics[index].pinned = !topics[index].pinned;
  localStorage.setItem("topics", JSON.stringify(topics));
  return topics[index];
}

// Search topics
async function searchTopics(
  term,
  page = 1,
  limit = 6,
  sort = "newest",
  category = "all"
) {
  const result = await getTopics(1, 1000, sort, category); // Get all for searching
  const allTopics = result.topics;

  if (!term) {
    return getTopics(page, limit, sort, category);
  }

  const filteredTopics = allTopics.filter(
    (t) =>
      t.title.toLowerCase().includes(term.toLowerCase()) ||
      t.description.toLowerCase().includes(term.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(term.toLowerCase()))
  );

  // Calculate pagination
  const total = filteredTopics.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedTopics = filteredTopics.slice(startIndex, endIndex);

  return {
    topics: paginatedTopics,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

// ---- UI code below ----

// Theme management
function initializeTheme() {
  const themeToggle = document.getElementById("themeToggle");
  const body = document.body;

  // Load saved theme from localStorage
  const savedTheme = localStorage.getItem("theme") || "light";
  if (savedTheme === "dark") {
    body.classList.add("dark-mode");
    themeToggle.innerHTML = '<i class="bi bi-sun"></i>';
  }

  // Add toggle event
  themeToggle.addEventListener("click", () => {
    body.classList.toggle("dark-mode");
    const isDark = body.classList.contains("dark-mode");
    themeToggle.innerHTML = isDark
      ? '<i class="bi bi-sun"></i>'
      : '<i class="bi bi-moon"></i>';
    localStorage.setItem("theme", isDark ? "dark" : "light");
  });
}

// Sidebar Toggle
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const mainContent = document.getElementById("mainContent");
menuToggle.addEventListener("click", function () {
  sidebar.classList.toggle("open");
  mainContent.classList.toggle("shifted");
});
document.addEventListener("click", function (event) {
  if (window.innerWidth <= 768) {
    if (!sidebar.contains(event.target) && !menuToggle.contains(event.target)) {
      sidebar.classList.remove("open");
      mainContent.classList.remove("shifted");
    }
  }
});
function goToProfile() {
  window.location.href = "profile.html";
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

    // Render pagination
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

  // Logic to show limited page numbers
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

  // Scroll to top of topic grid
  document.getElementById("topicGrid").scrollIntoView({ behavior: "smooth" });
};

// Toggle topic dropdown menu
window.toggleTopicOptions = function (event, topicId) {
  event.stopPropagation();
  const dropdown = document.getElementById(`dropdown-${topicId}`);

  // Close all other dropdowns first
  document.querySelectorAll(".topic-dropdown-menu.show").forEach((menu) => {
    if (menu.id !== `dropdown-${topicId}`) {
      menu.classList.remove("show");
    }
  });

  // Toggle the current dropdown
  dropdown.classList.toggle("show");
};

// Close dropdowns when clicking elsewhere
document.addEventListener("click", function (event) {
  if (!event.target.closest(".topic-options-btn")) {
    document.querySelectorAll(".topic-dropdown-menu.show").forEach((menu) => {
      menu.classList.remove("show");
    });
  }
});

// Toggle pin status
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

// Show delete confirmation
window.showDeleteConfirmation = function (topicId) {
  document.getElementById("confirmationBackdrop").style.display = "block";
  document.getElementById("deleteConfirmation").style.display = "block";

  // Set up confirmation buttons
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

// Hide delete confirmation
function hideDeleteConfirmation() {
  document.getElementById("confirmationBackdrop").style.display = "none";
  document.getElementById("deleteConfirmation").style.display = "none";
}

// Show edit topic modal
window.showEditTopicModal = async function (topicId) {
  const topics = JSON.parse(localStorage.getItem("topics") || "[]");
  const topic = topics.find((t) => t.id === topicId);

  if (!topic) {
    showNotification("Topic not found", true);
    return;
  }

  // Populate the modal with topic data
  document.getElementById("modalTitle").textContent = "Edit Topic";
  document.getElementById("topicTitle").value = topic.title;
  document.getElementById("topicDescription").value = topic.description || "";
  document.getElementById("topicCategory").value =
    topic.category || "discussion";
  document.getElementById("topicId").value = topicId;
  document.getElementById("isEdit").value = "true";
  document.getElementById("saveTopicBtn").textContent = "Save Changes";

  // Reset tag selection
  document.querySelectorAll(".tag-option").forEach((tag) => {
    tag.classList.remove("selected");
  });

  // Select the tags that this topic has
  if (topic.tags && topic.tags.length) {
    document.getElementById("selectedTags").value = topic.tags.join(",");
    topic.tags.forEach((tag) => {
      const tagElement = document.querySelector(
        `.tag-option[data-tag="${tag}"]`
      );
      if (tagElement) {
        tagElement.classList.add("selected");
      }
    });
  } else {
    document.getElementById("selectedTags").value = "";
  }

  // Show the modal
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
      // Deselect tag
      this.classList.remove("selected");
    } else if (selectedTags.length < 3) {
      // Select tag if less than 3 are selected
      this.classList.add("selected");
    } else {
      showNotification("You can select up to 3 tags", true);
    }

    // Update hidden field with selected tags
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
  const description = document.getElementById("topicDescription").value.trim();
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
      // Update existing topic
      await updateTopic(topicId, { title, description, category, tags });
      showNotification("Topic updated successfully");
    } else {
      // Create new topic
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
document.getElementById("searchInput").addEventListener("input", function (e) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentSearch = e.target.value.trim();
    currentPage = 1; // Reset to first page when searching
    renderTopics();
  }, 300); // Debounce for better performance
});

// Sort and category filter handlers
document.getElementById("sortFilter").addEventListener("change", function (e) {
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

// Initialize and render
(async function init() {
  // Initialize dark mode
  initializeTheme();

  // Initialize sidebar - OPEN by default for discussion forum
  sidebar.classList.add("open");
  mainContent.classList.add("shifted");

  // Initialize sample data and render topics
  await initializeSampleData();
  await renderTopics();

  console.log(
    `Discussion forum loaded for ${CURRENT_SESSION.user} at ${CURRENT_SESSION.utcTime} UTC`
  );
})();
