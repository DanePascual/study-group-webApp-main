import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";
import {
  getAuth,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-auth.js";

// Firebase config
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

// Password requirements
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
  specialChars: "!@#$%^&*()",
};

// ===== UI Elements =====
const urlParams = new URLSearchParams(window.location.search);
const oobCode = urlParams.get("oobCode");
const resetForm = document.getElementById("resetForm");
const errorState = document.getElementById("errorState");
const successState = document.getElementById("successState");
const emailDisplay = document.getElementById("emailDisplay");
const resetEmail = document.getElementById("resetEmail");
const newPassword = document.getElementById("newPassword");
const confirmPassword = document.getElementById("confirmPassword");
const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetBtn = document.getElementById("resetBtn");
const formError = document.getElementById("formError");
const formErrorMessage = document.getElementById("formErrorMessage");

// Progress elements
const progressStep1 = document.getElementById("progressStep1");
const progressStep2 = document.getElementById("progressStep2");
const progressStep3 = document.getElementById("progressStep3");

// ===== Logging =====
function logSecurityEvent(eventType, details) {
  const timestamp = new Date().toISOString();
  console.warn(`[SECURITY] ${timestamp} | Event: ${eventType}`, details);
}

// ===== Show Toast =====
function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let iconClass =
    type === "success" ? "check-circle-fill" : "exclamation-circle-fill";
  let title = type === "success" ? "Success" : "Error";

  toast.innerHTML = `
    <div class="toast-icon">
      <i class="bi bi-${iconClass}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <i class="bi bi-x"></i>
    </button>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(400px)";
    setTimeout(() => toast.remove(), 300);
  }, 8000);
}

// ===== Show Error States =====
function showError(msg) {
  formErrorMessage.textContent = msg;
  formError.style.display = "flex";
  formError.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearError() {
  formError.style.display = "none";
}

// ===== Update Progress =====
function updateProgress(step) {
  progressStep1.classList.remove("active", "completed");
  progressStep2.classList.remove("active", "completed");
  progressStep3.classList.remove("active", "completed");

  if (step >= 1) progressStep1.classList.add("completed");
  if (step >= 2)
    progressStep2.classList.add(step === 2 ? "active" : "completed");
  if (step >= 3) progressStep3.classList.add("active");

  if (step === 2) progressStep2.classList.add("active");
}

// ===== Verify Reset Code =====
if (!oobCode) {
  showErrorState("Missing password reset link. Please request a new one.");
  logSecurityEvent("RESET_INVALID_CODE", { reason: "NO_CODE" });
} else {
  verifyPasswordResetCode(auth, oobCode)
    .then((email) => {
      resetEmail.textContent = email;
      emailDisplay.style.display = "flex";
      resetForm.style.display = "flex";
      updateProgress(2);
    })
    .catch((err) => {
      logSecurityEvent("RESET_CODE_VERIFICATION_FAILED", { error: err.code });
      const msg =
        err.code === "auth/expired-action-code"
          ? "This password reset link has expired. Please request a new one."
          : "This password reset link is invalid. Please request a new one.";
      showErrorState(msg);
    });
}

// ===== Password Strength Checker =====
newPassword.addEventListener("input", function () {
  const password = this.value;
  clearError();

  const hasLength = password.length >= PASSWORD_REQUIREMENTS.minLength;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = new RegExp(`[${PASSWORD_REQUIREMENTS.specialChars}]`).test(
    password
  );

  updateRequirement("req-length", hasLength);
  updateRequirement("req-uppercase", hasUppercase);
  updateRequirement("req-lowercase", hasLowercase);
  updateRequirement("req-number", hasNumber);
  updateRequirement("req-special", hasSpecial);

  const strength = [
    hasLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
  ].filter(Boolean).length;
  const strengthBar = document.getElementById("passwordStrengthBar");
  const strengthValue = document.getElementById("strengthValue");

  strengthBar.className = "strength-bar";
  if (password.length === 0) {
    strengthValue.textContent = "-";
    strengthValue.className = "strength-value";
  } else if (strength < 3) {
    strengthBar.classList.add("weak");
    strengthValue.textContent = "Weak";
    strengthValue.className = "strength-value weak";
  } else if (strength < 5) {
    strengthBar.classList.add("medium");
    strengthValue.textContent = "Medium";
    strengthValue.className = "strength-value medium";
  } else {
    strengthBar.classList.add("strong");
    strengthValue.textContent = "Strong";
    strengthValue.className = "strength-value strong";
  }

  // Update match feedback
  checkPasswordMatch();
});

function updateRequirement(id, isValid) {
  const el = document.getElementById(id);
  if (!el) return;

  if (isValid) {
    el.classList.add("met");
    el.querySelector("i").className = "bi bi-check-circle-fill";
  } else {
    el.classList.remove("met");
    el.querySelector("i").className = "bi bi-circle";
  }
}

// ===== Password Match Checker =====
function checkPasswordMatch() {
  const feedback = document.getElementById("matchFeedback");
  if (!feedback || !confirmPassword.value) {
    feedback.classList.remove("show");
    return;
  }

  if (newPassword.value === confirmPassword.value) {
    feedback.classList.add("show", "success");
    feedback.classList.remove("error");
    feedback.textContent = "✓ Passwords match";
    confirmPassword.classList.add("success");
    confirmPassword.classList.remove("error");
  } else {
    feedback.classList.add("show", "error");
    feedback.classList.remove("success");
    feedback.textContent = "✗ Passwords do not match";
    confirmPassword.classList.add("error");
    confirmPassword.classList.remove("success");
  }
}

confirmPassword.addEventListener("input", checkPasswordMatch);

// ===== Password Toggle =====
document.getElementById("toggleNewPassword").addEventListener("click", (e) => {
  e.preventDefault();
  const icon = e.currentTarget.querySelector("i");
  if (newPassword.type === "password") {
    newPassword.type = "text";
    icon.classList.remove("bi-eye");
    icon.classList.add("bi-eye-slash");
  } else {
    newPassword.type = "password";
    icon.classList.remove("bi-eye-slash");
    icon.classList.add("bi-eye");
  }
});

document
  .getElementById("toggleConfirmPassword")
  .addEventListener("click", (e) => {
    e.preventDefault();
    const icon = e.currentTarget.querySelector("i");
    if (confirmPassword.type === "password") {
      confirmPassword.type = "text";
      icon.classList.remove("bi-eye");
      icon.classList.add("bi-eye-slash");
    } else {
      confirmPassword.type = "password";
      icon.classList.remove("bi-eye-slash");
      icon.classList.add("bi-eye");
    }
  });

// ===== CONFIRMATION DIALOG FUNCTIONS =====
function showConfirmationDialog(onConfirm) {
  const dialog = document.getElementById("confirmationDialog");
  const cancelBtn = document.getElementById("confirmCancel");
  const confirmBtn = document.getElementById("confirmYes");
  const overlay = document.querySelector(".confirmation-overlay");

  dialog.style.display = "flex";

  cancelBtn.onclick = () => {
    dialog.style.display = "none";
    logSecurityEvent("RESET_PASSWORD_CANCELLED", {});
  };

  confirmBtn.onclick = () => {
    dialog.style.display = "none";
    onConfirm();
  };

  overlay.onclick = () => {
    dialog.style.display = "none";
    logSecurityEvent("RESET_PASSWORD_CANCELLED", {});
  };

  // Close on Escape key
  const escapeHandler = (e) => {
    if (e.key === "Escape" && dialog.style.display === "flex") {
      dialog.style.display = "none";
      document.removeEventListener("keydown", escapeHandler);
      logSecurityEvent("RESET_PASSWORD_CANCELLED", {});
    }
  };
  document.addEventListener("keydown", escapeHandler);
}

async function performPasswordReset(password) {
  resetBtn.disabled = true;
  document.querySelector("#resetBtn .btn-content").style.display = "none";
  document.querySelector("#resetBtn .btn-loader").style.display = "flex";

  try {
    await confirmPasswordReset(auth, oobCode, password);
    logSecurityEvent("RESET_PASSWORD_SUCCESS", {});
    showSuccessState();
    updateProgress(3);
  } catch (err) {
    resetBtn.disabled = false;
    document.querySelector("#resetBtn .btn-content").style.display = "flex";
    document.querySelector("#resetBtn .btn-loader").style.display = "none";

    logSecurityEvent("RESET_PASSWORD_FAILED", { error: err.code });

    const msg =
      err.code === "auth/expired-action-code"
        ? "Reset link expired. Please request a new one."
        : "Error resetting password. Please try again.";
    showError(msg);
  }
}

// ===== Form Submission =====
resetPasswordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const pwd = newPassword.value;
  const confirmPwd = confirmPassword.value;

  // Validation
  if (!pwd || !confirmPwd) {
    showError("📝 Please fill in all password fields.");
    return;
  }

  const hasLength = pwd.length >= PASSWORD_REQUIREMENTS.minLength;
  const hasUppercase = /[A-Z]/.test(pwd);
  const hasLowercase = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecial = new RegExp(`[${PASSWORD_REQUIREMENTS.specialChars}]`).test(
    pwd
  );

  if (
    !hasLength ||
    !hasUppercase ||
    !hasLowercase ||
    !hasNumber ||
    !hasSpecial
  ) {
    showError(
      "🔐 Password does not meet all requirements. Check the checklist above."
    );
    logSecurityEvent("RESET_PASSWORD_WEAK", {});
    return;
  }

  if (pwd !== confirmPwd) {
    showError("❌ Passwords do not match. Please try again.");
    confirmPassword.classList.add("error");
    return;
  }

  // Show styled confirmation dialog
  showConfirmationDialog(() => {
    performPasswordReset(pwd);
  });
});

// ===== Show Error State =====
function showErrorState(message) {
  resetForm.style.display = "none";
  errorState.style.display = "block";
  const errorMsg = document.getElementById("errorMessage");
  if (errorMsg) errorMsg.textContent = message;
  updateProgress(1);
}

// ===== Show Success State =====
function showSuccessState() {
  resetForm.style.display = "none";
  successState.style.display = "block";
}

// ===== Navigate =====
window.goToLogin = function () {
  window.location.href = "login.html";
};

// Initialize
window.addEventListener("DOMContentLoaded", () => {
  updateProgress(1);
});
