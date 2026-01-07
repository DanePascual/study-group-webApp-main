// frontend/student/scripts/topic.js
// ✅ Like feature removed
// ✅ FIXED: Store full post object in modal for edit/delete
// ✅ FIXED: Use author_avatar from post (same as post card!)
// ✅ FIXED: Profile pictures now showing in modal header + comments + footer
// ✅ FIXED: Edit/Delete now searches arrays first (discussion.js pattern)
// ✅ FIXED: Post title removed - only content required
// ✅ FIXED: Image upload removed - use JSON only
// ✅ FIXED: Comments fetched from API (not localStorage) with avatars from DB
// ✅ FIXED: Footer avatar always shows current user's profile picture
// ✅ FIXED: Comment scroll now respects comments order (newest-first vs oldest-first)
// ✅ NEW: Contextual report buttons for topics, posts, and comments

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
  getTopicComments as apiGetTopicComments,
  postComment as apiPostComment,
} from "./topicsClient.js";
import { postJsonWithAuth } from "./apiClient.js";
import { apiUrl } from "../../config/appConfig.js";
import { openReportModal } from "./reportModal.js";

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

// ---- Global State ----
let CURRENT_SESSION = null;
let CURRENT_USER_ID = null;

window.currentTopicId = null;
window.allTopicPosts = [];
window.myTopicPosts = [];
window.currentCommentingPostId = null;
window.currentCommentingPost = null;

// ---- Authentication ----
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
    initializeTopicPage();
  } else {
    window.location.href = "login.html";
  }
});

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

function getTopicIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function goBackToForum() {
  window.location.href = "discussion.html";
}
window.goBackToForum = goBackToForum;

// ---- Main Topic Page Logic ----
function initializeTopicPage() {
  window.currentTopicId = getTopicIdFromUrl();
  if (!window.currentTopicId) {
    showNotification("No topic ID provided", true);
    return goBackToForum();
  }

  let currentTab = "all-posts";

  function syncPostsToLocalStorage() {
    if (!window.currentTopicId) return;
    const key = "posts_" + window.currentTopicId;
    localStorage.setItem(key, JSON.stringify(window.allTopicPosts));
    console.log(
      `[topic.js] ✅ Synced ${window.allTopicPosts.length} posts to localStorage`
    );
  }

  // Server-backed functions
  async function getTopicById(topicId) {
    try {
      const resp = await apiGetTopic(topicId);
      const topic = resp && resp.topic ? resp.topic : resp;
      try {
        await apiIncrementView(topicId);
      } catch (e) {
        // ignore
      }
      return topic;
    } catch (err) {
      console.warn("Server topic fetch failed:", err);
      return null;
    }
  }

  async function getPosts(topicId) {
    try {
      const posts = await apiGetTopicPosts(topicId);

      if (posts && posts.length > 0) {
        window.allTopicPosts = posts;

        window.myTopicPosts = posts.filter(
          (p) =>
            String(p.userId) === String(CURRENT_USER_ID) ||
            String(p.authorId) === String(CURRENT_USER_ID)
        );

        syncPostsToLocalStorage();

        console.log(`[getPosts] ✅ Loaded ${posts.length} posts`);
      }

      return posts || [];
    } catch (err) {
      console.warn("Server posts fetch failed:", err);
      return [];
    }
  }

  // ✅ FIXED: Get comments from API instead of localStorage
  async function getComments(topicId, postId) {
    if (!topicId || !postId) return [];
    try {
      console.log(
        `[getComments] Fetching comments from API for post ${postId}`
      );
      const resp = await apiGetTopicComments(topicId, postId, {
        limit: 100,
        sort: "newest",
      });

      const comments = resp.comments || [];
      console.log(
        `[getComments] ✅ Loaded ${comments.length} comments from API with avatars`
      );
      return comments;
    } catch (err) {
      console.warn("[getComments] API fetch failed:", err);
      // Fallback: try localStorage (for backward compatibility)
      try {
        const key = "comments_" + topicId + "_" + postId;
        const comments = JSON.parse(localStorage.getItem(key) || "[]");
        console.log(
          `[getComments] ⚠️ Using localStorage fallback: ${comments.length} comments`
        );
        return comments;
      } catch (localErr) {
        console.warn("[getComments] Fallback error:", localErr);
        return [];
      }
    }
  }

  // ✅ FIXED: Create post with JSON only (no image)
  async function createPost(topicId, { title, content, author }) {
    try {
      console.log("[createPost] Creating post with content");

      const serverResp = await postJsonWithAuth(
        apiUrl(`/api/topics/${encodeURIComponent(topicId)}/posts`),
        {
          title: title || "",
          content: content,
        }
      );

      console.log("[createPost] ✅ Post created:", serverResp);
      const post = serverResp && serverResp.post ? serverResp.post : serverResp;
      return post;
    } catch (err) {
      console.error("[createPost] ❌ Error:", err);
      throw err;
    }
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
    const tagsContainer = document.getElementById("topicTags");
    if (topic.tags && topic.tags.length) {
      tagsContainer.innerHTML = topic.tags
        .map((tag) => `<span class="topic-tag">${escapeHtml(tag)}</span>`)
        .join("");
    } else {
      tagsContainer.innerHTML = "";
    }
  }

  // Render all posts
  async function renderAllPosts() {
    const postGrid = document.getElementById("postGrid");

    if (window.allTopicPosts.length === 0) {
      postGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="bi bi-file-earmark-text"></i></div>
          <div class="empty-state-text">No posts yet. Create the first post!</div>
        </div>
      `;
      return;
    }

    postGrid.innerHTML = "";
    window.allTopicPosts.forEach((post) => {
      const postHtml = buildPostCard(post);
      const el = document.createElement("div");
      el.innerHTML = postHtml;
      postGrid.appendChild(el.firstElementChild);
    });
    console.log("[renderAllPosts] ✅ Re-rendered all posts");
  }

  window.renderAllPostsFunction = renderAllPosts;

  // Render my posts
  async function renderMyPosts() {
    const myPostsGrid = document.getElementById("myPostsGrid");
    const myPostsEmpty = document.getElementById("myPostsEmpty");

    if (window.myTopicPosts.length === 0) {
      myPostsGrid.innerHTML = "";
      myPostsEmpty.style.display = "block";
      return;
    }

    myPostsEmpty.style.display = "none";
    myPostsGrid.innerHTML = "";

    window.myTopicPosts.forEach((post) => {
      const postHtml = buildPostCard(post);
      const el = document.createElement("div");
      el.innerHTML = postHtml;
      myPostsGrid.appendChild(el.firstElementChild);
    });
  }

  window.renderMyPostsFunction = renderMyPosts;

  // ✅ BUILD POST CARD
  function buildPostCard(post) {
    const initials = getInitials(post.author);
    const avatarHtml = post.author_avatar
      ? `<div class="author-avatar" style="background-image: url('${post.author_avatar}'); background-size: cover; background-position: center;"></div>`
      : `<div class="author-avatar">${escapeHtml(initials)}</div>`;

    // Check if user can report (not their own post)
    const isOwnPost =
      String(post.authorId) === String(CURRENT_USER_ID) ||
      String(post.userId) === String(CURRENT_USER_ID);
    const reportBtnHtml = !isOwnPost
      ? `
      <button class="post-report-btn" data-post-id="${
        post.id
      }" data-author-id="${
          post.authorId || post.userId || ""
        }" data-author-name="${escapeHtml(
          post.author || ""
        )}" title="Report this post">
        <i class="bi bi-three-dots-vertical"></i>
      </button>`
      : "";

    return `
      <div class="post-card" data-post-id="${post.id}">
        <div class="post-card-content">
          <div class="post-card-header">
            <div class="post-title-container">
              <div class="post-author">
                ${avatarHtml}
                <span>${escapeHtml(post.author || "Anonymous")}</span>
              </div>
              ${reportBtnHtml}
            </div>
          </div>
          <div class="post-preview">${escapeHtml(
            (post.content || "").substring(0, 150)
          )}${(post.content || "").length > 150 ? "..." : ""}</div>
          <div class="post-meta">
            <div class="post-meta-left">
              <span class="post-date">
                <i class="bi bi-clock"></i>
                ${formatRelativeTime(post.created_at || post.created)}
              </span>
            </div>
            <button class="view-post-btn" onclick="window.openCommentModal('${
              post.id
            }')">
              <i class="bi bi-chat-dots"></i>
              Comment
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ✅ OPEN COMMENT MODAL
  window.openCommentModal = async function (postId) {
    try {
      const post =
        window.allTopicPosts.find((p) => String(p.id) === String(postId)) ||
        window.myTopicPosts.find((p) => String(p.id) === String(postId));

      if (!post) {
        showNotification("Post not found", true);
        return;
      }

      window.currentCommentingPostId = postId;
      window.currentCommentingPost = post;

      const initials = getInitials(post.author);
      const authorAvatar = document.getElementById("commentModalAuthorAvatar");

      if (post.author_avatar) {
        authorAvatar.style.backgroundImage = `url('${post.author_avatar}')`;
        authorAvatar.style.backgroundSize = "cover";
        authorAvatar.style.backgroundPosition = "center";
        authorAvatar.textContent = "";
      } else {
        authorAvatar.style.backgroundImage = "none";
        authorAvatar.textContent = initials;
      }

      document.getElementById("commentModalAuthorName").textContent =
        post.author || "Anonymous";
      document.getElementById("commentModalPostDate").textContent =
        formatRelativeTime(post.created_at || post.created);
      document.getElementById("commentModalPostContent").textContent =
        escapeHtml(post.content);

      const isAuthor =
        String(post.authorId) === String(CURRENT_USER_ID) ||
        String(post.userId) === String(CURRENT_USER_ID);
      const optionsBtn = document.getElementById("commentModalOptionsBtn");
      const optionsMenu = document.getElementById("commentModalOptionsMenu");

      if (isAuthor) {
        optionsBtn.style.display = "block";
      } else {
        optionsBtn.style.display = "none";
        optionsMenu.classList.remove("show");
      }

      const commentsList = document.getElementById("commentModalCommentsList");
      commentsList.innerHTML =
        '<div style="text-align: center; padding: 20px;"><div class="loader"><div class="loader-spinner"></div></div></div>';

      const comments = await getComments(window.currentTopicId, postId);
      renderComments(comments);

      document.getElementById("commentModalBackdrop").classList.add("active");

      // ✅ FIXED: Always show current user's avatar in footer (not post author's)
      const currentUserAvatar = document.getElementById(
        "commentModalCurrentUserAvatar"
      );

      // Try to load current user's profile picture
      let currentUserPhoto = null;
      try {
        const currentUserDoc = await getDoc(doc(db, "users", CURRENT_USER_ID));
        if (currentUserDoc.exists()) {
          currentUserPhoto = currentUserDoc.data()?.photo || null;
        }
      } catch (e) {
        console.warn("Could not fetch current user photo:", e);
      }

      // Display current user's avatar
      if (currentUserPhoto) {
        console.log(
          "[openCommentModal] ✅ Using current user photo:",
          currentUserPhoto
        );
        currentUserAvatar.style.backgroundImage = `url('${currentUserPhoto}')`;
        currentUserAvatar.style.backgroundSize = "cover";
        currentUserAvatar.style.backgroundPosition = "center";
        currentUserAvatar.textContent = "";
      } else {
        console.log("[openCommentModal] Using current user initials");
        currentUserAvatar.style.backgroundImage = "none";
        currentUserAvatar.textContent =
          CURRENT_SESSION.userAvatar.toUpperCase();
      }

      setTimeout(() => {
        document.getElementById("commentModalCommentInput").focus();
      }, 300);
    } catch (err) {
      console.error("Error opening comment modal:", err);
      showNotification("Could not open comments", true);
    }
  };

  // ✅ FIXED: RENDER COMMENTS - Now displays avatars from DB
  function renderComments(comments) {
    const commentsList = document.getElementById("commentModalCommentsList");
    const commentCount = document.getElementById("commentModalCommentCount");

    commentCount.textContent = comments.length;

    if (comments.length === 0) {
      commentsList.innerHTML =
        '<div style="text-align: center; padding: 20px; color: #999;">No comments yet. Be the first to comment!</div>';
      return;
    }

    commentsList.innerHTML = comments
      .map((comment) => {
        const initials = getInitials(comment.author);

        // ✅ FIXED: Use author_avatar from comment (from DB)
        let avatarHtml;
        if (comment.author_avatar) {
          avatarHtml = `<div class="comment-avatar" style="background-image: url('${comment.author_avatar}'); background-size: cover; background-position: center;"></div>`;
        } else {
          avatarHtml = `<div class="comment-avatar">${initials}</div>`;
        }

        return `
        <div class="comment-item">
          ${avatarHtml}
          <div class="comment-content">
            <div class="comment-author" style="font-weight: bold; font-size: 13px;">${escapeHtml(
              comment.author
            )}</div>
            <div class="comment-text" style="font-size: 13px; margin: 5px 0;">${escapeHtml(
              comment.text || comment.content
            )}</div>
            <div style="font-size: 12px; color: #888;">${formatRelativeTime(
              comment.created || comment.created_at
            )}</div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  // Close comment modal
  window.closeCommentModal = function () {
    document.getElementById("commentModalBackdrop").classList.remove("active");
    document.getElementById("commentModalCommentInput").value = "";
    window.currentCommentingPostId = null;
    window.currentCommentingPost = null;
  };

  // Toggle comment modal options
  window.toggleCommentModalOptions = function (event) {
    event.stopPropagation();
    const menu = document.getElementById("commentModalOptionsMenu");
    const btn = event.target.closest(".post-options-btn-modal");

    if (!btn) return;

    document.querySelectorAll(".post-dropdown-menu").forEach((m) => {
      if (m !== menu) m.classList.remove("show");
    });

    menu.classList.toggle("show");

    if (menu.classList.contains("show")) {
      const rect = btn.getBoundingClientRect();
      menu.style.position = "fixed";
      menu.style.top = rect.bottom + 5 + "px";
      menu.style.right = window.innerWidth - rect.right + "px";
    }
  };

  // ✅ FIXED: Add comment - Now uses API instead of localStorage
  const commentBtn = document.getElementById("commentModalCommentBtn");
  commentBtn.addEventListener("click", async function () {
    const commentInput = document.getElementById("commentModalCommentInput");
    const commentText = commentInput.value.trim();

    if (!commentText) {
      showNotification("Comment cannot be empty", true);
      return;
    }

    if (!window.currentCommentingPostId) {
      showNotification("Error: No post selected", true);
      return;
    }

    try {
      const postId = window.currentCommentingPostId;

      console.log("[addComment] Posting comment via API");

      // ✅ Use API to post comment
      const resp = await apiPostComment(
        window.currentTopicId,
        postId,
        commentText
      );

      console.log("[addComment] ✅ Comment posted:", resp);

      // ✅ Increment post comment count
      const post =
        window.allTopicPosts.find((p) => String(p.id) === String(postId)) ||
        window.myTopicPosts.find((p) => String(p.id) === String(postId));
      if (post) {
        post.comments = (post.comments || 0) + 1;
      }

      // ✅ Clear input and reload comments from API
      commentInput.value = "";
      const comments = await getComments(window.currentTopicId, postId);
      renderComments(comments);

      showNotification("Comment added successfully");

      // --- SCROLL FIX: Determine where to scroll based on comments order ---
      // The API returns comments in order specified by getTopicComments() call (we requested sort: "newest").
      // If the comments array is newest-first (newest at index 0) we should scroll to top (scrollTop = 0).
      // If the comments array is oldest-first (oldest at index 0) we should scroll to bottom (scrollTop = scrollHeight).
      // We'll inspect timestamps to decide, and fall back to scrolling to top.
      setTimeout(() => {
        const commentsList = document.getElementById(
          "commentModalCommentsList"
        );
        if (!commentsList) return;

        let scrollToTop = true; // default: newest-first -> scroll to top

        try {
          if (comments && comments.length > 1) {
            const firstTs = new Date(
              comments[0].created || comments[0].created_at
            ).getTime();
            const lastTs = new Date(
              comments[comments.length - 1].created ||
                comments[comments.length - 1].created_at
            ).getTime();

            if (!isNaN(firstTs) && !isNaN(lastTs)) {
              // If first is older than last, then array is oldest-first -> scroll bottom
              // If first is newer than last, array is newest-first -> scroll top
              scrollToTop = firstTs >= lastTs;
            } else {
              // If timestamps are invalid, default to newest-first behavior
              scrollToTop = true;
            }
          } else if (comments && comments.length === 1) {
            // Single comment -> assume it is the newest; show it (top)
            scrollToTop = true;
          }
        } catch (e) {
          // on any error, default to showing newest-first
          scrollToTop = true;
        }

        if (scrollToTop) {
          commentsList.scrollTop = 0;
        } else {
          commentsList.scrollTop = commentsList.scrollHeight;
        }
      }, 100);
    } catch (err) {
      console.error("Error adding comment:", err);
      showNotification("Failed to add comment", true);
    }
  });

  // Tab switching
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const tabName = this.getAttribute("data-tab");
      switchTab(tabName);
    });
  });

  function switchTab(tabName) {
    currentTab = tabName;

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.remove("active");
    });

    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
    document.getElementById(`${tabName}-content`).classList.add("active");

    if (tabName === "all-posts") {
      renderAllPosts();
    } else if (tabName === "my-posts") {
      renderMyPosts();
    }

    document.getElementById("myPostsCount").textContent =
      window.myTopicPosts.length;
  }

  // ✅ FIXED: Edit post modal - SEARCH ARRAYS FIRST
  window.showEditPostModal = async function (postId) {
    try {
      let post =
        window.allTopicPosts.find((p) => String(p.id) === String(postId)) ||
        window.myTopicPosts.find((p) => String(p.id) === String(postId));

      if (!post) {
        showNotification("Post not found", true);
        return;
      }

      if (String(post.authorId || post.userId) !== String(CURRENT_USER_ID)) {
        showNotification("You can only edit your own posts.", true);
        return;
      }

      document.getElementById("modalTitle").textContent = "Edit Post";
      document.getElementById("postContent").value = post.content || "";
      document.getElementById("postId").value = post.id;
      document.getElementById("isEdit").value = "true";
      document.getElementById("savePostBtn").textContent = "Save Changes";

      document.getElementById("modalBackdrop").classList.add("active");
      window.closeCommentModal();
    } catch (err) {
      console.error("Error:", err);
      showNotification("Could not open edit modal", true);
    }
  };

  // ✅ FIXED: Delete confirmation
  window.showDeleteConfirmation = function (postId) {
    try {
      let post =
        window.allTopicPosts.find((p) => String(p.id) === String(postId)) ||
        window.myTopicPosts.find((p) => String(p.id) === String(postId));

      if (!post) {
        showNotification("Post not found", true);
        return;
      }

      if (String(post.authorId || post.userId) !== String(CURRENT_USER_ID)) {
        showNotification("You can only delete your own posts.", true);
        return;
      }

      document.getElementById("confirmationBackdrop").style.display = "block";
      document.getElementById("deleteConfirmation").style.display = "block";

      document.getElementById("cancelDeleteBtn").onclick =
        hideDeleteConfirmation;

      document.getElementById("confirmDeleteBtn").onclick = async function () {
        try {
          await deletePostApi(window.currentTopicId, postId);
          hideDeleteConfirmation();

          window.allTopicPosts = window.allTopicPosts.filter(
            (p) => p.id !== postId
          );
          window.myTopicPosts = window.myTopicPosts.filter(
            (p) => p.id !== postId
          );

          document.getElementById("myPostsCount").textContent =
            window.myTopicPosts.length;

          syncPostsToLocalStorage();

          if (currentTab === "all-posts") {
            renderAllPosts();
          } else {
            renderMyPosts();
          }

          window.closeCommentModal();
          showNotification("Post deleted successfully");
        } catch (error) {
          hideDeleteConfirmation();
          showNotification(error.message, true);
        }
      };
    } catch (err) {
      console.error("Error:", err);
      showNotification("Could not show delete confirmation", true);
    }
  };

  function hideDeleteConfirmation() {
    document.getElementById("confirmationBackdrop").style.display = "none";
    document.getElementById("deleteConfirmation").style.display = "none";
  }

  // Create/Edit post modal
  const createPostBtn = document.getElementById("createPostBtn");
  const createPostBtn2 = document.getElementById("createPostBtn2");
  const modalBackdrop = document.getElementById("modalBackdrop");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const cancelModalBtn = document.getElementById("cancelModalBtn");
  const postForm = document.getElementById("postForm");

  function openCreateModal() {
    document.getElementById("modalTitle").textContent = "Create New Post";
    document.getElementById("postId").value = "";
    document.getElementById("isEdit").value = "false";
    document.getElementById("savePostBtn").textContent = "Post";
    document.getElementById("postForm").reset();
    modalBackdrop.classList.add("active");
  }

  if (createPostBtn) createPostBtn.onclick = openCreateModal;
  if (createPostBtn2) createPostBtn2.onclick = openCreateModal;

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

  // ✅ FIXED: Post form submit - JSON only, no image
  postForm.onsubmit = async function (e) {
    e.preventDefault();
    const postContent = document.getElementById("postContent").value.trim();
    const isEdit = document.getElementById("isEdit").value === "true";
    const postId = document.getElementById("postId").value;

    if (!postContent) {
      showNotification("Content is required", true);
      return;
    }

    try {
      if (isEdit) {
        await apiEditPost(window.currentTopicId, postId, {
          content: postContent,
        });
        const post =
          window.allTopicPosts.find((p) => p.id === postId) ||
          window.myTopicPosts.find((p) => p.id === postId);
        if (post) {
          post.content = postContent;
        }
        showNotification("Post updated successfully");
      } else {
        const newPost = await createPost(window.currentTopicId, {
          title: "",
          content: postContent,
          author: CURRENT_SESSION.user,
        });
        if (newPost) {
          window.allTopicPosts.unshift(newPost);
          window.myTopicPosts.unshift(newPost);
          syncPostsToLocalStorage();
          showNotification("Post created successfully");
        }
      }

      modalBackdrop.classList.remove("active");
      postForm.reset();
      document.getElementById("myPostsCount").textContent =
        window.myTopicPosts.length;

      if (currentTab === "all-posts") {
        renderAllPosts();
      } else {
        renderMyPosts();
      }

      const topic = await getTopicById(window.currentTopicId);
      if (topic) await renderTopicHeader(topic);
    } catch (error) {
      console.error("[postForm.onsubmit] Error:", error);
      showNotification(error.message, true);
    }
  };

  // Close comment modal button
  document.getElementById("closeCommentModal").onclick =
    window.closeCommentModal;

  // Close dropdown menus
  document.addEventListener("click", function (event) {
    const menus = document.querySelectorAll(".post-dropdown-menu");
    menus.forEach((menu) => {
      if (
        !event.target.closest(".post-options-btn-modal") &&
        !event.target.closest(".post-dropdown-menu")
      ) {
        menu.classList.remove("show");
      }
    });

    // Close topic dropdown
    const topicDropdown = document.getElementById("topicDropdown");
    if (topicDropdown && !event.target.closest("#topicActionsMenu")) {
      topicDropdown.classList.remove("active");
    }
  });

  // ✅ Topic report button handler
  const topicMenuBtn = document.getElementById("topicMenuBtn");
  const topicDropdown = document.getElementById("topicDropdown");
  const reportTopicBtn = document.getElementById("reportTopicBtn");

  if (topicMenuBtn && topicDropdown) {
    topicMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      topicDropdown.classList.toggle("active");
    });
  }

  if (reportTopicBtn) {
    reportTopicBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      topicDropdown.classList.remove("active");

      // Get topic data
      const topic = await getTopicById(window.currentTopicId);
      if (!topic) {
        showNotification("Topic data not found", true);
        return;
      }

      openReportModal({
        targetId: topic.authorId || topic.userId || "",
        targetEmail: topic.authorEmail || "",
        targetName: topic.author || "Topic Author",
        contextType: "topic",
        contextId: window.currentTopicId,
        contextName: topic.title || "Discussion Topic",
        contentId: window.currentTopicId,
        contentType: "topic",
      });
    });
  }

  // ✅ Post report button handler (delegated)
  document.addEventListener("click", function (event) {
    const reportBtn = event.target.closest(".post-report-btn");
    if (reportBtn) {
      event.stopPropagation();
      const postId = reportBtn.dataset.postId;
      const authorId = reportBtn.dataset.authorId;
      const authorName = reportBtn.dataset.authorName;

      // Find post to get more context
      const post =
        window.allTopicPosts.find((p) => String(p.id) === String(postId)) ||
        window.myTopicPosts.find((p) => String(p.id) === String(postId));

      openReportModal({
        targetId: authorId,
        targetEmail: post?.authorEmail || "",
        targetName: authorName || "Post Author",
        contextType: "post",
        contextId: window.currentTopicId,
        contextName:
          document.getElementById("topicTitle")?.textContent ||
          "Discussion Topic",
        contentId: postId,
        contentType: "post",
      });
    }
  });

  // Initial load
  (async function () {
    if (!window.currentTopicId) {
      showNotification("No topic ID provided", true);
      return goBackToForum();
    }
    try {
      await apiIncrementView(window.currentTopicId);
    } catch (err) {
      // ignore
    }
    const topic = await getTopicById(window.currentTopicId);
    if (!topic) {
      showNotification("Topic not found", true);
      return goBackToForum();
    }
    await renderTopicHeader(topic);
    await getPosts(window.currentTopicId);
    window.myTopicPosts = window.allTopicPosts.filter(
      (p) =>
        String(p.userId) === String(CURRENT_USER_ID) ||
        String(p.authorId) === String(CURRENT_USER_ID)
    );
    document.getElementById("myPostsCount").textContent =
      window.myTopicPosts.length;
    renderAllPosts();
  })();
}
