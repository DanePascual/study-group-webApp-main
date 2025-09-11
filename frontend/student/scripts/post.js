// Wait for DOM to be fully loaded before executing the script
document.addEventListener("DOMContentLoaded", function () {
  // Current session information
  const CURRENT_SESSION = {
    utcTime: "2025-08-31 12:59:19", // Updated UTC time
    user: "DanePascual",
    timezone: "UTC",
  };

  // Current user ID (normally from auth system)
  const CURRENT_USER_ID = "user_dane_pascual";
  const CURRENT_USER_NAME = CURRENT_SESSION.user;
  const CURRENT_USER_INITIALS = "DP";

  // Track active reply form
  let activeReplyForm = null;

  // Track expanded comment threads to maintain state
  let expandedThreads = new Set();

  // Track the scroll position
  let lastScrollPosition = 0;

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
      if (
        !sidebar.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {
        sidebar.classList.remove("open");
        mainContent.classList.remove("shifted");
      }
    }
  });

  // Function to navigate to profile page
  window.goToProfile = function () {
    window.location.href = "profile.html";
  };

  // --- Utility functions ---
  function getIdsFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return {
      topicId: params.get("topic"),
      postId: params.get("post"),
    };
  }

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
    if (diffHour < 24) return `${diffHour} hr${diffHour !== 1 ? "s" : ""} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;

    // If older than a week, show date
    const options = { year: "numeric", month: "short", day: "numeric" };
    return date.toLocaleDateString(undefined, options);
  }

  // Generate initials from username
  function getInitials(name) {
    if (!name) return "?";
    return name
      .split(" ")
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase()
      .substring(0, 2);
  }

  // Format text with basic markdown
  function formatTextWithMarkdown(text) {
    if (!text) return "";

    // Escape HTML first to prevent XSS
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    // Format bold text
    let formatted = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Format italic text
    formatted = formatted.replace(/_(.*?)_/g, "<em>$1</em>");

    // Format code blocks
    formatted = formatted.replace(/`(.*?)`/g, "<code>$1</code>");

    // Convert URLs to links
    formatted = formatted.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    return formatted;
  }

  // Get comment path for deep nesting
  function getCommentPath(comments, commentId) {
    if (!commentId) return [];

    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return [];

    if (!comment.parentId) {
      return [comment.author];
    } else {
      const parentPath = getCommentPath(comments, comment.parentId);
      return [...parentPath, comment.author];
    }
  }

  // --- Backend API simulation ---

  // Get topic info for breadcrumbs
  async function getTopic(topicId) {
    await delay(50);
    const topics = JSON.parse(localStorage.getItem("topics") || "[]");
    return topics.find((t) => t.id == topicId);
  }

  // Get post by id
  async function getPost(topicId, postId) {
    await delay(50);
    const posts = JSON.parse(localStorage.getItem("posts_" + topicId) || "[]");

    // Update view count for this post
    const postIndex = posts.findIndex((p) => p.id == postId);
    if (postIndex !== -1) {
      posts[postIndex].viewCount = (posts[postIndex].viewCount || 0) + 1;
      localStorage.setItem("posts_" + topicId, JSON.stringify(posts));
    }

    return posts.find((p) => p.id == postId);
  }

  // Get all comments
  async function getComments(topicId, postId, sort = "newest") {
    await delay(50);
    let comments = JSON.parse(
      localStorage.getItem("comments_" + topicId + "_" + postId) || "[]"
    );

    // Apply sorting
    switch (sort) {
      case "newest":
        comments.sort((a, b) => new Date(b.created) - new Date(a.created));
        break;
      case "oldest":
        comments.sort((a, b) => new Date(a.created) - new Date(b.created));
        break;
      case "popular":
        comments.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        break;
    }

    return comments;
  }

  // Create a comment
  async function createComment(topicId, postId, { content, author, parentId }) {
    await delay(100);
    const commentsKey = "comments_" + topicId + "_" + postId;
    const comments = JSON.parse(localStorage.getItem(commentsKey) || "[]");
    const now = new Date();
    const comment = {
      id: Date.now().toString(),
      content,
      author: author || CURRENT_USER_NAME,
      created: now.toISOString(),
      lastEdited: null,
      parentId: parentId || null,
      userId: CURRENT_USER_ID,
      likes: 0,
      liked_by: [],
    };
    comments.push(comment);
    localStorage.setItem(commentsKey, JSON.stringify(comments));

    // Update comment count in the post
    const posts = JSON.parse(localStorage.getItem("posts_" + topicId) || "[]");
    const postIndex = posts.findIndex((p) => p.id == postId);
    if (postIndex !== -1) {
      posts[postIndex].commentCount = (posts[postIndex].commentCount || 0) + 1;
      localStorage.setItem("posts_" + topicId, JSON.stringify(posts));
    }

    return comment;
  }

  // Update comment content - renamed to avoid naming conflicts
  async function updateCommentContent(topicId, postId, commentId, newContent) {
    await delay(100);
    const commentsKey = "comments_" + topicId + "_" + postId;
    const comments = JSON.parse(localStorage.getItem(commentsKey) || "[]");
    const comment = comments.find((c) => c.id === commentId);

    if (!comment) return null;
    if (comment.userId !== CURRENT_USER_ID) return null;

    comment.content = newContent;
    comment.lastEdited = new Date().toISOString();
    localStorage.setItem(commentsKey, JSON.stringify(comments));
    return comment;
  }

  // Remove comment - renamed to avoid naming conflicts
  async function removeComment(topicId, postId, commentId) {
    await delay(100);
    const commentsKey = "comments_" + topicId + "_" + postId;
    let comments = JSON.parse(localStorage.getItem(commentsKey) || "[]");
    const comment = comments.find((c) => c.id === commentId);

    if (!comment) return false;
    if (comment.userId !== CURRENT_USER_ID) return false;

    // Check if comment has replies
    const hasReplies = comments.some((c) => c.parentId === commentId);

    if (hasReplies) {
      comment.content = "[Comment deleted]";
      comment.isDeleted = true;
    } else {
      comments = comments.filter((c) => c.id !== commentId);

      // Update comment count in the post
      const posts = JSON.parse(
        localStorage.getItem("posts_" + topicId) || "[]"
      );
      const postIndex = posts.findIndex((p) => p.id == postId);
      if (postIndex !== -1 && posts[postIndex].commentCount > 0) {
        posts[postIndex].commentCount--;
        localStorage.setItem("posts_" + topicId, JSON.stringify(posts));
      }
    }

    localStorage.setItem(commentsKey, JSON.stringify(comments));
    return true;
  }

  // Like a post
  async function likePost(topicId, postId) {
    await delay(50);
    const posts = JSON.parse(localStorage.getItem("posts_" + topicId) || "[]");
    const postIndex = posts.findIndex((p) => p.id == postId);

    if (postIndex === -1) return null;

    if (!posts[postIndex].likes) {
      posts[postIndex].likes = 0;
      posts[postIndex].likedBy = [];
    }

    const alreadyLiked = posts[postIndex].likedBy.includes(CURRENT_USER_ID);

    if (alreadyLiked) {
      posts[postIndex].likes--;
      posts[postIndex].likedBy = posts[postIndex].likedBy.filter(
        (id) => id !== CURRENT_USER_ID
      );
    } else {
      posts[postIndex].likes++;
      posts[postIndex].likedBy.push(CURRENT_USER_ID);
    }

    localStorage.setItem("posts_" + topicId, JSON.stringify(posts));
    return {
      likes: posts[postIndex].likes,
      liked: !alreadyLiked,
    };
  }

  // Render post
  async function renderPost(topicId, postId) {
    const post = await getPost(topicId, postId);
    if (!post) {
      window.location.href = "topic.html?id=" + topicId;
      return;
    }

    // Set title and metadata
    document.getElementById("postTitle").textContent = post.title;
    document.getElementById("postAuthorName").textContent =
      post.author || "Anonymous";
    document.getElementById("postAuthorAvatar").textContent = getInitials(
      post.author
    );
    document.getElementById("postTime").textContent = formatRelativeTime(
      post.created
    );

    // Set post content with formatting
    document.getElementById("postContent").innerHTML = formatTextWithMarkdown(
      post.content
    );

    // Show edit indicator if needed
    if (post.lastEdited) {
      document.getElementById("postEditedContainer").style.display = "flex";
    }

    // Set likes count
    document.getElementById("likeCount").textContent = post.likes || 0;

    // Check if user already liked this post
    if (post.likedBy && post.likedBy.includes(CURRENT_USER_ID)) {
      document.getElementById("likeBtn").classList.add("active");
    }

    // Update breadcrumbs
    const topic = await getTopic(topicId);
    if (topic) {
      document.getElementById("topicBreadcrumb").textContent = topic.title;
      document.getElementById(
        "topicBreadcrumb"
      ).href = `topic.html?id=${topicId}`;
    }
    document.getElementById("postBreadcrumb").textContent = post.title;
  }

  // Render comments recursively - improved with better nesting indicators
  function renderCommentTree(comments, parentId = null, level = 0) {
    let html = "";
    const filteredComments = comments.filter((c) => {
      if (parentId === null) return c.parentId == null;
      return c.parentId == parentId;
    });

    if (filteredComments.length === 0) return "";

    filteredComments.forEach((comment) => {
      const hasReplies = comments.some((c) => c.parentId === comment.id);
      const isOwnComment = comment.userId === CURRENT_USER_ID;
      const isDeleted = comment.isDeleted;
      const relativeTime = formatRelativeTime(comment.created);
      const commentInitials = getInitials(comment.author);

      // For deeply nested comments (level > 2), show who they're replying to
      let replyPathHtml = "";
      if (level > 2 && comment.parentId) {
        const parentComment = comments.find((c) => c.id === comment.parentId);
        if (parentComment) {
          replyPathHtml = `<div class="reply-path">
            <i class="bi bi-arrow-return-right"></i> 
            Replying to <strong>@${parentComment.author}</strong>
          </div>`;
        }
      }

      html += `
      <div class="comment" data-comment-id="${
        comment.id
      }" data-nesting-level="${level}">
        <div class="comment-header">
          <div class="comment-author-info">
            <div class="comment-avatar">${commentInitials}</div>
            <div class="comment-user">
              <div class="comment-author">${comment.author}</div>
              <div class="comment-meta">
                ${relativeTime}
                ${
                  comment.lastEdited
                    ? `<span class="edited-indicator">(edited)</span>`
                    : ""
                }
              </div>
            </div>
          </div>
        </div>
        
        <div class="comment-body">
          ${replyPathHtml}
          <div class="comment-content ${isDeleted ? "comment-deleted" : ""}">
            ${
              isDeleted
                ? comment.content
                : formatTextWithMarkdown(comment.content)
            }
          </div>
          
          ${
            !isDeleted
              ? `
            <div class="comment-actions">
              <button class="reply-btn" onclick="toggleReplyForm('${
                comment.id
              }', '${comment.author.replace(/'/g, "&#39;")}')">
                <i class="bi bi-reply"></i> Reply
              </button>
              
              ${
                isOwnComment
                  ? `
                <button class="edit-btn" onclick="editComment('${comment.id}')">
                  <i class="bi bi-pencil"></i> Edit
                </button>
                <button class="delete-btn" onclick="deleteComment('${comment.id}')">
                  <i class="bi bi-trash"></i> Delete
                </button>
              `
                  : ""
              }
              
              ${
                hasReplies
                  ? `
                <button class="collapse-btn" onclick="toggleReplies('${comment.id}')">
                  <i class="bi bi-chevron-down toggle-icon"></i>
                  <span class="toggle-text">Show replies</span>
                </button>
              `
                  : ""
              }
            </div>

            <!-- Inline reply form -->
            <div class="reply-form" id="replyForm-${comment.id}">
              <div class="comment-avatar">${CURRENT_USER_INITIALS}</div>
              <div style="flex: 1">
                <div class="replying-to">
                  <i class="bi bi-reply"></i> 
                  Replying to @${comment.author}
                </div>
                <textarea class="reply-input" id="replyInput-${
                  comment.id
                }" placeholder="Write your reply to @${
                  comment.author
                }..."></textarea>
                <div class="reply-btn-group">
                  <button class="reply-cancel" onclick="cancelReply('${
                    comment.id
                  }')">Cancel</button>
                  <button class="reply-submit" onclick="submitReply('${
                    comment.id
                  }')">Post Reply</button>
                </div>
              </div>
            </div>
          `
              : ""
          }
          
          ${
            hasReplies
              ? `<div class="comment-replies" id="replies-${
                  comment.id
                }">${renderCommentTree(comments, comment.id, level + 1)}</div>`
              : ""
          }
        </div>
      </div>
    `;
    });

    return html;
  }

  // Toggle comment replies - updated to track state
  window.toggleReplies = function (commentId) {
    const repliesContainer = document.getElementById(`replies-${commentId}`);
    const commentElement = repliesContainer.closest(".comment");
    const toggleBtn = commentElement.querySelector(".collapse-btn");
    const toggleIcon = toggleBtn.querySelector(".toggle-icon");
    const toggleText = toggleBtn.querySelector(".toggle-text");

    repliesContainer.style.display =
      repliesContainer.style.display === "none" ? "block" : "none";

    if (repliesContainer.style.display === "none") {
      toggleIcon.classList.remove("bi-chevron-up");
      toggleIcon.classList.add("bi-chevron-down");
      toggleText.textContent = "Show replies";
      expandedThreads.delete(commentId); // Remove from expanded threads
    } else {
      toggleIcon.classList.remove("bi-chevron-down");
      toggleIcon.classList.add("bi-chevron-up");
      toggleText.textContent = "Hide replies";
      expandedThreads.add(commentId); // Add to expanded threads
    }
  };

  // Show inline reply form - renamed to toggleReplyForm for clarity
  window.toggleReplyForm = function (commentId, author) {
    // Hide any active reply form first
    if (activeReplyForm) {
      activeReplyForm.classList.remove("active");
    }

    // Show the reply form for this comment
    const replyForm = document.getElementById(`replyForm-${commentId}`);
    replyForm.classList.add("active");

    // Focus the textarea
    const replyInput = document.getElementById(`replyInput-${commentId}`);
    replyInput.focus();

    // Update active form tracker
    activeReplyForm = replyForm;
  };

  // Cancel reply
  window.cancelReply = function (commentId) {
    const replyForm = document.getElementById(`replyForm-${commentId}`);
    replyForm.classList.remove("active");
    document.getElementById(`replyInput-${commentId}`).value = "";
    activeReplyForm = null;
  };

  // Submit reply - fixed version
  window.submitReply = async function (commentId) {
    const replyInput = document.getElementById(`replyInput-${commentId}`);
    const content = replyInput.value.trim();

    if (content) {
      // Save scroll position before any changes
      lastScrollPosition = window.scrollY;

      // Remember which threads are expanded
      document.querySelectorAll(".comment-replies").forEach((thread) => {
        if (thread.style.display !== "none") {
          const parentComment = thread.closest(".comment");
          if (parentComment) {
            const parentId = parentComment.dataset.commentId;
            expandedThreads.add(parentId);
          }
        }
      });

      // Always ensure the current thread will be expanded
      expandedThreads.add(commentId);

      const { topicId, postId } = getIdsFromUrl();

      await createComment(topicId, postId, {
        content: content,
        author: CURRENT_USER_NAME,
        parentId: commentId,
      });

      // Clear the reply form
      replyInput.value = "";
      document
        .getElementById(`replyForm-${commentId}`)
        .classList.remove("active");
      activeReplyForm = null;

      // Refresh comments
      await renderComments(topicId, postId);

      // After rendering, restore scroll position
      window.scrollTo({
        top: lastScrollPosition,
        behavior: "auto",
      });
    }
  };

  // Edit a comment - fixed version
  window.editComment = async function (commentId) {
    // Save scroll position and expanded threads
    lastScrollPosition = window.scrollY;
    document.querySelectorAll(".comment-replies").forEach((thread) => {
      if (thread.style.display !== "none") {
        const parentComment = thread.closest(".comment");
        if (parentComment) {
          const parentId = parentComment.dataset.commentId;
          expandedThreads.add(parentId);
        }
      }
    });

    const { topicId, postId } = getIdsFromUrl();
    const commentsKey = "comments_" + topicId + "_" + postId;
    const comments = JSON.parse(localStorage.getItem(commentsKey) || "[]");
    const comment = comments.find((c) => c.id === commentId);

    if (!comment) return;

    const newContent = prompt("Edit your comment:", comment.content);
    if (newContent !== null && newContent.trim() !== "") {
      // Call updateCommentContent instead of editComment to avoid recursion
      await updateCommentContent(topicId, postId, commentId, newContent.trim());

      // Refresh comments and restore state
      await renderComments(topicId, postId);

      // Restore scroll position
      window.scrollTo({
        top: lastScrollPosition,
        behavior: "auto",
      });
    }
  };

  // Delete a comment - fixed version
  window.deleteComment = async function (commentId) {
    // Save scroll position and expanded threads
    lastScrollPosition = window.scrollY;
    document.querySelectorAll(".comment-replies").forEach((thread) => {
      if (thread.style.display !== "none") {
        const parentComment = thread.closest(".comment");
        if (parentComment) {
          const parentId = parentComment.dataset.commentId;
          expandedThreads.add(parentId);
        }
      }
    });

    const { topicId, postId } = getIdsFromUrl();
    if (confirm("Are you sure you want to delete this comment?")) {
      // Call removeComment instead of deleteComment to avoid recursion
      await removeComment(topicId, postId, commentId);

      // Refresh comments and restore state
      await renderComments(topicId, postId);

      // Restore scroll position
      window.scrollTo({
        top: lastScrollPosition,
        behavior: "auto",
      });
    }
  };

  // Quick comment functionality
  document
    .getElementById("quickCommentInput")
    .addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        document.getElementById("createCommentBtn").click();
      }
    });

  // Add comment button
  document.getElementById("createCommentBtn").onclick = async function () {
    const quickComment = document
      .getElementById("quickCommentInput")
      .value.trim();

    if (quickComment) {
      // Save thread state
      lastScrollPosition = window.scrollY;
      document.querySelectorAll(".comment-replies").forEach((thread) => {
        if (thread.style.display !== "none") {
          const parentComment = thread.closest(".comment");
          if (parentComment) {
            const parentId = parentComment.dataset.commentId;
            expandedThreads.add(parentId);
          }
        }
      });

      const { topicId, postId } = getIdsFromUrl();

      await createComment(topicId, postId, {
        content: quickComment,
        author: CURRENT_USER_NAME,
      });

      document.getElementById("quickCommentInput").value = "";

      // Refresh with state preservation
      await renderComments(topicId, postId);

      // Scroll to bottom to see new comment
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  // Render all comments - updated to maintain thread state
  async function renderComments(topicId, postId) {
    const commentsSort = document.getElementById("commentSortDropdown").value;
    const comments = await getComments(topicId, postId, commentsSort);
    const commentsList = document.getElementById("commentsList");
    const commentsCount = document.getElementById("commentsCount");

    if (!comments || comments.length === 0) {
      commentsList.innerHTML = `
  <div class="empty-comments">
    <div class="empty-icon"><i class="bi bi-chat-square"></i></div>
    <div class="empty-text">No comments yet. Be the first to comment!</div>
  </div>
  `;
      commentsCount.textContent = "";
    } else {
      commentsList.innerHTML = renderCommentTree(comments);
      commentsCount.textContent = `(${comments.length})`;

      // Set thread visibility based on previously expanded state
      expandedThreads.forEach((threadId) => {
        const repliesContainer = document.getElementById(`replies-${threadId}`);
        if (repliesContainer) {
          repliesContainer.style.display = "block";

          // Update the button UI as well
          const commentElement = repliesContainer.closest(".comment");
          if (commentElement) {
            const toggleBtn = commentElement.querySelector(".collapse-btn");
            if (toggleBtn) {
              const toggleIcon = toggleBtn.querySelector(".toggle-icon");
              const toggleText = toggleBtn.querySelector(".toggle-text");

              toggleIcon.classList.remove("bi-chevron-down");
              toggleIcon.classList.add("bi-chevron-up");
              toggleText.textContent = "Hide replies";
            }
          }
        }
      });

      // If it's the first load, collapse all threads by default
      if (expandedThreads.size === 0) {
        const replyThreads = document.querySelectorAll(".comment-replies");
        replyThreads.forEach((thread) => {
          thread.style.display = "none";
        });
      }
    }
  }

  // Handle comment sorting
  document
    .getElementById("commentSortDropdown")
    .addEventListener("change", async function () {
      // Save state before sorting
      lastScrollPosition = window.scrollY;
      document.querySelectorAll(".comment-replies").forEach((thread) => {
        if (thread.style.display !== "none") {
          const parentComment = thread.closest(".comment");
          if (parentComment) {
            const parentId = parentComment.dataset.commentId;
            expandedThreads.add(parentId);
          }
        }
      });

      const { topicId, postId } = getIdsFromUrl();
      await renderComments(topicId, postId);

      // Restore scroll position after sorting
      window.scrollTo({
        top: lastScrollPosition,
        behavior: "auto",
      });
    });

  // Handle likes
  document
    .getElementById("likeBtn")
    .addEventListener("click", async function () {
      const { topicId, postId } = getIdsFromUrl();
      const result = await likePost(topicId, postId);

      if (result) {
        document.getElementById("likeCount").textContent = result.likes;
        if (result.liked) {
          this.classList.add("active");
        } else {
          this.classList.remove("active");
        }
      }
    });

  // Back to topic link
  document.getElementById("backToTopic").onclick = async function () {
    const { topicId } = getIdsFromUrl();
    window.location.href = "topic.html?id=" + topicId;
  };

  // Initial page load
  (async function () {
    // Initialize theme system
    initializeTheme();

    const { topicId, postId } = getIdsFromUrl();
    if (!topicId || !postId) {
      window.location.href = "discussion.html";
      return;
    }

    // Set user information
    document.getElementById("sidebarUsername").textContent = CURRENT_USER_NAME;
    document.getElementById("sidebarUserAvatar").textContent =
      CURRENT_USER_INITIALS;
    document.getElementById("currentUserAvatar").textContent =
      CURRENT_USER_INITIALS;

    // Render post content
    await renderPost(topicId, postId);

    // Render comments
    await renderComments(topicId, postId);
  })();
});
