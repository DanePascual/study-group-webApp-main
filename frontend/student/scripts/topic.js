// frontend/student/scripts/topic.js
// Topic detail page — server-first (uses topicsClient), with localStorage fallback.
// Expects topicsClient to export: getTopic, getTopicPosts, postReply, incrementView, editPost, deletePostApi.
// If the server is unreachable the code falls back to the previous localStorage simulation.
// ✅ FIXED: Uses URL paths (/profile/uid) instead of query strings (?uid=...)

import { auth, db } from "../../config/firebase.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import {
  getTopic as apiGetTopic,
  getTopicPosts as apiGetTopicPosts,
  postReply as apiPostReply,
  incrementView as apiIncrementView,
  editPost as apiEditPost,
  deletePostApi,
} from "./topicsClient.js";

// Utilities
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
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
function getInitials(name) {
  if (!name) return "U";
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase()
    .substring(0, 2);
}
function showNotification(message, isError = false) {
  const existingNotification = document.querySelector(".notification");
  if (existingNotification) existingNotification.remove();
  const notification = document.createElement("div");
  notification.className = `notification ${isError ? "error" : ""}`;
  notification.innerHTML = `
    <i class="bi bi-${isError ? "exclamation-circle" : "check-circle"}"></i>
    ${message}
  `;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.opacity = "0";
    notification.style.transform = "translateX(100%)";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ---- Dynamic session initialization ----
let CURRENT_SESSION = null;
let CURRENT_USER_ID = null;

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
    // Update sidebar client area (defensive). Centralized sidebar.js may overwrite with server profile.
    updateSidebarUserInfo();
    // Theme and sidebar behaviors are handled centrally in sidebar.js.
    initializeTopicPage();
  } else {
    window.location.href = "login.html";
  }
});

// ---- Update sidebar dynamically ----
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

// ---- Main Topic Page Logic ----
function initializeTopicPage() {
  function getTopicIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
  }
  function goBackToForum() {
    window.location.href = "discussion.html";
  }
  window.goBackToForum = goBackToForum;

  // Local-only helpers (previous behavior)
  async function getTopicByIdLocal(topicId) {
    await delay(50);
    const topics = JSON.parse(localStorage.getItem("topics") || "[]");
    const topic = topics.find((t) => t.id == topicId);
    if (topic) {
      const idx = topics.findIndex((t) => t.id == topicId);
      if (idx !== -1) {
        topics[idx].viewCount = (topics[idx].viewCount || 0) + 1;
        localStorage.setItem("topics", JSON.stringify(topics));
      }
    }
    return topic;
  }
  async function getPostsLocal(topicId, page = 1, limit = 5, sort = "newest") {
    await delay(50);
    let posts = JSON.parse(localStorage.getItem("posts_" + topicId) || "[]");
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
    const total = posts.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedPosts = posts.slice(startIndex, endIndex);
    return {
      posts: paginatedPosts,
      pagination: { page, limit, total, totalPages },
    };
  }
  async function createPostLocal(topicId, { title, content, author }) {
    await delay(100);
    const posts = JSON.parse(localStorage.getItem("posts_" + topicId) || "[]");
    const now = new Date();
    const post = {
      id: Date.now().toString(),
      title,
      content,
      author: author || (CURRENT_SESSION && CURRENT_SESSION.user),
      authorId: CURRENT_USER_ID,
      created: now.toISOString(),
      lastEdited: null,
    };
    posts.unshift(post);
    localStorage.setItem("posts_" + topicId, JSON.stringify(posts));
    // Update topic metadata locally
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

  // Server-backed functions with fallback
  async function getTopicById(topicId) {
    // Try server first
    try {
      const resp = await apiGetTopic(topicId);
      // Support both shapes: { topic: {...} } or direct topic object
      const topic = resp && resp.topic ? resp.topic : resp;
      // increment server-side view (best-effort)
      try {
        await apiIncrementView(topicId);
      } catch (e) {
        // ignore increment errors
      }
      return topic;
    } catch (err) {
      // fallback to local
      console.warn("Server topic fetch failed, falling back to local:", err);
      const local = await getTopicByIdLocal(topicId);
      return local;
    }
  }

  async function getPosts(topicId, page = 1, limit = 5, sort = "newest") {
    try {
      const resp = await apiGetTopicPosts(topicId);
      // expect { posts: [...] } or direct array
      const posts = resp && resp.posts ? resp.posts : resp;
      // apply client-side pagination/sort if server doesn't provide pagination
      if (!resp.pagination) {
        // simple client-side handling: slice
        let sorted = posts.slice();
        switch (sort) {
          case "newest":
            sorted.sort((a, b) => new Date(b.created) - new Date(a.created));
            break;
          case "oldest":
            sorted.sort((a, b) => new Date(a.created) - new Date(b.created));
            break;
          case "title":
            sorted.sort((a, b) => a.title.localeCompare(b.title));
            break;
        }
        const total = sorted.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedPosts = sorted.slice(startIndex, endIndex);
        return {
          posts: paginatedPosts,
          pagination: { page, limit, total, totalPages },
        };
      }
      return resp;
    } catch (err) {
      console.warn("Server posts fetch failed, falling back to local:", err);
      return getPostsLocal(topicId, page, limit, sort);
    }
  }

  async function createPost(topicId, { title, content, author }) {
    // Try server first. We send both title and content — backend should accept both.
    try {
      // If apiPostReply expects only content, adjust backend later.
      const serverResp = await apiPostReply(topicId, { title, content });
      // serverResp expected to return created post or { post: {...} }
      const post = serverResp && serverResp.post ? serverResp.post : serverResp;
      // refresh topic header/posts after creating
      return post;
    } catch (err) {
      console.warn("Server post create failed, falling back to local:", err);
      return createPostLocal(topicId, { title, content, author });
    }
  }

  // Main page global state
  let currentPage = 1;
  let currentSort = "newest";

  // Render topic header
  async function renderTopicHeader(topic) {
    document.getElementById("topicTitle").textContent = topic.title;
    document.getElementById("topicAuthor").innerHTML = `
      <a href="/profile/${encodeURIComponent(
        topic.authorId || topic.userId
      )}" style="color: inherit; text-decoration: none; cursor: pointer;">
        ${escapeHtml(topic.author || "Anonymous")}
      </a>
    `;
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
    const tagsContainer = document.getElementById("topicTags");
    if (topic.tags && topic.tags.length) {
      tagsContainer.innerHTML = topic.tags
        .map((tag) => `<span class="topic-tag">${escapeHtml(tag)}</span>`)
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
            const isAuthor = String(post.authorId) === String(CURRENT_USER_ID);
            const initials = getInitials(post.author);

            // Create avatar HTML with a completely different structure
            let avatarHtml;
            if (post.author_avatar) {
              // For posts with avatar URLs, use a background-image style instead
              avatarHtml = `<div class="author-avatar" style="background-image: url('${post.author_avatar}'); background-size: cover; background-position: center;"></div>`;
            } else {
              // For posts without avatar URLs, use the existing initials approach
              avatarHtml = `<div class="author-avatar">${escapeHtml(
                initials
              )}</div>`;
            }

            return `
            <div class="post-card">
              <div class="post-card-content">
                <div class="post-card-header">
                  <div class="post-title-container">
                    <div class="post-title">${escapeHtml(post.title)}</div>
                    <div class="post-author">
                      ${avatarHtml}
                      <span><a href="/profile/${encodeURIComponent(
                        post.authorId || post.userId
                      )}" style="color: inherit; text-decoration: none; cursor: pointer;">${escapeHtml(
              post.author || "Anonymous"
            )}</a></span>
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
                <div class="post-preview">${escapeHtml(
                  (post.content || "").substring(0, 200)
                )}${(post.content || "").length > 200 ? "..." : ""}</div>
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
                  <a href="post.html?topic=${encodeURIComponent(
                    topicId
                  )}&post=${encodeURIComponent(post.id)}" class="view-post-btn">
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
    const { page, totalPages } = pagination || { page: 1, totalPages: 1 };
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
        }" onclick="changePage(${i})">${i}</button>
      `;
    }
    paginationHTML += `
      <button class="pagination-btn ${page === totalPages ? "disabled" : ""}" ${
      page === totalPages ? "disabled" : ""
    } onclick="changePage(${page + 1})">
        <i class="bi bi-chevron-right"></i>
      </button>
    `;
    paginationControls.innerHTML = paginationHTML;
  }

  window.changePage = function (page) {
    currentPage = page;
    renderPosts();
    document.getElementById("postGrid").scrollIntoView({ behavior: "smooth" });
  };

  // Toggle post dropdown menu
  window.togglePostOptions = function (event, postId) {
    event.stopPropagation();
    const dropdown = document.getElementById(`dropdown-${postId}`);
    document.querySelectorAll(".post-dropdown-menu.show").forEach((menu) => {
      if (menu.id !== `dropdown-${postId}`) menu.classList.remove("show");
    });
    dropdown.classList.toggle("show");
  };
  document.addEventListener("click", function (event) {
    if (!event.target.closest(".post-options-btn")) {
      document.querySelectorAll(".post-dropdown-menu.show").forEach((menu) => {
        menu.classList.remove("show");
      });
    }
  });

  // Show edit post modal — robust and ownership-checked; server-first if needed
  window.showEditPostModal = async function (postId) {
    try {
      const topicId = getTopicIdFromUrl();
      const postsKey = "posts_" + topicId;
      let posts = [];
      try {
        posts = JSON.parse(localStorage.getItem(postsKey) || "[]");
      } catch (e) {
        posts = [];
      }

      // Robust id comparison (stringify both)
      let post = posts.find((p) => String(p.id) === String(postId));

      // If post not found locally, attempt to fetch from server posts (if available)
      if (!post) {
        try {
          const resp = await apiGetTopicPosts(topicId);
          const serverPosts = resp && resp.posts ? resp.posts : resp;
          post = (serverPosts || []).find(
            (p) => String(p.id) === String(postId)
          );
        } catch (e) {
          // ignore server fetch errors — we'll show a clear message below
        }
      }

      if (!post) {
        // If not found locally or on server
        showNotification(
          "Post not found locally. Server-hosted posts must be edited through the server (not supported in offline/local fallback).",
          true
        );
        console.debug("showEditPostModal: post not found", {
          topicId,
          postId,
          postsKey,
          posts,
        });
        return;
      }

      // Ownership check: only allow author (or admin in future)
      if (String(post.authorId) !== String(CURRENT_USER_ID)) {
        showNotification("You can only edit your own posts.", true);
        return;
      }

      // Populate edit modal with post data
      document.getElementById("modalTitle").textContent = "Edit Post";
      document.getElementById("postTitle").value = post.title || "";
      document.getElementById("postContent").value = post.content || "";
      document.getElementById("postId").value = post.id;
      document.getElementById("isEdit").value = "true";
      document.getElementById("savePostBtn").textContent = "Save Changes";
      document.getElementById("modalBackdrop").classList.add("active");
    } catch (err) {
      console.error("showEditPostModal error:", err);
      showNotification(
        "Could not open edit modal. Check console for details.",
        true
      );
    }
  };

  // Show delete confirmation — server-first where possible
  window.showDeleteConfirmation = function (postId) {
    try {
      const topicId = getTopicIdFromUrl();
      const postsKey = "posts_" + topicId;
      let posts = [];
      try {
        posts = JSON.parse(localStorage.getItem(postsKey) || "[]");
      } catch (e) {
        posts = [];
      }
      const postLocal = posts.find((p) => String(p.id) === String(postId));

      if (!postLocal) {
        // If post isn't local we still allow the user to attempt server deletion when they confirm.
        // Show confirmation and proceed to call server delete on confirm.
        document.getElementById("confirmationBackdrop").style.display = "block";
        document.getElementById("deleteConfirmation").style.display = "block";
        document.getElementById("cancelDeleteBtn").onclick =
          hideDeleteConfirmation;
        document.getElementById("confirmDeleteBtn").onclick =
          async function () {
            try {
              const topicIdInner = getTopicIdFromUrl();
              // Try server delete first
              try {
                await deletePostApi(topicIdInner, postId);
                hideDeleteConfirmation();
                showNotification("Post deleted on server");
              } catch (serverErr) {
                // If server returns 403/404 show appropriate message, otherwise fallback to local if desired
                if (serverErr && serverErr.status === 403) {
                  throw new Error(
                    "You are not allowed to delete this post (server)"
                  );
                } else if (serverErr && serverErr.status === 404) {
                  throw new Error("Post not found on server");
                } else {
                  console.warn(
                    "Server delete failed, falling back to local if available:",
                    serverErr
                  );
                  // fallback local attempt (may throw)
                  await deletePost(topicIdInner, postId);
                  showNotification("Post deleted locally (offline fallback)");
                }
              }
              // Refresh UI
              await renderPosts();
              const topic = await getTopicById(topicIdInner);
              if (topic) renderTopicHeader(topic);
            } catch (error) {
              hideDeleteConfirmation();
              showNotification(error.message, true);
            }
          };
        return;
      }

      // If local post exists, enforce ownership then show confirmation which deletes locally (or try server if desired)
      if (String(postLocal.authorId) !== String(CURRENT_USER_ID)) {
        showNotification("You can only delete your own posts.", true);
        return;
      }

      document.getElementById("confirmationBackdrop").style.display = "block";
      document.getElementById("deleteConfirmation").style.display = "block";
      document.getElementById("cancelDeleteBtn").onclick =
        hideDeleteConfirmation;
      document.getElementById("confirmDeleteBtn").onclick = async function () {
        try {
          const topicIdInner = getTopicIdFromUrl();
          // Prefer server delete when available
          try {
            await deletePostApi(topicIdInner, postId);
            hideDeleteConfirmation();
            showNotification("Post deleted on server");
          } catch (serverErr) {
            console.warn(
              "Server delete failed, falling back to local:",
              serverErr
            );
            await deletePost(topicIdInner, postId);
            hideDeleteConfirmation();
            showNotification("Post deleted locally");
          }
          await renderPosts();
          const topic = await getTopicById(topicIdInner);
          if (topic) renderTopicHeader(topic);
        } catch (error) {
          hideDeleteConfirmation();
          showNotification(error.message, true);
        }
      };
    } catch (err) {
      console.error("showDeleteConfirmation error:", err);
      showNotification("Could not show delete confirmation.", true);
    }
  };
  function hideDeleteConfirmation() {
    document.getElementById("confirmationBackdrop").style.display = "none";
    document.getElementById("deleteConfirmation").style.display = "none";
  }

  // Local edit/delete functions reuse existing local ones (they operate on localStorage)
  async function editPost(topicId, postId, { title, content }) {
    // try server-side edit if endpoint exists; fallback local
    await delay(100);
    // Prefer server first
    try {
      await apiEditPost(topicId, postId, { title, content });
      return; // success (server updated) - caller will refresh UI
    } catch (serverErr) {
      // If server returns 403/404 propagate friendly error; otherwise fallback to local
      if (serverErr && serverErr.status === 403) {
        throw new Error("You are not allowed to edit this post (server)");
      } else if (serverErr && serverErr.status === 404) {
        throw new Error("Post not found on server");
      }
      // fallback to local edit
    }

    const postsKey = "posts_" + topicId;
    let posts = JSON.parse(localStorage.getItem(postsKey) || "[]");
    const idx = posts.findIndex((p) => String(p.id) === String(postId));
    if (idx === -1) throw new Error("Post not found");
    if (String(posts[idx].authorId) !== String(CURRENT_USER_ID))
      throw new Error("You can only edit your own posts");
    posts[idx] = {
      ...posts[idx],
      title,
      content,
      lastEdited: new Date().toISOString(),
    };
    localStorage.setItem(postsKey, JSON.stringify(posts));
    return posts[idx];
  }

  async function deletePost(topicId, postId) {
    await delay(100);
    // Attempt server delete first
    try {
      await deletePostApi(topicId, postId);
      return true;
    } catch (serverErr) {
      // If server returns 403/404, bubble meaningful errors; otherwise continue to local fallback
      if (serverErr && serverErr.status === 403) {
        throw new Error("You are not allowed to delete this post (server)");
      } else if (serverErr && serverErr.status === 404) {
        throw new Error("Post not found on server");
      }
      // fallback to local delete
    }

    const postsKey = "posts_" + topicId;
    let posts = JSON.parse(localStorage.getItem(postsKey) || "[]");
    const idx = posts.findIndex((p) => String(p.id) === String(postId));
    if (idx === -1) throw new Error("Post not found");
    if (String(posts[idx].authorId) !== String(CURRENT_USER_ID))
      throw new Error("You can only delete your own posts");
    posts.splice(idx, 1);
    localStorage.setItem(postsKey, JSON.stringify(posts));
    // Update topic post count locally
    let topics = JSON.parse(localStorage.getItem("topics") || "[]");
    const topicIdx = topics.findIndex((t) => t.id == topicId);
    if (topicIdx !== -1) {
      topics[topicIdx].postCount = Math.max(
        0,
        (topics[topicIdx].postCount || 0) - 1
      );
      localStorage.setItem("topics", JSON.stringify(topics));
    }
    localStorage.removeItem("comments_" + topicId + "_" + postId);
    return true;
  }

  // Modal logic wiring
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
        // Use unified editPost which will attempt server then fallback local
        await editPost(topicId, postId, {
          title: postTitle,
          content: postContent,
        });
        showNotification("Post updated successfully");
      } else {
        // Create: prefer server, fallback local
        try {
          await createPost(topicId, {
            title: postTitle,
            content: postContent,
            author: CURRENT_SESSION.user,
          });
          showNotification("Post created successfully");
        } catch (serverErr) {
          // fallback to local
          await createPostLocal(topicId, {
            title: postTitle,
            content: postContent,
            author: CURRENT_SESSION.user,
          });
          showNotification("Post created locally (offline fallback)");
        }
      }
      modalBackdrop.classList.remove("active");
      postForm.reset();
      const topic = await getTopicById(topicId);
      if (topic) await renderTopicHeader(topic);
      await renderPosts();
    } catch (error) {
      showNotification(error.message, true);
    }
  };

  // Sort handler
  const sortFilterEl = document.getElementById("sortFilter");
  if (sortFilterEl) {
    sortFilterEl.addEventListener("change", function (e) {
      currentSort = e.target.value;
      currentPage = 1;
      renderPosts();
    });
  }

  // Initial page load logic
  (async function () {
    const topicId = getTopicIdFromUrl();
    if (!topicId) {
      showNotification("No topic ID provided", true);
      return goBackToForum();
    }
    // Try to increment view (best-effort)
    try {
      await apiIncrementView(topicId);
    } catch (err) {
      // ignore
    }
    const topic = await getTopicById(topicId);
    if (!topic) {
      showNotification("Topic not found", true);
      return goBackToForum();
    }
    await renderTopicHeader(topic);
    await renderPosts();
    console.log(
      `Topic page loaded for ${CURRENT_SESSION && CURRENT_SESSION.user} at ${
        CURRENT_SESSION && CURRENT_SESSION.datetime
      }`
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
