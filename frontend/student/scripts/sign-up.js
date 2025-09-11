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

  // Email validation - MODIFIED TO ONLY ALLOW COLLEGE EMAIL
  function validateEmail(email) {
    // Fix the regex pattern by ensuring it's correctly formed
    // The $ was inside the capture group which might cause issues
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
  const emailInput = document.getElementById("email");
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

  // Form submission
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

      showLoadingState();

      setTimeout(() => {
        showAlert(
          "Account created successfully! Welcome to Study Group!",
          "success"
        );

        setTimeout(() => {
          goToLogin();
        }, 2000);
      }, 2000);
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
});
