// Import Firebase from the loaded scripts
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-auth.js";

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

// Attach event listener for password toggle
document
  .getElementById("passwordToggleBtn")
  .addEventListener("click", togglePassword);

// Password toggle functionality
function togglePassword() {
  const passwordInput = document.getElementById("password");
  const toggleIcon = document.getElementById("passwordToggleIcon");

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    toggleIcon.classList.remove("bi-eye");
    toggleIcon.classList.add("bi-eye-slash");
  } else {
    passwordInput.type = "password";
    toggleIcon.classList.remove("bi-eye-slash");
    toggleIcon.classList.add("bi-eye");
  }
}

// Email validation function
function validateEmail(email) {
  const requiredDomain = "@paterostechnologicalcollege.edu.ph";
  return email.toLowerCase().endsWith(requiredDomain.toLowerCase());
}

// Real-time email validation
document.getElementById("email").addEventListener("input", function (e) {
  const email = e.target.value;
  const emailInput = e.target;

  if (email && !validateEmail(email)) {
    emailInput.style.borderColor = "#dc3545";
    emailInput.style.backgroundColor = "#fff5f5";
    if (!document.getElementById("emailError")) {
      const errorMsg = document.createElement("div");
      errorMsg.id = "emailError";
      errorMsg.className = "error-message";
      errorMsg.textContent =
        "Please use your Pateros Technological College email address";
      emailInput.parentNode.appendChild(errorMsg);
    }
  } else {
    emailInput.style.borderColor = "#e0e0e0";
    emailInput.style.backgroundColor = "#f8f9fa";
    const errorMsg = document.getElementById("emailError");
    if (errorMsg) {
      errorMsg.remove();
    }
  }
});

// Real-time validation for forgot password email
document.getElementById("forgotEmail").addEventListener("input", function (e) {
  const email = e.target.value;
  const emailInput = e.target;

  if (email) {
    if (!validateEmail(email)) {
      emailInput.classList.add("error");
      emailInput.classList.remove("success");
    } else {
      emailInput.classList.remove("error");
      emailInput.classList.add("success");
    }
  } else {
    emailInput.classList.remove("error", "success");
  }
});

// Login form submission with Firebase Auth integration
document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  if (!validateEmail(email)) {
    alert(
      "Please use your Pateros Technological College email address\n(example@paterostechnologicalcollege.edu.ph)"
    );
    return;
  }

  if (email && password) {
    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        alert("Login successful! Redirecting...");
        window.location.href = "dashboard.html";
      })
      .catch((error) => {
        alert("Login failed: " + error.message);
      });
  } else {
    alert("Please fill in all fields");
  }
});

// Forgot Password Modal Functions
function openForgotPasswordModal() {
  document.getElementById("forgotPasswordModal").style.display = "block";
  document.body.style.overflow = "hidden";
  document.getElementById("forgotEmail").focus();
}
window.openForgotPasswordModal = openForgotPasswordModal;

function closeForgotPasswordModal() {
  document.getElementById("forgotPasswordModal").style.display = "none";
  document.body.style.overflow = "auto";
  document.getElementById("forgotEmail").value = "";
  document.getElementById("forgotEmail").classList.remove("error", "success");
  hideResetLoadingState();
}
window.closeForgotPasswordModal = closeForgotPasswordModal;

// Modal click outside
document
  .getElementById("forgotPasswordModal")
  .addEventListener("click", function (e) {
    if (e.target === this) {
      closeForgotPasswordModal();
    }
  });

// Send reset link functionality with Firebase
function sendResetLink() {
  const email = document.getElementById("forgotEmail").value.trim();

  if (!email) {
    alert("Please enter your email address");
    document.getElementById("forgotEmail").focus();
    return;
  }

  if (!validateEmail(email)) {
    alert(
      "Please use your Pateros Technological College email address\n(@paterostechnologicalcollege.edu.ph)"
    );
    document.getElementById("forgotEmail").focus();
    return;
  }

  showResetLoadingState();

  sendPasswordResetEmail(auth, email)
    .then(() => {
      hideResetLoadingState();
      closeForgotPasswordModal();
      alert(
        `Password reset link sent to ${email}!\n\nCheck your email and follow the instructions to reset your password.`
      );
    })
    .catch((error) => {
      hideResetLoadingState();
      alert("Error sending reset email: " + error.message);
    });
}
window.sendResetLink = sendResetLink;

// Password reset loading state management
function showResetLoadingState() {
  const btn = document.getElementById("sendResetBtn");
  const spinner = document.getElementById("resetSpinner");
  const btnText = document.getElementById("resetBtnText");

  btn.disabled = true;
  spinner.style.display = "inline-block";
  btnText.textContent = "Sending...";
}
function hideResetLoadingState() {
  const btn = document.getElementById("sendResetBtn");
  const spinner = document.getElementById("resetSpinner");
  const btnText = document.getElementById("resetBtnText");

  btn.disabled = false;
  spinner.style.display = "none";
  btnText.textContent = "Send Reset Link";
}

// Sign up button
function goToSignup() {
  window.location.href = "sign-up.html";
}
window.goToSignup = goToSignup;

// Keyboard shortcuts
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    closeForgotPasswordModal();
  }
});

// Enter key submission for forgot password
document
  .getElementById("forgotEmail")
  .addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendResetLink();
    }
  });
