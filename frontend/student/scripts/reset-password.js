const allowedEmailDomain = "@paterostechnologicalcollege.edu.ph";
let resetData = null;

// Initialize page
document.addEventListener("DOMContentLoaded", function () {
  validateResetToken();
});

// Validate reset token from URL or localStorage
function validateResetToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");
  const email = urlParams.get("email");

  // Check localStorage for demo purposes
  const storedReset = localStorage.getItem("passwordResetRequest");

  if (storedReset) {
    try {
      resetData = JSON.parse(storedReset);

      // Check if token is valid (for demo, we'll accept any recent request)
      const resetTime = new Date(resetData.timestamp);
      const now = new Date();
      const timeDiff = (now - resetTime) / (1000 * 60); // minutes

      if (timeDiff > 30) {
        // 30 minutes expiry
        showErrorState("Reset link has expired. Please request a new one.");
        return;
      }

      // Valid token - show form
      document.getElementById("resetEmail").textContent = resetData.email;
      document.getElementById("resetForm").style.display = "flex";
    } catch (e) {
      showErrorState("Invalid reset link format.");
    }
  } else if (token && email) {
    // In a real application, you would verify the token on the server
    // For demo purposes, we'll accept any token and email
    if (email.endsWith(allowedEmailDomain)) {
      resetData = { email: email, token: token };
      document.getElementById("resetEmail").textContent = email;
      document.getElementById("resetForm").style.display = "flex";
    } else {
      showErrorState(
        "Invalid email domain. Must be from Pateros Technological College."
      );
    }
  } else {
    showErrorState(
      "Missing reset parameters. Please request a new password reset link."
    );
  }
}

// Show error state
function showErrorState(message) {
  document.getElementById("resetForm").style.display = "none";
  document.getElementById("errorState").style.display = "block";
  document.querySelector(".status-message").textContent = message;
}

// Show success state
function showSuccessState() {
  document.getElementById("resetForm").style.display = "none";
  document.getElementById("successState").style.display = "block";
}

// Password toggle functionality
function togglePassword(inputId, iconId) {
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
}

// Password strength checker
const newPassword = document.getElementById("newPassword");
const passwordStrengthBar = document.getElementById("passwordStrengthBar");

// Password requirements
const reqLength = document.getElementById("req-length");
const reqUppercase = document.getElementById("req-uppercase");
const reqLowercase = document.getElementById("req-lowercase");
const reqNumber = document.getElementById("req-number");
const reqSpecial = document.getElementById("req-special");

// Check password strength and requirements
newPassword.addEventListener("input", function () {
  const password = this.value;

  // Check individual requirements
  const hasLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*]/.test(password);

  // Update requirement indicators
  updateRequirement(reqLength, hasLength);
  updateRequirement(reqUppercase, hasUppercase);
  updateRequirement(reqLowercase, hasLowercase);
  updateRequirement(reqNumber, hasNumber);
  updateRequirement(reqSpecial, hasSpecial);

  // Calculate strength score (0-5)
  const strengthScore = [
    hasLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
  ].filter(Boolean).length;

  // Update strength bar
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

// Update requirement display
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

// Form submission
document
  .getElementById("resetPasswordForm")
  .addEventListener("submit", function (e) {
    e.preventDefault();

    const password = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    // Validate password strength
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

    // Check passwords match
    if (password !== confirmPassword) {
      showToast("Passwords do not match", "error");
      document.getElementById("confirmPassword").classList.add("error");
      return;
    }

    // Show loading state
    const resetBtn = document.getElementById("resetBtn");
    resetBtn.disabled = true;
    document.getElementById("loadingSpinner").style.display = "inline-block";
    document.getElementById("btnText").textContent = "Resetting...";

    // Simulate API call with delay
    setTimeout(function () {
      // In a real app, you'd make an API request to update the password

      // Remove the reset request from localStorage (for demo)
      localStorage.removeItem("passwordResetRequest");

      // Store new password (for demo only - in real app this would be handled on server)
      const userCredentials = JSON.parse(
        localStorage.getItem("userCredentials") || "{}"
      );
      if (resetData && resetData.email) {
        userCredentials[resetData.email] = {
          password: password, // In real app, this would be hashed
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem(
          "userCredentials",
          JSON.stringify(userCredentials)
        );
      }

      // Show success state
      showSuccessState();
    }, 2000);
  });

// Show toast notification
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

  // Auto remove after 5 seconds
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

// Navigate to login page
function goToLogin() {
  window.location.href = "login.html";
}

// Check for password confirmation match
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
