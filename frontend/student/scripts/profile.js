// Current Session Info - Updated with your provided timestamp
const CURRENT_SESSION = {
  utcTime: "2025-08-31 01:58:31", // UTC time
  philippinesTime: "2025-08-31 09:58:31", // Philippines time (UTC+8)
  user: "DanePascual",
  timezone: "Asia/Manila",
};

// Global variables
const currentUser = CURRENT_SESSION.user;
const allowedEmailDomain = "@paterostechnologicalcollege.edu.ph";
let currentPhotoURL = null;

// Theme management
const themeToggle = document.getElementById("themeToggle");
const body = document.body;

// Load saved theme
const savedTheme = localStorage.getItem("theme") || "light";
if (savedTheme === "dark") {
  body.classList.add("dark-mode");
  themeToggle.innerHTML = '<i class="bi bi-sun"></i>';
}

themeToggle.addEventListener("click", () => {
  body.classList.toggle("dark-mode");
  const isDark = body.classList.contains("dark-mode");
  themeToggle.innerHTML = isDark
    ? '<i class="bi bi-sun"></i>'
    : '<i class="bi bi-moon"></i>';
  localStorage.setItem("theme", isDark ? "dark" : "light");

  console.log(
    `Theme switched to ${isDark ? "dark" : "light"} mode by ${
      CURRENT_SESSION.user
    }`
  );
});

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  initializeSidebar();
  animateOnLoad();

  console.log(
    `Profile page initialized for ${CURRENT_SESSION.user} at ${CURRENT_SESSION.philippinesTime}`
  );
  console.log(`Timezone: ${CURRENT_SESSION.timezone} (UTC+8)`);
});

function initializeSidebar() {
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const mainContent = document.getElementById("mainContent");

  // Open sidebar by default on desktop
  if (window.innerWidth > 768) {
    sidebar.classList.add("open");
    mainContent.classList.add("shifted");
  }

  menuToggle.addEventListener("click", function () {
    sidebar.classList.toggle("open");
    mainContent.classList.toggle("shifted");
  });

  document.addEventListener("click", function (event) {
    if (window.innerWidth <= 768) {
      if (
        !sidebar.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {
        sidebar.classList.remove("open");
        mainContent.classList.remove("shifted");
      }
    }
  });
}

function animateOnLoad() {
  const sections = document.querySelectorAll(".profile-section");
  sections.forEach((section, index) => {
    setTimeout(() => {
      section.style.opacity = "0";
      section.style.transform = "translateY(20px)";
      section.style.transition = "all 0.6s ease";
      setTimeout(() => {
        section.style.opacity = "1";
        section.style.transform = "translateY(0)";
      }, 100);
    }, index * 150);
  });

  const header = document.querySelector(".profile-header");
  header.style.opacity = "0";
  header.style.transform = "translateY(-20px)";
  header.style.transition = "all 0.8s ease";
  setTimeout(() => {
    header.style.opacity = "1";
    header.style.transform = "translateY(0)";
  }, 300);
}

// Modal Functions
function openEditModal() {
  document.getElementById("editModal").style.display = "block";
  document.body.style.overflow = "hidden";
}

function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
  document.body.style.overflow = "auto";

  // Reset email field styling if it has error
  const emailField = document.getElementById("editEmail");
  emailField.classList.remove("error");
}

// Close modal when clicking outside
document.getElementById("editModal").addEventListener("click", function (e) {
  if (e.target === this) {
    closeEditModal();
  }
});

// Photo Upload Functionality
document
  .querySelector(".file-input-wrapper")
  .addEventListener("click", function () {
    document.getElementById("photoInput").click();
  });

document.getElementById("photoInput").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      console.log("File size must be less than 5MB");
      return;
    }
    if (!file.type.match(/^image\/(jpeg|jpg|png|gif)$/)) {
      console.log("Please select a valid image file (JPG, PNG, or GIF)");
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      currentPhotoURL = e.target.result;
      document.getElementById(
        "modalAvatar"
      ).innerHTML = `<img src="${currentPhotoURL}" alt="Profile Photo">`;
    };
    reader.readAsDataURL(file);
  }
});

// Email validation for PTC domain
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      valid: false,
      message: "Please enter a valid email address format!",
    };
  }

  if (!email.toLowerCase().endsWith(allowedEmailDomain.toLowerCase())) {
    return {
      valid: false,
      message: `Email must be from Pateros Technological College domain (${allowedEmailDomain})`,
    };
  }

  return { valid: true, message: "" };
}

// Real-time email validation
document.getElementById("editEmail").addEventListener("input", function () {
  const email = this.value.trim();
  if (email) {
    const validation = validateEmail(email);
    if (!validation.valid) {
      this.classList.add("error");
    } else {
      this.classList.remove("error");
    }
  } else {
    this.classList.remove("error");
  }
});

// Save Profile Function
function saveProfile() {
  const name = document.getElementById("editName").value.trim();
  const email = document.getElementById("editEmail").value.trim();
  const studentNumber = document
    .getElementById("editStudentNumber")
    .value.trim();
  const program = document.getElementById("editProgram").value.trim();
  const institution = document.getElementById("editInstitution").value.trim();
  const yearLevel = document.getElementById("editYearLevel").value.trim();
  const specialization = document
    .getElementById("editSpecialization")
    .value.trim();
  const graduation = document.getElementById("editGraduation").value.trim();
  const bio = document.getElementById("editBio").value.trim();

  if (!name || !email || !studentNumber || !program) {
    console.log("Please fill in all required fields!");
    return;
  }

  // Validate email domain
  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    console.log(emailValidation.message);
    document.getElementById("editEmail").classList.add("error");
    document.getElementById("editEmail").focus();
    return;
  }

  // Update profile display
  document.getElementById("displayName").textContent = name;
  document.getElementById("displayEmail").innerHTML = `
          <i class="bi bi-envelope"></i>
          <span class="email-text">${email}</span>
        `;
  document.getElementById("displayBio").textContent = bio;

  // Update info sections
  document.getElementById("infoName").textContent = name;
  document.getElementById("infoEmail").textContent = email;
  document.getElementById("infoStudentNumber").textContent = studentNumber;
  document.getElementById("infoProgram").textContent = program;
  document.getElementById("infoInstitution").textContent = institution;
  document.getElementById("infoYearLevel").textContent = yearLevel;
  document.getElementById("infoSpecialization").textContent = specialization;
  document.getElementById("infoGraduation").textContent = graduation;
  document.getElementById("infoBio").textContent = bio;

  // Update sidebar user info
  const sidebarName = document.getElementById("sidebarName");
  const sidebarCourse = document.getElementById("sidebarCourse");
  if (sidebarName) sidebarName.textContent = name;
  if (sidebarCourse) sidebarCourse.textContent = program;

  // Update profile photos if new photo was uploaded
  if (currentPhotoURL) {
    document.getElementById(
      "profileAvatar"
    ).innerHTML = `<img src="${currentPhotoURL}" alt="Profile Photo">`;
    document.getElementById(
      "sidebarAvatar"
    ).innerHTML = `<img src="${currentPhotoURL}" alt="Profile Photo">`;
  }

  // Store profile data in localStorage
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
    photo: currentPhotoURL,
    lastUpdated: CURRENT_SESSION.philippinesTime,
    timezone: CURRENT_SESSION.timezone,
  };
  localStorage.setItem("userProfile", JSON.stringify(profileData));

  closeEditModal();

  console.log(`Profile updated by ${CURRENT_SESSION.user}`);
}

// Keyboard shortcuts
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeEditModal();
  if (e.ctrlKey && e.key === "e") {
    e.preventDefault();
    openEditModal();
  }
  if (e.ctrlKey && e.key === "t") {
    e.preventDefault();
    themeToggle.click();
  }
});

// Load saved profile data on page load
window.addEventListener("load", function () {
  const savedProfile = localStorage.getItem("userProfile");
  if (savedProfile) {
    const profile = JSON.parse(savedProfile);

    // Update form fields
    if (profile.name) document.getElementById("editName").value = profile.name;
    if (profile.email)
      document.getElementById("editEmail").value = profile.email;
    if (profile.studentNumber)
      document.getElementById("editStudentNumber").value =
        profile.studentNumber;
    if (profile.program)
      document.getElementById("editProgram").value = profile.program;
    if (profile.institution)
      document.getElementById("editInstitution").value = profile.institution;
    if (profile.yearLevel)
      document.getElementById("editYearLevel").value = profile.yearLevel;
    if (profile.specialization)
      document.getElementById("editSpecialization").value =
        profile.specialization;
    if (profile.graduation)
      document.getElementById("editGraduation").value = profile.graduation;
    if (profile.bio) document.getElementById("editBio").value = profile.bio;

    // Update display without triggering save
    if (profile.photo) {
      currentPhotoURL = profile.photo;
      document.getElementById(
        "profileAvatar"
      ).innerHTML = `<img src="${profile.photo}" alt="Profile Photo">`;
      document.getElementById(
        "sidebarAvatar"
      ).innerHTML = `<img src="${profile.photo}" alt="Profile Photo">`;
    }
  }
});

console.log(`Profile page ready for ${CURRENT_SESSION.user}`);
