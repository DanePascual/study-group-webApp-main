// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAn1-kQypHeeoqZRGYKhJfE5AiICkTX_Hw",
  authDomain: "study-group-webapp-93fc2.firebaseapp.com",
  projectId: "study-group-webapp-93fc2",
  storageBucket: "study-group-webapp-93fc2.firebasestorage.app",
  messagingSenderId: "857690286168",
  appId: "1:857690286168:web:93e5f7bf374b62445a022d",
  measurementId: "G-MR51J9BKM0",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
