const express = require("express");
const router = express.Router();
const multer = require("multer");
const admin = require("../config/firebase-admin");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const supabase = require("../config/supabase"); // Import your Supabase client

// Set up multer for file uploads (memory storage)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Firestore ref
const db = admin.firestore();

// GET /api/resources - List all resources (public)
router.get("/", async (req, res) => {
  try {
    const snapshot = await db
      .collection("resources")
      .orderBy("createdAt", "desc")
      .get();
    const resources = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(resources);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/resources/:id - Get single resource
router.get("/:id", async (req, res) => {
  try {
    const doc = await db.collection("resources").doc(req.params.id).get();
    if (!doc.exists)
      return res.status(404).json({ error: "Resource not found" });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/resources - Upload new resource (Supabase Storage + Firestore metadata)
router.post(
  "/",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { title, desc, category, tags } = req.body;
      const file = req.files?.file?.[0];
      const coverImage = req.files?.coverImage?.[0];

      if (!title || !file) {
        return res.status(400).json({ error: "Title and file are required." });
      }
      // Parse tags (should be array)
      let tagsArray = [];
      try {
        tagsArray = typeof tags === "string" ? JSON.parse(tags) : tags || [];
      } catch {
        tagsArray = [];
      }

      const type = path
        .extname(file.originalname)
        .replace(".", "")
        .toLowerCase();
      const size = file.size || 0; // Store bytes, format on frontend
      const filename = `${uuidv4()}.${type}`;

      // Upload to Supabase bucket called 'resources'
      const { error: uploadError } = await supabase.storage
        .from("resources")
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });
      if (uploadError) {
        return res.status(500).json({
          error: "Failed to upload file to Supabase Storage",
          details: uploadError.message,
        });
      }

      // Get public URL for file
      const { data: publicUrlData } = supabase.storage
        .from("resources")
        .getPublicUrl(filename);
      const fileUrl = publicUrlData?.publicUrl || "";

      // ---- Optional: Upload cover image to Supabase Storage ----
      let coverImageUrl = "";
      if (coverImage) {
        const coverType = path
          .extname(coverImage.originalname)
          .replace(".", "")
          .toLowerCase();
        const coverFilename = `covers/${uuidv4()}.${coverType}`;
        const { error: coverUploadError } = await supabase.storage
          .from("resources")
          .upload(coverFilename, coverImage.buffer, {
            contentType: coverImage.mimetype,
            upsert: false,
          });
        if (!coverUploadError) {
          const { data: coverPublicUrlData } = supabase.storage
            .from("resources")
            .getPublicUrl(coverFilename);
          coverImageUrl = coverPublicUrlData?.publicUrl || "";
        }
      }

      const resource = {
        title,
        desc: desc || "",
        tags: tagsArray,
        category: category || "",
        type,
        size, // store bytes
        url: fileUrl,
        coverImage: coverImageUrl,
        by: req.body.by || "Anonymous",
        userId: req.body.userId || "anon",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        downloads: 0,
        views: 0,
        supabaseFile: filename,
      };
      const docRef = await db.collection("resources").add(resource);

      // Fetch the doc to get the real timestamp and return it
      const docSnap = await docRef.get();
      res.status(201).json({ id: docRef.id, ...docSnap.data() });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// PUT /api/resources/:id - Edit resource metadata (now with cover image support!)
router.put(
  "/:id",
  upload.fields([{ name: "coverImage", maxCount: 1 }]),
  async (req, res) => {
    try {
      const docRef = db.collection("resources").doc(req.params.id);
      const doc = await docRef.get();
      if (!doc.exists)
        return res.status(404).json({ error: "Resource not found" });

      const update = { ...req.body };
      delete update.url;
      delete update.size;
      delete update.type;
      update.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      // If tags is sent as a stringified JSON, parse it
      if (typeof update.tags === "string") {
        try {
          update.tags = JSON.parse(update.tags);
        } catch {
          update.tags = [];
        }
      }

      // Handle cover image update (if new one is uploaded)
      let newCoverImageUrl = null;
      let oldCoverImageUrl = doc.data().coverImage || "";
      const coverImage = req.files?.coverImage?.[0];

      if (coverImage) {
        // Upload new cover image to Supabase
        const coverType = path
          .extname(coverImage.originalname)
          .replace(".", "")
          .toLowerCase();
        const coverFilename = `covers/${uuidv4()}.${coverType}`;
        const { error: coverUploadError } = await supabase.storage
          .from("resources")
          .upload(coverFilename, coverImage.buffer, {
            contentType: coverImage.mimetype,
            upsert: false,
          });
        if (coverUploadError) {
          return res.status(500).json({
            error: "Failed to upload new cover image to Supabase Storage",
            details: coverUploadError.message,
          });
        }
        const { data: coverPublicUrlData } = supabase.storage
          .from("resources")
          .getPublicUrl(coverFilename);
        newCoverImageUrl = coverPublicUrlData?.publicUrl || "";
        update.coverImage = newCoverImageUrl;

        // Optionally: delete old cover image from Supabase Storage
        if (oldCoverImageUrl) {
          const matches = oldCoverImageUrl.match(
            /covers\/([a-zA-Z0-9\-]+\.[a-zA-Z0-9]+)$/
          );
          if (matches && matches[1]) {
            await supabase.storage
              .from("resources")
              .remove([`covers/${matches[1]}`]);
          }
        }
      }

      await docRef.update(update);
      // Return the updated resource
      const updatedDoc = await docRef.get();
      res.json({ id: docRef.id, ...updatedDoc.data() });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /api/resources/:id - Delete metadata and file from Supabase Storage
router.delete("/:id", async (req, res) => {
  try {
    const docRef = db.collection("resources").doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists)
      return res.status(404).json({ error: "Resource not found" });
    const resource = doc.data();

    // Delete main file from Supabase Storage
    if (resource.supabaseFile) {
      await supabase.storage.from("resources").remove([resource.supabaseFile]);
    }
    // Delete cover image from Supabase Storage
    if (resource.coverImage) {
      // Extract cover filename from URL
      const matches = resource.coverImage.match(
        /covers\/([a-zA-Z0-9\-]+\.[a-zA-Z0-9]+)$/
      );
      if (matches && matches[1]) {
        await supabase.storage
          .from("resources")
          .remove([`covers/${matches[1]}`]);
      }
    }
    await docRef.delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
