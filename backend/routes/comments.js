/**
 * backend/routes/comments.js
 *
 * Hardened comments API:
 * - Consistent response shapes
 * - Robust RPC normalization and fallbacks
 * - Use sanitize-html for content sanitization
 * - Use .select().single() on inserts/updates to return created/updated rows
 * - Rate limiting on create comment and like endpoints to reduce abuse
 * - Clear server-side logging and friendly client error messages
 *
 * NOTE:
 * - This file expects the following to exist in your project:
 *   - backend/config/supabase.js (exports a Supabase service-role client)
 *   - backend/config/firebase-admin.js (firebase-admin initialized)
 *   - backend/middleware/firebaseAuthMiddleware.js (attaches req.user with uid and admin)
 * - Run `npm install sanitize-html express-rate-limit` in the backend if not already present.
 */

const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const admin = require("../config/firebase-admin");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");
const notificationService = require("../services/notificationService");

const sanitizeHtml = require("sanitize-html");
const rateLimit = require("express-rate-limit");

// Rate limiters
const createCommentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per IP per minute for creating comments
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down" },
});

const likeToggleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // likes are lightweight, slightly higher limit
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down" },
});

// Helpers

function normalizeRpcResult(rpcResult) {
  if (rpcResult === null || typeof rpcResult === "undefined") return null;
  // Supabase RPC can return scalar, array, or object
  if (Array.isArray(rpcResult)) {
    if (rpcResult.length === 0) return null;
    // If array of rows, try to extract a count-like field
    const first = rpcResult[0];
    if (typeof first === "object") {
      return first.likes_count || first.count || first.value || null;
    }
    return first;
  }
  if (typeof rpcResult === "object") {
    if ("likes_count" in rpcResult) return rpcResult.likes_count;
    if ("count" in rpcResult) return rpcResult.count;
    if ("value" in rpcResult) return rpcResult.value;
    // fallback to object itself
    return rpcResult;
  }
  // scalar
  return rpcResult;
}

function friendlyServerError(res, err, logMessage = "Server error") {
  console.error(logMessage, err && err.message ? err.message : err);
  return res.status(500).json({ error: "An internal server error occurred" });
}

function sanitizeContent(content) {
  // Allow minimal formatting for comments: bold, italics, code, links
  return sanitizeHtml(content || "", {
    allowedTags: ["b", "i", "em", "strong", "code", "pre", "a", "br", "p"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    transformTags: {
      a: (tagName, attribs) => {
        // ensure external links open safely
        const href = attribs.href || "";
        return {
          tagName: "a",
          attribs: {
            href,
            target: "_blank",
            rel: "noopener noreferrer",
          },
        };
      },
    },
  });
}

// Light legacy fallback — we keep it for minimal script-stripping, but prefer sanitizeHtml above
function stripScriptTags(s) {
  if (!s || typeof s !== "string") return s || "";
  return s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
}

/**
 * Create a comment (protected)
 * POST /api/topics/:topicId/posts/:postId/comments
 */
router.post(
  "/topics/:topicId/posts/:postId/comments",
  createCommentLimiter,
  firebaseAuthMiddleware,
  async (req, res) => {
    const { topicId, postId } = req.params;
    const uid = req.user && req.user.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const { content, parent_id = null } = req.body || {};
    if (!content || String(content).trim() === "") {
      return res.status(400).json({ error: "Comment content required" });
    }
    if (String(content).length > 3000) {
      return res
        .status(400)
        .json({ error: "Comment too long (max 3000 characters)" });
    }

    try {
      // Ensure post exists (server-side authoritative)
      const { data: postExists, error: postErr } = await supabase
        .from("posts")
        .select("id, topic_id")
        .eq("id", postId)
        .maybeSingle();

      if (postErr) {
        console.warn("Error checking post existence:", postErr);
        return res.status(500).json({ error: "Could not verify post" });
      }
      if (!postExists) {
        return res.status(404).json({ error: "Post not found" });
      }
      // Also ensure the post belongs to the requested topic (defensive)
      if (String(postExists.topic_id) !== String(topicId)) {
        return res.status(400).json({ error: "Topic and post mismatch" });
      }

      // Resolve user display info (best-effort)
      let author_name = uid.slice(0, 8);
      let author_avatar = null;
      try {
        const udoc = await admin.firestore().collection("users").doc(uid).get();
        if (udoc && udoc.exists) {
          const ud = udoc.data() || {};
          author_name = ud.displayName || ud.name || ud.email || author_name;
          author_avatar = ud.photo || null;
        }
      } catch (e) {
        console.warn("Could not resolve author snapshot for comments:", e);
      }

      // Sanitize content
      const safeContent = sanitizeContent(String(content).trim());

      // Insert comment and return created row
      const payload = {
        topic_id: topicId,
        post_id: postId,
        parent_id: parent_id || null,
        author_id: uid,
        author_name,
        author_avatar,
        content: safeContent,
        created_at: new Date().toISOString(),
        edited_at: null,
        is_deleted: false,
        likes_count: 0,
      };

      const { data, error } = await supabase
        .from("comments")
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error("Supabase INSERT comment error:", error);
        return res.status(500).json({ error: "Could not create comment" });
      }

      // Try to increment post comment_count via RPC if available (non-fatal)
      try {
        const { data: rpcResult, error: rpcErr } = await supabase.rpc(
          "increment_post_comment_count",
          { p_post_id: postId }
        );
        if (rpcErr) {
          // not fatal, log and continue
          console.warn(
            "increment_post_comment_count RPC failed (non-fatal):",
            rpcErr
          );
        } else {
          // ignore rpcResult content; it's informational
          // console.log("increment_post_comment_count result:", rpcResult);
        }
      } catch (e) {
        console.warn(
          "increment_post_comment_count RPC invocation failed (non-fatal):",
          e
        );
      }

      // ===== NOTIFICATION: Notify post owner about new comment =====
      try {
        // Get post info to find owner
        const { data: postData } = await supabase
          .from("posts")
          .select("author_id, title")
          .eq("id", postId)
          .single();

        if (postData && postData.author_id && postData.author_id !== uid) {
          const postTitle = postData.title || "your post";
          await notificationService.notifyPostComment(
            postData.author_id,
            author_name,
            postTitle,
            postId
          );
        }
      } catch (notifErr) {
        console.warn(
          "[comments] Failed to send comment notification:",
          notifErr.message
        );
      }

      return res.status(201).json({ comment: data });
    } catch (err) {
      return friendlyServerError(res, err, "Server error creating comment:");
    }
  }
);

/**
 * List comments for a post
 * GET /api/topics/:topicId/posts/:postId/comments
 * Response: { comments: [...], nextCursor: <iso|null> }
 */
router.get("/topics/:topicId/posts/:postId/comments", async (req, res) => {
  const { topicId, postId } = req.params;
  const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
  const sort = req.query.sort === "oldest" ? "oldest" : "newest";
  const cursor = req.query.cursor || null; // expects ISO timestamp

  try {
    let qb = supabase
      .from("comments")
      .select(
        "id, topic_id, post_id, parent_id, author_id, author_name, author_avatar, content, created_at, edited_at, is_deleted, likes_count"
      )
      .eq("post_id", postId);

    if (sort === "newest") {
      qb = qb.order("created_at", { ascending: false });
      if (cursor) qb = qb.lt("created_at", cursor);
    } else {
      qb = qb.order("created_at", { ascending: true });
      if (cursor) qb = qb.gt("created_at", cursor);
    }

    qb = qb.limit(limit);

    const { data, error } = await qb;
    if (error) {
      console.error("Supabase GET comments error:", error);
      return res.status(500).json({ error: "Could not load comments" });
    }

    // Determine nextCursor if results length === limit
    let nextCursor = null;
    if (data && data.length === limit) {
      const last = data[data.length - 1];
      nextCursor = last.created_at || null;
    }

    return res.json({ comments: data || [], nextCursor });
  } catch (err) {
    return friendlyServerError(res, err, "Server error listing comments:");
  }
});

/**
 * Edit comment (author only)
 * PATCH /api/comments/:commentId
 * Response: { comment: {...} }
 */
router.patch(
  "/comments/:commentId",
  firebaseAuthMiddleware,
  async (req, res) => {
    const { commentId } = req.params;
    const uid = req.user && req.user.uid;
    const { content } = req.body || {};

    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!content || String(content).trim() === "") {
      return res.status(400).json({ error: "Content required" });
    }
    if (String(content).length > 3000) {
      return res.status(400).json({ error: "Comment too long (max 3000)" });
    }

    try {
      const { data: existing, error: getErr } = await supabase
        .from("comments")
        .select("*")
        .eq("id", commentId)
        .maybeSingle();

      if (getErr) {
        console.error("Error fetching comment for edit:", getErr);
        return res.status(500).json({ error: "Could not fetch comment" });
      }
      if (!existing)
        return res.status(404).json({ error: "Comment not found" });

      if (
        existing.author_id !== uid &&
        !(req.user && req.user.admin === true)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const safeContent = sanitizeContent(String(content).trim());

      const { data, error } = await supabase
        .from("comments")
        .update({ content: safeContent, edited_at: new Date().toISOString() })
        .eq("id", commentId)
        .select()
        .single();

      if (error) {
        console.error("Supabase UPDATE comment error:", error);
        return res.status(500).json({ error: "Could not update comment" });
      }
      return res.json({ comment: data });
    } catch (err) {
      return friendlyServerError(res, err, "Server error PATCH comment:");
    }
  }
);

/**
 * Soft-delete comment (author or admin)
 * DELETE /api/comments/:commentId
 * Response: { success: true }
 */
router.delete(
  "/comments/:commentId",
  firebaseAuthMiddleware,
  async (req, res) => {
    const { commentId } = req.params;
    const uid = req.user && req.user.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    try {
      const { data: existing, error: getErr } = await supabase
        .from("comments")
        .select("*")
        .eq("id", commentId)
        .maybeSingle();

      if (getErr) {
        console.error("Error fetching comment for delete:", getErr);
        return res.status(500).json({ error: "Could not fetch comment" });
      }
      if (!existing)
        return res.status(404).json({ error: "Comment not found" });

      if (
        existing.author_id !== uid &&
        !(req.user && req.user.admin === true)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { error } = await supabase
        .from("comments")
        .update({ is_deleted: true, content: "[Comment deleted]" })
        .eq("id", commentId);

      if (error) {
        console.error("Supabase DELETE(comment) error:", error);
        return res.status(500).json({ error: "Could not delete comment" });
      }

      return res.json({ success: true });
    } catch (err) {
      return friendlyServerError(res, err, "Server error DELETE comment:");
    }
  }
);

/**
 * Toggle like on a comment
 * POST /api/comments/:commentId/like
 * Response: { liked: boolean, likes: <number|null> }
 */
router.post(
  "/comments/:commentId/like",
  likeToggleLimiter,
  firebaseAuthMiddleware,
  async (req, res) => {
    const { commentId } = req.params;
    const uid = req.user && req.user.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    try {
      // Check if user already liked (maybeSingle avoids error if none)
      const { data: existingLike, error: likeErr } = await supabase
        .from("comment_likes")
        .select("*")
        .eq("comment_id", commentId)
        .eq("user_id", uid)
        .maybeSingle();

      if (likeErr) {
        console.error("Supabase comment_likes check error:", likeErr);
        return res.status(500).json({ error: "Could not process like" });
      }

      // Helper to attempt RPC and fallback to manual increment/decrement
      async function attemptRpcOrFallback(increment = true) {
        // Try RPC first
        try {
          const rpcName = increment
            ? "increment_comment_like_count"
            : "decrement_comment_like_count";
          const { data: rpcResult, error: rpcErr } = await supabase.rpc(
            rpcName,
            { p_comment_id: commentId }
          );
          if (rpcErr) throw rpcErr;
          const normalized = normalizeRpcResult(rpcResult);
          // If normalized is object with likes_count, return it; or scalar
          return typeof normalized === "number"
            ? normalized
            : Number(normalized) || null;
        } catch (rpcErr) {
          // Fallback: read current and update
          try {
            const { data: cdata, error: cErr } = await supabase
              .from("comments")
              .select("likes_count")
              .eq("id", commentId)
              .maybeSingle();

            if (cErr || !cdata) {
              throw cErr || new Error("Comment not found for like fallback");
            }
            const current = (cdata && cdata.likes_count) || 0;
            const newCount = increment ? current + 1 : Math.max(current - 1, 0);
            const { data: updatedRow, error: updErr } = await supabase
              .from("comments")
              .update({ likes_count: newCount })
              .eq("id", commentId)
              .select()
              .single();
            if (updErr) throw updErr;
            return (updatedRow && updatedRow.likes_count) || newCount;
          } catch (finalErr) {
            console.warn("Fallback like increment/decrement failed:", finalErr);
            return null;
          }
        }
      }

      if (existingLike) {
        // Unlike
        const { error: delErr } = await supabase
          .from("comment_likes")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", uid);

        if (delErr) {
          console.error("Supabase DELETE comment_like error:", delErr);
          return res.status(500).json({ error: "Could not remove like" });
        }

        const newCount = await attemptRpcOrFallback(false);
        return res.json({ liked: false, likes: newCount });
      } else {
        // Insert like and return new count
        const { data: insertedLike, error: insErr } = await supabase
          .from("comment_likes")
          .insert([{ comment_id: commentId, user_id: uid }])
          .select()
          .maybeSingle();

        if (insErr) {
          console.error("Supabase INSERT comment_like error:", insErr);
          return res.status(500).json({ error: "Could not register like" });
        }

        const newCount = await attemptRpcOrFallback(true);
        return res.json({ liked: true, likes: newCount });
      }
    } catch (err) {
      return friendlyServerError(res, err, "Server error toggling like:");
    }
  }
);

module.exports = router;
