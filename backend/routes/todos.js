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
router.post("/", firebaseAuthMiddleware, async (req, res) => {
  const uid = req.user.uid;
  const {
    text,
    completed = false,
    reminder = "",
    created = new Date().toISOString(),
    priority = "medium",
  } = req.body;

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
router.put("/:id", firebaseAuthMiddleware, async (req, res) => {
  const uid = req.user.uid;
  const todoId = req.params.id;
  try {
    const docRef = admin.firestore().collection("todos").doc(todoId);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().uid !== uid) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await docRef.update(req.body);
    res.json({ id: todoId, ...req.body });
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
