// frontend/student/scripts/post.js
// Applied changes:
// - Use centralized fetchJsonWithAuth for GET requests so timeouts/retries and token handling are consistent.
// - Replaced manual fetch() calls for comments and post header with fetchJsonWithAuth.
// - Kept existing behavior (server-first with local fallback) and preserved offline/localStorage logic.

import { auth } from "../../config/firebase.js";
import { apiUrl } from "../../config/appConfig.js";
import {
  postJsonWithAuth,
  patchJsonWithAuth,
  deleteWithAuth,
  fetchJsonWithAuth,
} from "./apiClient.js";
import { openReportModal } from "./reportModal.js";

// Configuration
const COMMENTS_PAGE_LIMIT = 20;

// State
let CURRENT_USER = null;
let existingCommentsCache = new Map();
let nextCursorGlobal = null;
let loadingComments = false;
let CURRENT_TOPIC_ID = null;
let CURRENT_POST_ID = null;
let pendingDelete = null; // { commentId, topicId, postId, commentEl }

// Utilities
function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdownToHtml(md) {
  if (!md) return "";
  let out = escapeHtml(md);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/_(.+?)_/g, "<em>$1</em>");
  out = out.replace(/`(.+?)`/g, "<code>$1</code>");
  out = out.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
    return window.DOMPurify.sanitize(out);
  }
  return out;
}

function createElementFromHtml(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstChild;
}

function relativeTime(iso) {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown";
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return d.toLocaleDateString();
}

/**
 * Toast creation using #toastContainer and .toast classes defined in post.css.
 */
function showToast(msg, type = "info", timeout = 3500) {
  try {
    const id = "toastContainer";
    let c = document.getElementById(id);
    if (!c) {
      c = document.createElement("div");
      c.id = id;
      c.setAttribute("role", "status");
      c.setAttribute("aria-live", "polite");
      c.setAttribute("aria-atomic", "true");
      document.body.appendChild(c);
    }
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => {
      try {
        el.remove();
      } catch {}
    }, timeout);
  } catch {
    try {
      // eslint-disable-next-line no-alert
      alert(msg);
    } catch {}
  }
}

// Auth and current user management
async function waitForAuth() {
  return new Promise((resolve) => {
    const u = auth.currentUser;
    if (u) return resolve(u);
    const unsub = auth.onAuthStateChanged((user) => {
      unsub();
      resolve(user);
    });
  });
}

async function hydrateCurrentUser(u) {
  const cached = safeParse(localStorage.getItem("userProfile"));
  CURRENT_USER = u
    ? {
        uid: u.uid,
        displayName: u.displayName || u.email || "User",
        initials: (u.displayName || u.email || "U")[0].toUpperCase(),
        photo: (cached && cached.photo) || u.photoURL || null,
      }
    : null;
  updateCurrentUserAvatarInUI();
  updateRenderedAvatarsForCurrentUser();
}

auth.onAuthStateChanged((u) => {
  hydrateCurrentUser(u).catch(() => {});
  setCommentAuthState(!!u, CURRENT_TOPIC_ID, CURRENT_POST_ID);
});

// Avatar helpers
function updateCurrentUserAvatarInUI() {
  const avatarEl = document.getElementById("currentUserAvatar");
  if (!avatarEl) return;
  avatarEl.innerHTML = "";
  if (CURRENT_USER && CURRENT_USER.photo) {
    const img = document.createElement("img");
    img.src = CURRENT_USER.photo;
    img.alt = `${CURRENT_USER.displayName || "You"} avatar`;
    avatarEl.appendChild(img);
  } else if (CURRENT_USER) {
    avatarEl.textContent = CURRENT_USER.initials || "?";
  } else {
    avatarEl.textContent = "?";
  }
}

function updateRenderedAvatarsForCurrentUser() {
  if (!CURRENT_USER || !CURRENT_USER.uid) return;
  document.querySelectorAll(".comment[data-author-id]").forEach((n) => {
    try {
      const authorId = n.getAttribute("data-author-id");
      if (String(authorId) === String(CURRENT_USER.uid)) {
        const avatarNode = n.querySelector(".comment-avatar");
        if (avatarNode) {
          avatarNode.innerHTML = "";
          if (CURRENT_USER.photo) {
            const img = document.createElement("img");
            img.src = CURRENT_USER.photo;
            img.alt = `${CURRENT_USER.displayName || "You"} avatar`;
            avatarNode.appendChild(img);
          } else {
            avatarNode.textContent = CURRENT_USER.initials || "?";
          }
        }
      }
    } catch {}
  });
}

// Build comment tree from flat list
function buildTree(flatComments) {
  const map = new Map();
  (flatComments || []).forEach((c) =>
    map.set(String(c.id), { ...c, children: [] })
  );
  const roots = [];
  for (const node of map.values()) {
    const parentId = node.parent_id ? String(node.parent_id) : null;
    if (parentId && map.has(parentId)) {
      let depth = 0;
      let cur = map.get(parentId);
      while (cur && cur.parent_id) {
        depth++;
        cur = map.get(String(cur.parent_id));
        if (depth > 50) break;
      }
      if (depth < 50) {
        map.get(parentId).children.push(node);
        continue;
      }
    }
    roots.push(node);
  }
  return roots;
}

// API helpers (comments)
// Use fetchJsonWithAuth for GET so signed-in users get token behavior; still works if unauthenticated.
async function fetchCommentsServer(
  topicId,
  postId,
  { limit = COMMENTS_PAGE_LIMIT, cursor = null, sort = "newest" } = {}
) {
  try {
    const u = new URL(
      apiUrl(
        `/api/topics/${encodeURIComponent(topicId)}/posts/${encodeURIComponent(
          postId
        )}/comments`
      )
    );
    u.searchParams.set("limit", String(limit));
    if (cursor) u.searchParams.set("cursor", String(cursor));
    u.searchParams.set("sort", sort);
    const data = await fetchJsonWithAuth(u.toString(), { method: "GET" });
    return data;
  } catch (err) {
    console.warn("fetchCommentsServer failed:", err);
    return null;
  }
}

async function postCommentServer(
  topicId,
  postId,
  { content, parent_id = null } = {}
) {
  const url = apiUrl(
    `/api/topics/${encodeURIComponent(topicId)}/posts/${encodeURIComponent(
      postId
    )}/comments`
  );
  return postJsonWithAuth(url, { content, parent_id });
}

async function patchCommentServer(commentId, { content }) {
  const url = apiUrl(`/api/comments/${encodeURIComponent(commentId)}`);
  return patchJsonWithAuth(url, { content });
}

async function deleteCommentServer(commentId) {
  const url = apiUrl(`/api/comments/${encodeURIComponent(commentId)}`);
  return deleteWithAuth(url);
}

// Local fallback (localStorage)
function commentsKey(topicId, postId) {
  return `comments_${topicId}_${postId}`;
}
async function getCommentsLocal(topicId, postId) {
  await new Promise((r) => setTimeout(r, 40));
  return JSON.parse(localStorage.getItem(commentsKey(topicId, postId)) || "[]");
}
async function createCommentLocal(
  topicId,
  postId,
  { content, parent_id = null } = {}
) {
  await new Promise((r) => setTimeout(r, 80));
  const key = commentsKey(topicId, postId);
  const arr = JSON.parse(localStorage.getItem(key) || "[]");
  const now = new Date().toISOString();
  const comment = {
    id: "local-" + Date.now(),
    topic_id: topicId,
    post_id: postId,
    parent_id: parent_id || null,
    author_id: CURRENT_USER?.uid || "local",
    author_name: CURRENT_USER?.displayName || "You",
    author_avatar: CURRENT_USER?.photo || null,
    content,
    created_at: now,
    edited_at: null,
    is_deleted: false,
    likes_count: 0,
  };
  arr.unshift(comment);
  localStorage.setItem(key, JSON.stringify(arr));
  return comment;
}
async function patchCommentLocal(commentId, topicId, postId, { content } = {}) {
  const key = commentsKey(topicId, postId);
  const arr = JSON.parse(localStorage.getItem(key) || "[]");
  const idx = arr.findIndex((c) => String(c.id) === String(commentId));
  if (idx === -1) throw new Error("Not found");
  arr[idx].content = content;
  arr[idx].edited_at = new Date().toISOString();
  localStorage.setItem(key, JSON.stringify(arr));
  return arr[idx];
}
async function deleteCommentLocal(commentId, topicId, postId) {
  const key = commentsKey(topicId, postId);
  const arr = JSON.parse(localStorage.getItem(key) || "[]");
  const idx = arr.findIndex((c) => String(c.id) === String(commentId));
  if (idx === -1) throw new Error("Not found");
  arr[idx].is_deleted = true;
  arr[idx].content = "[Comment deleted]";
  localStorage.setItem(key, JSON.stringify(arr));
  return true;
}

// Render helpers
function createCommentNode(comment, topicId, postId) {
  const wrapper = document.createElement("div");
  wrapper.className = "comment";
  wrapper.dataset.commentId = String(comment.id);
  if (comment.author_id)
    wrapper.setAttribute("data-author-id", String(comment.author_id));

  const avatar = document.createElement("div");
  avatar.className = "comment-avatar";
  const avatarUrl = comment.author_avatar || null;
  if (avatarUrl) {
    avatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(
      comment.author_name || "User"
    )} avatar">`;
  } else if (
    CURRENT_USER &&
    comment.author_id &&
    String(comment.author_id) === String(CURRENT_USER.uid) &&
    CURRENT_USER.photo
  ) {
    avatar.innerHTML = `<img src="${escapeHtml(
      CURRENT_USER.photo
    )}" alt="${escapeHtml(CURRENT_USER.displayName || "You")} avatar">`;
  } else {
    avatar.textContent =
      comment.author_name && comment.author_name[0]
        ? comment.author_name[0].toUpperCase()
        : "?";
  }

  const body = document.createElement("div");
  body.className = "comment-body";

  const header = document.createElement("div");
  header.className = "comment-header";

  const userCol = document.createElement("div");
  userCol.className = "comment-user";
  const nameEl = document.createElement("div");
  nameEl.className = "comment-author";
  nameEl.textContent = comment.author_name || "Anonymous";
  const timeEl = document.createElement("div");
  timeEl.className = "comment-meta";
  timeEl.textContent = relativeTime(comment.created_at || comment.created);

  userCol.appendChild(nameEl);
  userCol.appendChild(timeEl);
  header.appendChild(userCol);
  body.appendChild(header);

  const contentHtml = comment.is_deleted
    ? '<div class="comment-content comment-deleted">[Comment deleted]</div>'
    : `<div class="comment-content">${renderMarkdownToHtml(
        comment.content
      )}</div>`;
  body.insertAdjacentHTML("beforeend", contentHtml);

  const actions = document.createElement("div");
  actions.className = "comment-actions";

  const replyBtn = document.createElement("button");
  replyBtn.className = "btn-reply";
  replyBtn.setAttribute("aria-label", "Reply");
  replyBtn.setAttribute("aria-expanded", "false");
  replyBtn.type = "button";
  replyBtn.innerHTML = `Reply`;
  actions.appendChild(replyBtn);

  if (
    CURRENT_USER &&
    comment.author_id &&
    String(comment.author_id) === String(CURRENT_USER.uid) &&
    !comment.is_deleted
  ) {
    const editBtn = document.createElement("button");
    editBtn.className = "btn-edit";
    editBtn.setAttribute("aria-label", "Edit comment");
    editBtn.type = "button";
    editBtn.innerHTML = `Edit`;
    actions.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "btn-delete";
    delBtn.setAttribute("aria-label", "Delete comment");
    delBtn.type = "button";
    delBtn.innerHTML = `Delete`;
    actions.appendChild(delBtn);
  } else if (
    CURRENT_USER &&
    comment.author_id &&
    String(comment.author_id) !== String(CURRENT_USER.uid) &&
    !comment.is_deleted
  ) {
    // Report button for other users' comments
    const reportBtn = document.createElement("button");
    reportBtn.className = "btn-report";
    reportBtn.setAttribute("aria-label", "Report comment");
    reportBtn.type = "button";
    reportBtn.innerHTML = `Report`;
    reportBtn.dataset.commentId = String(comment.id);
    reportBtn.dataset.authorId = String(comment.author_id);
    reportBtn.dataset.authorName = escapeHtml(
      comment.author_name || "Anonymous"
    );
    reportBtn.dataset.authorEmail = escapeHtml(comment.author_email || "");
    actions.appendChild(reportBtn);
  }

  const replyForm = document.createElement("div");
  replyForm.className = "reply-form";
  replyForm.id = `reply-form-${comment.id}`;
  replyForm.style.display = "none";
  replyForm.setAttribute("aria-hidden", "true");
  replyForm.innerHTML = `
    <textarea class="reply-input" id="reply-input-${comment.id}" placeholder="Write a reply..." aria-label="Write a reply"></textarea>
    <div class="reply-actions">
      <button class="reply-submit">Post Reply</button>
      <button class="reply-cancel">Cancel</button>
    </div>
  `;

  body.appendChild(actions);
  body.appendChild(replyForm);

  wrapper.appendChild(avatar);
  wrapper.appendChild(body);

  const childrenContainer = document.createElement("div");
  childrenContainer.className = "children";
  wrapper.appendChild(childrenContainer);

  return wrapper;
}

function renderCommentTree(comment, parentContainer, topicId, postId) {
  if (document.querySelector(`.comment[data-comment-id="${comment.id}"]`))
    return;
  const node = createCommentNode(comment, topicId, postId);
  parentContainer.appendChild(node);
  if (comment.children && comment.children.length) {
    const childrenContainer = node.querySelector(".children");
    comment.children.forEach((child) =>
      renderCommentTree(child, childrenContainer, topicId, postId)
    );
  }
}

// Delegated event handlers
function setupCommentDelegation(topicId, postId) {
  const container = document.getElementById("commentsList");
  if (!container) return;

  const deleteModalEl = document.getElementById("confirmDeleteModal");
  let bsDeleteModal = null;
  if (deleteModalEl && window.bootstrap) {
    bsDeleteModal = bootstrap.Modal.getOrCreateInstance(deleteModalEl);
  }

  // Confirm delete button hookup
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  if (confirmDeleteBtn) {
    confirmDeleteBtn.onclick = async () => {
      if (!pendingDelete) {
        if (bsDeleteModal) bsDeleteModal.hide();
        return;
      }
      const { commentId, topicId: tId, postId: pId, commentEl } = pendingDelete;
      const contentEl = commentEl.querySelector(".comment-content");
      if (contentEl) contentEl.textContent = "[Deleting...]";
      try {
        try {
          await deleteCommentServer(commentId);
          showToast("Comment deleted", "success");
        } catch (serverErr) {
          await deleteCommentLocal(commentId, tId, pId);
          showToast("Comment deleted (offline)", "success");
        }
        if (contentEl) {
          contentEl.textContent = "[Comment deleted]";
          contentEl.classList.add("comment-deleted");
        }
      } catch (err) {
        console.warn("Delete failed:", err);
        if (contentEl) contentEl.textContent = "(error)";
        showToast("Failed to delete comment", "error");
      } finally {
        pendingDelete = null;
        if (bsDeleteModal) bsDeleteModal.hide();
      }
    };
  }

  container.addEventListener("click", async (e) => {
    const replyToggle = e.target.closest(".btn-reply");
    if (replyToggle) {
      if (!CURRENT_USER) {
        showToast("Please sign in to reply", "info");
        window.location.href = `login.html?redirect=${encodeURIComponent(
          window.location.href
        )}`;
        return;
      }
      const commentEl = replyToggle.closest(".comment");
      const commentId = commentEl && commentEl.getAttribute("data-comment-id");
      if (!commentId) return;
      toggleReplyForm(commentId);
      return;
    }

    const replyCancel = e.target.closest(".reply-cancel");
    if (replyCancel) {
      const form = replyCancel.closest(".reply-form");
      if (!form) return;
      form.style.display = "none";
      form.setAttribute("aria-hidden", "true");
      const pid = form.id.replace("reply-form-", "");
      const trig = document.querySelector(
        `.comment[data-comment-id="${pid}"] .btn-reply`
      );
      if (trig) trig.setAttribute("aria-expanded", "false");
      return;
    }

    const replySubmit = e.target.closest(".reply-submit");
    if (replySubmit) {
      if (!CURRENT_USER) {
        showToast("Please sign in to reply", "info");
        window.location.href = `login.html?redirect=${encodeURIComponent(
          window.location.href
        )}`;
        return;
      }
      const form = replySubmit.closest(".reply-form");
      if (!form) return;
      const parentId = form.id.replace("reply-form-", "");
      const textarea = form.querySelector(".reply-input");
      const val = textarea ? textarea.value.trim() : "";
      if (!val) {
        showToast("Reply cannot be empty", "error");
        return;
      }

      const temp = {
        id: "temp-" + Date.now(),
        author_name: CURRENT_USER?.displayName || "You",
        author_id: CURRENT_USER?.uid || "local",
        author_avatar: CURRENT_USER?.photo || null,
        content: val,
        created_at: new Date().toISOString(),
        is_deleted: false,
        parent_id: parentId,
      };

      const parentEl = document.querySelector(
        `.comment[data-comment-id="${parentId}"]`
      );
      if (!parentEl) return;
      let children = parentEl.querySelector(".children");
      if (!children) {
        children = document.createElement("div");
        children.className = "children";
        parentEl.appendChild(children);
      }
      const childNode = createCommentNode(temp, topicId, postId);
      children.insertBefore(childNode, children.firstChild);

      textarea.value = "";
      form.style.display = "none";
      form.setAttribute("aria-hidden", "true");
      const replyBtn = parentEl.querySelector(".btn-reply");
      if (replyBtn) replyBtn.setAttribute("aria-expanded", "false");

      replySubmit.disabled = true;
      replySubmit.textContent = "Posting...";

      try {
        const res = await postCommentServer(topicId, postId, {
          content: val,
          parent_id: parentId,
        });
        const newId = (res && res.comment && res.comment.id) || res.id || null;
        await loadAndRenderComments(topicId, postId, {
          reset: true,
          focusCommentId: newId || null,
        });
        showToast("Reply posted", "success");
      } catch (err) {
        try {
          const local = await createCommentLocal(topicId, postId, {
            content: val,
            parent_id: parentId,
          });
          await loadAndRenderComments(topicId, postId, {
            reset: true,
            focusCommentId: local.id,
          });
          showToast("Reply saved locally (offline)", "success");
        } catch {
          showToast("Failed to post reply", "error");
        }
      } finally {
        replySubmit.disabled = false;
        replySubmit.textContent = "Post Reply";
      }
      return;
    }

    const editBtn = e.target.closest(".btn-edit");
    if (editBtn) {
      const commentEl = editBtn.closest(".comment");
      if (!commentEl) return;
      const commentId = commentEl.getAttribute("data-comment-id");
      const cached = existingCommentsCache.get(String(commentId)) || {
        id: commentId,
        content: commentEl.querySelector(".comment-content")?.textContent || "",
      };
      openInlineEditor(commentEl, cached, topicId, postId);
      return;
    }

    const delBtn = e.target.closest(".btn-delete");
    if (delBtn) {
      const commentEl = delBtn.closest(".comment");
      if (!commentEl) return;
      const commentId = commentEl.getAttribute("data-comment-id");

      // Use accessible modal confirmation instead of window.confirm
      pendingDelete = {
        commentId,
        topicId,
        postId,
        commentEl,
      };

      // Set a short confirmation message (no author, no extra sentence)
      const msgEl = document.getElementById("confirmDeleteMessage");
      if (msgEl) {
        msgEl.textContent = "Are you sure you want to delete this comment?";
      }

      const deleteModalEl = document.getElementById("confirmDeleteModal");
      if (deleteModalEl && window.bootstrap) {
        const bsDeleteModal =
          bootstrap.Modal.getOrCreateInstance(deleteModalEl);
        bsDeleteModal.show();
      } else {
        // fallback to confirm if modal not available
        if (!confirm("Are you sure you want to delete this comment?")) {
          pendingDelete = null;
          return;
        }
        // user confirmed; perform deletion immediately
        try {
          const contentEl = commentEl.querySelector(".comment-content");
          if (contentEl) contentEl.textContent = "[Deleting...]";
          try {
            await deleteCommentServer(commentId);
            showToast("Comment deleted", "success");
          } catch (serverErr) {
            await deleteCommentLocal(commentId, topicId, postId);
            showToast("Comment deleted (offline)", "success");
          }
          if (contentEl) {
            contentEl.textContent = "[Comment deleted]";
            contentEl.classList.add("comment-deleted");
          }
        } catch (err) {
          console.warn("Delete failed:", err);
          showToast("Failed to delete comment", "error");
        } finally {
          pendingDelete = null;
        }
      }
      return;
    }

    // Report button handler
    const reportBtn = e.target.closest(".btn-report");
    if (reportBtn) {
      if (!CURRENT_USER) {
        showToast("Please sign in to report", "info");
        window.location.href = `login.html?redirect=${encodeURIComponent(
          window.location.href
        )}`;
        return;
      }
      const commentEl = reportBtn.closest(".comment");
      if (!commentEl) return;

      const commentId = commentEl.getAttribute("data-comment-id");
      const authorId = reportBtn.dataset.authorId || "";
      const authorName = reportBtn.dataset.authorName || "Anonymous";
      const authorEmail = reportBtn.dataset.authorEmail || "";

      // Get topic and post names for context
      const topicName =
        document.querySelector(".post-topic-name")?.textContent ||
        "Unknown Topic";
      const postTitle =
        document.querySelector(".post-header-title")?.textContent ||
        "Unknown Post";

      openReportModal({
        targetId: authorId,
        targetEmail: authorEmail,
        targetName: authorName,
        contextType: "comment",
        contextId: postId,
        contextName: `${topicName} > ${postTitle}`,
        contentId: commentId,
        contentType: "comment",
      });
      return;
    }
  });
}

// Toggle reply form
function toggleReplyForm(commentId) {
  const f = document.getElementById(`reply-form-${commentId}`);
  if (!f) return;
  const isHidden = f.style.display === "none" || f.style.display === "";
  f.style.display = isHidden ? "flex" : "none";
  f.setAttribute("aria-hidden", isHidden ? "false" : "true");
  const trigger = document.querySelector(
    `.comment[data-comment-id="${commentId}"] .btn-reply`
  );
  if (trigger)
    trigger.setAttribute("aria-expanded", isHidden ? "true" : "false");
  if (isHidden) {
    const input = f.querySelector(".reply-input");
    if (input) input.focus();
  }
}

// Inline editor
function openInlineEditor(commentEl, commentData = {}, topicId, postId) {
  try {
    const contentEl = commentEl.querySelector(".comment-content");
    if (!contentEl) return;
    const old = commentData.content || contentEl.textContent || "";
    const textarea = document.createElement("textarea");
    textarea.className = "edit-textarea";
    textarea.value = old;
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    const container = document.createElement("div");
    container.className = "edit-controls";
    container.appendChild(saveBtn);
    container.appendChild(cancelBtn);
    contentEl.replaceWith(textarea);
    commentEl.querySelector(".comment-body").appendChild(container);
    textarea.focus();

    cancelBtn.onclick = () => {
      textarea.replaceWith(
        createElementFromHtml(
          `<div class="comment-content">${renderMarkdownToHtml(old)}</div>`
        )
      );
      container.remove();
    };

    saveBtn.onclick = async () => {
      const v = textarea.value.trim();
      if (!v) {
        showToast("Comment cannot be empty", "error");
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      try {
        await patchCommentServer(commentData.id, { content: v });
        showToast("Comment updated", "success");
      } catch (err) {
        try {
          await patchCommentLocal(commentData.id, topicId, postId, {
            content: v,
          });
          showToast("Comment updated locally (offline)", "success");
        } catch {
          showToast("Failed to update comment", "error");
          saveBtn.disabled = false;
          saveBtn.textContent = "Save";
          return;
        }
      }
      await loadAndRenderComments(topicId, postId, { reset: true });
    };
  } catch (err) {
    console.warn("openInlineEditor failed:", err);
  }
}

// Load & render comments
async function loadAndRenderComments(
  topicId,
  postId,
  { reset = false, focusCommentId = null } = {}
) {
  const commentsContainer = document.getElementById("commentsList");
  const countEl = document.getElementById("commentsCount");
  if (!commentsContainer) return;

  try {
    if (reset) {
      commentsContainer.innerHTML = `<div class="loader"><div class="loader-spinner"></div></div>`;
      nextCursorGlobal = null;
      existingCommentsCache.clear();
    } else {
      const existingBtn = document.getElementById("loadMoreBtn");
      if (existingBtn) {
        existingBtn.innerHTML = '<span class="spinner"></span> Loading...';
        existingBtn.disabled = true;
      }
    }

    loadingComments = true;

    const resp = await fetchCommentsServer(topicId, postId, {
      limit: COMMENTS_PAGE_LIMIT,
      cursor: reset ? null : nextCursorGlobal,
      sort: document.getElementById("commentSortDropdown")?.value || "newest",
    });

    let newComments = [];
    if (resp && resp.comments) {
      newComments = resp.comments;
      nextCursorGlobal = resp.nextCursor || null;
    } else {
      if (reset) {
        newComments = await getCommentsLocal(topicId, postId);
      }
      nextCursorGlobal = null;
    }

    if (reset) {
      commentsContainer.innerHTML = "";
      const fragment = document.createDocumentFragment();
      const roots = buildTree(newComments);
      roots.forEach((root) =>
        renderCommentTree(root, fragment, topicId, postId)
      );
      commentsContainer.appendChild(fragment);
      newComments.forEach((c) => existingCommentsCache.set(String(c.id), c));
    } else {
      const filtered = newComments.filter(
        (c) =>
          !existingCommentsCache.has(String(c.id)) &&
          !document.querySelector(`.comment[data-comment-id="${c.id}"]`)
      );
      filtered.forEach((c) => existingCommentsCache.set(String(c.id), c));
      const topLevel = filtered.filter((c) => !c.parent_id);
      const roots = buildTree(topLevel);
      const fragment = document.createDocumentFragment();
      roots.forEach((root) =>
        renderCommentTree(root, fragment, topicId, postId)
      );
      commentsContainer.appendChild(fragment);
      const replyCandidates = filtered.filter((c) => c.parent_id);
      for (const reply of replyCandidates) {
        const parentNode = document.querySelector(
          `.comment[data-comment-id="${reply.parent_id}"]`
        );
        if (parentNode) {
          let childrenContainer = parentNode.querySelector(".children");
          if (!childrenContainer) {
            childrenContainer = document.createElement("div");
            childrenContainer.className = "children";
            parentNode.appendChild(childrenContainer);
          }
          renderCommentTree(reply, childrenContainer, topicId, postId);
        } else {
          renderCommentTree(reply, commentsContainer, topicId, postId);
        }
      }
    }

    const existingLoad = document.getElementById("loadMoreBtn");
    if (existingLoad) existingLoad.remove();
    if (nextCursorGlobal) {
      const loadMore = document.createElement("button");
      loadMore.id = "loadMoreBtn";
      loadMore.className = "load-more btn";
      loadMore.innerHTML =
        '<i class="bi bi-chevron-down"></i> Load more comments';
      loadMore.onclick = async () => {
        if (loadingComments) return;
        await loadAndRenderComments(topicId, postId, { reset: false });
      };
      commentsContainer.appendChild(loadMore);
    }

    const allCommentsCount = document.querySelectorAll(".comment").length;
    if (countEl)
      countEl.textContent = allCommentsCount ? `(${allCommentsCount})` : "";

    if (focusCommentId) {
      requestAnimationFrame(() => {
        const el = document.querySelector(
          `.comment[data-comment-id="${focusCommentId}"]`
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.style.transition = "box-shadow 0.4s ease";
          el.style.boxShadow = "0 0 0 3px rgba(76,175,80,0.14)";
          setTimeout(() => (el.style.boxShadow = ""), 1200);
        }
      });
    }
  } catch (err) {
    console.error("loadAndRenderComments error:", err);
    showToast("Failed to load comments", "error");
  } finally {
    loadingComments = false;
    const existingBtn = document.getElementById("loadMoreBtn");
    if (existingBtn) existingBtn.disabled = false;
  }
}

// Quick comment wiring
function wireQuickCommentHandlers(topicId, postId) {
  const input = document.getElementById("quickCommentInput");
  const btn = document.getElementById("createCommentBtn");
  if (input) {
    const clonedInput = input.cloneNode(true);
    input.parentNode.replaceChild(clonedInput, input);
    clonedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const clickBtn = document.getElementById("createCommentBtn");
        if (clickBtn) clickBtn.click();
      }
    });
  }
  if (btn) {
    btn.onclick = async () => {
      if (!CURRENT_USER) {
        showToast("Please sign in to comment", "info");
        window.location.href = `login.html?redirect=${encodeURIComponent(
          window.location.href
        )}`;
        return;
      }
      const txt = (
        document.getElementById("quickCommentInput").value || ""
      ).trim();
      if (!txt) {
        showToast("Comment cannot be empty", "error");
        return;
      }
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="bi bi-hourglass"></i> Posting...';
      btn.disabled = true;

      const temp = {
        id: "temp-" + Date.now(),
        author_name: CURRENT_USER?.displayName || "You",
        author_id: CURRENT_USER?.uid || "local",
        author_avatar: CURRENT_USER?.photo || null,
        content: txt,
        created_at: new Date().toISOString(),
        is_deleted: false,
        parent_id: null,
      };
      const list = document.getElementById("commentsList");
      const tempNode = createCommentNode(temp, topicId, postId);
      if (list) list.insertBefore(tempNode, list.firstChild);
      document.getElementById("quickCommentInput").value = "";

      try {
        const res = await postCommentServer(topicId, postId, { content: txt });
        const createdId =
          (res && res.comment && res.comment.id) || res.id || null;
        showToast("Comment posted successfully", "success");
        await loadAndRenderComments(topicId, postId, {
          reset: true,
          focusCommentId: createdId || null,
        });
      } catch (e) {
        try {
          const local = await createCommentLocal(topicId, postId, {
            content: txt,
          });
          showToast("Comment saved locally (offline mode)", "success");
          await loadAndRenderComments(topicId, postId, {
            reset: true,
            focusCommentId: local.id,
          });
        } catch {
          showToast("Failed to post comment", "error");
        }
      } finally {
        btn.innerHTML =
          originalText || '<i class="bi bi-send"></i> Post Comment';
        btn.disabled = false;
      }
    };
  }
}

// Set quick-comment UI based on auth state (small UX fallback for unauthenticated users)
function setCommentAuthState(isAuthed, topicId, postId) {
  const input = document.getElementById("quickCommentInput");
  const btn = document.getElementById("createCommentBtn");
  if (!input || !btn) return;
  if (!isAuthed) {
    input.placeholder = "Sign in to comment";
    input.disabled = true;
    btn.innerHTML =
      '<i class="bi bi-box-arrow-in-right"></i> Sign in to comment';
    btn.disabled = false;
    btn.onclick = () => {
      window.location.href = `login.html?redirect=${encodeURIComponent(
        window.location.href
      )}`;
    };
  } else {
    input.placeholder = "Write a comment...";
    input.disabled = false;
    wireQuickCommentHandlers(topicId, postId);
  }
}

// Sync local -> server
async function syncLocalComments(topicId, postId) {
  try {
    const key = commentsKey(topicId, postId);
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(arr) || arr.length === 0) return;
    const candidates = arr.filter(
      (c) =>
        String(c.id).startsWith("local-") || String(c.id).startsWith("temp-")
    );
    if (candidates.length === 0) return;
    showToast(`Syncing ${candidates.length} offline comment(s)...`, "info");
    for (const c of candidates) {
      try {
        await postCommentServer(topicId, postId, {
          content: c.content,
          parent_id: c.parent_id || null,
        });
        const updated = JSON.parse(localStorage.getItem(key) || "[]").filter(
          (x) => String(x.id) !== String(c.id)
        );
        localStorage.setItem(key, JSON.stringify(updated));
        showToast("Offline comment synced", "success");
      } catch (err) {
        console.warn("syncLocalComments: failed to sync one comment", err);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    await loadAndRenderComments(topicId, postId, { reset: true });
  } catch (err) {
    console.error("syncLocalComments error:", err);
  }
}

// Init
(async function init() {
  await waitForAuth();
  hydrateCurrentUser(auth.currentUser).catch(() => {});

  const params = new URLSearchParams(window.location.search);
  const topicId =
    params.get("topic") || params.get("id") || params.get("topicId");
  const postId = params.get("post") || params.get("postId");

  if (!topicId || !postId) {
    window.location.href = "discussion.html";
    return;
  }

  CURRENT_TOPIC_ID = topicId;
  CURRENT_POST_ID = postId;

  try {
    wireQuickCommentHandlers(topicId, postId);
    setupCommentDelegation(topicId, postId);
  } catch (e) {
    console.warn("wire failed", e);
  }

  setCommentAuthState(!!auth.currentUser, topicId, postId);

  // Load post header (server-first)
  try {
    const j = await fetchJsonWithAuth(
      apiUrl(`/api/topics/${encodeURIComponent(topicId)}/posts`),
      { method: "GET" }
    );
    const posts = j.posts || (Array.isArray(j) ? j : []);
    const post = posts.find((p) => String(p.id) === String(postId));
    if (post) {
      const titleEl = document.getElementById("postTitle");
      if (titleEl) titleEl.textContent = post.title || "Untitled";
      const authorNameEl = document.getElementById("postAuthorName");
      if (authorNameEl)
        authorNameEl.textContent =
          post.author || post.author_name || "Anonymous";
      const postAuthorAvatar = document.getElementById("postAuthorAvatar");
      if (postAuthorAvatar) {
        if (post.author_avatar)
          postAuthorAvatar.innerHTML = `<img src="${post.author_avatar}" alt="${
            post.author || "Author"
          } avatar">`;
        else
          postAuthorAvatar.textContent =
            (post.author || "")[0]?.toUpperCase() || "?";
      }
      const timeEl = document.getElementById("postTime");
      if (timeEl)
        timeEl.textContent = relativeTime(post.created_at || post.created);
      const contentEl = document.getElementById("postContent");
      if (contentEl)
        contentEl.innerHTML = renderMarkdownToHtml(
          post.content || post.body || ""
        );
      const breadcrumbEl = document.getElementById("postBreadcrumb");
      if (breadcrumbEl) breadcrumbEl.textContent = post.title || "Post";
    }
  } catch (e) {
    console.warn("Could not fetch post:", e);
  }

  await loadAndRenderComments(topicId, postId, { reset: true });
  try {
    await syncLocalComments(topicId, postId);
  } catch (err) {
    console.warn("Initial sync failed:", err);
  }
  window.addEventListener("online", () => {
    syncLocalComments(topicId, postId).catch(() => {});
  });

  const sortEl = document.getElementById("commentSortDropdown");
  if (sortEl)
    sortEl.addEventListener("change", async () => {
      await loadAndRenderComments(topicId, postId, { reset: true });
    });

  const backBtn = document.getElementById("backToTopic");
  if (backBtn)
    backBtn.addEventListener("click", () => {
      window.location.href = `topic.html?id=${encodeURIComponent(topicId)}`;
    });
})();
