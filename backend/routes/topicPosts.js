// backend/routes/topicPosts.js
// Topic post edit/delete routes using Supabase and existing firebaseAuthMiddleware
// - Uses the Supabase service-role client (backend/config/supabase.js)
// - Uses firebaseAuthMiddleware to verify ID token and attach req.user (uid + admin claims)
// - Ensures ownership or admin claim before allowing edit/delete
// - Updates topic.post_count on delete (best-effort, non-atomic)
// - Robust update: if optional columns (e.g. last_edited_by, updated_at) are missing in DB, retry without them.

const express = require("express");
const supabase = require("../config/supabase");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

const router = express.Router();

// Helper: check ownership or admin claim
function checkOwnershipOrAdmin(postAuthorId, uid, userClaims) {
  if (!uid) return false;
  if (String(postAuthorId) === String(uid)) return true;
  if (userClaims && userClaims.admin === true) return true;
  return false;
}

function isMissingColumnError(err, columnName) {
  if (!err) return false;
  const msg = String(err.message || err || "").toLowerCase();
  // look for phrases Supabase/PostgREST uses about missing column or schema cache
  return (
    msg.includes(columnName.toLowerCase()) ||
    msg.includes("schema cache") ||
    msg.includes("could not find the") ||
    msg.includes("column") ||
    msg.includes("does not exist")
  );
}

// Attempt update with optional columns, retry by removing missing columns if necessary.
async function tryUpdatePostWithFallback(topicId, postId, payload) {
  // First attempt
  let resp = await supabase
    .from("posts")
    .update(payload)
    .eq("id", postId)
    .eq("topic_id", topicId)
    .select()
    .single();

  if (!resp.error) return resp;

  // If error indicates missing optional columns, compute which to drop and retry
  const optionalCols = ["last_edited_by", "updated_at"];
  const toDrop = optionalCols.filter((c) =>
    isMissingColumnError(resp.error, c)
  );

  if (toDrop.length === 0) {
    // Not a missing-column error we can handle
    return resp;
  }

  // Retry without missing columns
  const fallback = { ...payload };
  for (const c of toDrop) delete fallback[c];

  const retryResp = await supabase
    .from("posts")
    .update(fallback)
    .eq("id", postId)
    .eq("topic_id", topicId)
    .select()
    .single();

  return retryResp;
}

// PUT /api/topics/:topicId/posts/:postId
// Protected: requires valid Firebase ID token, ownership or admin required
router.put(
  "/api/topics/:topicId/posts/:postId",
  firebaseAuthMiddleware,
  async (req, res) => {
    const { topicId, postId } = req.params;
    const uid = req.user && req.user.uid;
    const claims = req.user || {};
    const { title, content } = req.body || {};

    if (typeof title === "undefined" && typeof content === "undefined") {
      return res.status(400).json({ error: "Nothing to update" });
    }

    try {
      // Fetch the post row from Supabase
      const { data: existingPost, error: fetchErr } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .eq("topic_id", topicId)
        .single();

      if (fetchErr || !existingPost) {
        return res.status(404).json({ error: "Post not found" });
      }

      // Authorization: only author or admin can edit
      if (!checkOwnershipOrAdmin(existingPost.author_id, uid, claims)) {
        return res.status(403).json({ error: "Not allowed to edit this post" });
      }

      // Build update payload (first attempt includes optional audit/timestamp)
      const attemptPayload = {};
      if (typeof title !== "undefined") attemptPayload.title = title;
      if (typeof content !== "undefined") attemptPayload.content = content;
      attemptPayload.updated_at = new Date().toISOString();
      attemptPayload.last_edited_by = uid;

      // Try update with fallback
      const updateResp = await tryUpdatePostWithFallback(
        topicId,
        postId,
        attemptPayload
      );

      if (updateResp.error) {
        console.error(
          "Supabase UPDATE post error after fallback:",
          updateResp.error
        );
        return res
          .status(500)
          .json({ error: updateResp.error.message || "DB error" });
      }

      return res.status(200).json({ post: updateResp.data });
    } catch (err) {
      console.error("PUT /api/topics/:topicId/posts/:postId error:", err);
      return res.status(500).json({ error: err.message || "Server error" });
    }
  }
);

// DELETE /api/topics/:topicId/posts/:postId
// Protected: requires valid Firebase ID token, ownership or admin required
router.delete(
  "/api/topics/:topicId/posts/:postId",
  firebaseAuthMiddleware,
  async (req, res) => {
    const { topicId, postId } = req.params;
    const uid = req.user && req.user.uid;
    const claims = req.user || {};

    try {
      // Fetch the post row from Supabase
      const { data: existingPost, error: fetchErr } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .eq("topic_id", topicId)
        .single();

      if (fetchErr || !existingPost) {
        return res.status(404).json({ error: "Post not found" });
      }

      // Authorization: only author or admin can delete
      if (!checkOwnershipOrAdmin(existingPost.author_id, uid, claims)) {
        return res
          .status(403)
          .json({ error: "Not allowed to delete this post" });
      }

      // Delete the post
      const { error: deleteErr } = await supabase
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("topic_id", topicId);

      if (deleteErr) {
        console.error("Supabase DELETE post error:", deleteErr);
        return res.status(500).json({ error: deleteErr.message || "DB error" });
      }

      // Best-effort: decrement topic post_count (non-atomic). Ignore failures.
      try {
        const { data: topicRow, error: topicFetchErr } = await supabase
          .from("topics")
          .select("post_count")
          .eq("id", topicId)
          .single();

        if (!topicFetchErr && topicRow) {
          const current =
            typeof topicRow.post_count === "number" ? topicRow.post_count : 0;
          const newCount = Math.max(0, current - 1);
          const { error: upErr } = await supabase
            .from("topics")
            .update({ post_count: newCount })
            .eq("id", topicId);

          if (upErr) {
            console.warn(
              "Failed to decrement topic.post_count (non-fatal):",
              upErr
            );
          }
        }
      } catch (ucErr) {
        console.warn(
          "Error updating topic.post_count after delete (non-fatal):",
          ucErr
        );
      }

      return res.status(204).send();
    } catch (err) {
      console.error("DELETE /api/topics/:topicId/posts/:postId error:", err);
      return res.status(500).json({ error: err.message || "Server error" });
    }
  }
);

module.exports = router;
