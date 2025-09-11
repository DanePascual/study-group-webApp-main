// Current user and time information
const CURRENT_SESSION = {
  utcTime: "2025-08-31 10:00:16", // Updated UTC time
  user: "DanePascual",
  timezone: "UTC",
};

// Current user ID (normally from auth system)
const CURRENT_USER_ID = "user_dane_pascual"; // Simulate the current user

// ---- Backend-ready API simulation ----
// Each topic's posts are stored as 'posts_<topicId>' in localStorage

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

// Generate avatar from username
function getInitials(name) {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

// Get topic details
async function getTopicById(topicId) {
  await delay(50);
  const topics = JSON.parse(localStorage.getItem("topics") || "[]");
  const topic = topics.find((t) => t.id == topicId);

  if (topic) {
    // Update view count
    const idx = topics.findIndex((t) => t.id == topicId);
    if (idx !== -1) {
      topics[idx].viewCount = (topics[idx].viewCount || 0) + 1;
      localStorage.setItem("topics", JSON.stringify(topics));
    }
  }

  return topic;
}

// Get posts for a topic with pagination
async function getPosts(topicId, page = 1, limit = 5, sort = "newest") {
  await delay(50);
  let posts = JSON.parse(localStorage.getItem("posts_" + topicId) || "[]");

  // Apply sorting
  switch (sort) {
    case "newest":
      posts.sort((a, b) => new Date(b.created) - new Date(a.created));
      break;
    case "oldest":
      posts.sort((a, b) => new Date(a.created) - new Date(b.created));
      break;
    case "title":
      posts.sort((a, b) => a.title.localeCompare(b.title));
      break;
  }

  // Calculate pagination
  const total = posts.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedPosts = posts.slice(startIndex, endIndex);

  return {
    posts: paginatedPosts,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

// Create a post
async function createPost(topicId, { title, content, author }) {
  await delay(100);
  const posts = JSON.parse(localStorage.getItem("posts_" + topicId) || "[]");
  const now = new Date();
  const post = {
    id: Date.now().toString(),
    title,
    content,
    author: author || CURRENT_SESSION.user,
    authorId: CURRENT_USER_ID,
    created: now.toISOString(),
    lastEdited: null,
  };
  posts.unshift(post);
  localStorage.setItem("posts_" + topicId, JSON.stringify(posts));

  // Update topic with latest post info and count
  let topics = JSON.parse(localStorage.getItem("topics") || "[]");
  const idx = topics.findIndex((t) => t.id == topicId);
  if (idx !== -1) {
    topics[idx].postCount = (topics[idx].postCount || 0) + 1;
    topics[idx].latestPost = {
      title: post.title,
      author: post.author,
      created: post.created,
    };
    topics[idx].latestActivity = now.toISOString();
    localStorage.setItem("topics", JSON.stringify(topics));
  }

  return post;
}

// Edit a post
async function editPost(topicId, postId, { title, content }) {
  await delay(100);
  const posts = JSON.parse(localStorage.getItem("posts_" + topicId) || "[]");
  const idx = posts.findIndex((p) => p.id === postId);

  if (idx === -1) {
    throw new Error("Post not found");
  }

  // Check if current user is the author
  if (posts[idx].authorId !== CURRENT_USER_ID) {
    throw new Error("You can only edit your own posts");
  }

  // Update the post
  posts[idx] = {
    ...posts[idx],
    title,
    content,
    lastEdited: new Date().toISOString(),
  };

  localStorage.setItem("posts_" + topicId, JSON.stringify(posts));
  return posts[idx];
}

// Delete a post
async function deletePost(topicId, postId) {
  await delay(100);
  let posts = JSON.parse(localStorage.getItem("posts_" + topicId) || "[]");
  const idx = posts.findIndex((p) => p.id === postId);

  if (idx === -1) {
    throw new Error("Post not found");
  }

  // Check if current user is the author
  if (posts[idx].authorId !== CURRENT_USER_ID) {
    throw new Error("You can only delete your own posts");
  }

  // Remove the post
  posts.splice(idx, 1);
  localStorage.setItem("posts_" + topicId, JSON.stringify(posts));

  // Update topic post count
  let topics = JSON.parse(localStorage.getItem("topics") || "[]");
  const topicIdx = topics.findIndex((t) => t.id == topicId);
  if (topicIdx !== -1) {
    topics[topicIdx].postCount = Math.max(
      0,
      (topics[topicIdx].postCount || 0) - 1
    );

    // If this was the last post, update latestPost to null
    if (posts.length === 0) {
      topics[topicIdx].latestPost = null;
    } else {
      // Otherwise update to the most recent post
      const latestPost = posts.sort(
        (a, b) => new Date(b.created) - new Date(a.created)
      )[0];
      topics[topicIdx].latestPost = {
        title: latestPost.title,
        author: latestPost.author,
        created: latestPost.created,
      };
    }

    localStorage.setItem("topics", JSON.stringify(topics));
  }

  // Also delete all comments for this post
  localStorage.removeItem("comments_" + topicId + "_" + postId);

  return true;
}

// UI/Navigation helpers
function goBackToForum() {
  window.location.href = "discussion.html";
}

// ----- Main Page Logic -----
// Global state
let currentPage = 1;
let currentSort = "newest";

// Get topicId from URL (?id=123)
function getTopicIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

// Render topic header
async function renderTopicHeader(topic) {
  document.getElementById("topicTitle").textContent = topic.title;
  document.getElementById("topicAuthor").textContent =
    topic.author || "Anonymous";
  document.getElementById("topicDate").textContent = formatRelativeTime(
    topic.created
  );
  document.getElementById("topicPostCount").textContent = `${
    topic.postCount || 0
  } post${topic.postCount !== 1 ? "s" : ""}`;
  document.getElementById("topicViews").textContent = `${
    topic.viewCount || 0
  } view${topic.viewCount !== 1 ? "s" : ""}`;
  document.getElementById("topicCategory").textContent =
    topic.category || "Discussion";
  document.getElementById("topicDescription").textContent =
    topic.description || "No description provided.";

  // Render tags
  const tagsContainer = document.getElementById("topicTags");
  if (topic.tags && topic.tags.length) {
    tagsContainer.innerHTML = topic.tags
      .map((tag) => `<span class="topic-tag">${tag}</span>`)
      .join("");
  } else {
    tagsContainer.innerHTML = "";
  }
}

// Render post grid
async function renderPosts() {
  const topicId = getTopicIdFromUrl();
  const postGrid = document.getElementById("postGrid");

  try {
    const result = await getPosts(topicId, currentPage, 5, currentSort);
    const { posts, pagination } = result;

    if (!posts || posts.length === 0) {
      postGrid.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon"><i class="bi bi-file-earmark-text"></i></div>
              <div class="empty-state-text">No posts yet. Use the "Create New Post" button above to start the discussion!</div>
            </div>
          `;
    } else {
      postGrid.innerHTML = posts
        .map((post) => {
          const isAuthor = post.authorId === CURRENT_USER_ID;
          const initials = getInitials(post.author);

          return `
              <div class="post-card">
                <div class="post-card-content">
                  <div class="post-card-header">
                    <div class="post-title-container">
                      <div class="post-title">${post.title}</div>
                      <div class="post-author">
                        <div class="author-avatar">${initials}</div>
                        <span>${post.author}</span>
                      </div>
                    </div>
                    
                    ${
                      isAuthor
                        ? `
                      <div class="post-options">
                        <button class="post-options-btn" onclick="togglePostOptions(event, '${post.id}')">
                          <i class="bi bi-three-dots-vertical"></i>
                        </button>
                        <div class="post-dropdown-menu" id="dropdown-${post.id}">
                          <div class="post-dropdown-item" onclick="showEditPostModal('${post.id}')">
                            <i class="bi bi-pencil"></i> Edit
                          </div>
                          <div class="post-dropdown-item delete" onclick="showDeleteConfirmation('${post.id}')">
                            <i class="bi bi-trash"></i> Delete
                          </div>
                        </div>
                      </div>
                    `
                        : ""
                    }
                  </div>
                  
                  <div class="post-preview">
                    ${post.content.substring(0, 200)}${
            post.content.length > 200 ? "..." : ""
          }
                  </div>
                  
                  <div class="post-meta">
                    <div class="post-date">
                      <i class="bi bi-clock"></i>
                      ${formatRelativeTime(post.created)}
                      ${
                        post.lastEdited
                          ? `<span class="edited">(edited)</span>`
                          : ""
                      }
                    </div>
                    <a href="post.html?topic=${topicId}&post=${
            post.id
          }" class="view-post-btn">
                      <i class="bi bi-eye"></i>
                      View Discussion
                    </a>
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
    postGrid.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon"><i class="bi bi-exclamation-triangle"></i></div>
            <div class="empty-state-text">Error loading posts. Please try again.</div>
          </div>
        `;
    console.error("Error rendering posts:", error);
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
  renderPosts();

  // Scroll to top of posts
  document.getElementById("postGrid").scrollIntoView({ behavior: "smooth" });
};

// Toggle post dropdown menu
window.togglePostOptions = function (event, postId) {
  event.stopPropagation();
  const dropdown = document.getElementById(`dropdown-${postId}`);

  // Close all other dropdowns first
  document.querySelectorAll(".post-dropdown-menu.show").forEach((menu) => {
    if (menu.id !== `dropdown-${postId}`) {
      menu.classList.remove("show");
    }
  });

  // Toggle the current dropdown
  dropdown.classList.toggle("show");
};

// Close dropdowns when clicking elsewhere
document.addEventListener("click", function (event) {
  if (!event.target.closest(".post-options-btn")) {
    document.querySelectorAll(".post-dropdown-menu.show").forEach((menu) => {
      menu.classList.remove("show");
    });
  }
});

// Show edit post modal
window.showEditPostModal = async function (postId) {
  const topicId = getTopicIdFromUrl();
  const posts = JSON.parse(localStorage.getItem("posts_" + topicId) || "[]");
  const post = posts.find((p) => p.id === postId);

  if (!post) {
    showNotification("Post not found", true);
    return;
  }

  // Populate the modal with post data
  document.getElementById("modalTitle").textContent = "Edit Post";
  document.getElementById("postTitle").value = post.title;
  document.getElementById("postContent").value = post.content;
  document.getElementById("postId").value = postId;
  document.getElementById("isEdit").value = "true";
  document.getElementById("savePostBtn").textContent = "Save Changes";

  // Show the modal
  document.getElementById("modalBackdrop").classList.add("active");
};

// Show delete confirmation
window.showDeleteConfirmation = function (postId) {
  document.getElementById("confirmationBackdrop").style.display = "block";
  document.getElementById("deleteConfirmation").style.display = "block";

  // Set up confirmation buttons
  document.getElementById("cancelDeleteBtn").onclick = hideDeleteConfirmation;
  document.getElementById("confirmDeleteBtn").onclick = async function () {
    try {
      const topicId = getTopicIdFromUrl();
      await deletePost(topicId, postId);
      hideDeleteConfirmation();
      renderPosts();
      showNotification("Post deleted successfully");

      // Reload topic to update stats
      const topic = await getTopicById(topicId);
      renderTopicHeader(topic);
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

// Modal logic
const createPostBtn = document.getElementById("createPostBtn");
const modalBackdrop = document.getElementById("modalBackdrop");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");
const postForm = document.getElementById("postForm");

createPostBtn.onclick = () => {
  document.getElementById("modalTitle").textContent = "Create New Post";
  document.getElementById("postId").value = "";
  document.getElementById("isEdit").value = "false";
  document.getElementById("savePostBtn").textContent = "Post";
  document.getElementById("postForm").reset();
  modalBackdrop.classList.add("active");
};

closeModalBtn.onclick = cancelModalBtn.onclick = () => {
  modalBackdrop.classList.remove("active");
  postForm.reset();
};

modalBackdrop.onclick = (e) => {
  if (e.target === modalBackdrop) {
    modalBackdrop.classList.remove("active");
    postForm.reset();
  }
};

// Post form submit (for both Create and Edit)
postForm.onsubmit = async function (e) {
  e.preventDefault();
  const topicId = getTopicIdFromUrl();
  const postTitle = document.getElementById("postTitle").value.trim();
  const postContent = document.getElementById("postContent").value.trim();
  const isEdit = document.getElementById("isEdit").value === "true";
  const postId = document.getElementById("postId").value;

  if (!postTitle || !postContent) {
    showNotification("Title and content are required", true);
    return;
  }

  try {
    if (isEdit) {
      // Edit existing post
      await editPost(topicId, postId, {
        title: postTitle,
        content: postContent,
      });
      showNotification("Post updated successfully");
    } else {
      // Create new post
      await createPost(topicId, {
        title: postTitle,
        content: postContent,
        author: CURRENT_SESSION.user,
      });
      showNotification("Post created successfully");
    }

    modalBackdrop.classList.remove("active");
    postForm.reset();

    // Reload topic to update stats
    const topic = await getTopicById(topicId);
    renderTopicHeader(topic);
    renderPosts();
  } catch (error) {
    showNotification(error.message, true);
  }
};

// Sort filter handler
document.getElementById("sortFilter").addEventListener("change", function (e) {
  currentSort = e.target.value;
  currentPage = 1; // Reset to first page when changing sort
  renderPosts();
});

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

// Sidebar toggle functionality
function initializeSidebar() {
  document.getElementById("menuToggle").addEventListener("click", function () {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("mainContent").classList.toggle("shifted");
  });
}

// Function to handle profile click
window.goToProfile = function () {
  window.location.href = "profile.html";
};

// Initial page load
(async function () {
  const topicId = getTopicIdFromUrl();
  if (!topicId) {
    showNotification("No topic ID provided", true);
    return goBackToForum();
  }

  const topic = await getTopicById(topicId);
  if (!topic) {
    showNotification("Topic not found", true);
    return goBackToForum();
  }

  renderTopicHeader(topic);
  renderPosts();

  // Set user avatar in sidebar
  document.querySelector(".user-avatar").textContent = "DP";

  // Initialize theme and sidebar
  initializeTheme();
  initializeSidebar();

  // Keep sidebar closed by default
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("mainContent").classList.remove("shifted");

  console.log(
    `Topic page loaded for ${CURRENT_SESSION.user} at ${CURRENT_SESSION.utcTime} UTC`
  );
})();
