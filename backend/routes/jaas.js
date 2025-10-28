// backend/routes/jaas.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

// --- Configuration ---
const JAAS_APP_ID = process.env.JAAS_APP_ID || "";
const JAAS_KEY_ID = process.env.JAAS_KEY_ID || "";
const JAAS_SECRET = process.env.JAAS_SECRET;
const JAAS_PRIVATE_KEY_PATH = process.env.JAAS_PRIVATE_KEY_PATH || "";
const JAAS_DOMAIN = process.env.JAAS_DOMAIN || "8x8.vc";
const JAAS_TOKEN_TTL_SECS = parseInt(
  process.env.JAAS_TOKEN_TTL_SECS || "3600",
  10
);
// Optional leeway to mitigate small clock drift between client/server/8x8 validators
const JAAS_NBF_LEEWAY_SECS = parseInt(
  process.env.JAAS_NBF_LEEWAY_SECS || "5",
  10
);
const ROOM_PREFIX = process.env.JAAS_ROOM_PREFIX || "StudyGroup";

// Early sanity check (fail fast, clear message)
if (!JAAS_APP_ID) {
  console.error("JaaS: Missing JAAS_APP_ID in environment.");
}
if (!JAAS_KEY_ID) {
  console.error("JaaS: Missing JAAS_KEY_ID in environment.");
}
if (!JAAS_PRIVATE_KEY_PATH && !JAAS_SECRET) {
  console.error(
    "JaaS: No signing credentials found. Set JAAS_PRIVATE_KEY_PATH for RS256 (recommended) or JAAS_SECRET for HS256."
  );
}

let JAAS_PRIVATE_KEY = null;
if (JAAS_PRIVATE_KEY_PATH) {
  try {
    const resolvedPath = path.isAbsolute(JAAS_PRIVATE_KEY_PATH)
      ? JAAS_PRIVATE_KEY_PATH
      : path.join(process.cwd(), JAAS_PRIVATE_KEY_PATH);
    if (fs.existsSync(resolvedPath)) {
      JAAS_PRIVATE_KEY = fs.readFileSync(resolvedPath, "utf8");
      console.info(
        "✅ JaaS: Private key for RS256 signing loaded successfully."
      );
    } else {
      console.warn(
        `⚠️ JaaS: JAAS_PRIVATE_KEY_PATH is set, but file not found at: ${resolvedPath}`
      );
    }
  } catch (err) {
    console.error("❌ JaaS: Error loading private key.", err);
  }
}

function normalizeRoomName(roomName) {
  if (!roomName) return "";
  return String(roomName)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createJaasJwt({ normalizedRoomName, caller }) {
  if (!JAAS_APP_ID || !JAAS_KEY_ID) {
    throw new Error(
      "JaaS is not configured (missing JAAS_APP_ID or JAAS_KEY_ID)."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + JAAS_TOKEN_TTL_SECS;
  const nbf = Math.max(0, now - Math.abs(JAAS_NBF_LEEWAY_SECS || 0));

  // JaaS standard claims. Keep iss:'chat' per 8x8 examples.
  const payload = {
    iss: "chat",
    sub: JAAS_APP_ID,
    aud: "jitsi",
    nbf,
    iat: now,
    exp,
    room: normalizedRoomName,
    context: {
      user: {
        id: caller.uid,
        name:
          caller.name ||
          caller.displayName ||
          `User-${String(caller.uid || "").slice(0, 6)}`,
        email: caller.email,
      },
      // Feature flags (booleans are fine)
      features: {
        recording: false,
        livestreaming: false,
        transcription: true,
      },
    },
  };

  const kid = `${JAAS_APP_ID}/${JAAS_KEY_ID}`;
  const usingRs256 = Boolean(JAAS_PRIVATE_KEY);

  const signOptions = {
    algorithm: usingRs256 ? "RS256" : "HS256",
    header: { kid },
  };

  const secretOrKey = JAAS_PRIVATE_KEY || JAAS_SECRET;
  if (!secretOrKey) {
    throw new Error(
      "JaaS signing credentials are not configured on the server."
    );
  }

  return jwt.sign(payload, secretOrKey, signOptions);
}

router.post("/", firebaseAuthMiddleware, async (req, res) => {
  try {
    if (!JAAS_APP_ID || !JAAS_KEY_ID) {
      return res
        .status(500)
        .json({
          error: "Video service is not configured. Please contact support.",
        });
    }

    const { roomId } = req.body;
    const caller = req.user;

    if (!roomId) {
      return res.status(400).json({ error: "Room ID is required." });
    }

    const fullRoomName = `${ROOM_PREFIX}-${roomId}`;
    const normalizedRoomName = normalizeRoomName(fullRoomName);

    console.log(
      `JaaS: Request for roomId='${roomId}', normalized='${normalizedRoomName}', by uid='${caller?.uid}'`
    );

    const token = createJaasJwt({ normalizedRoomName, caller });

    // Build the correct external_api.js URL:
    // https://8x8.vc/<tenantId>/<keyId>/external_api.js
    const prefix = "vpaas-magic-cookie-";
    const tenantId = JAAS_APP_ID.startsWith(prefix)
      ? JAAS_APP_ID.substring(prefix.length)
      : JAAS_APP_ID;
    const externalApiUrl = `https://${JAAS_DOMAIN}/${tenantId}/${JAAS_KEY_ID}/external_api.js`;

    console.log(`✅ JaaS: externalApiUrl resolved: ${externalApiUrl}`);

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      roomName: normalizedRoomName,
      externalApiUrl,
      token,
      expiresAt: new Date(
        Date.now() + JAAS_TOKEN_TTL_SECS * 1000
      ).toISOString(),
    });
  } catch (err) {
    console.error(
      "❌ JaaS: Error generating token:",
      err && err.stack ? err.stack : err
    );
    const message =
      err.message &&
      /not configured|credentials|key|APP_ID|KEY_ID/i.test(err.message)
        ? "Video service misconfigured on server."
        : "Unexpected error while setting up the video session.";
    return res.status(500).json({ error: message });
  }
});

module.exports = router;
