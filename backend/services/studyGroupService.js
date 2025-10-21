const admin = require("../config/firebase-admin");
const db = admin.firestore();

const STUDY_GROUPS_COLLECTION = "studyGroups";

// Create a study group
async function createStudyGroup(data) {
  const docRef = await db.collection(STUDY_GROUPS_COLLECTION).add(data);
  return { id: docRef.id, ...data };
}

// Get all study groups
async function getAllStudyGroups() {
  const snapshot = await db.collection(STUDY_GROUPS_COLLECTION).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

// Get a single study group by ID
async function getStudyGroupById(id) {
  const doc = await db.collection(STUDY_GROUPS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

// Update a study group
async function updateStudyGroup(id, data) {
  await db.collection(STUDY_GROUPS_COLLECTION).doc(id).update(data);
  return getStudyGroupById(id);
}

// Delete a study group
async function deleteStudyGroup(id) {
  await db.collection(STUDY_GROUPS_COLLECTION).doc(id).delete();
  return { id };
}

module.exports = {
  createStudyGroup,
  getAllStudyGroups,
  getStudyGroupById,
  updateStudyGroup,
  deleteStudyGroup,
};
