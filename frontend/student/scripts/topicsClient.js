// frontend/student/scripts/topicsClient.js
// Topics client (ES module) that uses centralized apiClient helpers for authenticated requests.
// - Replaced manual token + fetch logic with apiClient helpers (fetchJsonWithAuth, postJsonWithAuth, fetchWithAuth, postFormWithAuth)
// - Keeps server-first behavior with localStorage fallback used by discussion/topic pages.
// - Exports: getTopics, postTopic, incrementView, getTopic, getTopicPosts, postReply, editPost, deletePostApi

import { API_BASE } from "../../config/appConfig.js";
import { auth } from "../../config/firebase.js";
import fetchWithAuth, {
  fetchJsonWithAuth,
  postJsonWithAuth,
  postFormWithAuth,
} from "./apiClient.js";

// Safe JSON parse helper: returns null if no JSON body
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
  // Use fetchJsonWithAuth to get unified behaviour (attaches token when available, safe timeouts/retries).
  // This still works for public endpoints because fetchWithAuth tolerates missing token.
  try {
    return await fetchJsonWithAuth(`${API_BASE}/api/topics`, { method: "GET" });
  } catch (err) {
    // Provide same error shape as previous implementation
    throw new Error(
      "Failed to load topics: " + (err && err.message ? err.message : err)
    );
  }
}

// POST /api/topics (create topic) — attaches ID token via postJsonWithAuth
export async function postTopic(
  title,
  content,
  metadata = null,
  { forceTokenRefresh = false } = {}
) {
  if (!title || !title.trim()) throw new Error("Title is required");
  try {
    // postJsonWithAuth will use authFetch internally
    return await postJsonWithAuth(`${API_BASE}/api/topics`, {
      title: title.trim(),
      content,
      metadata,
    });
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
      // use fetchJsonWithAuth to attach token
      return await fetchJsonWithAuth(url, { method: "POST" });
    } else {
      // best-effort unauthenticated increment (public endpoint)
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
      {
        method: "GET",
      }
    );
  } catch (err) {
    throw new Error(
      "GET /api/topics/:id failed: " + (err && err.message ? err.message : "")
    );
  }
}

// GET /api/topics/:id/posts
export async function getTopicPosts(topicId) {
  if (!topicId) throw new Error("topicId required");
  try {
    return await fetchJsonWithAuth(
      `${API_BASE}/api/topics/${encodeURIComponent(topicId)}/posts`,
      { method: "GET" }
    );
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
    // Use postJsonWithAuth which centralizes token handling and error parsing
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

// PUT /api/topics/:id/posts/:postId (edit post) — protected, server must enforce ownership/roles
export async function editPost(topicId, postId, payload) {
  if (!topicId || !postId) throw new Error("topicId and postId required");
  const url = `${API_BASE}/api/topics/${encodeURIComponent(
    topicId
  )}/posts/${encodeURIComponent(postId)}`;
  try {
    // fetchJsonWithAuth throws on non-2xx and returns parsed JSON on success
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

// DELETE /api/topics/:id/posts/:postId (delete post) — protected, server must enforce ownership/roles
export async function deletePostApi(topicId, postId) {
  if (!topicId || !postId) throw new Error("topicId and postId required");
  const url = `${API_BASE}/api/topics/${encodeURIComponent(
    topicId
  )}/posts/${encodeURIComponent(postId)}`;
  try {
    // Use fetchJsonWithAuth for consistent auth/timeout/retry/error-parsing behaviour
    const parsed = await fetchJsonWithAuth(url, { method: "DELETE" });
    return parsed;
  } catch (err) {
    const e = new Error(
      "Delete post failed: " + (err && err.message ? err.message : "")
    );
    if (err && err.status) e.status = err.status;
    throw e;
  }
}
