// Current Session Info - 2025-08-29 03:23:47 Philippines Time (UTC+8)
const CURRENT_SESSION = {
  utcTime: "2025-08-29 03:23:47", // UTC time
  philippinesTime: "2025-08-29 11:23:47", // Philippines time (UTC+8)
  user: "DanePascual", // Current user
  timezone: "Asia/Manila",
};

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
});

// Navbar scroll effect
window.addEventListener("scroll", () => {
  const navbar = document.getElementById("navbar");
  if (window.scrollY > 50) {
    navbar.classList.add("scrolled");
  } else {
    navbar.classList.remove("scrolled");
  }
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute("href"));
    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  });
});

// Scroll animations
const observerOptions = {
  threshold: 0.1,
  rootMargin: "0px 0px -50px 0px",
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("animate");
    }
  });
}, observerOptions);

// Observe all scroll-animate elements
document.querySelectorAll(".scroll-animate").forEach((el) => {
  observer.observe(el);
});

// User session validation
function validateUserSession() {
  // Store current user session
  localStorage.setItem("currentUser", CURRENT_SESSION.user);
  localStorage.setItem(
    "landingPageVisit",
    JSON.stringify({
      user: CURRENT_SESSION.user,
      timestamp: CURRENT_SESSION.philippinesTime,
      timezone: CURRENT_SESSION.timezone,
    })
  );

  console.log(
    `👋 Landing page visited by ${CURRENT_SESSION.user} at ${CURRENT_SESSION.philippinesTime} Philippines Time`
  );
}

// Handle online/offline status
window.addEventListener("online", () => {
  console.log("You're back online!");
});

window.addEventListener("offline", () => {
  console.log("You're offline. Some features may be limited.");
});

// Performance monitoring
window.addEventListener("load", () => {
  const loadTime = performance.now();
  console.log(
    `⚡ Landing page loaded in ${loadTime.toFixed(2)}ms for ${
      CURRENT_SESSION.user
    }`
  );

  if (loadTime > 3000) {
    console.warn("⚠️ Landing page loading slowly. Consider optimization.");
  }
});

// Final initialization log
document.addEventListener("DOMContentLoaded", function () {
  // Validate user session
  validateUserSession();
  console.log(
    `🎉 Landing page ready for ${CURRENT_SESSION.user} at ${CURRENT_SESSION.philippinesTime} Philippines Time`
  );
});
