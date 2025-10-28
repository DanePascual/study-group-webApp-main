// frontend/student/scripts/sign-up.js
// Updated to use centralized apiUrl helper from appConfig.js
// - Removed all hardcoded http://localhost:5000 URLs
// - Now uses dynamic API_BASE from appConfig.js
// - Maintains all existing functionality

import { apiUrl } from "../../config/appConfig.js";

// Wait for the DOM to be fully loaded before attaching event listeners
document.addEventListener("DOMContentLoaded", function () {
  // Password toggle functionality
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

  // =========================
  // OTP Email Verification Logic
  // =========================

  let otpVerified = false;
  let otpEmail = "";

  // Elements for OTP
  const emailInput = document.getElementById("email");
  const requestOtpBtn = document.getElementById("requestOtpBtn");
  const otpModal = document.getElementById("otpModal");
  const verifyOtpBtn = document.getElementById("verifyOtpBtn");
  const otpInput = document.getElementById("otp");
  const otpHint = document.getElementById("otpHint");
  const signupBtn = document.getElementById("signupBtn");
  const closeBtn = document.querySelector(".close-btn");

  // Modal control
  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      otpModal.style.display = "none";
    });
  }

  // Close modal if clicked outside
  window.addEventListener("click", function (event) {
    if (event.target === otpModal) {
      otpModal.style.display = "none";
    }
  });

  // Step 1: Request OTP
  if (requestOtpBtn) {
    requestOtpBtn.addEventListener("click", function () {
      const email = emailInput.value.trim();
      if (!validateEmail(email)) {
        showAlert("Please enter a valid college email.", "error");
        return;
      }

      requestOtpBtn.disabled = true;
      requestOtpBtn.textContent = "Sending...";

      // Use apiUrl() helper instead of hardcoded URL
      fetch(apiUrl("/api/auth/request-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok) {
            otpModal.style.display = "block";
            otpHint.textContent =
              "We've sent a 6-digit code to your email. Check your inbox (and spam).";
            otpEmail = email;
            showAlert("OTP sent to your email.", "success");
          } else {
            showAlert(data.error || "Failed to send OTP.", "error");
          }
        })
        .catch(() => {
          showAlert("Network error. Try again later.", "error");
        })
        .finally(() => {
          requestOtpBtn.disabled = false;
          requestOtpBtn.textContent = "Request OTP";
        });
    });
  }

  // Step 2: Verify OTP
  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener("click", function () {
      const otp = otpInput.value.trim();
      if (!otp || otp.length !== 6) {
        showAlert("Enter the 6-digit code sent to your email.", "error");
        return;
      }
      verifyOtpBtn.disabled = true;
      verifyOtpBtn.textContent = "Verifying...";

      // Use apiUrl() helper instead of hardcoded URL
      fetch(apiUrl("/api/auth/verify-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: otpEmail || emailInput.value.trim(),
          otp,
        }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok) {
            otpVerified = true;
            emailInput.readOnly = true;
            requestOtpBtn.disabled = true;
            showAlert("Email verified. You may now sign up.", "success");
            signupBtn.disabled = false;
            otpModal.style.display = "none";
            requestOtpBtn.textContent = "Email Verified";
            requestOtpBtn.style.backgroundColor = "#3d9940";
          } else {
            showAlert(data.error || "OTP verification failed.", "error");
            otpHint.textContent = "Check your code and try again.";
          }
        })
        .catch(() => {
          showAlert("Network error. Try again.", "error");
        })
        .finally(() => {
          verifyOtpBtn.disabled = false;
          verifyOtpBtn.textContent = "Verify OTP";
        });
    });
  }

  // Step 3: Disable signup until OTP is verified
  if (signupBtn) {
    signupBtn.disabled = true; // Prevent signup until email is verified
  }

  // =========================
  // Form Validation & Submission
  // =========================

  // Email validation - ONLY ALLOW COLLEGE EMAIL
  function validateEmail(email) {
    const emailRegex = /^[^\s@]+@paterostechnologicalcollege\.edu\.ph$/;
    return emailRegex.test(email);
  }

  // Student ID validation
  function validateStudentId(studentId) {
    const pattern = /^\d{4}-\d{4}$/;
    return pattern.test(studentId);
  }

  // Password strength checker
  function checkPasswordStrength(password) {
    let strength = 0;
    const requirements = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };

    Object.values(requirements).forEach((met) => {
      if (met) strength++;
    });

    const strengthBar = document.getElementById("passwordStrengthBar");
    if (strengthBar) {
      if (strength < 3) {
        strengthBar.className = "password-strength-bar strength-weak";
      } else if (strength < 5) {
        strengthBar.className = "password-strength-bar strength-medium";
      } else {
        strengthBar.className = "password-strength-bar strength-strong";
      }
    }

    return strength >= 3;
  }

  // Helper functions for field validation
  function showFieldError(input, message) {
    input.classList.remove("success");
    input.classList.add("error");

    const existingMsg = input.parentNode.querySelector(
      ".error-message, .success-message"
    );
    if (existingMsg) existingMsg.remove();

    const errorMsg = document.createElement("div");
    errorMsg.className = "error-message";
    errorMsg.textContent = message;
    input.parentNode.appendChild(errorMsg);
  }

  function showFieldSuccess(input) {
    input.classList.remove("error");
    input.classList.add("success");

    const existingMsg = input.parentNode.querySelector(
      ".error-message, .success-message"
    );
    if (existingMsg) existingMsg.remove();
  }

  function clearFieldState(input) {
    input.classList.remove("error", "success");

    const existingMsg = input.parentNode.querySelector(
      ".error-message, .success-message"
    );
    if (existingMsg) existingMsg.remove();
  }

  // Real-time validation - MODIFIED ERROR MESSAGE
  if (emailInput) {
    emailInput.addEventListener("input", function (e) {
      const email = e.target.value;
      const emailInput = e.target;

      if (email && !validateEmail(email)) {
        showFieldError(
          emailInput,
          "Please use your college email (@paterostechnologicalcollege.edu.ph)"
        );
      } else if (email) {
        showFieldSuccess(emailInput);
      } else {
        clearFieldState(emailInput);
      }
    });
  }

  const studentIdInput = document.getElementById("studentId");
  if (studentIdInput) {
    studentIdInput.addEventListener("input", function (e) {
      const studentId = e.target.value;
      const studentIdInput = e.target;

      if (studentId && !validateStudentId(studentId)) {
        showFieldError(studentIdInput, "Format: YYYY-NNNN (e.g., 2024-1234)");
      } else if (studentId) {
        showFieldSuccess(studentIdInput);
      } else {
        clearFieldState(studentIdInput);
      }
    });
  }

  const passwordInput = document.getElementById("password");
  if (passwordInput) {
    passwordInput.addEventListener("input", function (e) {
      const password = e.target.value;
      const passwordInput = e.target;

      if (password) {
        const isStrong = checkPasswordStrength(password);
        if (isStrong) {
          showFieldSuccess(passwordInput);
        } else {
          clearFieldState(passwordInput);
        }
      } else {
        clearFieldState(passwordInput);
      }

      const confirmPassword = document.getElementById("confirmPassword").value;
      if (confirmPassword) {
        checkPasswordMatch();
      }
    });
  }

  const confirmPasswordInput = document.getElementById("confirmPassword");
  if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener("input", checkPasswordMatch);
  }

  function checkPasswordMatch() {
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const confirmPasswordInput = document.getElementById("confirmPassword");

    if (confirmPassword) {
      if (password === confirmPassword) {
        showFieldSuccess(confirmPasswordInput);
      } else {
        showFieldError(confirmPasswordInput, "Passwords do not match");
      }
    } else {
      clearFieldState(confirmPasswordInput);
    }
  }

  // Form submission (calls backend API)
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", function (e) {
      e.preventDefault();

      const formData = {
        firstName: document.getElementById("firstName").value.trim(),
        lastName: document.getElementById("lastName").value.trim(),
        email: document.getElementById("email").value.trim(),
        studentId: document.getElementById("studentId").value.trim(),
        course: document.getElementById("course").value,
        yearLevel: document.getElementById("yearLevel").value,
        password: document.getElementById("password").value,
        confirmPassword: document.getElementById("confirmPassword").value,
      };

      if (!validateForm(formData)) {
        return;
      }

      // Only allow submission if OTP is verified
      if (!otpVerified) {
        showAlert("Please verify your email first.", "error");
        return;
      }

      showLoadingState();

      // Use apiUrl() helper instead of hardcoded URL
      fetch(apiUrl("/api/auth/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok) {
            hideLoadingState();
            showAlert(
              "Account created successfully! Welcome to Study Group!",
              "success"
            );
            setTimeout(() => {
              goToLogin();
            }, 2000);
          } else {
            hideLoadingState();
            showAlert(data.error, "error");
          }
        })
        .catch((error) => {
          hideLoadingState();
          showAlert("Network error. Please try again.", "error");
        });
    });
  }

  function validateForm(data) {
    let isValid = true;
    const errors = [];

    if (!data.firstName) errors.push("First name is required");
    if (!data.lastName) errors.push("Last name is required");
    if (!data.email) errors.push("Email is required");
    if (!data.studentId) errors.push("Student ID is required");
    if (!data.course) errors.push("Course is required");
    if (!data.yearLevel) errors.push("Year level is required");
    if (!data.password) errors.push("Password is required");
    if (!data.confirmPassword) errors.push("Password confirmation is required");

    if (data.email && !validateEmail(data.email)) {
      errors.push(
        "Please use your institutional email (@paterostechnologicalcollege.edu.ph)"
      );
    }

    if (data.studentId && !validateStudentId(data.studentId)) {
      errors.push("Student ID must be in format YYYY-NNNN");
    }

    if (data.password && !checkPasswordStrength(data.password)) {
      errors.push("Password does not meet security requirements");
    }

    if (
      data.password &&
      data.confirmPassword &&
      data.password !== data.confirmPassword
    ) {
      errors.push("Passwords do not match");
    }

    if (errors.length > 0) {
      showAlert(errors.join("\n"), "error");
      isValid = false;
    }

    return isValid;
  }

  function showLoadingState() {
    const btn = document.getElementById("signupBtn");
    const spinner = document.getElementById("loadingSpinner");
    const btnText = document.getElementById("btnText");

    btn.disabled = true;
    spinner.style.display = "inline-block";
    btnText.textContent = "Creating Account...";
  }

  function hideLoadingState() {
    const btn = document.getElementById("signupBtn");
    const spinner = document.getElementById("loadingSpinner");
    const btnText = document.getElementById("btnText");

    btn.disabled = false;
    spinner.style.display = "none";
    btnText.textContent = "Sign up";
  }

  // Make goToLogin function globally accessible
  window.goToLogin = function () {
    showAlert("Redirecting to login page...", "success");
    window.location.href = "login.html";
  };

  function showAlert(message, type) {
    const existingAlert = document.querySelector(".alert");
    if (existingAlert) {
      existingAlert.remove();
    }

    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                min-width: 350px;
                max-width: 500px;
                padding: 16px 20px;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                background: ${type === "error" ? "#ff4444" : "#4caf50"};
                color: white;
                font-size: 14px;
                line-height: 1.4;
                animation: slideInRight 0.3s ease-out;
            `;

    alertDiv.innerHTML = `
                <div style="white-space: pre-line;">${message}</div>
                <button onclick="this.parentElement.remove()" style="
                    position: absolute;
                    top: 8px;
                    right: 12px;
                    background: none;
                    border: none;
                    color: white;
                    font-size: 18px;
                    cursor: pointer;
                    opacity: 0.8;
                ">&times;</button>
            `;

    document.body.appendChild(alertDiv);

    if (type === "success") {
      setTimeout(() => {
        if (alertDiv.parentNode) {
          alertDiv.remove();
        }
      }, 5000);
    }
  }

  // Add CSS animations
  const style = document.createElement("style");
  style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
  document.head.appendChild(style);

  // Reset OTP verification if email changes
  if (emailInput) {
    emailInput.addEventListener("input", function () {
      if (otpVerified) {
        otpVerified = false;
        emailInput.readOnly = false;
        requestOtpBtn.disabled = false;
        requestOtpBtn.textContent = "Request OTP";
        requestOtpBtn.style.backgroundColor = "";
        signupBtn.disabled = true;
      }
    });
  }
});
