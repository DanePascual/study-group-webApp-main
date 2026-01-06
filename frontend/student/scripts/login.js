// frontend/student/scripts/login.js
// FIXED: Remove all Firebase error messages, show only user-friendly messages
// ✅ NEW: Ban check after successful login

import {
  auth,
  db,
  getIdToken,
  onAuthStateChanged,
} from "../../config/firebase.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// ===== UI Elements =====
const loginForm = document.getElementById("loginForm");
const loginErrorEl = document.getElementById("loginError");
const loginErrorMessageEl = document.getElementById("loginErrorMessage");
const loginSuccessEl = document.getElementById("loginSuccess");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = document.getElementById("loginBtnText");
const loginLoader = document.getElementById("loginLoader");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberMeCheckbox = document.getElementById("rememberMe");

// Modal Elements
const forgotPasswordModal = document.getElementById("forgotPasswordModal");
const forgotEmail = document.getElementById("forgotEmail");
const sendResetBtn = document.getElementById("sendResetBtn");
const resetBtnText = document.getElementById("resetBtnText");
const resetSpinner = document.getElementById("resetSpinner");
const modalError = document.getElementById("modalError");
const modalErrorMessage = document.getElementById("modalErrorMessage");
const modalSuccess = document.getElementById("modalSuccess");

// ===== Helper Functions =====
function showInlineError(msg) {
  // IMPORTANT: Only set innerHTML, don't append Firebase errors
  loginErrorMessageEl.innerHTML = msg;
  loginErrorEl.style.display = "flex";
  loginErrorEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearInlineError() {
  loginErrorEl.style.display = "none";
  loginErrorMessageEl.innerHTML = "";
}

function showSuccessAlert() {
  loginSuccessEl.style.display = "flex";
}

function setLoginLoading(loading) {
  loginBtn.disabled = loading;
  if (loading) {
    document.querySelector("#loginBtn .btn-content").style.display = "none";
    loginLoader.style.display = "flex";
  } else {
    document.querySelector("#loginBtn .btn-content").style.display = "flex";
    loginLoader.style.display = "none";
  }
}

// Email validation
function validateEmail(email) {
  const requiredDomain = "@paterostechnologicalcollege.edu.ph";
  return email && email.toLowerCase().endsWith(requiredDomain.toLowerCase());
}

// ===== CHECK IF USER IS BANNED =====
async function checkUserBanned(uid) {
  try {
    console.log("[login] Checking ban status for user:", uid);

    // Get user from Firestore
    const userDocSnap = await getDoc(doc(db, "users", uid));

    if (!userDocSnap.exists()) {
      console.warn("[login] User document not found");
      return false;
    }

    const userData = userDocSnap.data();
    const isBanned = userData.isBanned === true;

    if (isBanned) {
      console.warn(`[login] ❌ User ${uid} is banned`);
      console.warn("[login] Ban reason:", userData.bannedReason || "No reason");
      console.warn("[login] Banned at:", userData.bannedAt || "Unknown");
    } else {
      console.log(`[login] ✅ User ${uid} is not banned - access allowed`);
    }

    return isBanned;
  } catch (err) {
    console.error("[login] Error checking ban status:", err);
    // If error checking ban status, allow login (fail open)
    return false;
  }
}

// ===== Real-time Email Validation =====
emailInput.addEventListener("input", function () {
  const value = this.value.trim();
  const indicator = document.getElementById("emailIndicator");
  const helper = document.getElementById("emailHelper");

  if (!value) {
    this.classList.remove("error", "success");
    indicator.classList.remove("error", "success");
    helper.textContent = "Use your college email address";
    helper.classList.remove("error", "success");
    return;
  }

  if (validateEmail(value)) {
    this.classList.add("success");
    this.classList.remove("error");
    indicator.classList.add("success");
    indicator.classList.remove("error");
    indicator.innerHTML = '<i class="bi bi-check-circle-fill"></i>';
    helper.textContent = "✓ Email verified";
    helper.classList.add("success");
    helper.classList.remove("error");
  } else {
    this.classList.add("error");
    this.classList.remove("success");
    indicator.classList.add("error");
    indicator.classList.remove("success");
    indicator.innerHTML = '<i class="bi bi-x-circle-fill"></i>';
    helper.textContent = "Use your Pateros Technological College email";
    helper.classList.add("error");
    helper.classList.remove("success");
  }
});

// ===== Password Visibility Toggle =====
document.getElementById("passwordToggleBtn").addEventListener("click", (e) => {
  e.preventDefault();
  const passwordToggleIcon = document.getElementById("passwordToggleIcon");

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    passwordToggleIcon.classList.remove("bi-eye");
    passwordToggleIcon.classList.add("bi-eye-slash");
  } else {
    passwordInput.type = "password";
    passwordToggleIcon.classList.remove("bi-eye-slash");
    passwordToggleIcon.classList.add("bi-eye");
  }
});

// ===== LOGIN FORM SUBMISSION =====
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearInlineError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // Validation
  if (!email || !password) {
    showInlineError(
      "📝 Please enter both your email and password to continue."
    );
    return;
  }

  if (!validateEmail(email)) {
    showInlineError(
      "📧 Please use your college email address (example@paterostechnologicalcollege.edu.ph)"
    );
    emailInput.classList.add("error");
    return;
  }

  if (password.length < 6) {
    showInlineError("🔐 Password should be at least 6 characters long.");
    passwordInput.classList.add("error");
    return;
  }

  setLoginLoading(true);
  try {
    // Attempt login
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const idToken = await getIdToken();

    if (idToken) {
      sessionStorage.setItem("idToken", idToken);
      sessionStorage.setItem("uid", userCredential.user.uid || "");

      if (rememberMeCheckbox.checked) {
        localStorage.setItem("rememberEmail", email);
      } else {
        localStorage.removeItem("rememberEmail");
      }
    }

    // ===== NEW: Check if user is banned =====
    console.log("[login] Checking if user is banned...");
    const isBanned = await checkUserBanned(userCredential.user.uid);

    if (isBanned) {
      setLoginLoading(false);
      showInlineError(
        "🚫 <strong>Account Banned</strong><br/>Your account has been suspended and you cannot log in.<br/><br/>💡 <strong>What to do:</strong> Contact support if you believe this is an error."
      );
      // Sign out the user
      await auth.signOut();
      sessionStorage.removeItem("idToken");
      sessionStorage.removeItem("uid");
      console.warn("[login] Banned user signed out");
      return;
    }

    // If not banned, continue
    console.log("[login] ✅ User passed ban check - proceeding to dashboard");
    showSuccessAlert();
    setTimeout(() => {
      window.location.href = "../pages/dashboard.html";
    }, 800);
  } catch (err) {
    setLoginLoading(false);

    // Handle error - this is the KEY FIX
    handleLoginError(err, email);
  }
});

// ===== SMART ERROR HANDLER - ONLY USER-FRIENDLY MESSAGES =====
async function handleLoginError(err, email) {
  let message = "";
  let inputToHighlight = "both";

  // Always check error code first, NEVER show Firebase error message
  if (!err || !err.code) {
    message =
      '❌ <strong>Login failed</strong><br/>An unexpected error occurred.<br/><br/>💡 <strong>What to do:</strong> Please try again. If the problem persists, contact <a href="mailto:support@paterostechnologicalcollege.edu.ph" style="color: #4caf50; font-weight: 600;">support</a>.';
    inputToHighlight = "both";
    showInlineError(message);
    return;
  }

  // Extract error code safely
  const errorCode = err.code || "";

  // IMPORTANT: Map error codes to user-friendly messages
  // auth/invalid-login-credentials is the generic error for both wrong email AND wrong password
  if (
    errorCode === "auth/invalid-credential" ||
    errorCode === "auth/invalid-login-credentials"
  ) {
    // This is the tricky one - Firebase doesn't tell us if email doesn't exist or password is wrong
    // So we ask the user to check BOTH, but lean towards "wrong credentials"
    message = `❌ <strong>Invalid email or password</strong><br/>The email or password you entered doesn't match our records.<br/><br/>💡 <strong>What to do:</strong><br/>✓ Double-check your email and password<br/>✓ Make sure caps lock is off<br/>✓ Forgot your password?<br/>✓ Create a new account`;
    inputToHighlight = "both";
  } else if (errorCode === "auth/user-not-found") {
    // Email doesn't exist
    message = `📧 <strong>Account not found</strong><br/>There is no account registered with "<strong>${email}</strong>".<br/><br/>💡 <strong>What to do:</strong><br/>✓ Check if you typed the email correctly<br/>✓ Create a new account<br/>✓ Contact <a href="mailto:support@paterostechnologicalcollege.edu.ph" style="color: #4caf50; font-weight: 600; text-decoration: none;">support</a> if you need help`;
    inputToHighlight = "email";
  } else if (errorCode === "auth/wrong-password") {
    // Password is wrong
    message = `🔐 <strong>Incorrect password</strong><br/>The password you entered doesn't match our records.<br/><br/>💡 <strong>What to do:</strong><br/>✓ Double-check your password (is caps lock on?)<br/>✓ <a href="#" onclick="openForgotPasswordModal(); return false;" style="color: #4caf50; font-weight: 600; text-decoration: none;">Reset your password</a><br/>✓ Try again`;
    inputToHighlight = "password";
  } else if (errorCode === "auth/invalid-email") {
    message = `📧 <strong>Invalid email address</strong><br/>The email format is not valid.<br/><br/>💡 <strong>What to do:</strong> Use your college email (example@paterostechnologicalcollege.edu.ph).`;
    inputToHighlight = "email";
  } else if (errorCode === "auth/user-disabled") {
    message = `🚫 <strong>Account disabled</strong><br/>This account has been deactivated or suspended.<br/><br/>💡 <strong>What to do:</strong> Contact <a href="mailto:support@paterostechnologicalcollege.edu.ph" style="color: #4caf50; font-weight: 600; text-decoration: none;">support@paterostechnologicalcollege.edu.ph</a> for assistance.`;
    inputToHighlight = "both";
  } else if (errorCode === "auth/too-many-requests") {
    message = `⏱️ <strong>Too many login attempts</strong><br/>Your account has been temporarily locked for security.<br/><br/>💡 <strong>What to do:</strong><br/>✓ Wait 5-10 minutes and try again<br/>✓ Or <a href="#" onclick="openForgotPasswordModal(); return false;" style="color: #4caf50; font-weight: 600; text-decoration: none;">reset your password</a> to unlock immediately`;
    inputToHighlight = "both";
  } else if (errorCode === "auth/operation-not-allowed") {
    message = `⚙️ <strong>Login temporarily unavailable</strong><br/>Email/password sign-in is currently disabled.<br/><br/>💡 <strong>What to do:</strong> Please try again later or contact support.`;
    inputToHighlight = "both";
  } else if (errorCode === "auth/network-request-failed") {
    message = `🌐 <strong>Network connection error</strong><br/>Unable to reach the server.<br/><br/>💡 <strong>What to do:</strong> Check your internet connection and try again.`;
    inputToHighlight = null;
  } else if (errorCode === "auth/invalid-api-key") {
    message = `⚠️ <strong>System error</strong><br/>Something went wrong on our end.<br/><br/>💡 <strong>What to do:</strong> Please try again. If the issue persists, contact support.`;
    inputToHighlight = null;
  } else {
    // Catch-all for any other error - DO NOT show Firebase error
    message = `❌ <strong>Login failed</strong><br/>An error occurred while trying to log in.<br/><br/>💡 <strong>What to do:</strong> Please try again or contact <a href="mailto:support@paterostechnologicalcollege.edu.ph" style="color: #4caf50; font-weight: 600; text-decoration: none;">support</a>.`;
    inputToHighlight = "both";
  }

  showInlineError(message);

  // Highlight appropriate input
  emailInput.classList.remove("error");
  passwordInput.classList.remove("error");

  if (inputToHighlight === "email") {
    emailInput.classList.add("error");
  } else if (inputToHighlight === "password") {
    passwordInput.classList.add("error");
  } else if (inputToHighlight === "both") {
    emailInput.classList.add("error");
    passwordInput.classList.add("error");
  }
}

// Clear error on input
emailInput.addEventListener("input", () => {
  emailInput.classList.remove("error");
});

passwordInput.addEventListener("input", () => {
  passwordInput.classList.remove("error");
});

// ===== Remember Me =====
window.addEventListener("DOMContentLoaded", () => {
  const rememberEmail = localStorage.getItem("rememberEmail");
  if (rememberEmail) {
    emailInput.value = rememberEmail;
    rememberMeCheckbox.checked = true;
    emailInput.dispatchEvent(new Event("input"));
  }
});

// ===== Forgot Password Modal =====
function openForgotPasswordModal(e) {
  if (e) {
    e.preventDefault();
  }
  forgotPasswordModal.style.display = "block";
  forgotPasswordModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  forgotEmail.focus();
  clearModalErrors();
}
window.openForgotPasswordModal = openForgotPasswordModal;

function closeForgotPasswordModal() {
  forgotPasswordModal.style.display = "none";
  forgotPasswordModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "auto";
  forgotEmail.value = "";
  forgotEmail.classList.remove("error", "success");
  hideResetLoadingState();
  clearModalErrors();
}
window.closeForgotPasswordModal = closeForgotPasswordModal;

document.addEventListener("click", (e) => {
  if (e.target === forgotPasswordModal) {
    closeForgotPasswordModal();
  }
});

function clearModalErrors() {
  modalError.style.display = "none";
  modalSuccess.style.display = "none";
}

async function sendResetLink() {
  const email = forgotEmail.value.trim();
  clearModalErrors();

  if (!email) {
    showModalError("📧 Please enter your email address.");
    forgotEmail.focus();
    return;
  }

  if (!validateEmail(email)) {
    showModalError(
      "📧 Use your college email (example@paterostechnologicalcollege.edu.ph)"
    );
    forgotEmail.classList.add("error");
    return;
  }

  showResetLoadingState();
  try {
    await sendPasswordResetEmail(auth, email);
    hideResetLoadingState();
    showModalSuccess();
    forgotEmail.classList.add("success");

    setTimeout(() => {
      closeForgotPasswordModal();
    }, 2000);
  } catch (err) {
    hideResetLoadingState();
    const msg = parseForgotPasswordError(err);
    showModalError(msg);
    forgotEmail.classList.add("error");
  }
}
window.sendResetLink = sendResetLink;

// ===== PARSE FORGOT PASSWORD ERRORS =====
function parseForgotPasswordError(err) {
  if (!err || !err.code) {
    return "❌ Error sending reset email. Please try again.";
  }

  const errorCode = err.code || "";

  switch (errorCode) {
    case "auth/invalid-email":
      return "📧 Invalid email address. Please check and try again.";

    case "auth/user-not-found":
      return "🔍 No account found with this email. Please check if it's correct.";

    case "auth/too-many-requests":
      return "⏱️ Too many requests. Please wait a few minutes before trying again.";

    case "auth/network-request-failed":
      return "🌐 Network error. Check your connection and try again.";

    default:
      return `❌ Could not send reset email. Please try again later.`;
  }
}

function showModalError(msg) {
  modalErrorMessage.innerHTML = msg;
  modalError.style.display = "flex";
}

function showModalSuccess() {
  modalSuccess.style.display = "flex";
}

function showResetLoadingState() {
  sendResetBtn.disabled = true;
  document.querySelector("#sendResetBtn .btn-content").style.display = "none";
  resetSpinner.style.display = "flex";
}

function hideResetLoadingState() {
  sendResetBtn.disabled = false;
  document.querySelector("#sendResetBtn .btn-content").style.display = "flex";
  resetSpinner.style.display = "none";
}

// ===== Keyboard Shortcuts =====
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeForgotPasswordModal();
  }
});

forgotEmail.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendResetLink();
  }
});

// ===== Auth State Listener =====
onAuthStateChanged(async (user) => {
  if (user) {
    try {
      const token = await getIdToken(false);
      if (token) sessionStorage.setItem("idToken", token);
    } catch (e) {
      console.warn("Error refreshing idToken:", e && e.message ? e.message : e);
    }
  } else {
    sessionStorage.removeItem("idToken");
    sessionStorage.removeItem("uid");
  }
});

// ===== Signup Redirect =====
function goToSignup() {
  window.location.href = "../pages/sign-up.html";
}
window.goToSignup = goToSignup;
