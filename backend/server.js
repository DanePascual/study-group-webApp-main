const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const admin = require("./config/firebase-admin");

const app = express();

// ===== CORS Configuration (must be BEFORE helmet) =====
const corsOptions = {
  origin: [
    "https://studygroup.app",
    "https://www.studygroup.app",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

// Allow all origins in development
if (process.env.NODE_ENV !== "production") {
  corsOptions.origin = function (origin, callback) {
    console.log(`[CORS-DEBUG] DEV MODE: Allowing origin: ${origin}`);
    callback(null, true);
  };
} else {
  // Add debug logging for production
  const originalOrigin = corsOptions.origin;
  corsOptions.origin = function (origin, callback) {
    console.log(`[CORS-DEBUG] PROD MODE: Checking origin: ${origin}`);

    // Allow requests with no origin (e.g., mobile apps, Postman, direct browser access)
    if (!origin) {
      console.log(`[CORS-DEBUG] No origin header - allowing`);
      return callback(null, true);
    }

    if (originalOrigin.includes(origin)) {
      console.log(`[CORS-DEBUG] Origin allowed: ${origin}`);
      callback(null, true);
    } else {
      console.log(`[CORS-DEBUG] Origin rejected: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  };
}

console.log(
  `[CORS] Mode: ${process.env.NODE_ENV}, Origins:`,
  corsOptions.origin
);

app.use(cors(corsOptions));

// ===== SECURITY: Apply helmet.js security headers =====
// Note: Disable CSP for API server (only needed for frontend)
app.use(
  helmet({
    contentSecurityPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// ===== SECURITY: HTTPS Enforcement (production only) =====
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.header("x-forwarded-proto") !== "https") {
      return res.redirect(
        301,
        `https://${req.header("host")}${req.originalUrl}`
      );
    }
    next();
  });
}

// ===== SECURITY: Additional security headers =====
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()"
  );
  next();
});

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

// ===== Body parsers =====
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// ===== Health check =====
app.get("/healthz", (req, res) =>
  res.json({ status: "ok", now: new Date().toISOString() })
);

// ===== CORS Test endpoint =====
app.get("/api/cors-test", (req, res) => {
  res.json({
    message: "CORS test successful",
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
  });
});

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

// ===== Notifications Routes =====
const notificationsRoutes = require("./routes/notifications");
app.use("/api/notifications", notificationsRoutes);
console.log("[server] Mounted /api/notifications route");

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
