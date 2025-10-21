const express = require("express");
const router = express.Router();
const multer = require("multer");
const admin = require("../config/firebase-admin");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const supabase = require("../config/supabase");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

// Set up multer for file uploads (memory storage) with per-file size limit (5MB)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
});

// Firestore ref
const db = admin.firestore();

// Allowed MIME types for evidence files
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "text/plain",
]);

// Helper: safe trim & max-length
function safeTrim(str = "", max = 1000) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, max);
}

/**
 * POST /api/reports
 * Protected: requires Authorization Bearer <ID_TOKEN>
 * Accepts: multipart/form-data (fields + up to 5 files)
 * Server derives reporter identity from the verified token (req.user).
 */
router.post(
  "/",
  firebaseAuthMiddleware,
  upload.array("files", 5), // Accept up to 5 files as 'files'
  async (req, res) => {
    try {
      // Derive reporter from token
      const reporterId = req.user && req.user.uid;
      const reporterEmail =
        (req.user && (req.user.email || req.user.email)) || "";
      const reporterName =
        (req.user &&
          (req.user.name || req.user.displayName || req.user.email)) ||
        reporterId;

      if (!reporterId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Grab and sanitize fields
      const type = safeTrim(req.body.type || "", 100);
      const severity = safeTrim(req.body.severity || "", 50);
      const reportedUser = safeTrim(req.body.reportedUser || "", 200);
      const location = safeTrim(req.body.location || "", 300);
      const description = safeTrim(req.body.description || "", 1000);
      const incidentTime = req.body.incidentTime
        ? safeTrim(req.body.incidentTime, 50)
        : null;
      const anonymous =
        req.body.anonymous === "true" || req.body.anonymous === true;

      // Validate required fields
      if (!type || !severity || !reportedUser || !location || !description) {
        return res.status(400).json({ error: "Missing required fields." });
      }

      // Validate lengths (already trimmed) - reject if empty after trim
      if (description.length === 0) {
        return res.status(400).json({ error: "Description cannot be empty." });
      }

      // Validate files (server-side)
      const filesMeta = [];
      if (req.files && req.files.length > 0) {
        if (req.files.length > 5) {
          return res.status(400).json({ error: "Maximum 5 files allowed." });
        }

        for (const file of req.files) {
          if (!ALLOWED_MIME.has(file.mimetype)) {
            return res.status(400).json({
              error: "Invalid file type.",
              details: `Allowed types: image/jpeg, image/png, image/gif, application/pdf, text/plain`,
            });
          }
          // multer already enforces per-file size limit. double-check:
          if (file.size > 5 * 1024 * 1024) {
            return res
              .status(400)
              .json({
                error: `File "${file.originalname}" is too large (max 5MB).`,
              });
          }
        }

        // Upload files to Supabase storage
        for (const file of req.files) {
          const ext = path.extname(file.originalname).toLowerCase() || "";
          const fileName = `reports/${uuidv4()}${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("evidence")
            .upload(fileName, file.buffer, {
              contentType: file.mimetype,
              upsert: false,
            });

          if (uploadError) {
            console.error("Supabase upload error:", uploadError);
            return res
              .status(500)
              .json({
                error: "Failed to upload file",
                details: uploadError.message || uploadError,
              });
          }

          // Get public URL (ensure bucket policy allows public URL or use signed URL if private)
          const { data: publicUrlData, error: publicUrlError } =
            await supabase.storage.from("evidence").getPublicUrl(fileName);
          if (publicUrlError) {
            console.error("Supabase getPublicUrl error:", publicUrlError);
            return res
              .status(500)
              .json({
                error: "Failed to get file URL",
                details: publicUrlError.message || publicUrlError,
              });
          }

          filesMeta.push({
            name: file.originalname,
            url: (publicUrlData && publicUrlData.publicUrl) || "",
            size: file.size,
            mimetype: file.mimetype,
            storedFilename: fileName,
          });
        }
      }

      // Build report doc
      const now = new Date();
      // Generate a unique report id (prefix + uuid to avoid duplicates in the same minute)
      const reportId =
        "RPT" +
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0") +
        String(now.getHours()).padStart(2, "0") +
        String(now.getMinutes()).padStart(2, "0") +
        "-" +
        uuidv4().split("-")[0];

      const reportDoc = {
        id: reportId,
        reporterId,
        reporterName,
        reporterEmail,
        type,
        severity,
        reportedUser,
        location,
        incidentTime: incidentTime || null,
        description,
        anonymous: !!anonymous,
        files: filesMeta,
        // timestampISO used for immediate ordering and display
        timestampISO: now.toISOString(),
        // Firestore server timestamp for canonical ordering if needed
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      };

      // Add to Firestore
      await db.collection("reports").doc(reportId).set(reportDoc);

      // Return sanitized response (avoid returning internal data that might be sensitive)
      const responseDoc = {
        id: reportId,
        reporterId,
        reporterName,
        type,
        severity,
        reportedUser,
        location,
        incidentTime: reportDoc.incidentTime,
        description,
        anonymous: reportDoc.anonymous,
        files: filesMeta.map((f) => ({
          name: f.name,
          url: f.url,
          size: f.size,
          mimetype: f.mimetype,
        })),
        timestamp: reportDoc.timestampISO,
        status: reportDoc.status,
      };

      return res.status(201).json(responseDoc);
    } catch (err) {
      console.error("Error in POST /api/reports:", err);
      return res
        .status(500)
        .json({ error: "Server error", details: err.message });
    }
  }
);

/**
 * GET /api/reports?mine=true
 * Protected: server derives uid from token (no uid query param allowed)
 * Returns reports for the authenticated user when mine=true.
 */
router.get("/", firebaseAuthMiddleware, async (req, res) => {
  try {
    const { mine } = req.query;
    const uid = req.user && req.user.uid;
    if (mine === "true") {
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const snapshot = await db
        .collection("reports")
        .where("reporterId", "==", uid)
        .orderBy("timestampISO", "desc")
        .get();

      const reports = snapshot.docs.map((doc) => {
        const data = doc.data() || {};
        return {
          id: data.id,
          reporterId: data.reporterId,
          reporterName: data.reporterName,
          type: data.type,
          severity: data.severity,
          reportedUser: data.reportedUser,
          location: data.location,
          incidentTime: data.incidentTime,
          description: data.description,
          anonymous: data.anonymous,
          files: data.files || [],
          timestamp:
            data.timestampISO ||
            (data.timestamp ? data.timestamp.toDate().toISOString() : ""),
          status: data.status || "pending",
        };
      });

      return res.json(reports);
    } else {
      return res
        .status(400)
        .json({ error: "Missing or invalid 'mine' query parameter." });
    }
  } catch (err) {
    console.error("Error in GET /api/reports:", err);
    return res
      .status(500)
      .json({ error: "Server error", details: err.message });
  }
});

module.exports = router;
