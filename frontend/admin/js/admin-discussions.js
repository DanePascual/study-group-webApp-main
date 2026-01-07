// frontend/admin/js/admin-discussions.js
// Handles admin discussions management

let currentPage = 1;
let currentLimit = 10;
let currentCategory = "";
let currentSort = "newest";
let currentSearch = "";
let allTopics = [];
let currentViewingTopicId = null;
let activeCustomSelect = null;
let userCache = {}; // Cache to store user data by UID
let deletingType = null; // 'topic' or 'post'
let deletingId = null;

// API Base URL
const API_BASE =
  window.API_BASE || "https://study-group-backend-d8fc93ae1b7a.herokuapp.com";

// ===== LISTEN: Wait for adminUser to be available =====
let adminUserReady = false;
window.addEventListener("adminUserReady", () => {
  adminUserReady = true;
  console.log("[admin-discussions] ✅ adminUser is ready");
});

// ===== Initialize on page load =====
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[admin-discussions] Initializing...");

  // Setup event listeners immediately
  setupEventListeners();

  // Wait for admin user to be set
  let attempts = 0;
  const checkAdminInterval = setInterval(() => {
    attempts++;
    if (window.adminUser && window.adminUser.token) {
      clearInterval(checkAdminInterval);
      console.log("[admin-discussions] Admin user ready, loading topics...");
      loadTopics().then(() => {
        loadStatistics();
      });
    } else if (attempts > 50) {
      clearInterval(checkAdminInterval);
      console.error("[admin-discussions] Admin user not loaded");
    }
  }, 100);
});

// ===== Setup event listeners =====
function setupEventListeners() {
  console.log("[admin-discussions] Setting up event listeners...");

  // Search input with debounce
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = e.target.value;
        currentPage = 1;
        loadTopics();
      }, 300);
    });
  }

  // Pagination
  const prevBtn = document.getElementById("prevBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        loadTopics();
        scrollToTop();
      }
    });
  }

  const nextBtn = document.getElementById("nextBtn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const totalPages = Math.ceil(allTopics.length / currentLimit);
      if (currentPage < totalPages) {
        currentPage++;
        loadTopics();
        scrollToTop();
      }
    });
  }

  // Delete topic button
  const deleteTopicBtn = document.getElementById("deleteTopicBtn");
  if (deleteTopicBtn) {
    deleteTopicBtn.addEventListener("click", () => {
      if (currentViewingTopicId) {
        showDeleteConfirmation("topic", currentViewingTopicId, "this topic");
      }
    });
  }

  console.log("[admin-discussions] Event listeners setup complete");
}

// ===== CUSTOM SELECT FUNCTIONS =====
function toggleCustomSelect(type) {
  const dropdown = document.getElementById(type + "Dropdown");
  const trigger = document.getElementById(type + "Trigger");

  // Close other dropdowns
  if (activeCustomSelect && activeCustomSelect !== type) {
    document
      .getElementById(activeCustomSelect + "Dropdown")
      ?.classList.remove("active");
    document
      .getElementById(activeCustomSelect + "Trigger")
      ?.classList.remove("active");
  }

  dropdown.classList.toggle("active");
  trigger.classList.toggle("active");
  activeCustomSelect = dropdown.classList.contains("active") ? type : null;
}

function selectCustomOption(type, value, label) {
  if (type === "category") {
    currentCategory = value;
    document.getElementById("categoryValue").textContent = label;
    document.getElementById("categoryDropdown").classList.remove("active");
    document.getElementById("categoryTrigger").classList.remove("active");
  } else if (type === "sort") {
    currentSort = value;
    document.getElementById("sortValue").textContent = label;
    document.getElementById("sortDropdown").classList.remove("active");
    document.getElementById("sortTrigger").classList.remove("active");
  }

  activeCustomSelect = null;
  currentPage = 1;
  loadTopics();
}

// Close dropdowns when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".custom-select-wrapper")) {
    document
      .querySelectorAll(".custom-select-dropdown.active")
      .forEach((el) => {
        el.classList.remove("active");
      });
    document.querySelectorAll(".custom-select-trigger.active").forEach((el) => {
      el.classList.remove("active");
    });
    activeCustomSelect = null;
  }
});

// ===== Load statistics =====
async function loadStatistics() {
  try {
    console.log("[admin-discussions] Loading statistics...");

    // These would ideally come from backend endpoints
    // For now, we'll calculate them from topics
    const totalTopics = allTopics.length;

    // Set stat cards
    document.getElementById("totalTopicsCard").textContent = totalTopics;
    document.getElementById("totalPostsCard").textContent = allTopics.reduce(
      (sum, topic) => sum + (topic.postCount || topic.post_count || 0),
      0
    );
    document.getElementById("totalCommentsCard").textContent = "0"; // Would need backend support

    // Active topics (with activity in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeTopics = allTopics.filter((t) => {
      const topicDate = new Date(t.created || t.created_at);
      return topicDate > sevenDaysAgo;
    }).length;
    document.getElementById("activeTopicsCard").textContent = activeTopics;
  } catch (err) {
    console.error("[admin-discussions] Error loading statistics:", err);
  }
}

// ===== Load topics =====
async function loadTopics() {
  try {
    console.log("[admin-discussions] Fetching topics...");
    const topicsList = document.getElementById("topicsList");
    const emptyState = document.getElementById("emptyState");
    const pageInfo = document.getElementById("pageInfo");

    // Show loading state
    topicsList.innerHTML = '<div class="loading">Loading topics...</div>';

    const token = window.adminUser?.token;
    if (!token) {
      throw new Error("No admin token available");
    }

    // Fetch topics from backend
    const response = await fetch(`${API_BASE}/api/topics`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch topics: ${response.status}`);
    }

    const topics = await response.json();
    allTopics = Array.isArray(topics) ? topics : topics?.topics || [];

    // Filter by category
    let filtered = allTopics;
    if (currentCategory) {
      filtered = filtered.filter((t) => t.category === currentCategory);
    }

    // Filter by search
    if (currentSearch) {
      const search = currentSearch.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          (t.title && t.title.toLowerCase().includes(search)) ||
          (t.author && t.author.toLowerCase().includes(search))
      );
    }

    // Sort
    if (currentSort === "newest") {
      filtered.sort(
        (a, b) =>
          new Date(b.created || b.created_at) -
          new Date(a.created || a.created_at)
      );
    } else if (currentSort === "oldest") {
      filtered.sort(
        (a, b) =>
          new Date(a.created || a.created_at) -
          new Date(b.created || b.created_at)
      );
    } else if (currentSort === "activity") {
      filtered.sort(
        (a, b) =>
          (b.postCount || b.post_count || 0) -
          (a.postCount || a.post_count || 0)
      );
    }

    // Paginate
    const totalPages = Math.ceil(filtered.length / currentLimit);
    const start = (currentPage - 1) * currentLimit;
    const paginatedTopics = filtered.slice(start, start + currentLimit);

    // Update pagination info
    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    document.getElementById("prevBtn").disabled = currentPage === 1;
    document.getElementById("nextBtn").disabled = currentPage >= totalPages;

    // Render topics
    if (paginatedTopics.length === 0) {
      topicsList.innerHTML = "";
      emptyState.style.display = "block";
    } else {
      emptyState.style.display = "none";
      topicsList.innerHTML = paginatedTopics
        .map((topic) => createTopicCard(topic))
        .join("");

      // Add click listeners to view buttons
      document.querySelectorAll(".view-topic-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const topicId = btn.dataset.topicId;
          viewTopicDetail(topicId);
        });
      });

      // Add click listeners to delete buttons
      document.querySelectorAll(".delete-topic-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const topicId = btn.dataset.topicId;
          showDeleteConfirmation("topic", topicId, "this topic");
        });
      });
    }

    console.log(`[admin-discussions] Loaded ${paginatedTopics.length} topics`);
  } catch (err) {
    console.error("[admin-discussions] Error loading topics:", err);
    document.getElementById("topicsList").innerHTML = `
      <div class="error-message">
        Error loading topics: ${err.message}
      </div>
    `;
  }
}

// ===== Create topic card HTML =====
function createTopicCard(topic) {
  // Handle different date field names from backend
  const dateString =
    topic.created || topic.created_at || new Date().toISOString();
  const createdDate = new Date(dateString);
  const formattedDate = createdDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const categoryBadge = topic.category
    ? `<span class="category-badge category-${topic.category}">${topic.category}</span>`
    : "";

  // Use correct field names from backend response
  const author = topic.author || topic.author_name || "Unknown";
  const postCount = topic.postCount || topic.post_count || 0;
  const viewCount = topic.viewCount || topic.view_count || 0;

  return `
    <div class="topic-card">
      <div class="topic-header">
        <div class="topic-title-section">
          <h3>${escapeHtml(topic.title)}</h3>
          ${categoryBadge}
        </div>
        <div class="topic-actions">
          <button class="view-topic-btn" data-topic-id="${
            topic.id
          }">View</button>
          <button class="delete-topic-btn btn-danger-sm" data-topic-id="${
            topic.id
          }">Delete</button>
        </div>
      </div>
      <p class="topic-description">${escapeHtml(
        topic.description || "No description"
      )}</p>
      <div class="topic-meta">
        <span class="meta-item">
          <strong>Author:</strong> ${escapeHtml(author)}
        </span>
        <span class="meta-item">
          <strong>Posts:</strong> ${postCount}
        </span>
        <span class="meta-item">
          <strong>Views:</strong> ${viewCount}
        </span>
        <span class="meta-item">
          <strong>Created:</strong> ${formattedDate}
        </span>
      </div>
      ${topic.pinned ? '<div class="pinned-badge">📌 Pinned</div>' : ""}
    </div>
  `;
}

// ===== View topic detail =====
async function viewTopicDetail(topicId) {
  try {
    console.log("[admin-discussions] Viewing topic:", topicId);
    const token = window.adminUser?.token;
    const modal = document.getElementById("topicModal");

    // Fetch topic detail
    const response = await fetch(`${API_BASE}/api/topics/${topicId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch topic details");
    }

    const responseData = await response.json();
    // Backend wraps response in { topic: {...} }
    const topic = responseData.topic || responseData;
    currentViewingTopicId = topic.id;

    // Update modal title
    document.getElementById("modalTopicTitle").textContent = escapeHtml(
      topic.title || ""
    );

    // Map backend field names to display names
    const formattedCreatedDate = topic.created
      ? new Date(topic.created).toLocaleString()
      : "Unknown";

    // Render topic info
    const topicInfo = document.getElementById("topicInfo");
    topicInfo.innerHTML = `
      <div class="topic-detail-info">
        <div class="info-row">
          <label>Title:</label>
          <span>${escapeHtml(topic.title || "N/A")}</span>
        </div>
        <div class="info-row">
          <label>Description:</label>
          <span>${escapeHtml(
            topic.description || "No description provided"
          )}</span>
        </div>
        <div class="info-row">
          <label>Category:</label>
          <span>${topic.category || "General"}</span>
        </div>
        <div class="info-row">
          <label>Author:</label>
          <span>${escapeHtml(topic.author || "Unknown")}</span>
        </div>
        <div class="info-row">
          <label>Posts:</label>
          <span>${topic.postCount || topic.post_count || 0}</span>
        </div>
        <div class="info-row">
          <label>Views:</label>
          <span>${topic.viewCount || topic.view_count || 0}</span>
        </div>
        <div class="info-row">
          <label>Created:</label>
          <span>${formattedCreatedDate}</span>
        </div>
        <div class="info-row">
          <label>Tags:</label>
          <span>${
            topic.tags && Array.isArray(topic.tags) && topic.tags.length > 0
              ? topic.tags.map((t) => escapeHtml(t)).join(", ")
              : "No tags"
          }</span>
        </div>
        <div class="info-row">
          <label>Pinned:</label>
          <span>${topic.pinned ? "Yes" : "No"}</span>
        </div>
      </div>
    `;

    // Render posts list
    const postsList = document.getElementById("postsList");
    postsList.innerHTML = `
      <div class="posts-info">
        <p>This topic has <strong>${
          topic.postCount || topic.post_count || 0
        }</strong> posts.</p>
        <small>Detailed post management coming soon...</small>
      </div>
    `;

    // Show modal
    modal.classList.add("active");
  } catch (err) {
    console.error("[admin-discussions] Error viewing topic:", err);
    alert("Error loading topic details: " + err.message);
  }
}

// ===== Close modal =====
function closeModal() {
  document.getElementById("topicModal").classList.remove("active");
  currentViewingTopicId = null;
}

// ===== Show delete confirmation =====
function showDeleteConfirmation(type, id, itemName) {
  deletingType = type;
  deletingId = id;

  const deleteMessage = document.getElementById("deleteMessage");
  deleteMessage.textContent = `Are you sure you want to delete ${itemName}? This action cannot be undone.`;

  const confirmBtn = document.getElementById("confirmDeleteBtn");
  confirmBtn.onclick = () => confirmDelete();

  document.getElementById("deleteModal").classList.add("active");
}

// ===== Close delete modal =====
function closeDeleteModal() {
  document.getElementById("deleteModal").classList.remove("active");
  deletingType = null;
  deletingId = null;
}

// ===== Confirm delete =====
async function confirmDelete() {
  try {
    console.log(`[admin-discussions] Deleting ${deletingType}:`, deletingId);
    const token = window.adminUser?.token;

    if (!token) {
      throw new Error("No admin token available");
    }

    if (deletingType === "topic") {
      const response = await fetch(`${API_BASE}/api/topics/${deletingId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete topic");
      }

      console.log("[admin-discussions] ✅ Topic deleted successfully");
      closeDeleteModal();
      closeModal();
      loadTopics();
      loadStatistics();
    }
  } catch (err) {
    console.error("[admin-discussions] Error deleting item:", err);
    alert("Error deleting item: " + err.message);
  }
}

// ===== Utility function to escape HTML =====
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

// ===== Utility function to scroll to top =====
function scrollToTop() {
  document.querySelector(".admin-content").scrollTop = 0;
}

// Make functions globally available
window.toggleCustomSelect = toggleCustomSelect;
window.selectCustomOption = selectCustomOption;
window.viewTopicDetail = viewTopicDetail;
window.closeModal = closeModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;
