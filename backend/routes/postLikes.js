// backend/routes/postLikes.js
// Like/Unlike toggle for posts using Supabase and Firebase Auth
// ✅ FIXED: Count likes from post_likes table only (no manual incrementing)
// ✅ DISABLED: Database triggers causing double-increment

const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");
const rateLimit = require("express-rate-limit");

console.log("[postLikes] ✅ Route module loaded");

// Rate limiter for like toggle
const likeToggleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many like requests, slow down" },
});

/**
 * Helper: Get actual like count from post_likes table
 * ✅ ONLY source of truth - post_likes table
 */
async function getActualLikeCount(postId) {
  const { count, error } = await supabase
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId);

  if (error) {
    console.error("[postLikes] Error counting likes:", error);
    return 0;
  }
  return count || 0;
}

/**
 * GET /:postId/likes
 * Get like count and current user's like status
 */
router.get("/:postId/likes", async (req, res) => {
  const { postId } = req.params;
  const uid = req.user && req.user.uid ? req.user.uid : null;

  console.log(
    `[postLikes] GET /:postId/likes - postId: ${postId}, uid: ${
      uid || "anonymous"
    }`
  );

  try {
    if (!postId || postId.trim() === "") {
      return res.status(400).json({ error: "Post ID required" });
    }

    // ✅ Get actual count from post_likes table (source of truth)
    const likeCount = await getActualLikeCount(postId);
    console.log(`[postLikes] ✅ Actual like count for ${postId}: ${likeCount}`);

    let userLiked = false;

    if (uid) {
      const { data: userLike, error: userLikeErr } = await supabase
        .from("post_likes")
        .select("post_id")
        .eq("post_id", postId)
        .eq("user_id", uid)
        .maybeSingle();

      if (!userLikeErr && userLike) {
        userLiked = true;
      }
    }

    return res.json({
      post_id: postId,
      likes: likeCount,
      userLiked: userLiked,
      userId: uid || null,
    });
  } catch (err) {
    console.error("[postLikes] GET error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /:postId/like
 * Toggle like/unlike on a post (PROTECTED)
 * ✅ ONLY manages post_likes table, never touches posts.likes
 */
router.post(
  "/:postId/like",
  likeToggleLimiter,
  firebaseAuthMiddleware,
  async (req, res) => {
    const { postId } = req.params;
    const uid = req.user && req.user.uid;
    const reqId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(
      `[postLikes:${reqId}] POST /:postId/like called - postId: ${postId}, uid: ${uid}`
    );

    if (!uid) {
      console.warn(`[postLikes:${reqId}] ❌ NO UID - Request rejected`);
      return res.status(401).json({ error: "Unauthorized - Please sign in" });
    }

    try {
      if (!postId || postId.trim() === "") {
        console.warn(`[postLikes:${reqId}] ❌ INVALID postId`);
        return res.status(400).json({ error: "Post ID required" });
      }

      console.log(`[postLikes:${reqId}] Step 1: Checking for existing like...`);

      // Check if user already liked this post
      const { data: existingLike, error: checkErr } = await supabase
        .from("post_likes")
        .select("post_id")
        .eq("post_id", postId)
        .eq("user_id", uid)
        .maybeSingle();

      if (checkErr) {
        console.error(
          `[postLikes:${reqId}] ❌ Error checking existing like:`,
          checkErr
        );
        return res.status(500).json({ error: "Could not process like" });
      }

      let liked = false;
      let newCount = 0;

      if (existingLike) {
        // UNLIKE
        console.log(
          `[postLikes:${reqId}] Step 2a: User already liked, UNLIKING...`
        );

        const { error: deleteErr } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", uid);

        if (deleteErr) {
          console.error(
            `[postLikes:${reqId}] ❌ Error deleting like:`,
            deleteErr
          );
          return res.status(500).json({ error: "Could not remove like" });
        }

        console.log(`[postLikes:${reqId}] ✅ Like deleted from post_likes`);
        liked = false;

        // ✅ Get actual count from table
        newCount = await getActualLikeCount(postId);
        console.log(`[postLikes:${reqId}] ✅ UNLIKED. New count: ${newCount}`);
      } else {
        // LIKE
        console.log(
          `[postLikes:${reqId}] Step 2b: User hasn't liked yet, LIKING...`
        );

        const { error: insertErr } = await supabase
          .from("post_likes")
          .insert([{ post_id: postId, user_id: uid }]);

        if (insertErr) {
          console.error(
            `[postLikes:${reqId}] ❌ Error inserting like:`,
            insertErr
          );

          if (
            insertErr.code === "23505" ||
            (insertErr.message &&
              insertErr.message.includes("unique constraint"))
          ) {
            console.warn(`[postLikes:${reqId}] Duplicate like attempt`);
            return res.status(409).json({ error: "Already liked this post" });
          }

          return res.status(500).json({ error: "Could not add like" });
        }

        console.log(`[postLikes:${reqId}] ✅ Like inserted into post_likes`);
        liked = true;

        // ✅ Get actual count from table
        newCount = await getActualLikeCount(postId);
        console.log(`[postLikes:${reqId}] ✅ LIKED. New count: ${newCount}`);
      }

      console.log(
        `[postLikes:${reqId}] ✅ SUCCESS - Returning: liked=${liked}, likes=${newCount}`
      );

      return res.json({
        liked: liked,
        likes: newCount,
      });
    } catch (err) {
      console.error(`[postLikes:${reqId}] ❌ CATCH ERROR:`, err);
      console.error(`[postLikes:${reqId}] Error stack:`, err.stack);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
