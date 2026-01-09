const express = require("express");
const router = express.Router();
const multer = require("multer");
const admin = require("../config/firebase-admin");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const supabase = require("../config/supabase");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");
const rateLimit = require("express-rate-limit");

// ===== SECURITY: Rate limiters =====
const reportSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 reports per hour per user
  keyGenerator: (req) => req.user?.uid || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Too many reports submitted. Please try again later (max 10 per hour).",
  },
  skip: (req) => !req.user, // Skip if not authenticated
});

// Set up multer for file uploads (memory storage) with per-file size limit (5MB)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
});

// Firestore ref
const db = admin.firestore();

// ===== SECURITY: Constants =====
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "text/plain",
]);

const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_LOCATION_LENGTH = 300;
const MAX_TYPE_LENGTH = 100;
const MAX_SEVERITY_LENGTH = 50;
const MAX_REPORTED_USER_LENGTH = 200;
const MAX_INCIDENT_TIME_LENGTH = 50;
const MAX_CONTEXT_LENGTH = 255;

// ===== SECURITY: Logging helper =====
function logSecurityEvent(eventType, uid, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY] ${timestamp} | Event: ${eventType} | User: ${uid} | Details:`,
    details
  );
}

// ===== SECURITY: Helper: safe trim & max-length =====
function safeTrim(str = "", max = 1000) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, max);
}

// ===== SECURITY: Sanitize HTML to prevent XSS =====
function sanitizeForXSS(str = "") {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===== SECURITY: Check if user exists in Firestore =====
async function userExists(email) {
  if (!email || typeof email !== "string") return false;
  try {
    const snapshot = await db
      .collection("users")
      .where("email", "==", email.toLowerCase())
      .limit(1)
      .get();
    return !snapshot.empty;
  } catch (err) {
    console.warn("Error checking if user exists:", err);
    return false;
  }
}

// ===== SECURITY: Normalize email for comparison =====
function normalizeEmail(email) {
  return (email || "").toLowerCase().trim();
}

// ===== SECURITY: Prevent self-reporting =====
function isSelfReport(reporterEmail, reportedUser) {
  const reporter = normalizeEmail(reporterEmail);
  const reported = normalizeEmail(reportedUser);
  return reporter === reported;
}

/**
 * POST /api/reports
 * Protected: requires Authorization Bearer <ID_TOKEN>
 * Rate limited: max 10 per hour per user
 * Accepts: multipart/form-data (fields + up to 5 files)
 * ✅ FIXED: Anonymous field removed
 */
router.post(
  "/",
  firebaseAuthMiddleware,
  reportSubmitLimiter,
  upload.array("files", 5),
  async (req, res) => {
    try {
      // ===== SECURITY: Derive reporter from token =====
      const reporterId = req.user && req.user.uid;
      const reporterEmail = (req.user && req.user.email) || "";
      const reporterName =
        (req.user &&
          (req.user.name || req.user.displayName || req.user.email)) ||
        reporterId;

      if (!reporterId) {
        logSecurityEvent("REPORT_NO_UID", "unknown", {});
        return res.status(401).json({ error: "Unauthorized" });
      }

      // ===== SECURITY: Sanitize and validate fields =====
      const type = safeTrim(req.body.type || "", MAX_TYPE_LENGTH);
      const severity = safeTrim(req.body.severity || "", MAX_SEVERITY_LENGTH);
      const reportedUser = safeTrim(
        req.body.reportedUser || "",
        MAX_REPORTED_USER_LENGTH
      );
      const location = safeTrim(req.body.location || "", MAX_LOCATION_LENGTH);
      const description = safeTrim(
        req.body.description || "",
        MAX_DESCRIPTION_LENGTH
      );
      const incidentTime = req.body.incidentTime
        ? safeTrim(req.body.incidentTime, MAX_INCIDENT_TIME_LENGTH)
        : null;

      // ===== NEW: Contextual report fields =====
      const targetId = safeTrim(req.body.targetId || "", MAX_CONTEXT_LENGTH);
      const targetEmail = safeTrim(
        req.body.targetEmail || "",
        MAX_REPORTED_USER_LENGTH
      );
      const targetName = safeTrim(
        req.body.targetName || "",
        MAX_CONTEXT_LENGTH
      );
      const contextType = safeTrim(
        req.body.contextType || "",
        MAX_CONTEXT_LENGTH
      );
      const contextId = safeTrim(req.body.contextId || "", MAX_CONTEXT_LENGTH);
      const contextName = safeTrim(
        req.body.contextName || "",
        MAX_CONTEXT_LENGTH
      );
      const contentId = safeTrim(req.body.contentId || "", MAX_CONTEXT_LENGTH);
      const contentType = safeTrim(
        req.body.contentType || "",
        MAX_CONTEXT_LENGTH
      );

      // ===== SECURITY: Validate required fields =====
      // For contextual reports, we need type, description, and either reportedUser or targetId
      const hasReportedUser = reportedUser.length > 0;
      const hasTargetId = targetId.length > 0;

      if (!type || !description) {
        logSecurityEvent("REPORT_MISSING_FIELDS", reporterId, { type });
        return res
          .status(400)
          .json({ error: "Missing required fields (type, description)." });
      }

      if (!hasReportedUser && !hasTargetId) {
        logSecurityEvent("REPORT_MISSING_TARGET", reporterId, { type });
        return res
          .status(400)
          .json({ error: "Missing reported user information." });
      }

      // Use targetEmail as reportedUser if reportedUser is not provided
      const effectiveReportedUser = hasReportedUser
        ? reportedUser
        : targetEmail || targetId;
      const effectiveLocation = location || contextName || "Not specified";

      // ===== SECURITY: Validate description is not empty after trim =====
      if (description.length === 0) {
        logSecurityEvent("REPORT_EMPTY_DESCRIPTION", reporterId, {});
        return res.status(400).json({ error: "Description cannot be empty." });
      }

      // ===== SECURITY: Prevent self-reporting =====
      if (
        isSelfReport(reporterEmail, effectiveReportedUser) ||
        (targetId && targetId === reporterId)
      ) {
        logSecurityEvent("REPORT_SELF_REPORT_ATTEMPT", reporterId, {
          reportedUser: effectiveReportedUser,
        });
        return res.status(403).json({
          error:
            "You cannot report yourself. If you have a concern, please contact support.",
        });
      }

      // ===== SECURITY: Validate reported user exists (optional but recommended) =====
      // Only check if it looks like an email
      if (effectiveReportedUser.includes("@")) {
        const exists = await userExists(effectiveReportedUser);
        if (!exists) {
          logSecurityEvent("REPORT_NONEXISTENT_USER", reporterId, {
            reportedUser: effectiveReportedUser,
          });
          return res.status(400).json({
            error: "The reported user does not exist in our system.",
          });
        }
      }

      // ===== SECURITY: Validate files =====
      const filesMeta = [];
      if (req.files && req.files.length > 0) {
        if (req.files.length > 5) {
          logSecurityEvent("REPORT_TOO_MANY_FILES", reporterId, {
            count: req.files.length,
          });
          return res.status(400).json({ error: "Maximum 5 files allowed." });
        }

        for (const file of req.files) {
          if (!ALLOWED_MIME.has(file.mimetype)) {
            logSecurityEvent("REPORT_INVALID_FILE_TYPE", reporterId, {
              mimetype: file.mimetype,
            });
            return res.status(400).json({
              error: "Invalid file type.",
              details: `Allowed types: image/jpeg, image/png, image/gif, application/pdf, text/plain`,
            });
          }

          if (file.size > 5 * 1024 * 1024) {
            logSecurityEvent("REPORT_FILE_TOO_LARGE", reporterId, {
              filename: file.originalname,
              size: file.size,
            });
            return res.status(400).json({
              error: `File "${file.originalname}" is too large (max 5MB).`,
            });
          }
        }

        // ===== Upload files to Supabase storage =====
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
            console.error("[reports] Supabase upload error:", uploadError);
            logSecurityEvent("REPORT_FILE_UPLOAD_FAILED", reporterId, {
              error: uploadError.message,
            });
            return res.status(500).json({
              error: "Failed to upload file",
              details: uploadError.message || uploadError,
            });
          }

          const { data: publicUrlData, error: publicUrlError } =
            await supabase.storage.from("evidence").getPublicUrl(fileName);
          if (publicUrlError) {
            console.error(
              "[reports] Supabase getPublicUrl error:",
              publicUrlError
            );
            logSecurityEvent("REPORT_GET_URL_FAILED", reporterId, {
              error: publicUrlError.message,
            });
            return res.status(500).json({
              error: "Failed to get file URL",
              details: publicUrlError.message || publicUrlError,
            });
          }

          filesMeta.push({
            name: safeTrim(file.originalname, 255),
            url: (publicUrlData && publicUrlData.publicUrl) || "",
            size: file.size,
            mimetype: file.mimetype,
            storedFilename: fileName,
          });
        }
      }

      // ===== Build report doc =====
      const now = new Date();
      const reportId =
        "RPT" +
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0") +
        String(now.getHours()).padStart(2, "0") +
        String(now.getMinutes()).padStart(2, "0") +
        "-" +
        uuidv4().split("-")[0];

      // ✅ FIXED: Removed 'anonymous' field from reportDoc
      // ✅ UPDATED: Added contextual report fields
      const reportDoc = {
        id: reportId,
        reporterId,
        reporterName: safeTrim(reporterName, 255),
        reporterEmail,
        type,
        severity: severity || "medium",
        // Only normalize if it's an email (contains @), otherwise preserve UID case
        reportedUser: effectiveReportedUser.includes("@")
          ? normalizeEmail(effectiveReportedUser)
          : effectiveReportedUser,
        location: effectiveLocation,
        incidentTime: incidentTime || null,
        description,
        files: filesMeta,
        // New contextual fields
        targetId: targetId || null,
        // Only normalize if it's an email
        targetEmail: targetEmail
          ? targetEmail.includes("@")
            ? normalizeEmail(targetEmail)
            : targetEmail
          : null,
        targetName: targetName || null,
        contextType: contextType || null,
        contextId: contextId || null,
        contextName: contextName || null,
        contentId: contentId || null,
        contentType: contentType || null,
        // Timestamps
        timestampISO: now.toISOString(),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      };

      // ===== Add to Firestore =====
      await db.collection("reports").doc(reportId).set(reportDoc);

      console.log(`[reports] Report submitted: ${reportId} by ${reporterId}`);
      logSecurityEvent("REPORT_SUBMITTED", reporterId, {
        reportId,
        reportedUser: reportedUser,
      });

      // ✅ FIXED: Removed 'anonymous' field from response
      // ✅ UPDATED: Added contextual report fields to response
      const responseDoc = {
        id: reportId,
        reporterId,
        reporterName: reportDoc.reporterName,
        type,
        severity: reportDoc.severity,
        reportedUser: effectiveReportedUser,
        location: effectiveLocation,
        incidentTime: reportDoc.incidentTime,
        description,
        files: filesMeta.map((f) => ({
          name: f.name,
          url: f.url,
          size: f.size,
          mimetype: f.mimetype,
        })),
        // New contextual fields
        targetId: reportDoc.targetId,
        targetEmail: reportDoc.targetEmail,
        targetName: reportDoc.targetName,
        contextType: reportDoc.contextType,
        contextId: reportDoc.contextId,
        contextName: reportDoc.contextName,
        contentId: reportDoc.contentId,
        contentType: reportDoc.contentType,
        // Timestamps and status
        timestamp: reportDoc.timestampISO,
        status: reportDoc.status,
      };

      return res.status(201).json(responseDoc);
    } catch (err) {
      console.error("[reports] Error in POST /api/reports:", err);
      logSecurityEvent("REPORT_SUBMISSION_ERROR", req.user?.uid, {
        error: err.message,
      });
      return res.status(500).json({
        error: "Server error",
        details: err.message,
      });
    }
  }
);

/**
 * GET /api/reports?mine=true
 * Protected: server derives uid from token
 * Returns reports for the authenticated user
 * ✅ FIXED: Anonymous field removed
 */
router.get("/", firebaseAuthMiddleware, async (req, res) => {
  try {
    const { mine } = req.query;
    const uid = req.user && req.user.uid;

    if (mine === "true") {
      if (!uid) {
        logSecurityEvent("GET_REPORTS_NO_UID", "unknown", {});
        return res.status(401).json({ error: "Unauthorized" });
      }

      const snapshot = await db
        .collection("reports")
        .where("reporterId", "==", uid)
        .orderBy("timestampISO", "desc")
        .get();

      // ✅ FIXED: Removed 'anonymous' field from response mapping
      // ✅ UPDATED: Added contextual report fields to response
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
          files: data.files || [],
          // New contextual fields
          targetId: data.targetId || null,
          targetEmail: data.targetEmail || null,
          targetName: data.targetName || null,
          contextType: data.contextType || null,
          contextId: data.contextId || null,
          contextName: data.contextName || null,
          contentId: data.contentId || null,
          contentType: data.contentType || null,
          evidenceUrls: (data.files || []).map((f) => f.url).filter(Boolean),
          // Timestamps and status
          timestamp:
            data.timestampISO ||
            (data.timestamp ? data.timestamp.toDate().toISOString() : ""),
          createdAt: data.timestampISO || null,
          status: data.status || "pending",
          adminNotes: data.adminNotes || null,
        };
      });

      console.log(`[reports] Retrieved ${reports.length} reports for ${uid}`);
      return res.json(reports);
    } else {
      logSecurityEvent("GET_REPORTS_INVALID_PARAM", uid, {});
      return res
        .status(400)
        .json({ error: "Missing or invalid 'mine' query parameter." });
    }
  } catch (err) {
    console.error("[reports] Error in GET /api/reports:", err);
    logSecurityEvent("GET_REPORTS_ERROR", req.user?.uid, {
      error: err.message,
    });
    return res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

module.exports = router;
