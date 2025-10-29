const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const admin = require("../config/firebase-admin"); // used to resolve author display names from Firestore
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

/**
 * Build a public URL for a stored profile file when only filename exists.
 * Returns null if URL cannot be built.
 */
async function getPublicAvatarUrlFromFilename(photoFilename) {
  try {
    if (!photoFilename) return null;
    const bucket = "profiles";
    // photoFilename is stored as uploaded in uploads.js (e.g. "profiles/<uid>/<uuid>.png")
    const { data: publicUrlData, error: publicUrlError } =
      await supabase.storage.from(bucket).getPublicUrl(photoFilename);
    if (publicUrlError) {
      console.warn(
        "Supabase getPublicUrl error for",
        photoFilename,
        publicUrlError
      );
      return null;
    }
    return publicUrlData?.publicUrl || null;
  } catch (e) {
    console.warn("getPublicAvatarUrlFromFilename error:", e && e.message);
    return null;
  }
}

// Enhanced helper: resolve user data including names and avatars from Firestore
async function resolveUserData(uids) {
  const result = {};
  if (!uids || uids.size === 0) return result;
  try {
    // Get user docs in batch
    const promises = Array.from(uids).map((uid) =>
      admin.firestore().collection("users").doc(uid).get()
    );
    const snapshots = await Promise.all(promises);

    // Process each user doc
    for (let i = 0; i < snapshots.length; i++) {
      const snap = snapshots[i];
      const uid = Array.from(uids)[i];

      if (snap && snap.exists) {
        const d = snap.data();
        result[uid] = {
          name: d.displayName || d.name || d.email || uid.slice(0, 8),
          photo: d.photo || null,
          photoFilename: d.photoFilename || null,
        };
      } else {
        result[uid] = {
          name: uid.slice(0, 8),
          photo: null,
          photoFilename: null,
        };
      }
    }

    // Resolve photo URLs for users with photoFilename but no photo
    const avatarPromises = [];
    const uidOrder = [];

    for (const uid of uids) {
      const userData = result[uid];
      if (!userData.photo && userData.photoFilename) {
        avatarPromises.push(
          getPublicAvatarUrlFromFilename(userData.photoFilename)
        );
        uidOrder.push(uid);
      }
    }

    if (avatarPromises.length > 0) {
      const avatarResults = await Promise.all(avatarPromises);
      for (let i = 0; i < uidOrder.length; i++) {
        const uid = uidOrder[i];
        if (avatarResults[i]) {
          result[uid].photo = avatarResults[i];
        }
      }
    }
  } catch (err) {
    console.warn("resolveUserData error", err);
  }
  return result;
}

// Keep this for backward compatibility
async function resolveUserNames(uids) {
  const result = {};
  if (!uids || uids.size === 0) return result;

  try {
    const userData = await resolveUserData(uids);

    // Convert to simple name mapping for backward compatibility
    for (const [uid, data] of Object.entries(userData)) {
      result[uid] = data.name;
    }
  } catch (err) {
    console.warn("resolveUserNames error", err);
  }
  return result;
}

// Normalize a topic row from Supabase into a shape the frontend expects
function normalizeTopicRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || row.name || "",
    description: row.content || row.description || row.body || null,
    // standard created ISO string for frontend
    created: row.created_at || row.createdAt || row.created || null,
    viewCount:
      typeof row.views === "number"
        ? row.views
        : row.viewCount || row.view_count || 0,
    postCount:
      typeof row.post_count === "number"
        ? row.post_count
        : row.postCount || row.post_count || 0,
    authorId: row.author_id || row.authorId || null,
    // author (display string) will be attached by server when available
    author: row.author || null,
    category: (row.metadata && row.metadata.category) || row.category || null,
    tags: (row.metadata && row.metadata.tags) || row.tags || [],
    raw: row, // keep raw data available for debugging if needed
  };
}

// Normalize a post row from Supabase into a shape the frontend expects
function normalizePostRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || null,
    content: row.content || "",
    created: row.created_at || row.createdAt || row.created || null,
    authorId: row.author_id || row.authorId || null,
    author: row.author || null, // will be resolved server-side if we can
    raw: row,
  };
}

// GET /api/topics
// Returns: { topics: [ { topic... } ] }
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("topics")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase GET topics error:", error);
      return res.status(500).json({ error: error.message || "DB error" });
    }

    const rows = data || [];
    const normalized = rows.map(normalizeTopicRow);

    // collect all author ids to resolve display names in one batch
    const uids = new Set();
    normalized.forEach((t) => {
      if (t.authorId) uids.add(t.authorId);
    });

    const userDataMap = await resolveUserData(uids);

    // apply resolved names and coerce created to ISO string where possible
    // ✅ FIXED: Add userId field to match frontend expectations
    const topicsOut = normalized.map((t) => ({
      ...t,
      userId: t.authorId,
      author:
        t.author ||
        (t.authorId
          ? userDataMap[t.authorId]?.name || t.authorId.slice(0, 8)
          : "system"),
      author_avatar: t.authorId ? userDataMap[t.authorId]?.photo : null,
      created: t.created ? new Date(t.created).toISOString() : null,
    }));

    res.json({ topics: topicsOut });
  } catch (err) {
    console.error("Server error GET /api/topics:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/topics/:id  - single topic
// Returns: { topic: { ... } }
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("topics")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      console.warn(
        "Supabase GET topic by id returned error or no data:",
        error
      );
      return res.status(404).json({ error: "Topic not found" });
    }

    const topic = normalizeTopicRow(data);

    // resolve author name if possible
    if (topic.authorId) {
      const userDataMap = await resolveUserData(new Set([topic.authorId]));
      const userData = userDataMap[topic.authorId];

      topic.author =
        topic.author || userData?.name || topic.authorId.slice(0, 8);
      topic.author_avatar = userData?.photo || null;
    } else {
      topic.author = topic.author || "system";
      topic.author_avatar = null;
    }

    // ✅ FIXED: Add userId field
    topic.userId = topic.authorId;

    // Normalize created to ISO
    topic.created = topic.created
      ? new Date(topic.created).toISOString()
      : null;

    res.json({ topic });
  } catch (err) {
    console.error(`Server error GET /api/topics/${id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/topics/:id/posts - list posts for a topic
// Returns: { posts: [ ... ] }
router.get("/:id/posts", async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("topic_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`Supabase GET posts for topic ${id} error:`, error);
      return res.status(500).json({ error: error.message || "DB error" });
    }

    const rows = data || [];
    const normalized = rows.map(normalizePostRow);

    // collect author ids and resolve names
    const uids = new Set();
    normalized.forEach((p) => {
      if (p.authorId) uids.add(p.authorId);
    });

    const userDataMap = await resolveUserData(uids);

    const postsOut = normalized.map((p) => ({
      ...p,
      author:
        p.author ||
        (p.authorId
          ? userDataMap[p.authorId]?.name || p.authorId.slice(0, 8)
          : "Anonymous"),
      author_avatar: p.authorId ? userDataMap[p.authorId]?.photo : null,
      created: p.created ? new Date(p.created).toISOString() : null,
    }));

    res.json({ posts: postsOut });
  } catch (err) {
    console.error(`Server error GET /api/topics/${id}/posts:`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/topics  (protected)
router.post("/", firebaseAuthMiddleware, async (req, res) => {
  try {
    const uid = req.user && req.user.uid ? req.user.uid : null;
    const { title, content, metadata = null } = req.body;

    if (!title || title.trim() === "") {
      return res.status(400).json({ error: "Title is required" });
    }

    const payload = {
      title: title.trim(),
      content: content || null,
      author_id: uid || null,
      metadata,
      views: 0,
      post_count: 0,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("topics")
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error("Supabase INSERT topic error:", error);
      return res.status(500).json({ error: error.message || "DB error" });
    }

    // normalize and attach author name if possible
    const topic = normalizeTopicRow(data);
    if (topic.authorId) {
      const userDataMap = await resolveUserData(new Set([topic.authorId]));
      const userData = userDataMap[topic.authorId];

      topic.author = userData?.name || topic.authorId.slice(0, 8);
      topic.author_avatar = userData?.photo || null;
    } else {
      topic.author = topic.author || "system";
      topic.author_avatar = null;
    }

    // ✅ FIXED: Add userId field
    topic.userId = topic.authorId;

    topic.created = topic.created
      ? new Date(topic.created).toISOString()
      : null;

    res.status(201).json({ topic });
  } catch (err) {
    console.error("Server error POST /api/topics:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: PUT /api/topics/:id (edit topic - owner only)
// Protected: requires valid Firebase ID token, ownership required
router.put("/:id", firebaseAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const uid = req.user && req.user.uid;
  const { title, content, metadata = null } = req.body;

  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  try {
    // Fetch existing topic
    const { data: existingTopic, error: fetchErr } = await supabase
      .from("topics")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !existingTopic) {
      console.warn("Topic not found for edit:", id, fetchErr);
      return res.status(404).json({ error: "Topic not found" });
    }

    // Authorization: only author can edit
    if (String(existingTopic.author_id) !== String(uid)) {
      return res
        .status(403)
        .json({ error: "You can only edit your own topics" });
    }

    // Build update payload
    const updatePayload = {};
    if (typeof title !== "undefined" && title !== null) {
      updatePayload.title = title.trim();
    }
    if (typeof content !== "undefined" && content !== null) {
      updatePayload.content = content;
    }
    if (typeof metadata !== "undefined" && metadata !== null) {
      updatePayload.metadata = metadata;
    }
    updatePayload.updated_at = new Date().toISOString();

    // Update topic
    const { data, error } = await supabase
      .from("topics")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase UPDATE topic error:", error);
      return res.status(500).json({ error: error.message || "DB error" });
    }

    // Normalize and resolve author
    const topic = normalizeTopicRow(data);
    if (topic.authorId) {
      const userDataMap = await resolveUserData(new Set([topic.authorId]));
      const userData = userDataMap[topic.authorId];

      topic.author = userData?.name || topic.authorId.slice(0, 8);
      topic.author_avatar = userData?.photo || null;
    }

    // ✅ FIXED: Add userId field
    topic.userId = topic.authorId;

    topic.created = topic.created
      ? new Date(topic.created).toISOString()
      : null;

    res.status(200).json({ topic });
  } catch (err) {
    console.error(`Server error PUT /api/topics/${id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: DELETE /api/topics/:id (delete topic - owner only)
// Protected: requires valid Firebase ID token, ownership required
router.delete("/:id", firebaseAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const uid = req.user && req.user.uid;

  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  try {
    // Fetch existing topic
    const { data: existingTopic, error: fetchErr } = await supabase
      .from("topics")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !existingTopic) {
      console.warn("Topic not found for delete:", id, fetchErr);
      return res.status(404).json({ error: "Topic not found" });
    }

    // Authorization: only author can delete
    if (String(existingTopic.author_id) !== String(uid)) {
      return res
        .status(403)
        .json({ error: "You can only delete your own topics" });
    }

    // Delete associated posts (cascade)
    const { error: postsDelErr } = await supabase
      .from("posts")
      .delete()
      .eq("topic_id", id);

    if (postsDelErr) {
      console.warn(
        "Failed to delete associated posts (non-fatal):",
        postsDelErr
      );
      // Continue anyway
    }

    // Delete the topic
    const { error: delErr } = await supabase
      .from("topics")
      .delete()
      .eq("id", id);

    if (delErr) {
      console.error("Supabase DELETE topic error:", delErr);
      return res.status(500).json({ error: delErr.message || "DB error" });
    }

    res.status(204).send();
  } catch (err) {
    console.error(`Server error DELETE /api/topics/${id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/topics/:id/posts  (create a post/reply) - protected
router.post("/:id/posts", firebaseAuthMiddleware, async (req, res) => {
  const { id: topicId } = req.params;
  const { title = null, content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Post content is required" });
  }

  try {
    // Ensure topic exists and get current post_count (if any)
    const { data: topicData, error: topicError } = await supabase
      .from("topics")
      .select("id, post_count")
      .eq("id", topicId)
      .single();

    if (topicError || !topicData) {
      console.warn(
        "Attempt to create post for non-existent topic:",
        topicId,
        topicError
      );
      return res.status(404).json({ error: "Topic not found" });
    }

    const payload = {
      topic_id: topicId,
      title: title ? title.trim() : null,
      content: content.trim(),
      author_id: req.user.uid,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("posts")
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error("Supabase INSERT post error:", error);
      return res.status(500).json({ error: error.message || "DB error" });
    }

    // Safe non-atomic update of post_count: read value we already have, increment and write back.
    try {
      const currentCount =
        topicData && typeof topicData.post_count === "number"
          ? topicData.post_count
          : 0;
      const newCount = currentCount + 1;
      const { error: upErr } = await supabase
        .from("topics")
        .update({ post_count: newCount })
        .eq("id", topicId);

      if (upErr) {
        // Log but do not fail the request
        console.warn("Failed to update topic post_count (non-fatal):", upErr);
      }
    } catch (ucErr) {
      console.warn("Failed to update topic post_count (non-fatal):", ucErr);
    }

    // Normalize post and attach author display name and avatar
    const post = normalizePostRow(data);
    if (post.authorId) {
      const userDataMap = await resolveUserData(new Set([post.authorId]));
      const userData = userDataMap[post.authorId];

      post.author = userData?.name || post.authorId.slice(0, 8);
      post.author_avatar = userData?.photo || null;
    } else {
      post.author = "Anonymous";
      post.author_avatar = null;
    }
    post.created = post.created ? new Date(post.created).toISOString() : null;

    res.status(201).json({ post });
  } catch (err) {
    console.error(`Server error POST /api/topics/${topicId}/posts:`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/topics/:id/view  (increment view count)
router.post("/:id/view", async (req, res) => {
  const { id } = req.params;
  try {
    // Read current value
    const selectResp = await supabase
      .from("topics")
      .select("views")
      .eq("id", id)
      .single();

    if (selectResp.error || !selectResp.data) {
      console.warn(
        "Topic not found when incrementing view:",
        id,
        selectResp.error
      );
      return res.status(404).json({ error: "Topic not found" });
    }

    const currentViews =
      selectResp.data && typeof selectResp.data.views === "number"
        ? selectResp.data.views
        : 0;
    const newViews = currentViews + 1;

    // First try to update with latest_activity (works if column exists)
    let updateResp = await supabase
      .from("topics")
      .update({ views: newViews, latest_activity: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    // If updateResp.error indicates missing column 'latest_activity', retry updating only views.
    if (updateResp && updateResp.error) {
      const errMsg = String(updateResp.error.message || updateResp.error);
      console.warn(
        "Supabase increment view error (first attempt):",
        updateResp.error
      );
      if (
        errMsg.match(/latest_activity/i) ||
        errMsg.match(/could not find the .* latest_activity/i)
      ) {
        // Retry without latest_activity column
        const retryResp = await supabase
          .from("topics")
          .update({ views: newViews })
          .eq("id", id)
          .select()
          .single();

        if (retryResp.error) {
          console.error(
            "Supabase increment view error (retry without latest_activity):",
            retryResp.error
          );
          return res
            .status(500)
            .json({ error: retryResp.error.message || "DB error" });
        }
        updateResp = retryResp;
      } else {
        // Some other error, return 500
        return res
          .status(500)
          .json({ error: updateResp.error.message || "DB error" });
      }
    }

    // If updateResp.error is still present, handle it
    if (updateResp && updateResp.error) {
      console.error("Supabase increment view error (final):", updateResp.error);
      return res
        .status(500)
        .json({ error: updateResp.error.message || "DB error" });
    }

    // Success: normalize and return
    const topic = normalizeTopicRow(updateResp.data);

    // Add author avatar if possible
    if (topic.authorId) {
      const userDataMap = await resolveUserData(new Set([topic.authorId]));
      const userData = userDataMap[topic.authorId];

      topic.author =
        topic.author || userData?.name || topic.authorId.slice(0, 8);
      topic.author_avatar = userData?.photo || null;
    } else {
      topic.author = topic.author || null;
      topic.author_avatar = null;
    }

    // ✅ FIXED: Add userId field
    topic.userId = topic.authorId;

    topic.created = topic.created
      ? new Date(topic.created).toISOString()
      : null;

    res.json({ topic });
  } catch (err) {
    console.error("Server error POST /api/topics/:id/view:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
