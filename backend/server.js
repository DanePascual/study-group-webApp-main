// server.js — updated Express server (full file)
// - Loads backend/.env explicitly so env vars work no matter where node is run from.
// - Mounts topics + comments routes and keeps existing routes and services intact.
// - Configures CORS to allow the frontend origin(s), required headers, and PATCH method.
// - Adds a lightweight request logger and an error handler to surface server activity in the terminal.
// - Mounts /api/jaas route for generating short-lived JaaS tokens (server-side only).
// - Do NOT commit service account or Supabase service_role key into repo.

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const admin = require("./config/firebase-admin"); // Admin SDK (configured in backend/config)

const app = express();

// Temporary request logger for debugging (remove when finished)
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

// Configure CORS
// FRONTEND_ORIGIN may be a single origin or a comma-separated list.
// We also allow http://localhost:* and http://127.0.0.1:* for local static servers by default.
// For production, FRONTEND_DOMAIN can be used to allow https://<domain> and https://www.<domain>.
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

// CHANGED: Check NODE_ENV for production
function isLocalHost(origin) {
  // CRITICAL: In production, disable localhost
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    // Allow any port on localhost/127.0.0.1 for easier local dev (dev only)
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser tools without Origin
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

// Increase JSON / URL-encoded body size
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Routes
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

// Uploads route (handles server-side upload to Supabase/storage)
const uploadsRoutes = require("./routes/uploads");
app.use("/api/uploads", uploadsRoutes);

// Topics (discussion) - Supabase-backed endpoints
const topicsRoutes = require("./routes/topics");
app.use("/api/topics", topicsRoutes);

// Mount topic posts routes (edit / delete post). These routes expect the path /api/topics/:topicId/posts/:postId
const topicPostsRoutes = require("./routes/topicPosts");
app.use("/", topicPostsRoutes);

// Comments routes (create/list/edit/delete/like) mounted under /api
const commentsRoutes = require("./routes/comments");
app.use("/api", commentsRoutes);

// Study Group service and routes
const studyGroupService = require("./services/studyGroupService");
const firebaseAuthMiddleware = require("./middleware/firebaseAuthMiddleware");

// Protected creation route
app.post("/api/study-groups", firebaseAuthMiddleware, async (req, res) => {
  try {
    const {
      name,
      description,
      subject,
      tags = [],
      participants = [],
      ...otherFields
    } = req.body;
    const creatorUid = req.user.uid;
    const creatorEmail = req.user.email;
    let participantsList = Array.isArray(participants) ? participants : [];
    if (!participantsList.includes(creatorUid))
      participantsList.unshift(creatorUid);

    const group = await studyGroupService.createStudyGroup({
      name,
      description,
      subject,
      tags,
      creator: creatorUid,
      creatorEmail,
      participants: participantsList,
      createdAt: new Date().toISOString(),
      ...otherFields,
    });
    res.status(201).json(group);
  } catch (error) {
    console.error("Error creating study group:", error);
    res.status(500).json({ error: error.message });
  }
});

// Public list and get
app.get("/api/study-groups", async (req, res) => {
  try {
    const groups = await studyGroupService.getAllStudyGroups();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/study-groups/:id", async (req, res) => {
  try {
    const group = await studyGroupService.getStudyGroupById(req.params.id);
    if (!group) return res.status(404).json({ error: "Not found" });
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Protected update & delete - only owner or admin
app.put("/api/study-groups/:id", firebaseAuthMiddleware, async (req, res) => {
  try {
    const uid = req.user.uid;
    const group = await studyGroupService.getStudyGroupById(req.params.id);
    if (!group) return res.status(404).json({ error: "Not found" });
    if (group.creator !== uid && !(req.user.admin === true)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const updated = await studyGroupService.updateStudyGroup(
      req.params.id,
      req.body
    );
    res.json(updated);
  } catch (error) {
    console.error("Error updating study group:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete(
  "/api/study-groups/:id",
  firebaseAuthMiddleware,
  async (req, res) => {
    try {
      const uid = req.user.uid;
      const group = await studyGroupService.getStudyGroupById(req.params.id);
      if (!group) return res.status(404).json({ error: "Not found" });
      if (group.creator !== uid && !(req.user.admin === true)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await studyGroupService.deleteStudyGroup(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting study group:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// JaaS (Jitsi-as-a-Service) token endpoint router (server-side only).
// Exposes: POST /api/jaas  (protected via firebaseAuthMiddleware inside the route)
try {
  const jaasRoutes = require("./routes/jaas");
  app.use("/api/jaas", jaasRoutes);
  console.log("Mounted /api/jaas route");
} catch (e) {
  console.warn(
    "JaaS route not mounted (maybe backend/routes/jaas.js missing).",
    e?.message || e
  );
}

// Test root
app.get("/", (req, res) => res.send("Study Group Backend is running!"));

// Admin-only: list users
app.get("/api/users", firebaseAuthMiddleware, async (req, res) => {
  try {
    if (!req.user || req.user.admin !== true) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const listUsersResult = await admin.auth().listUsers(1000);
    res.json(
      listUsersResult.users.map((u) => ({
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        disabled: u.disabled,
      }))
    );
  } catch (error) {
    console.error("Error listing users:", error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get("/healthz", (req, res) =>
  res.json({ status: "ok", now: new Date().toISOString() })
);

// Generic error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

// Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
