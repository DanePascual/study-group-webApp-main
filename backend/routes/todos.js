const express = require("express");
const router = express.Router();
const admin = require("../config/firebase-admin");
const firebaseAuthMiddleware = require("../middleware/firebaseAuthMiddleware");

// GET all todos for the current user
router.get("/", firebaseAuthMiddleware, async (req, res) => {
  const uid = req.user.uid;
  try {
    const snapshot = await admin
      .firestore()
      .collection("todos")
      .where("uid", "==", uid)
      .orderBy("created", "desc")
      .get();

    const todos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(todos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// POST a new todo
// ✅ FIXED: Convert empty string reminder to null
router.post("/", firebaseAuthMiddleware, async (req, res) => {
  const uid = req.user.uid;
  let {
    text,
    completed = false,
    reminder = null, // ✅ CHANGED: Default to null instead of ""
    created = new Date().toISOString(),
    priority = "medium",
  } = req.body;

  // ✅ NEW: Convert empty string to null
  if (reminder === "") {
    reminder = null;
  }

  try {
    const todoData = { uid, text, completed, reminder, created, priority };
    const docRef = await admin.firestore().collection("todos").add(todoData);
    res.status(201).json({ id: docRef.id, ...todoData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// PUT update a todo by ID (only if it belongs to the user)
// ✅ FIXED: Convert empty string reminder to null
router.put("/:id", firebaseAuthMiddleware, async (req, res) => {
  const uid = req.user.uid;
  const todoId = req.params.id;
  try {
    const docRef = admin.firestore().collection("todos").doc(todoId);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().uid !== uid) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // ✅ NEW: Convert empty string reminder to null
    let updateData = { ...req.body };
    if (updateData.reminder === "") {
      updateData.reminder = null;
    }

    await docRef.update(updateData);
    res.json({ id: todoId, ...updateData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE a todo by ID (only if it belongs to the user)
router.delete("/:id", firebaseAuthMiddleware, async (req, res) => {
  const uid = req.user.uid;
  const todoId = req.params.id;
  try {
    const docRef = admin.firestore().collection("todos").doc(todoId);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().uid !== uid) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await docRef.delete();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
