// profile.js — Client-side profile logic (uploads profile photo via backend to Supabase).
// - Uses Firebase Auth for authentication tokens.
// - Uploads files to backend /api/uploads/profile-photo (protected).
// - Saves profile via backend PUT /api/users/profile.
// - Includes change-password flow (reauth + updatePassword) and validation.

import { auth } from "../../config/firebase.js";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

const API_BASE = "http://localhost:5000";

let CURRENT_SESSION = null;
let currentPhotoURL = null; // stores public image URL returned by backend
let currentPhotoFilename = null; // stores the Supabase stored filename returned by backend
let isLoading = false;

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
    <span>${message}</span>
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
    const editModal = document.getElementById("editModal");
    if (editModal) editModal.classList.add("loading");
  } else {
    saveBtn.disabled = false;
    saveBtn.innerHTML = "Save Changes";
    const editModal = document.getElementById("editModal");
    if (editModal) editModal.classList.remove("loading");
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

function updateProfileUI(profile) {
  const el = (id) => document.getElementById(id) || null;

  if (el("displayName")) el("displayName").textContent = profile.name || "";
  if (el("displayEmail"))
    el(
      "displayEmail"
    ).innerHTML = `<i class="bi bi-envelope"></i><span class="email-text">${
      profile.email || ""
    }</span>`;
  if (el("displayBio")) el("displayBio").textContent = profile.bio || "";

  const mapping = {
    infoName: profile.name,
    infoEmail: profile.email,
    infoStudentNumber: profile.studentNumber,
    infoProgram: profile.program,
    infoInstitution: profile.institution,
    infoYearLevel: profile.yearLevel,
    infoSpecialization: profile.specialization,
    infoGraduation: profile.graduation,
    infoBio: profile.bio,
  };

  Object.entries(mapping).forEach(([id, value]) => {
    const node = el(id);
    if (node) node.textContent = value || "";
  });

  const setVal = (id, value) => {
    const node = el(id);
    if (node) node.value = value || "";
  };

  setVal("editName", profile.name);
  setVal("editEmail", profile.email);
  setVal("editStudentNumber", profile.studentNumber);
  setVal("editProgram", profile.program);
  setVal("editInstitution", profile.institution);
  setVal("editYearLevel", profile.yearLevel);
  setVal("editSpecialization", profile.specialization);
  setVal("editGraduation", profile.graduation);
  setVal("editBio", profile.bio);

  if (profile.photo) {
    const profileAvatar = el("profileAvatar");
    const modalAvatar = el("modalAvatar");
    if (profileAvatar)
      profileAvatar.innerHTML = `<img src="${profile.photo}" alt="Profile Photo">`;
    if (modalAvatar)
      modalAvatar.innerHTML = `<img src="${profile.photo}" alt="Profile Photo">`;
    currentPhotoURL = profile.photo;
  }

  if (profile.photoFilename) {
    currentPhotoFilename = profile.photoFilename;
  }
}

// -------------------- Upload to backend (Supabase) --------------------
async function uploadProfilePhoto(file) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();

  const form = new FormData();
  form.append("photo", file, file.name);

  const resp = await fetch(`${API_BASE}/api/uploads/profile-photo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed (${resp.status})`);
  }
  return resp.json(); // { url, filename }
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
    const token = await user.getIdToken();
    const response = await fetch(`${API_BASE}/api/users/profile`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok)
      throw new Error(`Failed to fetch profile: ${response.status}`);
    const profile = await response.json();
    CURRENT_SESSION.userProgram = profile.program || "";
    updateSidebarUserInfo();
    currentPhotoURL = profile.photo || null;
    currentPhotoFilename = profile.photoFilename || null;
    updateProfileUI(profile);
    localStorage.setItem("userProfile", JSON.stringify(profile));
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

    if (file.size > 10 * 1024 * 1024) {
      const errorMessage = document.createElement("div");
      errorMessage.id = "photoError";
      errorMessage.className = "form-error";
      errorMessage.innerHTML = "File size must be less than 10MB";
      const photoSection = document.querySelector(".photo-upload-section");
      if (photoSection) photoSection.appendChild(errorMessage);
      return;
    }
    if (!file.type.match(/^image\/(jpeg|jpg|png|gif)$/)) {
      const errorMessage = document.createElement("div");
      errorMessage.id = "photoError";
      errorMessage.className = "form-error";
      errorMessage.innerHTML =
        "Please select a valid image file (JPG, PNG, or GIF)";
      const photoSection = document.querySelector(".photo-upload-section");
      if (photoSection) photoSection.appendChild(errorMessage);
      return;
    }

    const modalAvatar = document.getElementById("modalAvatar");
    if (modalAvatar)
      modalAvatar.innerHTML = `<div class="loading-spinner"><i class="bi bi-arrow-repeat spinning"></i></div>`;

    try {
      const result = await uploadProfilePhoto(file);
      currentPhotoURL = result.url;
      currentPhotoFilename = result.filename || currentPhotoFilename;
      const modalAvatarNode = document.getElementById("modalAvatar");
      if (modalAvatarNode)
        modalAvatarNode.innerHTML = `<img src="${currentPhotoURL}" alt="Profile Photo">`;
      showNotification("Photo uploaded", "success");
    } catch (err) {
      console.error("Error uploading photo:", err);
      showNotification("Could not upload photo. Try again.", "error");
      const modalAvatarNode = document.getElementById("modalAvatar");
      if (modalAvatarNode && currentPhotoURL)
        modalAvatarNode.innerHTML = `<img src="${currentPhotoURL}" alt="Profile Photo">`;
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
  const name = getVal("editName");
  const email = getVal("editEmail");
  const studentNumber = getVal("editStudentNumber");
  const program = getVal("editProgram");
  const institution = getVal("editInstitution");
  const yearLevel = getVal("editYearLevel");
  const specialization = getVal("editSpecialization");
  const graduation = getVal("editGraduation");
  const bio = getVal("editBio");

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
    const token = await user.getIdToken();

    const profileData = {
      name,
      email,
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

    const response = await fetch(`${API_BASE}/api/users/profile`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(profileData),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        body.error || `Failed to save profile: ${response.statusText}`
      );
    }

    const updatedProfile = await response.json();
    currentPhotoURL = updatedProfile.photo || currentPhotoURL;
    currentPhotoFilename = updatedProfile.photoFilename || currentPhotoFilename;
    updateProfileUI(updatedProfile);
    localStorage.setItem("userProfile", JSON.stringify(updatedProfile));
    updateLastUpdatedTime();
    closeEditModal();
    showNotification("Profile updated successfully!", "success");
  } catch (err) {
    console.error("Error saving profile:", err);
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

// -------------------- Change password flow --------------------
function wireChangePasswordUI() {
  const openBtn = document.getElementById("openChangePasswordBtn");
  const modal = document.getElementById("changePasswordModal");
  const closeBtn = document.getElementById("closeChangePasswordModal");
  const cancelBtn = document.getElementById("cancelChangePasswordBtn");
  const form = document.getElementById("changePasswordForm");
  const sendResetBtn = document.getElementById("sendResetEmailBtn");

  const close = () => {
    if (modal) {
      modal.style.display = "none";
      document.body.style.overflow = "auto";
    }
  };

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      if (modal) {
        modal.style.display = "block";
        document.body.style.overflow = "hidden";
        const cp = document.getElementById("currentPassword");
        const np = document.getElementById("newPassword");
        const hint = document.getElementById("passwordHint");
        if (cp) cp.value = "";
        if (np) np.value = "";
        if (hint) hint.style.display = "none";
      }
    });
  }
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (cancelBtn) cancelBtn.addEventListener("click", close);

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const currentPassword =
        (document.getElementById("currentPassword") || {}).value?.trim() || "";
      const newPassword =
        (document.getElementById("newPassword") || {}).value?.trim() || "";
      const hint = document.getElementById("passwordHint");
      if (newPassword.length < 8) {
        if (hint) hint.style.display = "block";
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
      try {
        const credential = EmailAuthProvider.credential(
          user.email,
          currentPassword
        );
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
        showNotification("Password changed successfully.", "success");
        close();
      } catch (err) {
        console.error("Error changing password:", err);
        if (err.code === "auth/wrong-password")
          showNotification("Current password is incorrect.", "error");
        else if (err.code === "auth/requires-recent-login")
          showNotification("Please re-login and try again.", "error");
        else
          showNotification(
            "Could not change password. Try password reset email.",
            "error"
          );
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
      try {
        await sendPasswordResetEmail(auth, user.email);
        showNotification(
          "Password reset email sent. Check your inbox.",
          "success"
        );
      } catch (err) {
        console.error("Error sending reset email:", err);
        showNotification(
          "Could not send reset email. Try again later.",
          "error"
        );
      }
    });
  }
}

// -------------------- Validation & misc helpers --------------------
function validateField(field) {
  const existing = document.getElementById(`${field.id}Error`);
  if (existing) existing.remove();

  if (field.required && !field.value.trim()) {
    field.classList.add("error");
    const msg = document.createElement("div");
    msg.id = `${field.id}Error`;
    msg.className = "form-error";
    msg.innerHTML = "This field is required";
    field.parentNode.appendChild(msg);
    return false;
  }

  if (field.id === "editEmail" && field.value.trim()) {
    const validation = validateEmail(field.value.trim());
    if (!validation.valid) {
      field.classList.add("error");
      const msg = document.createElement("div");
      msg.id = `${field.id}Error`;
      msg.className = "form-error";
      msg.innerHTML = validation.message;
      field.parentNode.appendChild(msg);
      return false;
    }
  }

  field.classList.remove("error");
  return true;
}

function validateAllFields() {
  const requiredFields = [
    "editName",
    "editEmail",
    "editStudentNumber",
    "editProgram",
  ];
  let valid = true;
  requiredFields.forEach((id) => {
    const f = document.getElementById(id);
    if (f) valid = validateField(f) && valid;
  });
  return valid;
}

function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(email))
    return {
      valid: false,
      message: "Please enter a valid email address format!",
    };
  if (!email.toLowerCase().endsWith("@paterostechnologicalcollege.edu.ph"))
    return {
      valid: false,
      message:
        "Email must be from Pateros Technological College domain (@paterostechnologicalcollege.edu.ph)",
    };
  return { valid: true, message: "" };
}

function updateLastUpdatedTime() {
  const lastUpdated = document.getElementById("lastUpdated");
  if (!lastUpdated) return;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);
  lastUpdated.textContent = `Last updated: ${date} ${time} UTC`;
}

// -------------------- Small page animation (restored) --------------------
// animateOnLoad used to be called in DOMContentLoaded. It was missing and caused a ReferenceError.
// Keep this simple and defensive — purely visual.
function animateOnLoad() {
  try {
    const sections = document.querySelectorAll(".profile-section");
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
    // animation failures are non-critical
    console.warn("animateOnLoad skipped due to:", e && e.message);
  }
}

// -------------------- DOMContentLoaded wiring --------------------
document.addEventListener("DOMContentLoaded", () => {
  // rely on centralized sidebar.js for sidebar wiring
  animateOnLoad();
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

  // keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "l") {
      e.preventDefault();
      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn) logoutBtn.click();
    }
    if (e.key === "Escape" && !isLoading) closeEditModal();
    if ((e.ctrlKey || e.metaKey) && e.key === "e") {
      e.preventDefault();
      openEditModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "t") {
      e.preventDefault();
      const t = document.getElementById("themeToggle");
      if (t) t.click();
    }
  });

  wireChangePasswordUI();
});

// -------------------- Form validation wiring --------------------
function initializeFormValidation() {
  const required = [
    "editName",
    "editEmail",
    "editStudentNumber",
    "editProgram",
  ];
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
