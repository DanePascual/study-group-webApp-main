// backend/routes/topicPosts.js
// Topic post edit/delete routes using Supabase and firebaseAuthMiddleware
// ✅ FIXED: Bulletproof like counting + no caching
// ✅ FIXED: Routes use relative paths (no /api/topics prefix)

const express = require("express");
const supabase = require("../config/supabase");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

const router = express.Router();

console.log("[topicPosts] ✅ Route module loaded");

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
  return (
    msg.includes(columnName.toLowerCase()) ||
    msg.includes("schema cache") ||
    msg.includes("could not find the") ||
    msg.includes("column") ||
    msg.includes("does not exist")
  );
}

async function tryUpdatePostWithFallback(topicId, postId, payload) {
  let resp = await supabase
    .from("posts")
    .update(payload)
    .eq("id", postId)
    .eq("topic_id", topicId)
    .select()
    .single();

  if (!resp.error) return resp;

  const optionalCols = ["last_edited_by", "updated_at"];
  const toDrop = optionalCols.filter((c) =>
    isMissingColumnError(resp.error, c)
  );

  if (toDrop.length === 0) {
    return resp;
  }

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

// ✅ BULLETPROOF: Get like count from post_likes table
async function getLikeCountForPosts(postIds) {
  if (!postIds || postIds.length === 0) {
    console.log("[topicPosts] 🔍 No post IDs provided");
    return {};
  }

  console.log(
    "[topicPosts] 🔍 Getting like counts for postIds:",
    JSON.stringify(postIds)
  );

  try {
    // ✅ Fetch ALL likes from post_likes table
    const { data: allLikes, error } = await supabase
      .from("post_likes")
      .select("post_id");

    console.log("[topicPosts] 🔍 Query error:", error);
    console.log(
      "[topicPosts] 🔍 Total likes in table:",
      allLikes ? allLikes.length : 0
    );
    console.log(
      "[topicPosts] 🔍 Query returned likes:",
      JSON.stringify(allLikes)
    );

    if (error) {
      console.error("[topicPosts] ❌ Query error:", error);
      return {};
    }

    // Filter to only the postIds we care about
    const filteredLikes = (allLikes || []).filter((like) =>
      postIds.includes(like.post_id)
    );

    console.log(
      "[topicPosts] 🔍 Filtered likes for our posts:",
      JSON.stringify(filteredLikes)
    );

    // Count likes per post
    const likeCounts = {};
    (filteredLikes || []).forEach((like) => {
      likeCounts[like.post_id] = (likeCounts[like.post_id] || 0) + 1;
    });

    console.log(
      "[topicPosts] ✅ Final likeCounts:",
      JSON.stringify(likeCounts)
    );

    // Log each post's count
    postIds.forEach((postId) => {
      console.log(
        `[topicPosts] ✅ Post ${postId}: ${likeCounts[postId] || 0} likes`
      );
    });

    return likeCounts;
  } catch (err) {
    console.error("[topicPosts] ❌ Exception in getLikeCountForPosts:", err);
    return {};
  }
}

// ✅ GET /api/topics/:topicId/posts - COUNT LIKES FROM post_likes TABLE
router.get("/:topicId/posts", async (req, res) => {
  const { topicId } = req.params;

  // ✅ CRITICAL: Disable HTTP caching
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("ETag", "false");

  try {
    if (!topicId || topicId.trim() === "") {
      return res.status(400).json({ error: "Topic ID required" });
    }

    console.log(`[topicPosts] GET /:topicId/posts - topicId: ${topicId}`);

    // Fetch posts
    const { data: posts, error } = await supabase
      .from("posts")
      .select(
        "id, title, content, author_id, created_at, comments, author_avatar"
      )
      .eq("topic_id", topicId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[topicPosts] ❌ GET error:", error);
      return res.status(500).json({ error: "Could not fetch posts" });
    }

    console.log(`[topicPosts] ✅ Fetched ${(posts || []).length} posts`);

    // ✅ Get actual like counts from post_likes table
    const postIds = (posts || []).map((p) => p.id);
    console.log(
      `[topicPosts] 🔍 Post IDs to get likes for:`,
      JSON.stringify(postIds)
    );

    const likeCounts = await getLikeCountForPosts(postIds);

    // ✅ Normalize response with accurate like counts
    const normalized = (posts || []).map((p) => {
      const likeCount = likeCounts[p.id] || 0;
      console.log(
        `[topicPosts] 📊 Final: Post ${p.id} will have ${likeCount} likes`
      );
      return {
        ...p,
        likes: likeCount,
        comments: typeof p.comments === "number" ? p.comments : 0,
      };
    });

    console.log(
      `[topicPosts] ✅ Returning ${normalized.length} posts with like counts`
    );

    return res.json({ posts: normalized });
  } catch (err) {
    console.error("[topicPosts] ❌ Unexpected error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ✅ FIXED: PUT /:topicId/posts/:postId (relative path, no /api/topics)
router.put(
  "/:topicId/posts/:postId",
  firebaseAuthMiddleware,
  async (req, res) => {
    const { topicId, postId } = req.params;
    const uid = req.user && req.user.uid;
    const claims = req.user || {};
    const { title, content } = req.body || {};

    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );

    if (typeof title === "undefined" && typeof content === "undefined") {
      return res.status(400).json({ error: "Nothing to update" });
    }

    try {
      const { data: existingPost, error: fetchErr } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .eq("topic_id", topicId)
        .single();

      if (fetchErr || !existingPost) {
        return res.status(404).json({ error: "Post not found" });
      }

      if (!checkOwnershipOrAdmin(existingPost.author_id, uid, claims)) {
        return res.status(403).json({ error: "Not allowed to edit this post" });
      }

      const attemptPayload = {};
      if (typeof title !== "undefined") attemptPayload.title = title;
      if (typeof content !== "undefined") attemptPayload.content = content;
      attemptPayload.updated_at = new Date().toISOString();
      attemptPayload.last_edited_by = uid;

      const updateResp = await tryUpdatePostWithFallback(
        topicId,
        postId,
        attemptPayload
      );

      if (updateResp.error) {
        console.error("[topicPosts] PUT error:", updateResp.error);
        return res
          .status(500)
          .json({ error: updateResp.error.message || "DB error" });
      }

      const likeCount = await getLikeCountForPosts([postId]);
      const post = updateResp.data || {};
      post.likes = likeCount[postId] || 0;

      return res.status(200).json({ post });
    } catch (err) {
      console.error("[topicPosts] PUT exception:", err);
      return res.status(500).json({ error: err.message || "Server error" });
    }
  }
);

// ✅ FIXED: DELETE /:topicId/posts/:postId (relative path, no /api/topics)
router.delete(
  "/:topicId/posts/:postId",
  firebaseAuthMiddleware,
  async (req, res) => {
    const { topicId, postId } = req.params;
    const uid = req.user && req.user.uid;
    const claims = req.user || {};

    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );

    try {
      const { data: existingPost, error: fetchErr } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .eq("topic_id", topicId)
        .single();

      if (fetchErr || !existingPost) {
        return res.status(404).json({ error: "Post not found" });
      }

      if (!checkOwnershipOrAdmin(existingPost.author_id, uid, claims)) {
        return res
          .status(403)
          .json({ error: "Not allowed to delete this post" });
      }

      const { error: deleteErr } = await supabase
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("topic_id", topicId);

      if (deleteErr) {
        console.error("[topicPosts] DELETE error:", deleteErr);
        return res.status(500).json({ error: deleteErr.message || "DB error" });
      }

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
            console.warn("[topicPosts] Failed to decrement post_count:", upErr);
          }
        }
      } catch (ucErr) {
        console.warn("[topicPosts] Error updating post_count:", ucErr);
      }

      try {
        const { error: likesErr } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", postId);

        if (likesErr) {
          console.warn("[topicPosts] Failed to delete post likes:", likesErr);
        }
      } catch (likesErr) {
        console.warn("[topicPosts] Error deleting post likes:", likesErr);
      }

      return res.status(204).send();
    } catch (err) {
      console.error("[topicPosts] DELETE exception:", err);
      return res.status(500).json({ error: err.message || "Server error" });
    }
  }
);

module.exports = router;
