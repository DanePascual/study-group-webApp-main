import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";
import {
  getAuth,
  verifyPasswordResetCode,
  confirmPasswordReset,
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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- Handle Reset Link Validation ---
const urlParams = new URLSearchParams(window.location.search);
const oobCode = urlParams.get("oobCode");
const resetForm = document.getElementById("resetForm");
const errorState = document.getElementById("errorState");
const successState = document.getElementById("successState");
const emailDisplay = document.getElementById("resetEmail");

if (!oobCode) {
  showErrorState("Missing or invalid password reset link.");
} else {
  verifyPasswordResetCode(auth, oobCode)
    .then((email) => {
      emailDisplay.textContent = email;
      resetForm.style.display = "flex";
    })
    .catch((err) => {
      showErrorState(
        err.code === "auth/expired-action-code"
          ? "This password reset link has expired. Please request a new one."
          : "This password reset link is invalid or has already been used. Please request a new one."
      );
    });
}

// --- Password Visibility Toggle ---
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

// --- Password Strength Checker ---
const newPassword = document.getElementById("newPassword");
const passwordStrengthBar = document.getElementById("passwordStrengthBar");
const reqLength = document.getElementById("req-length");
const reqUppercase = document.getElementById("req-uppercase");
const reqLowercase = document.getElementById("req-lowercase");
const reqNumber = document.getElementById("req-number");
const reqSpecial = document.getElementById("req-special");

newPassword.addEventListener("input", function () {
  const password = this.value;
  const hasLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*]/.test(password);

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

// --- Handle Password Confirmation ---
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

// --- Form Submission & Password Reset ---
document
  .getElementById("resetPasswordForm")
  .addEventListener("submit", function (e) {
    e.preventDefault();

    const password = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const resetBtn = document.getElementById("resetBtn");

    // Validate password requirements
    const hasLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*]/.test(password);

    if (
      !hasLength ||
      !hasUppercase ||
      !hasLowercase ||
      !hasNumber ||
      !hasSpecial
    ) {
      showToast("Password does not meet all requirements", "error");
      return;
    }

    if (password !== confirmPassword) {
      showToast("Passwords do not match", "error");
      document.getElementById("confirmPassword").classList.add("error");
      return;
    }

    // Show loading state
    resetBtn.disabled = true;
    document.getElementById("loadingSpinner").style.display = "inline-block";
    document.getElementById("btnText").textContent = "Resetting...";

    // --- Real Firebase Password Reset ---
    confirmPasswordReset(auth, oobCode, password)
      .then(() => {
        showSuccessState();
      })
      .catch((err) => {
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

// --- Toast Notification ---
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

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
  }, 5000);
}

// --- Show error/success state ---
function showErrorState(message) {
  resetForm.style.display = "none";
  errorState.style.display = "block";
  document.querySelector(".status-message").textContent = message;
}

function showSuccessState() {
  resetForm.style.display = "none";
  successState.style.display = "block";
}

// --- Back to login ---
window.goToLogin = function () {
  window.location.href = "login.html";
};
