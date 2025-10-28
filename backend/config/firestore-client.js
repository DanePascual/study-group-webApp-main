// backend/config/firestore-client.js
// Explicit Firestore client with strong diagnostics.
// Now prefers to reuse firebase-admin's Firestore instance (so the app uses one credentialed identity).
// Falls back to constructing an explicit @google-cloud/firestore client only if admin is not available.

const path = require("path");
const fs = require("fs");
const { Firestore } = require("@google-cloud/firestore");

function loadServiceAccountFromEnvOrFile() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (err) {
      console.warn(
        "firestore-client: FIREBASE_SERVICE_ACCOUNT_JSON invalid JSON:",
        err && err.message
      );
    }
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY,
    };
  }

  try {
    const localPath = path.join(__dirname, "serviceAccountKey.json");
    if (fs.existsSync(localPath)) {
      return require(localPath);
    }
  } catch (err) {
    // ignore
  }

  return null;
}

function normalizeKey(key) {
  if (!key || typeof key !== "string") return key;
  if (key.indexOf("\\n") !== -1) return key.replace(/\\n/g, "\n");
  return key;
}

let firestoreClient = null;

// First preference: reuse firebase-admin's Firestore instance (ensures same credentials)
try {
  let admin = null;
  try {
    // require the app's firebase-admin config if present
    // use './firebase-admin' because this file is in backend/config
    admin = require("./firebase-admin");
  } catch (e) {
    // firebase-admin config not present or failed to load; we'll fallback
    admin = null;
  }

  if (
    admin &&
    typeof admin === "object" &&
    typeof admin.firestore === "function"
  ) {
    try {
      firestoreClient = admin.firestore();
      console.log(
        "firestore-client: using firebase-admin's Firestore instance (reusing the same credentials)."
      );
    } catch (e) {
      console.warn(
        "firestore-client: failed to get Firestore from firebase-admin, will attempt explicit client. reason:",
        e && e.message
      );
      firestoreClient = null;
    }
  }
} catch (err) {
  // ignore unexpected errors here and continue to fallback logic
  console.warn(
    "firestore-client: unexpected error while checking firebase-admin:",
    err && err.message
  );
}

// If not obtained from admin, construct an explicit client (existing logic)
const serviceAccount = loadServiceAccountFromEnvOrFile();

try {
  if (!firestoreClient && serviceAccount && serviceAccount.project_id) {
    const projectId = serviceAccount.project_id;
    // Ensure env vars for other libs
    if (!process.env.GOOGLE_CLOUD_PROJECT)
      process.env.GOOGLE_CLOUD_PROJECT = projectId;
    if (!process.env.GCLOUD_PROJECT) process.env.GCLOUD_PROJECT = projectId;

    const clientEmail =
      serviceAccount.client_email || serviceAccount.clientEmail;
    const rawKey = serviceAccount.private_key || serviceAccount.privateKey;
    const privateKey = normalizeKey(rawKey);

    // Safe masked diagnostics
    try {
      const maskedEmail = clientEmail
        ? `${clientEmail.split("@")[0]}@<redacted>`
        : "<none>";
      const hadEscapedNewlines = rawKey && rawKey.indexOf("\\n") !== -1;
      const newlineCount = ((privateKey && privateKey.match(/\n/g)) || [])
        .length;
      const beginsWithPem =
        typeof privateKey === "string" &&
        privateKey.trim().startsWith("-----BEGIN");
      console.log(
        "firestore-client: diag: serviceAccount present. projectId=",
        projectId
      );
      console.log(
        "firestore-client: diag: client_email=",
        maskedEmail,
        "hadEscapedNewlines=",
        !!hadEscapedNewlines,
        "newlineCount=",
        newlineCount,
        "beginsWithPem=",
        !!beginsWithPem
      );
    } catch (diagErr) {
      console.warn("firestore-client: diag error:", diagErr && diagErr.message);
    }

    if (clientEmail && privateKey) {
      firestoreClient = new Firestore({
        projectId,
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
      });
      console.log(
        "firestore-client: created explicit Firestore client for project:",
        projectId
      );
    } else {
      console.warn(
        "firestore-client: serviceAccount missing client_email or private_key (falling back)."
      );
    }
  }
} catch (err) {
  console.error(
    "firestore-client: error while constructing explicit client:",
    err && err.message
  );
}

// Last-resort fallback to ADC (will not throw here)
if (!firestoreClient) {
  try {
    firestoreClient = new Firestore();
    console.warn("firestore-client: created fallback Firestore client (ADC).");
  } catch (err) {
    console.error(
      "firestore-client: failed to create fallback Firestore client:",
      err && err.message
    );
    throw err;
  }
}

// Non-fatal verification: run a quick read to prove the client can authenticate.
// This logs either success or the full error stack (but does NOT exit the process).
(async function verifyAuth() {
  try {
    const snapshot = await firestoreClient
      .collection("resources")
      .limit(1)
      .get();
    console.log(
      "firestore-client: verification query succeeded, docs=",
      snapshot.size
    );
  } catch (err) {
    console.error("firestore-client: verification query FAILED - full error:");
    console.error(err && err.stack ? err.stack : err);
    console.error(
      "firestore-client: verification failed. This means the constructed Firestore client could not authenticate."
    );
  }
})();

module.exports = firestoreClient;
