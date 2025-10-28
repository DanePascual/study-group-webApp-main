// frontend/student/scripts/login.js
// Production-ready login page script (v9.x modular).
// Responsibilities:
//  - Use shared firebase initializer (frontend/config/firebase.js)
//  - Sign in with email/password
//  - Obtain ID token and persist in sessionStorage for subsequent API calls
//  - Provide a friendly inline error area and minimal loading UI
//  - Provide forgot-password flow using Firebase sendPasswordResetEmail

// NOTE: path adjustments: this file lives at frontend/student/scripts/
// so the shared firebase module lives at ../../config/firebase.js (frontend/config/firebase.js)
import { auth, getIdToken, onAuthStateChanged } from "../config/firebase.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// --- UI helpers ---
const loginErrorEl = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = document.getElementById("loginBtnText");

function showInlineError(msg) {
  if (!loginErrorEl) {
    alert(msg);
    return;
  }
  loginErrorEl.textContent = msg;
  loginErrorEl.style.display = "block";
}

function clearInlineError() {
  if (!loginErrorEl) return;
  loginErrorEl.textContent = "";
  loginErrorEl.style.display = "none";
}

function setLoginLoading(loading) {
  if (!loginBtn) return;
  loginBtn.disabled = loading;
  if (loginBtnText)
    loginBtnText.textContent = loading ? "Logging in..." : "Log in";
}

// Password toggle functionality
function togglePassword() {
  const passwordInput = document.getElementById("password");
  const toggleIcon = document.getElementById("passwordToggleIcon");

  if (!passwordInput) return;
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
document
  .getElementById("passwordToggleBtn")
  .addEventListener("click", togglePassword);

// Email domain validation (client-side convenience)
function validateEmail(email) {
  const requiredDomain = "@paterostechnologicalcollege.edu.ph";
  return email && email.toLowerCase().endsWith(requiredDomain.toLowerCase());
}

// --- Authentication flows ---

// Login form submission
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearInlineError();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!validateEmail(email)) {
    showInlineError(
      "Please use your Pateros Technological College email address (example@paterostechnologicalcollege.edu.ph)."
    );
    return;
  }

  if (!email || !password) {
    showInlineError("Please fill in all fields.");
    return;
  }

  setLoginLoading(true);
  try {
    // Sign in using the modular SDK (shared auth instance)
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    // Obtain ID token for backend calls
    const idToken = await getIdToken();
    if (idToken) {
      // Persist token in sessionStorage for this browser session only.
      // Other scripts should use sessionStorage.getItem('idToken') or use an authFetch helper.
      sessionStorage.setItem("idToken", idToken);
      sessionStorage.setItem("uid", userCredential.user.uid || "");
    } else {
      // If token not available, continue but warn in console
      console.warn("Login succeeded but idToken was not obtained.");
    }

    // Redirect to dashboard (adjust path if your app structure differs)
    window.location.href = "../pages/dashboard.html";
  } catch (err) {
    // Convert Firebase errors to friendly messages where possible
    const msg =
      err && err.code
        ? firebaseErrorMessage(err)
        : err && err.message
        ? err.message
        : "Login failed";
    showInlineError(msg);
  } finally {
    setLoginLoading(false);
  }
});

// Friendly mapping for some common Firebase Auth errors (expand if needed)
function firebaseErrorMessage(err) {
  if (!err || !err.code)
    return err && err.message ? err.message : "Authentication error";
  switch (err.code) {
    case "auth/invalid-email":
      return "Invalid email address.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
      return "No account found with that email.";
    case "auth/wrong-password":
      return "Incorrect password.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please try again later.";
    default:
      return err.message || "Login failed";
  }
}

// --- Forgot password modal behavior ---
function openForgotPasswordModal() {
  const modal = document.getElementById("forgotPasswordModal");
  if (!modal) return;
  modal.style.display = "block";
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  const fe = document.getElementById("forgotEmail");
  if (fe) fe.focus();
}
window.openForgotPasswordModal = openForgotPasswordModal;

function closeForgotPasswordModal() {
  const modal = document.getElementById("forgotPasswordModal");
  if (!modal) return;
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "auto";
  const fe = document.getElementById("forgotEmail");
  if (fe) {
    fe.value = "";
    fe.classList.remove("error", "success");
  }
  hideResetLoadingState();
}
window.closeForgotPasswordModal = closeForgotPasswordModal;

document
  .getElementById("forgotPasswordModal")
  .addEventListener("click", function (e) {
    if (e.target === this) closeForgotPasswordModal();
  });

async function sendResetLink() {
  const email = document.getElementById("forgotEmail").value.trim();
  if (!email) {
    showInlineError("Please enter your email address.");
    document.getElementById("forgotEmail").focus();
    return;
  }
  if (!validateEmail(email)) {
    showInlineError(
      "Please use your Pateros Technological College email address."
    );
    document.getElementById("forgotEmail").focus();
    return;
  }

  showResetLoadingState();
  try {
    await sendPasswordResetEmail(auth, email);
    hideResetLoadingState();
    closeForgotPasswordModal();
    alert(`Password reset link sent to ${email}. Check your inbox.`);
  } catch (err) {
    hideResetLoadingState();
    showInlineError(
      "Error sending reset email: " + (err && err.message ? err.message : err)
    );
  }
}
window.sendResetLink = sendResetLink;

function showResetLoadingState() {
  const btn = document.getElementById("sendResetBtn");
  const spinner = document.getElementById("resetSpinner");
  const btnText = document.getElementById("resetBtnText");
  if (btn) btn.disabled = true;
  if (spinner) spinner.style.display = "inline-block";
  if (btnText) btnText.textContent = "Sending...";
}
function hideResetLoadingState() {
  const btn = document.getElementById("sendResetBtn");
  const spinner = document.getElementById("resetSpinner");
  const btnText = document.getElementById("resetBtnText");
  if (btn) btn.disabled = false;
  if (spinner) spinner.style.display = "none";
  if (btnText) btnText.textContent = "Send Reset Link";
}

// Signup redirect
function goToSignup() {
  window.location.href = "../pages/sign-up.html";
}
window.goToSignup = goToSignup;

// Keep sessionStorage token updated on auth state changes (refresh tokens periodically)
onAuthStateChanged(async (user) => {
  if (user) {
    try {
      // forceRefresh=false here; you could periodically call getIdToken(true) to refresh
      const token = await getIdToken(false);
      if (token) sessionStorage.setItem("idToken", token);
    } catch (e) {
      console.warn(
        "Error refreshing idToken on auth state change",
        e && e.message ? e.message : e
      );
    }
  } else {
    sessionStorage.removeItem("idToken");
    sessionStorage.removeItem("uid");
  }
});

// Keyboard shortcuts and small UX handlers
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    closeForgotPasswordModal();
  }
});

document
  .getElementById("forgotEmail")
  .addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendResetLink();
    }
  });
