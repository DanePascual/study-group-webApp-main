// backend/routes/topics.js
// Express router for topics API endpoints.

const express = require("express");
const topicsService = require("../services/topicsService");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

const router = express.Router();

// GET /api/topics
router.get("/", async (req, res) => {
  try {
    const {
      search = "",
      sort = "newest",
      category = "all",
      limit = "500",
    } = req.query;
    const topics = await topicsService.listTopics({
      search,
      sort,
      category,
      limit,
    });
    res.json({ topics });
  } catch (err) {
    console.error("GET /api/topics error:", err);
    res.status(500).json({ error: err.message || "Failed to load topics" });
  }
});

// POST /api/topics (protected)
router.post("/", firebaseAuthMiddleware, async (req, res) => {
  try {
    const {
      title,
      description = "",
      category = "discussion",
      tags = [],
    } = req.body;
    if (!title || !title.trim())
      return res.status(400).json({ error: "Title required" });
    const author_id = req.user.uid;
    const author_name = req.user.displayName || req.user.email || "User";
    const topic = await topicsService.createTopic({
      title: title.trim(),
      description,
      category,
      tags,
      author_id,
      author_name,
    });
    res.status(201).json({ topic });
  } catch (err) {
    console.error("POST /api/topics error:", err);
    res.status(500).json({ error: err.message || "Failed to create topic" });
  }
});

// POST /api/topics/:id/view (public)
router.post("/:id/view", async (req, res) => {
  try {
    const topic = await topicsService.incrementView(req.params.id);
    res.json({ topic });
  } catch (err) {
    console.error("POST /api/topics/:id/view error:", err);
    res.status(500).json({ error: err.message || "Failed to increment view" });
  }
});

module.exports = router;
