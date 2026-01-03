// frontend/student/scripts/profile.js
// ENHANCED VERSION: Tab-Based Layout, Profile Completion Tracker (CORRECTED),
// Improved Change Password Modal with Strength Indicator
// UPDATED: Email removed from header, Icon removed, Font weight reduced, Program moved to Academic, Bio removed from header

import { auth } from "../../config/firebase.js";
import { apiUrl } from "../../config/appConfig.js";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

import fetchWithAuth, {
  fetchJsonWithAuth,
  postFormWithAuth,
  putJsonWithAuth,
} from "./apiClient.js";

let CURRENT_SESSION = null;
let currentPhotoURL = null;
let currentPhotoFilename = null;
let isLoading = false;
let currentProfile = null;

// ===== SECURITY: Constants =====
const MAX_NAME_LENGTH = 255;
const MAX_BIO_LENGTH = 2000;
const MAX_STUDENT_NUMBER_LENGTH = 50;
const MAX_PROGRAM_LENGTH = 100;
const MAX_INSTITUTION_LENGTH = 255;
const MAX_YEAR_LEVEL_LENGTH = 50;
const MAX_SPECIALIZATION_LENGTH = 100;
const MAX_GRADUATION_LENGTH = 50;
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/gif"]);

// ===== SECURITY: Sanitization helpers =====
function sanitizeString(str, maxLength = 255) {
  if (typeof str !== "string") return "";
  return str.trim().substring(0, maxLength);
}

function logSecurityEvent(eventType, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[SECURITY] ${timestamp} | Event: ${eventType} | Details:`,
    details
  );
}

// -------------------- Notification --------------------
function showNotification(message, type = "success") {
  const existing = document.querySelectorAll(".notification");
  existing.forEach((n) => n.remove());

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <i class="bi bi-${
      type === "success" ? "check-circle" : "exclamation-circle"
    }-fill"></i>
    <span>${sanitizeString(message, 500)}</span>
    <button class="notification-close" onclick="this.parentElement.remove()">
      <i class="bi bi-x"></i>
    </button>
  `;
  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add("show"), 10);

  if (type === "success") {
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }
}

// -------------------- Loading UI --------------------
function setLoading(loading) {
  isLoading = loading;
  const saveBtn = document.getElementById("saveProfileBtn");
  if (!saveBtn) return;
  if (loading) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="bi bi-arrow-repeat spinning"></i> Saving...';
  } else {
    saveBtn.disabled = false;
    saveBtn.innerHTML = "Save Changes";
  }
}

// -------------------- UI update helpers --------------------
function updateSidebarUserInfo() {
  const avatar = document.getElementById("sidebarAvatar");
  const name = document.getElementById("sidebarName");
  const course = document.getElementById("sidebarCourse");
  if (avatar && CURRENT_SESSION?.userAvatar)
    avatar.textContent = CURRENT_SESSION.userAvatar.toUpperCase();
  if (name && CURRENT_SESSION?.user) name.textContent = CURRENT_SESSION.user;
  if (course) course.textContent = CURRENT_SESSION.userProgram || "";
}

// ===== PROFILE COMPLETION TRACKER (CORRECTED) =====
function calculateProfileCompletion(profile) {
  // Define which fields are required and which are optional
  const fields = [
    { key: "name", required: true, label: "Name" },
    { key: "studentNumber", required: true, label: "Student Number" },
    { key: "program", required: true, label: "Program" },
    { key: "institution", required: false, label: "Institution" },
    { key: "yearLevel", required: false, label: "Year Level" },
    { key: "bio", required: false, label: "Bio" },
    { key: "specialization", required: false, label: "Specialization" },
    { key: "graduation", required: false, label: "Graduation" },
    { key: "photo", required: false, label: "Photo" },
  ];

  let completedRequired = 0;
  let totalRequired = 0;
  let completedOptional = 0;
  let totalOptional = 0;
  const completionItems = [];

  fields.forEach((field) => {
    // Check if field has actual value (not empty/null/undefined)
    const hasValue =
      profile[field.key] &&
      String(profile[field.key]).trim() !== "" &&
      String(profile[field.key]).trim().toLowerCase() !== "loading...";

    const item = {
      label: field.label,
      done: hasValue,
      required: field.required,
    };

    completionItems.push(item);

    if (field.required) {
      totalRequired++;
      if (hasValue) completedRequired++;
    } else {
      totalOptional++;
      if (hasValue) completedOptional++;
    }
  });

  // Calculate percentage: Only required fields must be completed to show progress
  // Optional fields add bonus points
  let percentage = 0;

  if (totalRequired > 0) {
    // Base percentage from required fields (0-80%)
    const requiredPercentage = (completedRequired / totalRequired) * 80;
    // Bonus from optional fields (0-20%)
    const optionalPercentage =
      totalOptional > 0 ? (completedOptional / totalOptional) * 20 : 0;
    percentage = Math.round(requiredPercentage + optionalPercentage);
  }

  return {
    percentage,
    items: completionItems,
    completed: completedRequired,
    total: totalRequired,
  };
}

function updateProfileCompletion(profile) {
  const { percentage, items } = calculateProfileCompletion(profile);

  const percentageEl = document.getElementById("completionPercentage");
  if (percentageEl) {
    percentageEl.textContent = `${percentage}%`;
  }

  const fillEl = document.getElementById("completionFill");
  if (fillEl) {
    fillEl.style.width = `${percentage}%`;
  }

  // Completion items list removed - only showing percentage bar now
}

function updateProfileUI(profile) {
  const el = (id) => document.getElementById(id) || null;

  // Update display name (WITHOUT icon, WITHOUT bio below it)
  if (el("displayName")) {
    const displayNameText = el("displayNameText");
    if (displayNameText) {
      displayNameText.textContent = profile.name || "User Profile";
    }
  }

  // Email NOT displayed in header (removed)
  const emailEl = el("displayEmail");
  if (emailEl) {
    emailEl.style.display = "none";
  }

  // Bio NOT displayed in header (removed)
  const bioEl = el("displayBio");
  if (bioEl) {
    bioEl.style.display = "none";
  }

  // Info display mapping - REORGANIZED (Program moved to Academic, Bio only in Personal tab)
  const mapping = {
    // Personal Tab
    infoName: profile.name,
    infoEmail: profile.email,
    infoStudentNumber: profile.studentNumber,
    infoBio: profile.bio,

    // Academic Tab (Program moved here)
    infoProgram: profile.program,
    infoInstitution: profile.institution,
    infoYearLevel: profile.yearLevel,
    infoSpecialization: profile.specialization,
    infoGraduation: profile.graduation,
  };

  Object.entries(mapping).forEach(([id, value]) => {
    const node = el(id);
    if (node) node.textContent = value || "";
  });

  // Update form inputs
  const setVal = (id, value) => {
    const node = el(id);
    if (node) node.value = value || "";
  };

  setVal("editName", profile.name);
  setVal("editEmail", profile.email);
  const emailInput = el("editEmail");
  if (emailInput) {
    emailInput.disabled = true;
    emailInput.title = "Email cannot be changed";
  }

  setVal("editStudentNumber", profile.studentNumber);
  setVal("editProgram", profile.program);
  setVal("editInstitution", profile.institution);
  setVal("editYearLevel", profile.yearLevel);
  setVal("editSpecialization", profile.specialization);
  setVal("editGraduation", profile.graduation);
  setVal("editBio", profile.bio);

  // Avatar display
  if (profile.photo) {
    const profileAvatar = el("profileAvatar");
    const modalAvatar = el("modalAvatar");
    if (profileAvatar) {
      profileAvatar.innerHTML = "";
      const img = document.createElement("img");
      img.src = profile.photo;
      img.alt = "Profile Photo";
      profileAvatar.appendChild(img);
    }
    if (modalAvatar) {
      modalAvatar.innerHTML = "";
      const img = document.createElement("img");
      img.src = profile.photo;
      img.alt = "Profile Photo";
      modalAvatar.appendChild(img);
    }
    currentPhotoURL = profile.photo;
  }

  if (profile.photoFilename) {
    currentPhotoFilename = profile.photoFilename;
  }

  // Update completion tracker
  updateProfileCompletion(profile);

  // Store for later use
  currentProfile = profile;
}

// -------------------- Upload to backend --------------------
async function uploadProfilePhoto(file) {
  if (!file) throw new Error("No file provided");

  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    logSecurityEvent("PHOTO_UPLOAD_SIZE_EXCEEDED", {
      size: file.size,
      maxSize: MAX_PHOTO_SIZE_BYTES,
    });
    throw new Error("File size must be less than 10MB");
  }

  if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
    logSecurityEvent("PHOTO_UPLOAD_TYPE_REJECTED", {
      type: file.type,
      allowed: Array.from(ALLOWED_PHOTO_TYPES),
    });
    throw new Error("Please select a valid image file (JPG, PNG, or GIF)");
  }

  const form = new FormData();
  form.append("photo", file, file.name);

  const result = await postFormWithAuth(
    apiUrl("/api/uploads/profile-photo"),
    form,
    { timeoutMs: 60000 }
  );
  return result;
}

// -------------------- Broadcast profile update =====
function broadcastProfileUpdated(profile) {
  try {
    try {
      const sanitizedProfile = {
        name: sanitizeString(profile.name, MAX_NAME_LENGTH),
        email: profile.email,
        bio: sanitizeString(profile.bio, MAX_BIO_LENGTH),
        photo: profile.photo,
      };
      localStorage.setItem("userProfile", JSON.stringify(sanitizedProfile));
    } catch (e) {
      console.warn("localStorage error:", e && e.message);
    }
    window.dispatchEvent(
      new CustomEvent("profile:updated", { detail: profile })
    );
  } catch (e) {
    console.warn("Could not broadcast profile:updated", e && e.message);
  }
}

// -------------------- Auth state and initial profile fetch --------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    const currentPath = window.location.pathname;
    const pathParts = currentPath.split("/");
    const loginPath =
      pathParts.slice(0, pathParts.length - 1).join("/") + "/login.html";
    window.location.href = window.location.origin + loginPath;
    return;
  }

  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.classList.add("visible");

  const userNameFromAuth = user.displayName || user.email || "User";
  CURRENT_SESSION = {
    datetime: new Date().toISOString(),
    user: userNameFromAuth,
    userAvatar: userNameFromAuth ? userNameFromAuth[0] : "U",
    userProgram: "",
    email: user.email,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila",
  };
  updateSidebarUserInfo();

  try {
    const profile = await fetchJsonWithAuth("/api/users/profile");
    CURRENT_SESSION.userProgram = profile.program || "";
    updateSidebarUserInfo();
    currentPhotoURL = profile.photo || null;
    currentPhotoFilename = profile.photoFilename || null;
    updateProfileUI(profile);

    broadcastProfileUpdated(profile);

    updateLastUpdatedTime();
    if (overlay) overlay.classList.remove("visible");
  } catch (err) {
    console.error("Error fetching profile from backend:", err);
    showNotification(
      "Could not load your profile. Please try again later.",
      "error"
    );
    if (overlay) overlay.classList.remove("visible");
  }
});

// -------------------- File input / upload wiring --------------------
const fileWrapper = document.querySelector(".file-input-wrapper");
if (fileWrapper) {
  fileWrapper.addEventListener("click", () => {
    const photoInput = document.getElementById("photoInput");
    if (photoInput) photoInput.click();
  });
}

const photoInput = document.getElementById("photoInput");
if (photoInput) {
  photoInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const existingError = document.getElementById("photoError");
    if (existingError) existingError.remove();

    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      logSecurityEvent("PHOTO_VALIDATION_SIZE_FAILED", {
        size: file.size,
        maxSize: MAX_PHOTO_SIZE_BYTES,
      });
      const errorMessage = document.createElement("div");
      errorMessage.id = "photoError";
      errorMessage.className = "form-error";
      errorMessage.textContent = "File size must be less than 10MB";
      const photoSection = document.querySelector(".photo-upload-section");
      if (photoSection) photoSection.appendChild(errorMessage);
      return;
    }

    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      logSecurityEvent("PHOTO_VALIDATION_TYPE_FAILED", {
        type: file.type,
        allowed: Array.from(ALLOWED_PHOTO_TYPES),
      });
      const errorMessage = document.createElement("div");
      errorMessage.id = "photoError";
      errorMessage.className = "form-error";
      errorMessage.textContent =
        "Please select a valid image file (JPG, PNG, or GIF)";
      const photoSection = document.querySelector(".photo-upload-section");
      if (photoSection) photoSection.appendChild(errorMessage);
      return;
    }

    const modalAvatar = document.getElementById("modalAvatar");
    if (modalAvatar) {
      modalAvatar.innerHTML =
        '<div class="loading-spinner"><i class="bi bi-arrow-repeat spinning"></i></div>';
    }

    try {
      const result = await uploadProfilePhoto(file);
      currentPhotoURL = result.url;
      currentPhotoFilename = result.filename || currentPhotoFilename;
      const modalAvatarNode = document.getElementById("modalAvatar");
      if (modalAvatarNode) {
        modalAvatarNode.innerHTML = "";
        const img = document.createElement("img");
        img.src = currentPhotoURL;
        img.alt = "Profile Photo";
        modalAvatarNode.appendChild(img);
      }
      showNotification("Photo uploaded", "success");
    } catch (err) {
      console.error("Error uploading photo:", err);
      logSecurityEvent("PHOTO_UPLOAD_FAILED", {
        error: err && err.message ? err.message : "Unknown error",
      });
      showNotification("Could not upload photo. Try again.", "error");
      const modalAvatarNode = document.getElementById("modalAvatar");
      if (modalAvatarNode && currentPhotoURL) {
        modalAvatarNode.innerHTML = "";
        const img = document.createElement("img");
        img.src = currentPhotoURL;
        img.alt = "Profile Photo";
        modalAvatarNode.appendChild(img);
      }
    }
  });
}

// -------------------- Save profile --------------------
async function saveProfile() {
  if (isLoading) return;
  if (!validateAllFields()) {
    showNotification("Please correct the errors in the form", "error");
    return;
  }

  const getVal = (id) =>
    document.getElementById(id) ? document.getElementById(id).value.trim() : "";

  const name = sanitizeString(getVal("editName"), MAX_NAME_LENGTH);
  const studentNumber = sanitizeString(
    getVal("editStudentNumber"),
    MAX_STUDENT_NUMBER_LENGTH
  );
  const program = sanitizeString(getVal("editProgram"), MAX_PROGRAM_LENGTH);
  const institution = sanitizeString(
    getVal("editInstitution"),
    MAX_INSTITUTION_LENGTH
  );
  const yearLevel = sanitizeString(
    getVal("editYearLevel"),
    MAX_YEAR_LEVEL_LENGTH
  );
  const specialization = sanitizeString(
    getVal("editSpecialization"),
    MAX_SPECIALIZATION_LENGTH
  );
  const graduation = sanitizeString(
    getVal("editGraduation"),
    MAX_GRADUATION_LENGTH
  );
  const bio = sanitizeString(getVal("editBio"), MAX_BIO_LENGTH);

  setLoading(true);
  const user = auth.currentUser;
  if (!user) {
    showNotification(
      "You need to be logged in to update your profile",
      "error"
    );
    setLoading(false);
    return;
  }

  try {
    const profileData = {
      name,
      studentNumber,
      program,
      institution,
      yearLevel,
      specialization,
      graduation,
      bio,
      photo: currentPhotoURL || null,
      photoFilename: currentPhotoFilename || null,
    };

    const updatedProfile = await fetchJsonWithAuth("/api/users/profile", {
      method: "PUT",
      body: JSON.stringify(profileData),
    });

    currentPhotoURL = updatedProfile.photo || currentPhotoURL;
    currentPhotoFilename = updatedProfile.photoFilename || currentPhotoFilename;
    updateProfileUI(updatedProfile);

    broadcastProfileUpdated(updatedProfile);

    updateLastUpdatedTime();
    closeEditModal();
    showNotification("Profile updated successfully!", "success");
  } catch (err) {
    console.error("Error saving profile:", err);
    logSecurityEvent("PROFILE_SAVE_FAILED", {
      error: err && err.message ? err.message : "Unknown error",
    });
    showNotification(
      "Failed to save profile changes. Please try again.",
      "error"
    );
  } finally {
    setLoading(false);
  }
}

// -------------------- Modal helpers --------------------
function openEditModal() {
  const editModal = document.getElementById("editModal");
  if (!editModal) return;
  editModal.style.display = "block";
  document.body.style.overflow = "hidden";
}

function closeEditModal() {
  if (isLoading) return;
  const editModal = document.getElementById("editModal");
  if (!editModal) return;
  editModal.style.display = "none";
  document.body.style.overflow = "auto";

  const errorFields = document.querySelectorAll(".form-error");
  errorFields.forEach((f) => f.remove());
  const errorInputs = document.querySelectorAll(".error");
  errorInputs.forEach((i) => i.classList.remove("error"));
}

window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;

// ===== PASSWORD STRENGTH CHECKER =====
function checkPasswordStrength(password) {
  let strength = 0;
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  Object.entries(requirements).forEach(([key, met]) => {
    if (met) strength++;
    const reqEl = document.getElementById(`req-${key}`);
    if (reqEl) {
      if (met) {
        reqEl.classList.add("met");
      } else {
        reqEl.classList.remove("met");
      }
    }
  });

  const strengthBar = document.getElementById("strengthBar");
  const strengthValue = document.getElementById("strengthValue");

  if (strengthBar) {
    strengthBar.classList.remove("weak", "medium", "strong");
    if (strength < 3) {
      strengthBar.classList.add("weak");
      if (strengthValue) {
        strengthValue.textContent = "Weak";
        strengthValue.className = "strength-value weak";
      }
    } else if (strength < 5) {
      strengthBar.classList.add("medium");
      if (strengthValue) {
        strengthValue.textContent = "Medium";
        strengthValue.className = "strength-value medium";
      }
    } else {
      strengthBar.classList.add("strong");
      if (strengthValue) {
        strengthValue.textContent = "Strong";
        strengthValue.className = "strength-value strong";
      }
    }
  }

  return strength >= 3;
}

// ===== PASSWORD MATCH CHECKER =====
function checkPasswordMatch() {
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmNewPassword").value;
  const feedback = document.getElementById("passwordMatchFeedback");

  if (!confirmPassword) {
    feedback.className = "password-match-feedback";
    feedback.textContent = "";
    return false;
  }

  if (newPassword === confirmPassword) {
    feedback.className = "password-match-feedback success";
    feedback.textContent = "✓ Passwords match";
    return true;
  } else {
    feedback.className = "password-match-feedback error";
    feedback.textContent = "✗ Passwords do not match";
    return false;
  }
}

// ===== PASSWORD TOGGLE VISIBILITY =====
function setupPasswordToggle() {
  const toggleNewPassword = document.getElementById("toggleNewPassword");
  const toggleConfirmPassword = document.getElementById(
    "toggleConfirmPassword"
  );
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmNewPassword");

  if (toggleNewPassword && newPasswordInput) {
    toggleNewPassword.addEventListener("click", (e) => {
      e.preventDefault();
      if (newPasswordInput.type === "password") {
        newPasswordInput.type = "text";
        toggleNewPassword.innerHTML = '<i class="bi bi-eye-slash"></i>';
      } else {
        newPasswordInput.type = "password";
        toggleNewPassword.innerHTML = '<i class="bi bi-eye"></i>';
      }
    });
  }

  if (toggleConfirmPassword && confirmPasswordInput) {
    toggleConfirmPassword.addEventListener("click", (e) => {
      e.preventDefault();
      if (confirmPasswordInput.type === "password") {
        confirmPasswordInput.type = "text";
        toggleConfirmPassword.innerHTML = '<i class="bi bi-eye-slash"></i>';
      } else {
        confirmPasswordInput.type = "password";
        toggleConfirmPassword.innerHTML = '<i class="bi bi-eye"></i>';
      }
    });
  }
}

// -------------------- Change password flow --------------------
function wireChangePasswordUI() {
  const openBtn = document.getElementById("openChangePasswordBtn");
  const modal = document.getElementById("changePasswordModal");
  const closeBtn = document.getElementById("closeChangePasswordModal");
  const cancelBtn = document.getElementById("cancelChangePasswordBtn");
  const form = document.getElementById("changePasswordForm");
  const sendResetBtn = document.getElementById("sendResetEmailBtn");
  const confirmBtn = document.getElementById("confirmChangePasswordBtn");

  const close = () => {
    if (modal) {
      modal.style.display = "none";
      document.body.style.overflow = "auto";
      resetPasswordForm();
    }
  };

  function resetPasswordForm() {
    const currentPassword = document.getElementById("currentPassword");
    const newPassword = document.getElementById("newPassword");
    const confirmPassword = document.getElementById("confirmNewPassword");
    const feedback = document.getElementById("passwordMatchFeedback");

    if (currentPassword) currentPassword.value = "";
    if (newPassword) newPassword.value = "";
    if (confirmPassword) confirmPassword.value = "";
    if (feedback) {
      feedback.className = "password-match-feedback";
      feedback.textContent = "";
    }

    // Reset strength bar
    const strengthBar = document.getElementById("strengthBar");
    if (strengthBar) {
      strengthBar.className = "strength-bar";
      strengthBar.style.width = "0%";
    }

    const strengthValue = document.getElementById("strengthValue");
    if (strengthValue) strengthValue.textContent = "-";

    // Reset requirement items
    document
      .querySelectorAll(".requirement-item")
      .forEach((el) => el.classList.remove("met"));
  }

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      if (modal) {
        modal.style.display = "block";
        document.body.style.overflow = "hidden";
        resetPasswordForm();
        const currentPassword = document.getElementById("currentPassword");
        if (currentPassword) currentPassword.focus();
      }
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (cancelBtn) cancelBtn.addEventListener("click", close);

  // Real-time password validation
  const newPasswordInput = document.getElementById("newPassword");
  if (newPasswordInput) {
    newPasswordInput.addEventListener("input", function () {
      checkPasswordStrength(this.value);
      checkPasswordMatch();
    });
  }

  const confirmPasswordInput = document.getElementById("confirmNewPassword");
  if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener("input", checkPasswordMatch);
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const currentPassword =
        (document.getElementById("currentPassword") || {}).value?.trim() || "";
      const newPassword =
        (document.getElementById("newPassword") || {}).value?.trim() || "";
      const confirmPassword =
        (document.getElementById("confirmNewPassword") || {}).value?.trim() ||
        "";

      if (!currentPassword) {
        showNotification("Please enter your current password", "error");
        return;
      }

      if (newPassword.length < 8) {
        showNotification("New password must be at least 8 characters", "error");
        return;
      }

      if (newPassword !== confirmPassword) {
        showNotification("Passwords do not match", "error");
        return;
      }

      if (!checkPasswordStrength(newPassword)) {
        showNotification(
          "Password does not meet security requirements",
          "error"
        );
        return;
      }

      const user = auth.currentUser;
      if (!user) {
        showNotification("No signed-in user.", "error");
        return;
      }

      if (!user.email) {
        showNotification(
          "Password change only for email accounts. Use password reset otherwise.",
          "error"
        );
        return;
      }

      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML =
          '<i class="bi bi-arrow-repeat spinning"></i> Changing...';
      }

      try {
        const credential = EmailAuthProvider.credential(
          user.email,
          currentPassword
        );
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
        showNotification("Password changed successfully!", "success");
        logSecurityEvent("PASSWORD_CHANGED", { userId: user.uid });
        close();
      } catch (err) {
        console.error("Error changing password:", err);
        logSecurityEvent("PASSWORD_CHANGE_FAILED", {
          error: err && err.code ? err.code : "Unknown error",
        });

        if (err.code === "auth/wrong-password")
          showNotification("Current password is incorrect.", "error");
        else if (err.code === "auth/requires-recent-login")
          showNotification("Please re-login and try again.", "error");
        else
          showNotification(
            "Could not change password. Try password reset email.",
            "error"
          );
      } finally {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = "Change Password";
        }
      }
    });
  }

  if (sendResetBtn) {
    sendResetBtn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user || !user.email) {
        showNotification("No email available for reset.", "error");
        return;
      }

      sendResetBtn.disabled = true;
      sendResetBtn.innerHTML =
        '<i class="bi bi-arrow-repeat spinning"></i> Sending...';

      try {
        await sendPasswordResetEmail(auth, user.email);
        showNotification(
          "Password reset email sent. Check your inbox.",
          "success"
        );
        logSecurityEvent("PASSWORD_RESET_EMAIL_SENT", { email: user.email });
      } catch (err) {
        console.error("Error sending reset email:", err);
        logSecurityEvent("PASSWORD_RESET_EMAIL_FAILED", {
          error: err && err.message ? err.message : "Unknown error",
        });
        showNotification(
          "Could not send reset email. Try again later.",
          "error"
        );
      } finally {
        sendResetBtn.disabled = false;
        sendResetBtn.innerHTML =
          '<i class="bi bi-envelope-paper"></i> Send Password Reset Email';
      }
    });
  }
}

// -------------------- Validation & misc helpers --------------------
function validateField(field) {
  const existing = document.getElementById(`${field.id}Error`);
  if (existing) existing.remove();

  if (field.disabled) {
    field.classList.remove("error");
    return true;
  }

  if (field.required && !field.value.trim()) {
    field.classList.add("error");
    const msg = document.createElement("div");
    msg.id = `${field.id}Error`;
    msg.className = "form-error";
    msg.textContent = "This field is required";
    field.parentNode.appendChild(msg);
    return false;
  }

  field.classList.remove("error");
  return true;
}

function validateAllFields() {
  const requiredFields = ["editName", "editStudentNumber", "editProgram"];
  let valid = true;
  requiredFields.forEach((id) => {
    const f = document.getElementById(id);
    if (f) valid = validateField(f) && valid;
  });
  return valid;
}

function updateLastUpdatedTime() {
  const lastUpdated = document.getElementById("lastUpdated");
  if (!lastUpdated) return;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);
  lastUpdated.textContent = `Last updated: ${date} ${time} UTC`;
}

// ===== TAB FUNCTIONALITY (Deprecated - using single scrollable container now) =====
function setupTabs() {
  // Tabs removed - all sections now visible in single scrollable container
  // Keeping function for backward compatibility
}

// -------------------- Page animation --------------------
function animateOnLoad() {
  try {
    const sections = document.querySelectorAll(".profile-section-group");
    sections.forEach((section, idx) => {
      section.style.opacity = "0";
      section.style.transform = "translateY(12px)";
      section.style.transition = "all 0.5s ease";
      setTimeout(() => {
        section.style.opacity = "1";
        section.style.transform = "translateY(0)";
      }, 120 + idx * 80);
    });

    const header = document.querySelector(".profile-header");
    if (header) {
      header.style.opacity = "0";
      header.style.transform = "translateY(-8px)";
      header.style.transition = "all 0.6s ease";
      setTimeout(() => {
        header.style.opacity = "1";
        header.style.transform = "translateY(0)";
      }, 100);
    }
  } catch (e) {
    console.warn("animateOnLoad skipped due to:", e && e.message);
  }
}

// -------------------- DOMContentLoaded wiring --------------------
document.addEventListener("DOMContentLoaded", () => {
  animateOnLoad();
  setupTabs();
  setupPasswordToggle();
  initializeFormValidation();
  updateLastUpdatedTime();

  const editProfileBtn = document.getElementById("editProfileBtn");
  if (editProfileBtn) editProfileBtn.addEventListener("click", openEditModal);

  const closeEditModalBtn = document.getElementById("closeEditModalBtn");
  if (closeEditModalBtn)
    closeEditModalBtn.addEventListener("click", closeEditModal);

  const cancelEditModalBtn = document.getElementById("cancelEditModalBtn");
  if (cancelEditModalBtn)
    cancelEditModalBtn.addEventListener("click", closeEditModal);

  const saveProfileBtn = document.getElementById("saveProfileBtn");
  if (saveProfileBtn) saveProfileBtn.addEventListener("click", saveProfile);

  const editForm = document.getElementById("editForm");
  if (editForm)
    editForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saveProfile();
    });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn) logoutBtn.click();
    }
    if (e.key === "Escape" && !isLoading) closeEditModal();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      openEditModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
      e.preventDefault();
      const t = document.getElementById("themeToggle");
      if (t) t.click();
    }
  });

  wireChangePasswordUI();
});

// -------------------- Form validation wiring --------------------
function initializeFormValidation() {
  const required = ["editName", "editStudentNumber", "editProgram"];
  required.forEach((id) => {
    const field = document.getElementById(id);
    if (!field) return;
    field.addEventListener("blur", function () {
      validateField(this);
    });
    field.addEventListener("input", function () {
      if (this.classList.contains("error")) {
        this.classList.remove("error");
        const err = document.getElementById(`${this.id}Error`);
        if (err) err.remove();
      }
    });
  });
}

// Close modals when clicking outside
window.addEventListener("click", (e) => {
  const editModal = document.getElementById("editModal");
  if (e.target === editModal) closeEditModal();

  const changePasswordModal = document.getElementById("changePasswordModal");
  if (e.target === changePasswordModal) {
    changePasswordModal.style.display = "none";
    document.body.style.overflow = "auto";
  }
});
