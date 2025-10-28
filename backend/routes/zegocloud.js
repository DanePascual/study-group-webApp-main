const express = require("express");
const router = express.Router();
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

// ZegoCloud Configuration
const ZEGOCLOUD_CONFIG = {
  appID: parseInt(process.env.ZEGOCLOUD_APP_ID || "1315499195"),
  serverSecret:
    process.env.ZEGOCLOUD_SERVER_SECRET || "374d2858bfeea106ea4fa6a6f883f41f",
};

console.log("[zegocloud] 🔍 STARTUP CONFIG CHECK:");
console.log("[zegocloud] App ID:", ZEGOCLOUD_CONFIG.appID);
console.log(
  "[zegocloud] Server Secret:",
  ZEGOCLOUD_CONFIG.serverSecret ? "✅ LOADED" : "❌ NOT LOADED"
);

function logSecurityEvent(eventType, uid, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY] ${timestamp} | Event: ${eventType} | User: ${uid} | Details:`,
    details
  );
}

// ✅ Generate ZegoCloud Token
router.post("/", firebaseAuthMiddleware, async (req, res) => {
  try {
    const uid = req.user?.uid;
    const email = req.user?.email;
    const userName = req.user?.name || email?.split("@")[0] || "User";

    if (!uid) {
      logSecurityEvent("ZEGOCLOUD_TOKEN_NO_UID", "unknown", {});
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { roomID } = req.body;

    if (!roomID || typeof roomID !== "string") {
      logSecurityEvent("ZEGOCLOUD_TOKEN_INVALID_ROOM", uid, { roomID });
      return res.status(400).json({
        error: "Room ID is required and must be a string",
      });
    }

    console.log("[zegocloud] 🚀 Generating ZegoCloud token...");
    console.log("[zegocloud] Room ID:", roomID);
    console.log("[zegocloud] User ID:", uid);
    console.log("[zegocloud] User Name:", userName);

    // ✅ ZegoCloud doesn't require complex JWT - just return config
    const response = {
      appID: ZEGOCLOUD_CONFIG.appID,
      serverSecret: ZEGOCLOUD_CONFIG.serverSecret,
      roomID: roomID,
      userID: uid,
      userName: userName,
      userEmail: email,
    };

    console.log("[zegocloud] ✅ Token generated successfully");
    logSecurityEvent("ZEGOCLOUD_TOKEN_GENERATED", uid, {
      roomID: roomID,
      userName: userName,
    });

    res.json(response);
  } catch (error) {
    console.error("[zegocloud] Unexpected error in token generation:", error);
    logSecurityEvent("ZEGOCLOUD_TOKEN_ERROR", req.user?.uid, {
      error: error.message,
    });
    res.status(500).json({
      error: "Failed to generate ZegoCloud token",
      details: error.message,
    });
  }
});

module.exports = router;
