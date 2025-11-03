// backend/routes/resources.js
// Resources routes using Firestore for metadata and Supabase for file storage.
// SECURITY HARDENED VERSION - CommonJS (require/module.exports)

const express = require("express");
const router = express.Router();
const multer = require("multer");
const admin = require("../config/firebase-admin");
let db;
try {
  db = require("../config/firestore-client");
} catch (e) {
  db = null;
}
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");
const { JWT } = require("google-auth-library");
const supabase = require("../config/supabase");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

// ===== SECURITY: File type whitelist =====
const ALLOWED_FILE_TYPES = new Set(["pdf", "doc", "docx", "ppt", "pptx"]);
const ALLOWED_COVER_TYPES = new Set(["jpg", "jpeg", "png", "gif"]);

// ===== SECURITY: Input validation constants =====
const MAX_TITLE_LENGTH = 255;
const MAX_DESC_LENGTH = 2000;
const MAX_CATEGORY_LENGTH = 50;
const MAX_TAG_LENGTH = 50;
const MAX_TAGS_COUNT = 10;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_COVER_SIZE_BYTES = 10 * 1024 * 1024;
const MIN_SIGNED_URL_EXPIRY = 60;
const MAX_SIGNED_URL_EXPIRY = 3600;

// multer setup
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).replace(".", "").toLowerCase();
    if (file.fieldname === "file") {
      if (!ALLOWED_FILE_TYPES.has(ext)) {
        return cb(
          new Error(
            `File type .${ext} not allowed. Allowed: ${Array.from(
              ALLOWED_FILE_TYPES
            ).join(", ")}`
          )
        );
      }
    } else if (file.fieldname === "coverImage") {
      if (!ALLOWED_COVER_TYPES.has(ext)) {
        return cb(
          new Error(
            `Cover image type .${ext} not allowed. Allowed: ${Array.from(
              ALLOWED_COVER_TYPES
            ).join(", ")}`
          )
        );
      }
    }
    cb(null, true);
  },
});

// ===== SECURITY: Logging helpers =====
function logError(prefix, err) {
  try {
    if (err && err.stack) {
      console.error(`${prefix} - stack:\n`, err.stack);
    } else {
      console.error(`${prefix} - error:`, err);
    }
  } catch (e) {
    console.error("logError failed:", e && e.stack ? e.stack : e);
  }
}

function logSecurityEvent(eventType, uid, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY] ${timestamp} | Event: ${eventType} | User: ${uid} | Details:`,
    details
  );
}

// ===== SECURITY: Input validation helpers =====
function sanitizeString(str, maxLength = 255) {
  if (typeof str !== "string") return "";
  return str.trim().substring(0, maxLength);
}

function validateTitle(title) {
  const sanitized = sanitizeString(title, MAX_TITLE_LENGTH);
  if (!sanitized || sanitized.length === 0) {
    return { valid: false, error: "Title is required and must not be empty" };
  }
  return { valid: true, value: sanitized };
}

function validateDescription(desc) {
  if (desc === undefined || desc === null) {
    return { valid: true, value: "" };
  }
  const sanitized = sanitizeString(desc, MAX_DESC_LENGTH);
  return { valid: true, value: sanitized };
}

function validateCategory(category) {
  if (!category) return { valid: true, value: "" };
  const sanitized = sanitizeString(category, MAX_CATEGORY_LENGTH);
  return { valid: true, value: sanitized };
}

function validateTags(tagsInput) {
  let tags = [];
  try {
    if (typeof tagsInput === "string") {
      tags = JSON.parse(tagsInput);
    } else if (Array.isArray(tagsInput)) {
      tags = tagsInput;
    }
  } catch {
    return { valid: false, error: "Invalid tags format" };
  }

  if (!Array.isArray(tags)) {
    return { valid: false, error: "Tags must be an array" };
  }

  if (tags.length > MAX_TAGS_COUNT) {
    return { valid: false, error: `Maximum ${MAX_TAGS_COUNT} tags allowed` };
  }

  const sanitizedTags = tags
    .map((tag) => {
      if (typeof tag !== "string") return null;
      const sanitized = sanitizeString(tag, MAX_TAG_LENGTH);
      return sanitized.length > 0 ? sanitized : null;
    })
    .filter((tag) => tag !== null);

  return { valid: true, value: sanitizedTags };
}

function validateFileType(filename, iscover = false) {
  const ext = path.extname(filename).replace(".", "").toLowerCase();
  const allowedTypes = iscover ? ALLOWED_COVER_TYPES : ALLOWED_FILE_TYPES;

  if (!allowedTypes.has(ext)) {
    return {
      valid: false,
      error: `File type .${ext} not allowed. Allowed: ${Array.from(
        allowedTypes
      ).join(", ")}`,
    };
  }
  return { valid: true, value: ext };
}

function loadServiceAccount() {
  try {
    const localPath = path.join(
      __dirname,
      "..",
      "config",
      "serviceAccountKey.json"
    );
    if (fs.existsSync(localPath)) {
      return require(localPath);
    }
  } catch (e) {}
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (e) {}
  }
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY,
    };
  }
  return null;
}

function decodeValue(fv) {
  if (fv === null || fv === undefined) return null;
  if (fv.stringValue !== undefined) return fv.stringValue;
  if (fv.integerValue !== undefined) return Number(fv.integerValue);
  if (fv.doubleValue !== undefined) return Number(fv.doubleValue);
  if (fv.booleanValue !== undefined) return fv.booleanValue;
  if (fv.timestampValue !== undefined) return fv.timestampValue;
  if (fv.arrayValue && Array.isArray(fv.arrayValue.values)) {
    return fv.arrayValue.values.map(decodeValue);
  }
  if (fv.mapValue && fv.mapValue.fields) {
    const out = {};
    for (const k of Object.keys(fv.mapValue.fields)) {
      out[k] = decodeValue(fv.mapValue.fields[k]);
    }
    return out;
  }
  return fv;
}

async function fetchResourcesViaRest(limit = 100) {
  const sa = loadServiceAccount();
  if (!sa || !sa.client_email || !sa.private_key) {
    throw new Error("No service account available for REST fallback");
  }
  const privateKey = (sa.private_key || sa.privateKey || "").replace(
    /\\n/g,
    "\n"
  );
  const client = new JWT({
    email: sa.client_email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  const tokenResp = await client.authorize();
  if (!tokenResp || !tokenResp.access_token) {
    throw new Error("Failed to obtain access token for REST fallback");
  }
  const token = tokenResp.access_token;
  const project =
    sa.project_id ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;
  if (!project) throw new Error("No project_id available for REST fallback");
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/resources?pageSize=${limit}`;
  const resp = await fetch(url, {
    headers: { Authorization: "Bearer " + token },
  });
  const body = await resp.text().catch(() => null);
  let json = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch (e) {
    json = null;
  }
  if (!resp.ok) {
    const err = new Error(`REST call failed with status ${resp.status}`);
    err.status = resp.status;
    err.body = json || body;
    throw err;
  }
  const docs = (json && json.documents) || [];
  return docs.map((doc) => {
    const fields = doc.fields || {};
    const data = {};
    for (const k of Object.keys(fields)) {
      data[k] = decodeValue(fields[k]);
    }
    return Object.assign(
      { id: doc.name ? doc.name.split("/").pop() : undefined },
      data
    );
  });
}

// Public GET /api/resources
router.get("/", async (req, res) => {
  try {
    console.log(
      `[resources] GET / - from ${req.ip} query=${JSON.stringify(
        req.query || {}
      )}`
    );

    try {
      const client = db || (admin && admin.firestore && admin.firestore());
      if (!client) throw new Error("No Firestore client available");

      const snapshot = await client
        .collection("resources")
        .orderBy("createdAt", "desc")
        .get();
      const resources = snapshot.docs.map((doc) => {
        const d = doc.data();
        const { supabaseFile, coverFile, ...publicData } = d || {};
        return { id: doc.id, ...publicData };
      });
      return res.json(resources);
    } catch (clientErr) {
      console.warn(
        "[resources] Firestore client query failed, falling back to REST. reason:",
        clientErr && clientErr.message ? clientErr.message : clientErr
      );
    }

    try {
      const resources = await fetchResourcesViaRest(100);
      const publicResources = resources.map((r) => {
        const { supabaseFile, coverFile, ...pub } = r || {};
        return pub;
      });
      return res.json(publicResources);
    } catch (restErr) {
      logError("[resources] REST fallback error", restErr);
      return res.status(500).json({
        error:
          restErr && restErr.message ? restErr.message : "REST fallback failed",
      });
    }
  } catch (err) {
    logError("[resources] GET / error", err);
    res
      .status(500)
      .json({ error: err && err.message ? err.message : "Server error" });
  }
});

// Protected GET /api/resources/mine
router.get("/mine", firebaseAuthMiddleware, async (req, res) => {
  try {
    const uid = req.user && req.user.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const client = db || (admin && admin.firestore && admin.firestore());
    if (!client) throw new Error("No Firestore client available");

    const snapshot = await client
      .collection("resources")
      .where("ownerId", "==", uid)
      .orderBy("createdAt", "desc")
      .get();
    const resources = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return res.json(resources);
  } catch (err) {
    logError("[resources] GET /mine error", err);
    return res
      .status(500)
      .json({ error: err && err.message ? err.message : "Server error" });
  }
});

// POST /api/resources/:id/download
router.post("/:id/download", firebaseAuthMiddleware, async (req, res) => {
  try {
    const uid = req.user && req.user.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    console.log(
      `[resources] POST /:id/download - id=${req.params.id} user=${uid}`
    );
    const client = db || (admin && admin.firestore && admin.firestore());
    if (!client) throw new Error("No Firestore client available");

    const docRef = client.collection("resources").doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists)
      return res.status(404).json({ error: "Resource not found" });
    const resource = doc.data() || {};
    if (!resource.supabaseFile)
      return res
        .status(400)
        .json({ error: "No file available for this resource" });

    let expires = Number(process.env.SIGNED_URL_EXPIRES_SECONDS || 300);
    if (expires < MIN_SIGNED_URL_EXPIRY) {
      expires = MIN_SIGNED_URL_EXPIRY;
    }
    if (expires > MAX_SIGNED_URL_EXPIRY) {
      expires = MAX_SIGNED_URL_EXPIRY;
    }

    const { data: signedData, error: signedErr } = await supabase.storage
      .from("resources")
      .createSignedUrl(resource.supabaseFile, expires);
    if (signedErr || !signedData || !signedData.signedUrl) {
      logError("[resources] createSignedUrl failed", signedErr);
      logSecurityEvent("DOWNLOAD_SIGNED_URL_FAILED", uid, {
        resourceId: req.params.id,
        error: signedErr?.message || "Unknown error",
      });
      return res.status(500).json({ error: "Failed to create download link" });
    }

    const downloadDoc = {
      resourceId: req.params.id,
      userId: uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userAgent: req.get("User-Agent") || null,
      ip: req.ip || null,
    };

    const batch = client.batch();
    const downloadRef = client.collection("resourceDownloads").doc();
    batch.set(downloadRef, downloadDoc);
    batch.update(docRef, { downloads: (resource.downloads || 0) + 1 });
    await batch.commit();

    console.log(
      `[resources] Download initiated: resource=${req.params.id} user=${uid}`
    );
    return res.json({ signedUrl: signedData.signedUrl, expiresIn: expires });
  } catch (err) {
    logError("[resources] POST /:id/download error", err);
    res
      .status(500)
      .json({ error: err && err.message ? err.message : "Server error" });
  }
});

// GET /api/resources/:id
router.get("/:id", async (req, res) => {
  try {
    console.log(`[resources] GET /:id - id=${req.params.id}`);
    const client = db || (admin && admin.firestore && admin.firestore());
    if (!client) throw new Error("No Firestore client available");

    try {
      const doc = await client.collection("resources").doc(req.params.id).get();
      if (!doc.exists)
        return res.status(404).json({ error: "Resource not found" });
      const data = doc.data() || {};
      const { supabaseFile, coverFile, ...publicData } = data;
      return res.json({ id: doc.id, ...publicData });
    } catch (err) {
      console.warn(
        "[resources] GET/:id - client read failed, trying REST fallback",
        err && err.message
      );
      try {
        const sa = loadServiceAccount();
        if (!sa) throw new Error("No service account for REST fallback");
        const privateKey = (sa.private_key || sa.privateKey || "").replace(
          /\\n/g,
          "\n"
        );
        const clientJwt = new JWT({
          email: sa.client_email,
          key: privateKey,
          scopes: ["https://www.googleapis.com/auth/datastore"],
        });
        const tokenResp = await clientJwt.authorize();
        const token = tokenResp && tokenResp.access_token;
        const project =
          sa.project_id ||
          process.env.GOOGLE_CLOUD_PROJECT ||
          process.env.GCLOUD_PROJECT;
        const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/resources/${encodeURIComponent(
          req.params.id
        )}`;
        const resp = await fetch(url, {
          headers: { Authorization: "Bearer " + token },
        });
        if (resp.status === 404)
          return res.status(404).json({ error: "Resource not found" });
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          throw new Error(`REST read failed status=${resp.status} body=${txt}`);
        }
        const json = await resp.json();
        const fields = json.fields || {};
        const data = {};
        for (const k of Object.keys(fields)) data[k] = decodeValue(fields[k]);
        const { supabaseFile, coverFile, ...publicData } = data;
        return res.json({ id: req.params.id, ...publicData });
      } catch (restErr) {
        logError("[resources] GET/:id REST fallback error", restErr);
        return res.status(500).json({
          error:
            restErr && restErr.message
              ? restErr.message
              : "REST fallback failed",
        });
      }
    }
  } catch (err) {
    logError("[resources] GET /:id error", err);
    res
      .status(500)
      .json({ error: err && err.message ? err.message : "Server error" });
  }
});

// POST /api/resources
router.post(
  "/",
  firebaseAuthMiddleware,
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const uid = req.user && req.user.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      console.log(
        `[resources] POST / - user=${uid} files=${Object.keys(
          req.files || {}
        ).join(",")}`
      );

      const { title, desc, category, tags } = req.body;
      const file = req.files?.file?.[0];
      const coverImage = req.files?.coverImage?.[0];

      if (!title || !file) {
        logSecurityEvent("UPLOAD_VALIDATION_FAILED", uid, {
          reason: "Missing title or file",
        });
        return res.status(400).json({ error: "Title and file are required." });
      }

      const titleValidation = validateTitle(title);
      if (!titleValidation.valid) {
        logSecurityEvent("UPLOAD_TITLE_INVALID", uid, {
          reason: titleValidation.error,
        });
        return res.status(400).json({ error: titleValidation.error });
      }

      const descValidation = validateDescription(desc);
      if (!descValidation.valid) {
        logSecurityEvent("UPLOAD_DESC_INVALID", uid, {
          reason: descValidation.error,
        });
        return res.status(400).json({ error: descValidation.error });
      }

      const categoryValidation = validateCategory(category);
      if (!categoryValidation.valid) {
        logSecurityEvent("UPLOAD_CATEGORY_INVALID", uid, {
          reason: categoryValidation.error,
        });
        return res.status(400).json({ error: categoryValidation.error });
      }

      const tagsValidation = validateTags(tags);
      if (!tagsValidation.valid) {
        logSecurityEvent("UPLOAD_TAGS_INVALID", uid, {
          reason: tagsValidation.error,
        });
        return res.status(400).json({ error: tagsValidation.error });
      }

      const fileTypeValidation = validateFileType(file.originalname);
      if (!fileTypeValidation.valid) {
        logSecurityEvent("UPLOAD_FILE_TYPE_REJECTED", uid, {
          filename: file.originalname,
          reason: fileTypeValidation.error,
        });
        return res.status(400).json({ error: fileTypeValidation.error });
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        logSecurityEvent("UPLOAD_FILE_TOO_LARGE", uid, {
          filename: file.originalname,
          size: file.size,
          maxSize: MAX_FILE_SIZE_BYTES,
        });
        return res.status(413).json({
          error: `File size exceeds maximum of ${(
            MAX_FILE_SIZE_BYTES /
            1024 /
            1024
          ).toFixed(0)}MB`,
        });
      }

      const type = fileTypeValidation.value;
      const size = file.size;
      const filename = `resources/${uuidv4()}.${type}`;

      const { error: uploadError } = await supabase.storage
        .from("resources")
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });
      if (uploadError) {
        logError("[resources] Supabase upload error", uploadError);
        logSecurityEvent("UPLOAD_SUPABASE_FAILED", uid, {
          filename: file.originalname,
          error: uploadError.message,
        });
        return res
          .status(500)
          .json({ error: "Failed to upload file to Supabase Storage" });
      }

      let coverFileKey = null;
      if (coverImage) {
        const coverTypeValidation = validateFileType(
          coverImage.originalname,
          true
        );
        if (!coverTypeValidation.valid) {
          logSecurityEvent("UPLOAD_COVER_TYPE_REJECTED", uid, {
            filename: coverImage.originalname,
            reason: coverTypeValidation.error,
          });
          return res.status(400).json({ error: coverTypeValidation.error });
        }

        if (coverImage.size > MAX_COVER_SIZE_BYTES) {
          logSecurityEvent("UPLOAD_COVER_TOO_LARGE", uid, {
            filename: coverImage.originalname,
            size: coverImage.size,
            maxSize: MAX_COVER_SIZE_BYTES,
          });
          return res.status(413).json({
            error: `Cover image size exceeds maximum of ${(
              MAX_COVER_SIZE_BYTES /
              1024 /
              1024
            ).toFixed(0)}MB`,
          });
        }

        const coverType = coverTypeValidation.value;
        const coverKey = `covers/${uuidv4()}.${coverType}`;
        const { error: coverUploadError } = await supabase.storage
          .from("resources")
          .upload(coverKey, coverImage.buffer, {
            contentType: coverImage.mimetype,
            upsert: false,
          });
        if (!coverUploadError) {
          coverFileKey = coverKey;
        } else {
          console.warn("[resources] cover upload error:", coverUploadError);
          logSecurityEvent("UPLOAD_COVER_FAILED", uid, {
            filename: coverImage.originalname,
            error: coverUploadError.message,
          });
        }
      }

      const resource = {
        title: titleValidation.value,
        desc: descValidation.value,
        tags: tagsValidation.value,
        category: categoryValidation.value,
        type,
        size,
        supabaseFile: filename,
        coverFile: coverFileKey || null,
        by: req.user.name || req.user.email || "Anonymous",
        ownerId: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        downloads: 0,
        views: 0,
      };

      const client = db || (admin && admin.firestore && admin.firestore());
      if (!client) throw new Error("No Firestore client available for write");

      const docRef = await client.collection("resources").add(resource);
      const docSnap = await docRef.get();
      const docData = docSnap.data() || {};
      const { supabaseFile, coverFile, ...publicData } = docData;

      console.log(
        `[resources] ✅ Resource created: id=${docRef.id} by user=${uid} ownerId=${uid}`
      );
      return res.status(201).json({ id: docRef.id, ...publicData });
    } catch (err) {
      logError("[resources] POST / error", err);
      res
        .status(500)
        .json({ error: err && err.message ? err.message : "Server error" });
    }
  }
);

// PUT /api/resources/:id
router.put(
  "/:id",
  firebaseAuthMiddleware,
  upload.fields([{ name: "coverImage", maxCount: 1 }]),
  async (req, res) => {
    try {
      const uid = req.user && req.user.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      console.log(`[resources] PUT /:id - id=${req.params.id} user=${uid}`);
      const client = db || (admin && admin.firestore && admin.firestore());
      if (!client) throw new Error("No Firestore client available");

      const docRef = client.collection("resources").doc(req.params.id);
      const doc = await docRef.get();
      if (!doc.exists)
        return res.status(404).json({ error: "Resource not found" });
      const data = doc.data() || {};

      const isOwner = String(data.ownerId) === String(uid);
      const isAdmin = req.user && req.user.admin === true;
      if (!isOwner && !isAdmin) {
        logSecurityEvent("UPDATE_RESOURCE_FORBIDDEN", uid, {
          resourceId: req.params.id,
          owner: data.ownerId,
        });
        return res.status(403).json({ error: "Forbidden" });
      }

      const update = {};

      if (req.body.title !== undefined) {
        const titleValidation = validateTitle(req.body.title);
        if (!titleValidation.valid) {
          logSecurityEvent("UPDATE_TITLE_INVALID", uid, {
            reason: titleValidation.error,
          });
          return res.status(400).json({ error: titleValidation.error });
        }
        update.title = titleValidation.value;
      }

      if (req.body.desc !== undefined) {
        const descValidation = validateDescription(req.body.desc);
        if (!descValidation.valid) {
          logSecurityEvent("UPDATE_DESC_INVALID", uid, {
            reason: descValidation.error,
          });
          return res.status(400).json({ error: descValidation.error });
        }
        update.desc = descValidation.value;
      }

      if (req.body.category !== undefined) {
        const categoryValidation = validateCategory(req.body.category);
        if (!categoryValidation.valid) {
          logSecurityEvent("UPDATE_CATEGORY_INVALID", uid, {
            reason: categoryValidation.error,
          });
          return res.status(400).json({ error: categoryValidation.error });
        }
        update.category = categoryValidation.value;
      }

      if (req.body.tags !== undefined) {
        const tagsValidation = validateTags(req.body.tags);
        if (!tagsValidation.valid) {
          logSecurityEvent("UPDATE_TAGS_INVALID", uid, {
            reason: tagsValidation.error,
          });
          return res.status(400).json({ error: tagsValidation.error });
        }
        update.tags = tagsValidation.value;
      }

      update.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      const coverImage = req.files?.coverImage?.[0];
      if (coverImage) {
        const coverTypeValidation = validateFileType(
          coverImage.originalname,
          true
        );
        if (!coverTypeValidation.valid) {
          logSecurityEvent("UPDATE_COVER_TYPE_REJECTED", uid, {
            resourceId: req.params.id,
            filename: coverImage.originalname,
            reason: coverTypeValidation.error,
          });
          return res.status(400).json({ error: coverTypeValidation.error });
        }

        if (coverImage.size > MAX_COVER_SIZE_BYTES) {
          logSecurityEvent("UPDATE_COVER_TOO_LARGE", uid, {
            resourceId: req.params.id,
            size: coverImage.size,
            maxSize: MAX_COVER_SIZE_BYTES,
          });
          return res.status(413).json({
            error: `Cover image size exceeds maximum of ${(
              MAX_COVER_SIZE_BYTES /
              1024 /
              1024
            ).toFixed(0)}MB`,
          });
        }

        const coverType = coverTypeValidation.value;
        const coverKey = `covers/${uuidv4()}.${coverType}`;
        const { error: coverUploadError } = await supabase.storage
          .from("resources")
          .upload(coverKey, coverImage.buffer, {
            contentType: coverImage.mimetype,
            upsert: false,
          });
        if (coverUploadError) {
          logError("[resources] cover upload failed", coverUploadError);
          logSecurityEvent("UPDATE_COVER_UPLOAD_FAILED", uid, {
            resourceId: req.params.id,
            error: coverUploadError.message,
          });
          return res
            .status(500)
            .json({ error: "Failed to upload new cover image" });
        }
        update.coverFile = coverKey;
        if (data.coverFile) {
          try {
            await supabase.storage.from("resources").remove([data.coverFile]);
          } catch (e) {
            console.warn(
              "[resources] failed to remove old cover:",
              e && e.message ? e.message : e
            );
          }
        }
      }

      await docRef.update(update);
      const updatedDoc = await docRef.get();
      const updatedData = updatedDoc.data() || {};
      const { supabaseFile, coverFile, ...publicData } = updatedData;

      console.log(
        `[resources] Resource updated: id=${req.params.id} by user=${uid}`
      );
      return res.json({ id: docRef.id, ...publicData });
    } catch (err) {
      logError("[resources] PUT /:id error", err);
      res
        .status(500)
        .json({ error: err && err.message ? err.message : "Server error" });
    }
  }
);

// DELETE /api/resources/:id
router.delete("/:id", firebaseAuthMiddleware, async (req, res) => {
  try {
    const uid = req.user && req.user.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    console.log(`[resources] DELETE /:id - id=${req.params.id} user=${uid}`);
    const client = db || (admin && admin.firestore && admin.firestore());
    if (!client) throw new Error("No Firestore client available");

    const docRef = client.collection("resources").doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists)
      return res.status(404).json({ error: "Resource not found" });
    const resource = doc.data() || {};

    const isOwner = String(resource.ownerId) === String(uid);
    const isAdmin = req.user && req.user.admin === true;
    if (!isOwner && !isAdmin) {
      logSecurityEvent("DELETE_RESOURCE_FORBIDDEN", uid, {
        resourceId: req.params.id,
        owner: resource.ownerId,
      });
      return res.status(403).json({ error: "Forbidden" });
    }

    if (resource.supabaseFile) {
      try {
        await supabase.storage
          .from("resources")
          .remove([resource.supabaseFile]);
      } catch (e) {
        console.warn(
          "[resources] failed to remove main file:",
          e && e.message ? e.message : e
        );
      }
    }
    if (resource.coverFile) {
      try {
        await supabase.storage.from("resources").remove([resource.coverFile]);
      } catch (e) {
        console.warn(
          "[resources] failed to remove cover file:",
          e && e.message ? e.message : e
        );
      }
    }

    await docRef.delete();
    console.log(
      `[resources] Resource deleted: id=${req.params.id} by user=${uid}`
    );
    return res.json({ success: true });
  } catch (err) {
    logError("[resources] DELETE /:id error", err);
    res
      .status(500)
      .json({ error: err && err.message ? err.message : "Server error" });
  }
});

module.exports = router;
