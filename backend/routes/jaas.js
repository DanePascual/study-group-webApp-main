const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

// ===== JaaS Configuration =====
function getJaasPrivateKey() {
  // Try environment variable first
  if (process.env.JAAS_PRIVATE_KEY) {
    console.log("[jaas] Using JAAS_PRIVATE_KEY from environment");
    return process.env.JAAS_PRIVATE_KEY;
  }

  // Try loading from file path
  if (process.env.JAAS_PRIVATE_KEY_PATH) {
    try {
      const keyPath = path.resolve(process.env.JAAS_PRIVATE_KEY_PATH);
      console.log("[jaas] Loading private key from:", keyPath);
      const key = fs.readFileSync(keyPath, "utf-8");
      console.log("[jaas] Private key loaded successfully");
      return key;
    } catch (err) {
      console.error(
        "[jaas] Failed to load private key from file:",
        err.message
      );
    }
  }

  // Fallback to hardcoded (NOT recommended for production)
  console.warn("[jaas] WARNING: Using fallback private key");
  return `-----BEGIN RSA PRIVATE KEY-----
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
-----END RSA PRIVATE KEY-----`;
}

const JAAS_CONFIG = {
  appId:
    process.env.JAAS_APP_ID ||
    "vpaas-magic-cookie-d19e6743c9374edea0fea71dcfbc935f",
  virtualHost: "my-video-app",
  privateKey: getJaasPrivateKey(),
  tokenExpiry: 3600,
};

function logSecurityEvent(eventType, uid, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY] ${timestamp} | Event: ${eventType} | User: ${uid} | Details:`,
    details
  );
}

router.post("/", firebaseAuthMiddleware, async (req, res) => {
  try {
    const uid = req.user?.uid;
    const email = req.user?.email;
    const userName = req.user?.name || email?.split("@")[0] || "User";

    if (!uid) {
      logSecurityEvent("JAAS_TOKEN_NO_UID", "unknown", {});
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { roomName } = req.body;

    if (!roomName || typeof roomName !== "string") {
      logSecurityEvent("JAAS_TOKEN_INVALID_ROOM", uid, { roomName });
      return res.status(400).json({
        error: "Room name is required and must be a string",
      });
    }

    const sanitizedRoomName = roomName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 100);

    if (!sanitizedRoomName) {
      logSecurityEvent("JAAS_TOKEN_EMPTY_ROOM_AFTER_SANITIZATION", uid, {
        originalRoomName: roomName,
      });
      return res.status(400).json({
        error: "Room name contains no valid characters",
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + JAAS_CONFIG.tokenExpiry;

    const jwtPayload = {
      aud: "jitsi",
      iss: JAAS_CONFIG.appId,
      sub: JAAS_CONFIG.virtualHost,
      room: sanitizedRoomName,
      context: {
        user: {
          id: uid,
          name: userName,
          email: email,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
            userName
          )}`,
        },
      },
      exp: exp,
      nbf: now,
      iat: now,
    };

    console.log("[jaas] Attempting to sign JWT...");
    console.log(
      "[jaas] Private key format check:",
      JAAS_CONFIG.privateKey.substring(0, 30)
    );

    let token;
    try {
      token = jwt.sign(jwtPayload, JAAS_CONFIG.privateKey, {
        algorithm: "RS256",
        header: {
          typ: "JWT",
          kid: JAAS_CONFIG.appId,
        },
      });
      console.log("[jaas] ✅ JWT signed successfully");
    } catch (signErr) {
      console.error("[jaas] ❌ JWT signing error:", signErr.message);
      console.error("[jaas] Error details:", signErr);
      logSecurityEvent("JAAS_TOKEN_SIGN_FAILED", uid, {
        error: signErr.message,
        keyFormat: JAAS_CONFIG.privateKey.substring(0, 30),
      });
      return res.status(500).json({
        error: "Failed to generate token",
        details: signErr.message,
      });
    }

    console.log(
      `[jaas] Token generated for user ${uid} in room ${sanitizedRoomName}`
    );
    logSecurityEvent("JAAS_TOKEN_GENERATED", uid, {
      roomName: sanitizedRoomName,
      expiresIn: JAAS_CONFIG.tokenExpiry,
    });

    res.json({
      token: token,
      room: sanitizedRoomName,
      domain: "8x8.vc",
      virtualHost: JAAS_CONFIG.virtualHost,
      expiresIn: JAAS_CONFIG.tokenExpiry,
      jitsiDomain: "8x8.vc",
      jitsiMeetUrl: `https://8x8.vc/${JAAS_CONFIG.virtualHost}/${sanitizedRoomName}`,
    });
  } catch (error) {
    console.error("[jaas] Unexpected error in token generation:", error);
    logSecurityEvent("JAAS_TOKEN_ERROR", req.user?.uid, {
      error: error.message,
    });
    res.status(500).json({
      error: "Failed to generate Jitsi token",
      details: error.message,
    });
  }
});

module.exports = router;
