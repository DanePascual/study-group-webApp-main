// backend/config/firebase-admin.js
// Robust Firebase Admin initialization with explicit projectId propagation.
// - Accepts FIREBASE_SERVICE_ACCOUNT_JSON (full JSON string) OR
//   FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
// - Falls back to ./serviceAccountKey.json for local development only.
// - DOES NOT log secret values. Prints only safe diagnostics.
// - Ensures GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT are set and passes projectId to initializeApp().

const admin = require("firebase-admin");

let serviceAccount = null;
let loadedFrom = null;

function failFatal(msg) {
  console.error("firebase-admin:", msg);
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  } else {
    console.warn("Continuing in non-production mode (check credentials).");
  }
}

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      loadedFrom = "FIREBASE_SERVICE_ACCOUNT_JSON";
    } catch (err) {
      failFatal(
        "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: " + err.message
      );
    }
  } else if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    // Build service account from individual env vars. Private key in env often contains escaped \n
    const rawKey = process.env.FIREBASE_PRIVATE_KEY;
    const hasEscapedNewlines = rawKey.indexOf("\\n") !== -1;
    const fixedKey = rawKey.replace(/\\n/g, "\n");
    serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: fixedKey,
    };
    loadedFrom = "individual env vars";

    // Safe diagnostics (DO NOT print secrets)
    try {
      const newlineCount = (fixedKey.match(/\n/g) || []).length;
      const beginsWithPem =
        typeof fixedKey === "string" &&
        fixedKey.trim().startsWith("-----BEGIN");
      const endsWithPem =
        typeof fixedKey === "string" &&
        fixedKey.trim().endsWith("-----END PRIVATE KEY-----");
      console.log(
        "firebase-admin: [diag] loaded from individual env vars; FIREBASE_PRIVATE_KEY hadEscapedNewlines=",
        hasEscapedNewlines,
        "newlineCount=",
        newlineCount,
        "beginsWithPem=",
        beginsWithPem,
        "endsWithPem=",
        endsWithPem
      );
    } catch (diagErr) {
      console.warn(
        "firebase-admin: [diag] error computing private key shape:",
        diagErr && diagErr.message
      );
    }
  } else {
    // Development fallback
    try {
      /* eslint-disable global-require, import/no-dynamic-require */
      serviceAccount = require("./serviceAccountKey.json");
      loadedFrom = "./serviceAccountKey.json";
    } catch (err) {
      failFatal(
        "service account not provided. Set FIREBASE_SERVICE_ACCOUNT_JSON or provide FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, or place ./serviceAccountKey.json for local dev."
      );
    }
  }

  if (serviceAccount && serviceAccount.project_id) {
    console.log(
      "firebase-admin: loaded service account from",
      loadedFrom,
      "for project:",
      serviceAccount.project_id
    );
    // IMPORTANT: ensure google-cloud clients can detect the projectId reliably
    // Set both env vars used by Google libraries if they are not already set.
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      process.env.GOOGLE_CLOUD_PROJECT = serviceAccount.project_id;
    }
    if (!process.env.GCLOUD_PROJECT) {
      process.env.GCLOUD_PROJECT = serviceAccount.project_id;
    }
  } else if (serviceAccount) {
    console.warn(
      "firebase-admin: loaded a serviceAccount but project_id missing (continuing in non-production)."
    );
  }
} catch (err) {
  failFatal(
    "Unexpected error while initializing firebase-admin config: " +
      (err && err.message)
  );
}

// Initialize admin SDK with explicit projectId option (helps Firestore clients use correct project)
try {
  if (serviceAccount) {
    const initOptions = {
      credential: admin.credential.cert(serviceAccount),
      // pass projectId explicitly so admin.app().options.projectId is set
      projectId: serviceAccount.project_id,
      databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
    };
    admin.initializeApp(initOptions);
    console.log(
      "firebase-admin: initializeApp() called with certificate and projectId."
    );
  } else {
    console.warn(
      "firebase-admin: initializing without service account credentials (admin features will be limited)."
    );
    admin.initializeApp();
  }
} catch (err) {
  console.error("firebase-admin: failed to initialize:", err && err.message);
  if (process.env.NODE_ENV === "production") process.exit(1);
}

module.exports = admin;
