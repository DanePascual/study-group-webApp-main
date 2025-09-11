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

    // Show error message if not already shown
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

    // Remove error message if exists
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

// Login form submission
document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  // Validate email domain
  if (!validateEmail(email)) {
    alert(
      "Please use your Pateros Technological College email address\n(example@paterostechnologicalcollege.edu.ph)"
    );
    return;
  }

  // Check if both fields are filled
  if (email && password) {
    alert(
      "Login successful! Welcome to Study Group!\n(This will redirect to dashboard later)"
    );
    // TODO: Add actual login logic and redirect to dashboard
    // window.location.href = 'dashboard.html';
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

function closeForgotPasswordModal() {
  document.getElementById("forgotPasswordModal").style.display = "none";
  document.body.style.overflow = "auto";

  // Reset form
  document.getElementById("forgotEmail").value = "";
  document.getElementById("forgotEmail").classList.remove("error", "success");
  hideResetLoadingState();
}

// Close modal when clicking outside
document
  .getElementById("forgotPasswordModal")
  .addEventListener("click", function (e) {
    if (e.target === this) {
      closeForgotPasswordModal();
    }
  });

// Send reset link functionality
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

  // Simulate sending reset email
  setTimeout(() => {
    hideResetLoadingState();
    closeForgotPasswordModal();

    alert(
      `Password reset link sent to ${email}!\n\nCheck your email and follow the instructions to reset your password.`
    );

    // Store reset request for demo purposes
    localStorage.setItem(
      "passwordResetRequest",
      JSON.stringify({
        email: email,
        timestamp: new Date().toISOString(),
        token: generateResetToken(),
      })
    );
  }, 2500);
}

function generateResetToken() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

// Reset loading state management
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
