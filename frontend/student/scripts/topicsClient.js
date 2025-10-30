// frontend/student/scripts/topicsClient.js
// Topics client (ES module) that uses centralized apiClient helpers for authenticated requests.
// ✅ FIXED: Response validation for likes field
// ✅ FIXED: Normalize posts to ensure likes field exists
// ✅ FIXED: Error handling for malformed responses
// ✅ ADDED: Get comments from API instead of localStorage

import { API_BASE } from "../../config/appConfig.js";
import { auth } from "../../config/firebase.js";
import { fetchJsonWithAuth, postJsonWithAuth } from "./apiClient.js";

// Safe JSON parse helper: returns null for no JSON body
async function parseJsonSafe(res) {
  if (!res) return null;
  const ct =
    (res.headers && res.headers.get && res.headers.get("content-type")) || "";
  if (res.status === 204 || res.status === 205) return null;
  if (ct.indexOf("application/json") === -1) {
    const text = await res.text().catch(() => "");
    return text ? text : null;
  }
  return res.json();
}

// GET /api/topics
export async function getTopics() {
  try {
    return await fetchJsonWithAuth(`${API_BASE}/api/topics`, { method: "GET" });
  } catch (err) {
    throw new Error(
      "Failed to load topics: " + (err && err.message ? err.message : err)
    );
  }
}

// ✅ FIXED: POST /api/topics (create topic) — with normalization
export async function postTopic(
  title,
  content,
  metadata = null,
  { forceTokenRefresh = false } = {}
) {
  if (!title || !title.trim()) throw new Error("Title is required");
  try {
    const response = await postJsonWithAuth(`${API_BASE}/api/topics`, {
      title: title.trim(),
      content,
      metadata,
    });

    // ✅ Normalize the response before returning
    const topicData = response.topic || response;
    const normalized = {
      id: topicData.id,
      title: topicData.title || "",
      description: topicData.content || topicData.description || "",
      category:
        (topicData.metadata && topicData.metadata.category) ||
        topicData.category ||
        "discussion",
      tags:
        (topicData.metadata && topicData.metadata.tags) || topicData.tags || [],
      author: topicData.author || "system",
      authorId: topicData.author_id || topicData.authorId || null,
      userId: topicData.author_id || topicData.userId || null,
      created: topicData.created || new Date().toISOString(),
      updated: topicData.updated || null,
      postCount: topicData.post_count || topicData.postCount || 0,
      viewCount:
        topicData.views || topicData.viewCount || topicData.view_count || 0,
      pinned: !!topicData.pinned,
      latestActivity:
        topicData.latestActivity ||
        topicData.created ||
        new Date().toISOString(),
    };

    return normalized;
  } catch (err) {
    throw new Error(
      "POST /api/topics failed: " + (err && err.message ? err.message : "")
    );
  }
}

// POST /api/topics/:id/view (increment view)
export async function incrementView(
  topicId,
  { authRequired = false, forceTokenRefresh = false } = {}
) {
  if (!topicId) throw new Error("topicId required");
  const url = `${API_BASE}/api/topics/${encodeURIComponent(topicId)}/view`;
  try {
    if (authRequired) {
      return await fetchJsonWithAuth(url, { method: "POST" });
    } else {
      const res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await parseJsonSafe(res).catch(() => "");
        throw new Error(
          "POST /api/topics/:id/view failed: " + res.status + " " + (body || "")
        );
      }
      return parseJsonSafe(res);
    }
  } catch (err) {
    throw err;
  }
}

// GET /api/topics/:id
export async function getTopic(id) {
  if (!id) throw new Error("topic id required");
  try {
    return await fetchJsonWithAuth(
      `${API_BASE}/api/topics/${encodeURIComponent(id)}`,
      { method: "GET" }
    );
  } catch (err) {
    throw new Error(
      "GET /api/topics/:id failed: " + (err && err.message ? err.message : "")
    );
  }
}

// ✅ FIXED: GET /api/topics/:id/posts - Normalize posts with likes field
export async function getTopicPosts(topicId) {
  if (!topicId) throw new Error("topicId required");
  try {
    const resp = await fetchJsonWithAuth(
      `${API_BASE}/api/topics/${encodeURIComponent(topicId)}/posts`,
      { method: "GET" }
    );

    // ✅ CRITICAL: Extract posts array
    let posts = Array.isArray(resp) ? resp : resp.posts || resp;

    // ✅ CRITICAL: Validate posts is an array
    if (!Array.isArray(posts)) {
      console.warn("[getTopicPosts] Response is not an array, wrapping:", resp);
      posts = resp && typeof resp === "object" ? [resp] : [];
    }

    // ✅ CRITICAL: Normalize each post to ensure likes field exists
    const normalized = (posts || [])
      .map((p) => {
        if (!p || typeof p !== "object") {
          console.warn("[getTopicPosts] Skipping malformed post:", p);
          return null;
        }
        return {
          id: p.id,
          title: p.title || "",
          content: p.content || "",
          author: p.author || "Anonymous",
          author_id: p.author_id || p.authorId || null,
          userId: p.userId || p.author_id || null,
          authorId: p.author_id || p.authorId || null,
          created_at: p.created_at || p.created || new Date().toISOString(),
          created: p.created_at || p.created || new Date().toISOString(),
          likes: typeof p.likes === "number" ? p.likes : 0,
          comments: p.comments || 0,
          author_avatar: p.author_avatar || null,
        };
      })
      .filter((p) => p !== null);

    console.log(
      `[getTopicPosts] ✅ Normalized ${normalized.length} posts with likes field`
    );

    return normalized;
  } catch (err) {
    throw new Error(
      "GET /api/topics/:id/posts failed: " +
        (err && err.message ? err.message : "")
    );
  }
}

// POST /api/topics/:id/posts (create reply) — protected
export async function postReply(
  topicId,
  payload = {},
  { forceTokenRefresh = false } = {}
) {
  if (!topicId) throw new Error("topicId required");
  try {
    return await postJsonWithAuth(
      `${API_BASE}/api/topics/${encodeURIComponent(topicId)}/posts`,
      payload
    );
  } catch (err) {
    throw new Error(
      "POST /api/topics/:id/posts failed: " +
        (err && err.message ? err.message : "")
    );
  }
}

// PUT /api/topics/:id/posts/:postId (edit post) — protected
export async function editPost(topicId, postId, payload) {
  if (!topicId || !postId) throw new Error("topicId and postId required");
  const url = `${API_BASE}/api/topics/${encodeURIComponent(
    topicId
  )}/posts/${encodeURIComponent(postId)}`;
  try {
    return await fetchJsonWithAuth(url, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const e = new Error(
      "Edit post failed: " + (err && err.message ? err.message : "")
    );
    if (err && err.status) e.status = err.status;
    throw e;
  }
}

// DELETE /api/topics/:id/posts/:postId (delete post) — protected
export async function deletePostApi(topicId, postId) {
  if (!topicId || !postId) throw new Error("topicId and postId required");
  const url = `${API_BASE}/api/topics/${encodeURIComponent(
    topicId
  )}/posts/${encodeURIComponent(postId)}`;
  try {
    return await fetchJsonWithAuth(url, { method: "DELETE" });
  } catch (err) {
    const e = new Error(
      "Delete post failed: " + (err && err.message ? err.message : "")
    );
    if (err && err.status) e.status = err.status;
    throw e;
  }
}

// ✅ ADDED: GET /api/topics/:topicId/posts/:postId/comments - Fetch from API
export async function getTopicComments(topicId, postId, options = {}) {
  if (!topicId || !postId) throw new Error("topicId and postId required");
  try {
    const limit = options.limit || 20;
    const sort = options.sort || "newest";
    const cursor = options.cursor || null;

    let url = `${API_BASE}/api/topics/${encodeURIComponent(
      topicId
    )}/posts/${encodeURIComponent(
      postId
    )}/comments?limit=${limit}&sort=${sort}`;

    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`;
    }

    const resp = await fetchJsonWithAuth(url, { method: "GET" });

    // ✅ Extract and normalize comments
    let comments = Array.isArray(resp) ? resp : resp.comments || resp;

    if (!Array.isArray(comments)) {
      console.warn(
        "[getTopicComments] Response is not an array, wrapping:",
        resp
      );
      comments = resp && typeof resp === "object" ? [resp] : [];
    }

    // ✅ Normalize each comment with avatar
    const normalized = (comments || [])
      .map((c) => {
        if (!c || typeof c !== "object") {
          console.warn("[getTopicComments] Skipping malformed comment:", c);
          return null;
        }
        return {
          id: c.id,
          author: c.author_name || "Anonymous",
          author_id: c.author_id || null,
          author_avatar: c.author_avatar || null, // ✅ KEY: Avatar from DB
          text: c.content || "",
          content: c.content || "",
          created: c.created_at || new Date().toISOString(),
          created_at: c.created_at || new Date().toISOString(),
          edited_at: c.edited_at || null,
          is_deleted: c.is_deleted || false,
          likes_count: c.likes_count || 0,
        };
      })
      .filter((c) => c !== null);

    console.log(
      `[getTopicComments] ✅ Loaded ${normalized.length} comments with avatars`
    );

    return {
      comments: normalized,
      nextCursor: resp.nextCursor || null,
    };
  } catch (err) {
    throw new Error(
      "GET /api/topics/:id/posts/:postId/comments failed: " +
        (err && err.message ? err.message : "")
    );
  }
}

// ✅ POST /api/topics/:topicId/posts/:postId/comments - Create comment
export async function postComment(topicId, postId, content) {
  if (!topicId || !postId) throw new Error("topicId and postId required");
  if (!content || !content.trim()) throw new Error("Comment content required");

  try {
    return await postJsonWithAuth(
      `${API_BASE}/api/topics/${encodeURIComponent(
        topicId
      )}/posts/${encodeURIComponent(postId)}/comments`,
      { content: content.trim() }
    );
  } catch (err) {
    throw new Error(
      "POST comment failed: " + (err && err.message ? err.message : "")
    );
  }
}

// ✅ GET /api/posts/:postId/likes - Get like count with validation
export async function getPostLikes(postId) {
  if (!postId) throw new Error("postId required");
  try {
    const resp = await fetchJsonWithAuth(
      `${API_BASE}/api/posts/${encodeURIComponent(postId)}/likes`,
      { method: "GET" }
    );

    return {
      likes: typeof resp.likes === "number" ? resp.likes : 0,
      userLiked: resp.userLiked === true,
      post_id: resp.post_id || postId,
    };
  } catch (err) {
    console.warn(
      "getPostLikes failed: " + (err && err.message ? err.message : "")
    );
    return { likes: 0, userLiked: false, post_id: postId };
  }
}

// ✅ POST /api/posts/:postId/like - Toggle like with response validation
export async function togglePostLike(postId) {
  if (!postId) throw new Error("postId required");
  try {
    const resp = await postJsonWithAuth(
      `${API_BASE}/api/posts/${encodeURIComponent(postId)}/like`,
      {}
    );

    if (!resp || typeof resp !== "object") {
      throw new Error("Invalid response from server");
    }

    return {
      liked: resp.liked === true,
      likes: typeof resp.likes === "number" ? resp.likes : 0,
      post_id: resp.post_id || postId,
    };
  } catch (err) {
    const e = new Error(
      "Toggle like failed: " + (err && err.message ? err.message : "")
    );
    if (err && err.status) e.status = err.status;
    throw e;
  }
}
