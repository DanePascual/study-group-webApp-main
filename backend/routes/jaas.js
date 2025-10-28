const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

// ===== JaaS Configuration =====
const JAAS_CONFIG = {
  // Your JaaS AppID from 8x8.vc console
  appId: "vpaas-magic-cookie-d19e6743c9374edea0fea71dcfbc935f",

  // Your virtual host name (from JaaS dashboard)
  virtualHost: "my-video-app", // Changed from "My video app" to lowercase URL-safe format

  // Your private key (KEEP SECRET - environment variable in production)
  privateKey:
    process.env.JAAS_PRIVATE_KEY ||
    `-----BEGIN PRIVATE KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAwUZlCd40VLe2DY54xEnn
Y8yiaqaqfKB5WwrK04c7vvEx2BCZ/+GjPY0OJGZcbHmvpwFWFHLntbRzxiiAvJH4
SRphXvgKkcjiabQRm9MElOQdTTF1n8cuflOHEVS450DoebDAF8AAZ6cJXLtoUyFO
+0IOZQsW3eElySKd2kQRjHg6pm8h01JJe7JzKRHAMeqeHUHRhKuulqJiKQX9FuFq
jxEzI1GamSFm1GXOilk7Eo2a4YcFDvNno1esc8nv6m0ZXXZprHisoS0wSeOCGcr5
UJbAUGVWef4yh7vOg/ia/FTSw6ptn0PgRLUlv220EOmsxQG/8nrD5aEdmDHahYV1
GbtGnO3B+uingjXpw4HxGA9YiEdMfjxP6C31K4yDiawblSibKTJl37uVZImT9USf
U6IX+P2w34NjWfP4YWO2ThAPKDtT+IAYivJqLqYDtHqSwQtTkmt4W69VF2B7h8to
cAO7vaEn6icKo3krP2ecke6G+spgJS85lSzNG9zob1A3RNBvmXQ+515AE0lYTDh6
W/nHB/oaV1CbW89c6W7Qc85be8qb1l4PftSXq9C0wm3yYY5Ts2ozJbnl7op1cIpb
bDqWljBqLYL2r1aBED+DdK2FUMaboHDlCjaewB5H78/jDXAxK7T4tZbHptxwKz8y
K1DuZWT7s8lmvh9HKRvlqpcCAwEAAQ==
-----END PRIVATE KEY-----`,

  // Token expiration (1 hour)
  tokenExpiry: 3600, // seconds
};

// ===== SECURITY: Logging helper =====
function logSecurityEvent(eventType, uid, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY] ${timestamp} | Event: ${eventType} | User: ${uid} | Details:`,
    details
  );
}

// ===== POST /api/jaas - Generate JWT token for Jitsi room =====
router.post("/", firebaseAuthMiddleware, async (req, res) => {
  try {
    const uid = req.user?.uid;
    const email = req.user?.email;
    const userName = req.user?.name || email?.split("@")[0] || "User";

    if (!uid) {
      logSecurityEvent("JAAS_TOKEN_NO_UID", "unknown", {});
      return res.status(401).json({ error: "Unauthorized" });
    }

    // ===== Extract request parameters =====
    const { roomName } = req.body;

    if (!roomName || typeof roomName !== "string") {
      logSecurityEvent("JAAS_TOKEN_INVALID_ROOM", uid, {
        roomName,
      });
      return res.status(400).json({
        error: "Room name is required and must be a string",
      });
    }

    // ===== Sanitize room name for Jitsi =====
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

    // ===== Build JWT payload =====
    // Reference: https://jaas.8x8.vc/documentation#jwt-format
    const now = Math.floor(Date.now() / 1000);
    const exp = now + JAAS_CONFIG.tokenExpiry;

    const jwtPayload = {
      // Mandatory claims
      aud: "jitsi",
      iss: JAAS_CONFIG.appId,
      sub: JAAS_CONFIG.virtualHost,
      room: sanitizedRoomName,

      // User context (used by Jitsi for display)
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

      // Expiration
      exp: exp,
      nbf: now,
      iat: now,
    };

    // ===== Sign JWT with private key =====
    let token;
    try {
      token = jwt.sign(jwtPayload, JAAS_CONFIG.privateKey, {
        algorithm: "RS256",
        header: {
          typ: "JWT",
          kid: JAAS_CONFIG.appId,
        },
      });
    } catch (signErr) {
      console.error("[jaas] Error signing JWT:", signErr);
      logSecurityEvent("JAAS_TOKEN_SIGN_FAILED", uid, {
        error: signErr.message,
      });
      return res.status(500).json({
        error: "Failed to generate token",
        details: "Internal server error",
      });
    }

    // ===== Return token and room details =====
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
