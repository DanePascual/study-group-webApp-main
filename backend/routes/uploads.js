// backend/routes/uploads.js
// Add support for uploading profile photos and room files to Supabase storage (server-side).
// Protected endpoints: require Firebase ID token (firebaseAuthMiddleware).
// Returns { url, filename } like profile-photo route already did.

const express = require("express");
const router = express.Router();
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const supabase = require("../config/supabase");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

// Multer memory storage with 10 MB per-file limit
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB limit

// Allowed MIME types for images and common docs
const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const ALLOWED_DOC_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// Helper to upload buffer to a bucket and return public URL and filename
async function uploadBufferToBucket(bucket, filename, buffer, contentType) {
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filename, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  // Return public URL (we assume bucket is public)
  const { data: publicUrlData, error: publicUrlError } = await supabase.storage
    .from(bucket)
    .getPublicUrl(filename);

  if (publicUrlError) {
    // still return filename so caller may create signed URL later
    return { url: "", filename };
  }

  return { url: publicUrlData.publicUrl || "", filename };
}

// POST /api/uploads/profile-photo  (existing route — unchanged behavior)
router.post(
  "/profile-photo",
  firebaseAuthMiddleware,
  upload.single("photo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;

      // Server-side MIME validation
      if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
        return res.status(400).json({
          error: "Invalid file type. Allowed types: JPG, PNG, GIF, WEBP.",
        });
      }

      const uid = req.user && req.user.uid;
      if (!uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const bucket = "profiles";
      const ext = path.extname(file.originalname).toLowerCase() || "";
      const filename = `profiles/${uid}/${uuidv4()}${ext}`;

      try {
        const result = await uploadBufferToBucket(
          bucket,
          filename,
          file.buffer,
          file.mimetype
        );
        return res
          .status(201)
          .json({ url: result.url, filename: result.filename });
      } catch (uploadErr) {
        console.error("Supabase upload error (profile-photo):", uploadErr);
        return res.status(500).json({
          error: "Failed to upload file to storage",
          details: uploadErr.message || uploadErr,
        });
      }
    } catch (err) {
      console.error("Error in POST /api/uploads/profile-photo:", err);
      return res
        .status(500)
        .json({ error: "Server error", details: err.message });
    }
  }
);

// NEW: POST /api/uploads/room-file
// Protected: authenticated users only. Uploads a file for a room and returns { url, filename }.
router.post(
  "/room-file",
  firebaseAuthMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Expect roomId in form data (helps namespace files)
      const roomId = (req.body && req.body.roomId) || null;
      if (!roomId) {
        return res.status(400).json({ error: "Missing roomId" });
      }

      const file = req.file;
      const uid = req.user && req.user.uid;
      if (!uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Validate MIME type (allow images and docs)
      const mime = file.mimetype || "";
      const isImage = ALLOWED_IMAGE_MIME.has(mime);
      const isDoc = ALLOWED_DOC_MIME.has(mime);
      if (!isImage && !isDoc) {
        return res.status(400).json({ error: "Invalid file type" });
      }

      // Bucket to store room files
      const bucket = "room-files";

      // Build namespaced filename
      const ext = path.extname(file.originalname).toLowerCase() || "";
      const safeOwner = uid;
      const filename = `roomFiles/${roomId}/${safeOwner}_${uuidv4()}${ext}`;

      try {
        const result = await uploadBufferToBucket(
          bucket,
          filename,
          file.buffer,
          file.mimetype
        );
        // Return URL and filename so frontend can save URL into message documents
        return res
          .status(201)
          .json({ url: result.url, filename: result.filename });
      } catch (uploadErr) {
        console.error("Supabase upload error (room-file):", uploadErr);
        return res.status(500).json({
          error: "Failed to upload file to storage",
          details: uploadErr.message || uploadErr,
        });
      }
    } catch (err) {
      console.error("Error in POST /api/uploads/room-file:", err);
      return res
        .status(500)
        .json({ error: "Server error", details: err.message });
    }
  }
);

module.exports = router;
