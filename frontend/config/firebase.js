// Import Firebase modules from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js"; // ADD THIS LINE

// Your Firebase project config (get this from your Firebase Console)
const firebaseConfig = {
  apiKey: "AIzaSyAn1-kQypHeeoqZRGYKhJfE5AiICkTX_Hw",
  authDomain: "study-group-webapp-93fc2.firebaseapp.com",
  projectId: "study-group-webapp-93fc2",
  storageBucket: "study-group-webapp-93fc2.firebasestorage.app",
  messagingSenderId: "857690286168",
  appId: "1:857690286168:web:93e5f7bf374b62445a022d",
  measurementId: "G-MR51J9BKM0",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // ADD THIS LINE

export { app, auth, db }; // EXPORT db AS WELL
