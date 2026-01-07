const express = require("express");
const router = express.Router();
const admin = require("../../config/firebase-admin");
const adminAuthMiddleware = require("../../middleware/adminAuthMiddleware");

const db = admin.firestore();

// GET /api/admin/reports
router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    console.log("[admin-reports] Fetching reports...");
    console.log("[admin-reports] Query params:", req.query);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const severity = req.query.severity;
    const sort = req.query.sort || "newest";
    const search = req.query.search || "";

    let query = db.collection("reports");

    // ===== Apply sorting FIRST (use "timestamp" not "timestampISO") =====
    if (sort === "newest") {
      query = query.orderBy("timestamp", "desc");
      console.log("[admin-reports] Sort: newest (by timestamp desc)");
    } else if (sort === "oldest") {
      query = query.orderBy("timestamp", "asc");
      console.log("[admin-reports] Sort: oldest (by timestamp asc)");
    }

    // ===== Apply filters =====
    if (status) {
      query = query.where("status", "==", status);
      console.log(`[admin-reports] Filter: status = ${status}`);
    }

    if (severity) {
      query = query.where("severity", "==", severity);
      console.log(`[admin-reports] Filter: severity = ${severity}`);
    }

    // ===== Get total count =====
    const totalSnapshot = await query.get();
    const total = totalSnapshot.size;
    const pages = Math.ceil(total / limit);
    console.log(`[admin-reports] Total reports found: ${total}`);

    // ===== Pagination =====
    const offset = (page - 1) * limit;
    let reportsList = totalSnapshot.docs.slice(offset, offset + limit);

    // ===== Build response =====
    let reports = reportsList.map((doc) => {
      const data = doc.data();

      // Convert timestamp (Firestore) to ISO string
      let createdAt = null;
      if (data.timestampISO) {
        createdAt = data.timestampISO;
      } else if (data.timestamp) {
        createdAt = data.timestamp.toDate?.()
          ? data.timestamp.toDate().toISOString()
          : new Date(data.timestamp).toISOString();
      } else {
        createdAt = new Date().toISOString();
      }

      return {
        id: data.id || doc.id,
        type: data.type || "Unknown",
        reportedUserId: data.reportedUser || data.reportedUserId || "Unknown",
        reason: data.description || data.reason || "",
        severity: data.severity || "low",
        status: data.status || "pending",
        createdAt,
        reporterId: data.reporterId || "",
        reporterName: data.reporterName || "Unknown",
        reporterEmail: data.reporterEmail || "",
        location: data.location || "",
        incidentTime: data.incidentTime || null,
        files: data.files || [],
      };
    });

    // ===== Search filter (in memory) =====
    if (search) {
      const searchLower = search.toLowerCase();
      reports = reports.filter(
        (r) =>
          r.type?.toLowerCase().includes(searchLower) ||
          r.reason?.toLowerCase().includes(searchLower) ||
          r.reportedUserId?.toLowerCase().includes(searchLower) ||
          r.reporterName?.toLowerCase().includes(searchLower) ||
          r.location?.toLowerCase().includes(searchLower)
      );
      console.log(
        `[admin-reports] After search filter: ${reports.length} reports`
      );
    }

    console.log(
      `[admin-reports] ✅ Fetched ${reports.length} reports (page ${page}/${pages})`
    );

    res.json({
      reports,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
      filters: {
        status: status || "all",
        severity: severity || "all",
        sort,
        search,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin-reports] Error:", err.message);
    console.error("[admin-reports] Stack:", err.stack);
    res
      .status(500)
      .json({ error: "Failed to fetch reports", details: err.message });
  }
});

// GET /api/admin/reports/:reportId
router.get("/:reportId", adminAuthMiddleware, async (req, res) => {
  try {
    const reportId = req.params.reportId;
    console.log(`[admin-reports] Fetching report ${reportId}...`);

    const reportDoc = await db.collection("reports").doc(reportId).get();

    if (!reportDoc.exists) {
      return res.status(404).json({ error: "Report not found" });
    }

    const data = reportDoc.data();

    let createdAt = null;
    if (data.timestampISO) {
      createdAt = data.timestampISO;
    } else if (data.timestamp) {
      createdAt = data.timestamp.toDate?.()
        ? data.timestamp.toDate().toISOString()
        : new Date(data.timestamp).toISOString();
    } else {
      createdAt = new Date().toISOString();
    }

    res.json({
      id: data.id || reportId,
      type: data.type || "Unknown",
      reportedUserId: data.reportedUser || data.reportedUserId || "Unknown",
      reason: data.description || data.reason || "",
      severity: data.severity || "low",
      status: data.status || "pending",
      createdAt,
      reporterId: data.reporterId || "",
      reporterName: data.reporterName || "Unknown",
      reporterEmail: data.reporterEmail || "",
      location: data.location || "",
      incidentTime: data.incidentTime || null,
      files: data.files || [],
    });
  } catch (err) {
    console.error("[admin-reports] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

// PUT /api/admin/reports/:id/status
router.put("/:id/status", adminAuthMiddleware, async (req, res) => {
  try {
    const reportId = req.params.id;
    const { status, severity, reason } = req.body;
    const adminUid = req.user.uid;
    const adminName = req.user.name || "Unknown";

    console.log(
      `[admin-reports] Updating report ${reportId} status to ${status}, severity: ${severity}`
    );

    // Validate status (removed "reviewing")
    if (!["pending", "resolved", "dismissed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // Validate severity
    const validSeverities = ["low", "medium", "high", "critical"];
    const finalSeverity = validSeverities.includes(severity) ? severity : "low";

    await db
      .collection("reports")
      .doc(reportId)
      .update({
        status,
        severity: finalSeverity,
        updatedAt: new Date(),
        updatedBy: adminUid,
        updateReason: reason || "No reason provided",
      });

    await db.collection("auditLogs").add({
      timestamp: new Date(),
      adminUid,
      adminName,
      action: "update_report_status",
      targetReportId: reportId,
      targetName: `Report ${reportId}`,
      changes: {
        field: "status",
        to: status,
        severity: finalSeverity,
      },
      reason: reason || "No reason provided",
      status: "completed",
    });

    console.log(
      `[admin-reports] ✅ Report ${reportId} status updated to ${status}, severity: ${finalSeverity}`
    );

    res.json({ success: true, message: "Report status updated" });
  } catch (err) {
    console.error("[admin-reports] Error:", err.message);
    res.status(500).json({ error: "Failed to update report status" });
  }
});

module.exports = router;
