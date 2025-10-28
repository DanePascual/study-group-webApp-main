import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";
import {
  getAuth,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-auth.js";

// ===== SECURITY: Firebase config (from environment) =====
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

// ===== SECURITY: Password requirements constants =====
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
  specialChars: "!@#$%^&*()", // ← STANDARDIZED with backend
};

// ===== SECURITY: Logging helper =====
function logSecurityEvent(eventType, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY] ${timestamp} | Event: ${eventType} | Details:`,
    details
  );
}

// ===== DOM Elements =====
const urlParams = new URLSearchParams(window.location.search);
const oobCode = urlParams.get("oobCode");
const resetForm = document.getElementById("resetForm");
const errorState = document.getElementById("errorState");
const successState = document.getElementById("successState");
const emailDisplay = document.getElementById("resetEmail");

// ===== Handle Reset Link Validation =====
if (!oobCode) {
  showErrorState("Missing or invalid password reset link.");
  logSecurityEvent("RESET_PASSWORD_MISSING_CODE", {});
} else {
  verifyPasswordResetCode(auth, oobCode)
    .then((email) => {
      emailDisplay.textContent = email;
      resetForm.style.display = "flex";
    })
    .catch((err) => {
      logSecurityEvent("RESET_PASSWORD_INVALID_CODE", { error: err.code });
      showErrorState(
        err.code === "auth/expired-action-code"
          ? "This password reset link has expired. Please request a new one."
          : "This password reset link is invalid or has already been used. Please request a new one."
      );
    });
}

// ===== Password Visibility Toggle =====
window.togglePassword = function (inputId, iconId) {
  const passwordInput = document.getElementById(inputId);
  const toggleIcon = document.getElementById(iconId);

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    toggleIcon.classList.remove("bi-eye");
    toggleIcon.classList.add("bi-eye-slash");
  } else {
    passwordInput.type = "password";
    toggleIcon.classList.remove("bi-eye-slash");
    toggleIcon.classList.add("bi-eye");
  }
};

// ===== Password Strength Checker =====
const newPassword = document.getElementById("newPassword");
const passwordStrengthBar = document.getElementById("passwordStrengthBar");
const reqLength = document.getElementById("req-length");
const reqUppercase = document.getElementById("req-uppercase");
const reqLowercase = document.getElementById("req-lowercase");
const reqNumber = document.getElementById("req-number");
const reqSpecial = document.getElementById("req-special");

newPassword.addEventListener("input", function () {
  const password = this.value;

  // ===== SECURITY: Validate each requirement =====
  const hasLength = password.length >= PASSWORD_REQUIREMENTS.minLength;
  const hasUppercase = PASSWORD_REQUIREMENTS.requireUppercase
    ? /[A-Z]/.test(password)
    : true;
  const hasLowercase = PASSWORD_REQUIREMENTS.requireLowercase
    ? /[a-z]/.test(password)
    : true;
  const hasNumber = PASSWORD_REQUIREMENTS.requireNumber
    ? /[0-9]/.test(password)
    : true;
  const hasSpecial = PASSWORD_REQUIREMENTS.requireSpecial
    ? new RegExp(`[${PASSWORD_REQUIREMENTS.specialChars}]`).test(password)
    : true;

  updateRequirement(reqLength, hasLength);
  updateRequirement(reqUppercase, hasUppercase);
  updateRequirement(reqLowercase, hasLowercase);
  updateRequirement(reqNumber, hasNumber);
  updateRequirement(reqSpecial, hasSpecial);

  const strengthScore = [
    hasLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
  ].filter(Boolean).length;

  passwordStrengthBar.className = "password-strength-bar";
  if (password.length === 0) {
    passwordStrengthBar.style.width = "0";
  } else if (strengthScore <= 2) {
    passwordStrengthBar.classList.add("strength-weak");
  } else if (strengthScore <= 4) {
    passwordStrengthBar.classList.add("strength-medium");
  } else {
    passwordStrengthBar.classList.add("strength-strong");
  }
});

function updateRequirement(element, isValid) {
  const icon = element.querySelector("i");

  if (isValid) {
    element.classList.add("met");
    icon.classList.remove("bi-circle");
    icon.classList.add("bi-check-circle-fill");
  } else {
    element.classList.remove("met");
    icon.classList.remove("bi-check-circle-fill");
    icon.classList.add("bi-circle");
  }
}

// ===== Password Confirmation Validation =====
document
  .getElementById("confirmPassword")
  .addEventListener("input", function () {
    const password = document.getElementById("newPassword").value;
    if (this.value !== password) {
      this.classList.add("error");
    } else {
      this.classList.remove("error");
      this.classList.add("success");
    }
  });

// ===== Form Submission & Password Reset =====
document
  .getElementById("resetPasswordForm")
  .addEventListener("submit", function (e) {
    e.preventDefault();

    const password = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const resetBtn = document.getElementById("resetBtn");

    // ===== SECURITY: Validate password meets all requirements =====
    const hasLength = password.length >= PASSWORD_REQUIREMENTS.minLength;
    const hasUppercase = PASSWORD_REQUIREMENTS.requireUppercase
      ? /[A-Z]/.test(password)
      : true;
    const hasLowercase = PASSWORD_REQUIREMENTS.requireLowercase
      ? /[a-z]/.test(password)
      : true;
    const hasNumber = PASSWORD_REQUIREMENTS.requireNumber
      ? /[0-9]/.test(password)
      : true;
    const hasSpecial = PASSWORD_REQUIREMENTS.requireSpecial
      ? new RegExp(`[${PASSWORD_REQUIREMENTS.specialChars}]`).test(password)
      : true;

    if (
      !hasLength ||
      !hasUppercase ||
      !hasLowercase ||
      !hasNumber ||
      !hasSpecial
    ) {
      logSecurityEvent("RESET_PASSWORD_WEAK", {});
      showToast("Password does not meet all requirements", "error");
      return;
    }

    if (password !== confirmPassword) {
      logSecurityEvent("RESET_PASSWORD_MISMATCH", {});
      showToast("Passwords do not match", "error");
      document.getElementById("confirmPassword").classList.add("error");
      return;
    }

    // ===== SECURITY: Show confirmation dialog =====
    if (
      !confirm(
        "Are you sure you want to reset your password? You will need to sign in again with your new password."
      )
    ) {
      logSecurityEvent("RESET_PASSWORD_CANCELLED", {});
      return;
    }

    // Show loading state
    resetBtn.disabled = true;
    document.getElementById("loadingSpinner").style.display = "inline-block";
    document.getElementById("btnText").textContent = "Resetting...";

    // ===== Firebase Password Reset =====
    confirmPasswordReset(auth, oobCode, password)
      .then(() => {
        logSecurityEvent("RESET_PASSWORD_SUCCESS", {});
        showSuccessState();
      })
      .catch((err) => {
        console.error("Password reset error:", err);
        logSecurityEvent("RESET_PASSWORD_FAILED", { error: err.code });
        showErrorState(
          err.code === "auth/expired-action-code"
            ? "This password reset link has expired. Please request a new one."
            : "Error resetting password: " + (err.message || "Unknown error")
        );
      })
      .finally(() => {
        resetBtn.disabled = false;
        document.getElementById("loadingSpinner").style.display = "none";
        document.getElementById("btnText").textContent = "Reset Password";
      });
  });

// ===== Toast Notification (IMPROVED: 8 second duration) =====
function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let iconClass = "bi-info-circle";
  let title = "Information";

  if (type === "success") {
    iconClass = "bi-check-circle";
    title = "Success";
  } else if (type === "error") {
    iconClass = "bi-exclamation-circle";
    title = "Error";
  }

  toast.innerHTML = `
    <div class="toast-icon ${type}">
      <i class="bi ${iconClass}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;

  toastContainer.appendChild(toast);

  // ===== IMPROVED: 8 second duration instead of 5 =====
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
  }, 8000); // ← Changed from 5000 to 8000
}

// ===== Show error state =====
function showErrorState(message) {
  resetForm.style.display = "none";
  errorState.style.display = "block";
  const statusMessage = document.querySelector(".status-message");
  if (statusMessage) {
    statusMessage.textContent = message;
  }
}

// ===== Show success state =====
function showSuccessState() {
  resetForm.style.display = "none";
  successState.style.display = "block";
}

// ===== Back to login =====
window.goToLogin = function () {
  window.location.href = "login.html";
};
