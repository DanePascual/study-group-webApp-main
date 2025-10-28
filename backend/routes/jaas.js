const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

function getJaasPrivateKey() {
  // ✅ Try environment variable FIRST (for Heroku)
  if (process.env.JAAS_PRIVATE_KEY) {
    console.log("[jaas] ✅ Using JAAS_PRIVATE_KEY from environment");
    return process.env.JAAS_PRIVATE_KEY;
  }

  // Try file path (for local development)
  if (process.env.JAAS_PRIVATE_KEY_PATH) {
    try {
      const keyPath = path.resolve(process.env.JAAS_PRIVATE_KEY_PATH);
      console.log("[jaas] Loading private key from:", keyPath);
      const key = fs.readFileSync(keyPath, "utf-8");
      console.log("[jaas] ✅ Private key loaded successfully from file");
      return key;
    } catch (err) {
      console.error(
        "[jaas] ❌ Failed to load private key from file:",
        err.message
      );
    }
  }

  console.error("[jaas] ❌ CRITICAL: No private key found!");
  return null;
}

const JAAS_CONFIG = {
  appId:
    process.env.JAAS_APP_ID ||
    "vpaas-magic-cookie-d19e6743c9374edea0fea71dcfbc935f",
  keyId:
    process.env.JAAS_KEY_ID ||
    "vpaas-magic-cookie-d19e6743c9374edea0fea71dcfbc935f/1e5526",
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

    // ✅ CORRECT JWT Body per Jitsi documentation
    const jwtPayload = {
      aud: "jitsi",
      iss: "chat",
      sub: JAAS_CONFIG.appId,
      room: sanitizedRoomName,
      context: {
        user: {
          id: uid,
          name: userName,
          email: email,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
            userName
          )}`,
          moderator: true,
        },
        features: {
          livestreaming: false,
          "outbound-call": false,
          transcription: false,
          recording: false,
        },
        room: {
          regex: false,
        },
      },
      exp: exp,
      nbf: now,
      iat: now,
    };

    console.log("[jaas] Generating JWT...");
    console.log("[jaas] App ID:", JAAS_CONFIG.appId);
    console.log("[jaas] Key ID (kid):", JAAS_CONFIG.keyId);
    console.log("[jaas] Room:", sanitizedRoomName);

    if (!JAAS_CONFIG.privateKey) {
      console.error("[jaas] ❌ No private key available!");
      return res.status(500).json({
        error: "Failed to generate token",
        details: "Private key not configured",
      });
    }

    let token;
    try {
      token = jwt.sign(jwtPayload, JAAS_CONFIG.privateKey, {
        algorithm: "RS256",
        header: {
          typ: "JWT",
          kid: JAAS_CONFIG.keyId, // ✅ CORRECT FORMAT: AppID/KeyID
        },
      });

      const decoded = jwt.decode(token, { complete: true });
      console.log("[jaas] ✅ JWT signed successfully");
      console.log(
        "[jaas] JWT Header:",
        JSON.stringify(decoded.header, null, 2)
      );
      console.log("[jaas] JWT Payload - aud:", decoded.payload.aud);
      console.log("[jaas] JWT Payload - iss:", decoded.payload.iss);
      console.log("[jaas] JWT Payload - sub:", decoded.payload.sub);
    } catch (signErr) {
      console.error("[jaas] ❌ JWT signing error:", signErr.message);
      logSecurityEvent("JAAS_TOKEN_SIGN_FAILED", uid, {
        error: signErr.message,
      });
      return res.status(500).json({
        error: "Failed to generate token",
        details: signErr.message,
      });
    }

    console.log(
      `[jaas] ✅ Token generated for user ${uid} in room ${sanitizedRoomName}`
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
