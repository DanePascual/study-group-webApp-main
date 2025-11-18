const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const admin = require("./config/firebase-admin");

const app = express();

// ===== Request logger =====
app.use((req, res, next) => {
  const start = Date.now();
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${req.ip}`
  );
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${
        res.statusCode
      } (${ms}ms)`
    );
  });
  next();
});

// ===== CORS Configuration =====
const rawOrigins = (
  process.env.FRONTEND_ORIGIN ||
  "http://127.0.0.1:5500,http://localhost:5500,https://studygroup.app,https://www.studygroup.app"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const extraProd = [];
const frontDomain = (process.env.FRONTEND_DOMAIN || "studygroup.app").trim();
if (frontDomain) {
  const proto = (process.env.FRONTEND_PROTOCOL || "https").trim();
  extraProd.push(`${proto}://${frontDomain}`);
  extraProd.push(`${proto}://www.${frontDomain}`);
}

const explicitWhitelist = new Set([...rawOrigins, ...extraProd]);

// ===== DEBUG: Log CORS whitelist =====
console.log(`[CORS] Whitelist:`, Array.from(explicitWhitelist));

function isLocalHost(origin) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, cb) => {
      console.log(`[CORS] Checking origin: ${origin}`);

      if (!origin) {
        console.log(`[CORS] No origin provided, allowing`);
        return cb(null, true);
      }

      if (explicitWhitelist.has(origin)) {
        console.log(`[CORS] ✅ Origin allowed: ${origin}`);
        return cb(null, true);
      }

      if (isLocalHost(origin)) {
        console.log(`[CORS] ✅ Localhost allowed: ${origin}`);
        return cb(null, true);
      }

      console.warn(`[CORS] ❌ Origin blocked: ${origin}`);
      return cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 200,
    maxAge: 86400,
  })
);

// ===== Body parsers =====
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// ===== Health check =====
app.get("/healthz", (req, res) =>
  res.json({ status: "ok", now: new Date().toISOString() })
);

// ===== FIREBASE AUTH MIDDLEWARE =====
const firebaseAuthMiddleware = require("./middleware/firebaseAuthMiddleware");

// ===== Routes =====
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

const userRoutes = require("./routes/users");
app.use("/api/users", userRoutes);

const todosRoutes = require("./routes/todos");
app.use("/api/todos", todosRoutes);

const resourcesRoutes = require("./routes/resources");
app.use("/api/resources", resourcesRoutes);

const reportsRoutes = require("./routes/reports");
app.use("/api/reports", reportsRoutes);

const uploadsRoutes = require("./routes/uploads");
app.use("/api/uploads", uploadsRoutes);

const topicsRoutes = require("./routes/topics");
app.use("/api/topics", topicsRoutes);

// ✅ FIXED: Mount topicPosts at /api/topics (NOT /api/topic-posts)
// Routes in topicPosts.js are:
// PUT /api/topics/:topicId/posts/:postId
// DELETE /api/topics/:topicId/posts/:postId
const topicPostsRoutes = require("./routes/topicPosts");
app.use("/api/topics", topicPostsRoutes);

// ✅ FIXED: Mount comments at /api (so routes become /api/topics/:id/posts/:id/comments)
// Routes in comments.js are:
// POST /api/topics/:topicId/posts/:postId/comments
// GET /api/topics/:topicId/posts/:postId/comments
// PATCH /api/comments/:commentId
// DELETE /api/comments/:commentId
// POST /api/comments/:commentId/like
const commentsRoutes = require("./routes/comments");
app.use("/api", commentsRoutes);

// ===== NEW: Post Likes Routes =====
// ✅ FIXED: Mount at /api/posts so routes match correctly
// Routes in postLikes.js are /:postId/likes and /:postId/like
// Final paths: /api/posts/:postId/likes and /api/posts/:postId/like
const postLikesRoutes = require("./routes/postLikes");
app.use("/api/posts", postLikesRoutes);

// ===== Study Groups Routes =====
const studyGroupsRoutes = require("./routes/study-groups");
app.use("/api/study-groups", studyGroupsRoutes);

// ===== ZegoCloud Routes =====
const zegoCloudRoutes = require("./routes/zegocloud");
app.use("/api/zegocloud", zegoCloudRoutes);
console.log(
  "[server] Mounted /api/zegocloud route for ZegoCloud video conferencing"
);

// ===== ADMIN Routes (with Firebase Auth Middleware) =====
const adminDashboardRoutes = require("./routes/admin/dashboard");
app.use("/api/admin/dashboard", firebaseAuthMiddleware, adminDashboardRoutes);

const adminReportsRoutes = require("./routes/admin/reports");
app.use("/api/admin/reports", firebaseAuthMiddleware, adminReportsRoutes);

const adminUsersRoutes = require("./routes/admin/users");
app.use("/api/admin/users", firebaseAuthMiddleware, adminUsersRoutes);

const adminAdminsRoutes = require("./routes/admin/admins");
app.use("/api/admin/admins", firebaseAuthMiddleware, adminAdminsRoutes);

const adminAuditLogsRoutes = require("./routes/admin/audit-logs");
app.use("/api/admin/audit-logs", firebaseAuthMiddleware, adminAuditLogsRoutes);

// ===== ✅ NEW: STUDY ROOMS Routes =====
const adminStudyRoomsRoutes = require("./routes/admin/study-rooms");
app.use(
  "/api/admin/study-rooms",
  firebaseAuthMiddleware,
  adminStudyRoomsRoutes
);

console.log("[server] ✅ Admin routes mounted successfully");

// ===== 404 Handler =====
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ===== Error handler =====
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

// ===== Start server =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  console.log(`[server] ✅ All routes mounted successfully`);
});
