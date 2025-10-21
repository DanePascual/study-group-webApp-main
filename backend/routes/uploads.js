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

// Allowed MIME types for profile photos
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/gif"]);

// POST /api/uploads/profile-photo
// Protected: requires Authorization: Bearer <idToken>
// Uploads the authenticated user's profile photo to the "profiles" bucket
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
      if (!ALLOWED_MIME.has(file.mimetype)) {
        return res.status(400).json({
          error: "Invalid file type. Allowed types: JPG, PNG, GIF.",
        });
      }

      // Use the authenticated user's uid in the path so files are grouped per user
      const uid = req.user && req.user.uid;
      if (!uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Bucket to store profile images (you created this bucket)
      const bucket = "profiles";

      // Build a namespaced filename so we can easily find / delete old avatars later
      const ext = path.extname(file.originalname).toLowerCase() || "";
      const filename = `profiles/${uid}/${uuidv4()}${ext}`;

      // Upload to Supabase storage (server-side uses service role key in config/supabase.js)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error("Supabase upload error:", uploadError);
        return res.status(500).json({
          error: "Failed to upload file to storage",
          details: uploadError.message || uploadError,
        });
      }

      // Decide whether to return a public URL or a signed URL.
      // If you set SUPABASE_PROFILE_SIGNED=true in env, server will create a signed URL valid for one hour.
      const useSigned = process.env.SUPABASE_PROFILE_SIGNED === "true";

      let publicUrl = "";
      if (useSigned) {
        const expiresIn = 60 * 60; // 1 hour
        const { data: signedData, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(filename, expiresIn);
        if (signedError) {
          console.error("Supabase createSignedUrl error:", signedError);
          return res.status(500).json({
            error: "Failed to create signed URL",
            details: signedError.message || signedError,
          });
        }
        publicUrl = signedData.signedUrl;
      } else {
        const { data: publicUrlData, error: publicUrlError } =
          await supabase.storage.from(bucket).getPublicUrl(filename);
        if (publicUrlError) {
          console.error("Supabase getPublicUrl error:", publicUrlError);
          return res.status(500).json({
            error: "Failed to get public URL for uploaded file",
            details: publicUrlError.message || publicUrlError,
          });
        }
        publicUrl = publicUrlData?.publicUrl || "";
      }

      // Return the URL and stored filename to the client
      return res.status(201).json({
        url: publicUrl,
        filename,
      });
    } catch (err) {
      console.error("Error in POST /api/uploads/profile-photo:", err);
      return res
        .status(500)
        .json({ error: "Server error", details: err.message });
    }
  }
);

module.exports = router;
