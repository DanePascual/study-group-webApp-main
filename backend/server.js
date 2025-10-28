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
  process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500,http://localhost:5500"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const extraProd = [];
const frontDomain = (process.env.FRONTEND_DOMAIN || "").trim();
if (frontDomain) {
  const proto = (process.env.FRONTEND_PROTOCOL || "https").trim();
  extraProd.push(`${proto}://${frontDomain}`);
  extraProd.push(`${proto}://www.${frontDomain}`);
}

const explicitWhitelist = new Set([...rawOrigins, ...extraProd]);

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
      if (!origin) return cb(null, true);
      if (explicitWhitelist.has(origin) || isLocalHost(origin)) {
        return cb(null, true);
      }
      console.warn(`CORS blocked for origin: ${origin}`);
      return cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// ===== Body parsers =====
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// ===== Health check =====
app.get("/healthz", (req, res) =>
  res.json({ status: "ok", now: new Date().toISOString() })
);

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

const topicPostsRoutes = require("./routes/topicPosts");
app.use("/api/topic-posts", topicPostsRoutes);

const commentsRoutes = require("./routes/comments");
app.use("/api/comments", commentsRoutes);

// ===== Study Groups Routes =====
const studyGroupsRoutes = require("./routes/study-groups");
app.use("/api/study-groups", studyGroupsRoutes);

// ===== ZegoCloud Routes =====
const zegoCloudRoutes = require("./routes/zegocloud");
app.use("/api/zegocloud", zegoCloudRoutes);
console.log(
  "[server] Mounted /api/zegocloud route for ZegoCloud video conferencing"
);

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
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
