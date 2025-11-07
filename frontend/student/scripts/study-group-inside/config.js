// ✅ PRODUCTION-READY: Use environment variables or auto-detect

// Check if we're in development (localhost)
const isDevelopment =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

// Get API base from environment variable if available (Vercel, Netlify, Firebase Hosting)
const getApiBase = () => {
  // Priority order:
  // 1. Environment variable (set during build)
  // 2. Development localhost
  // 3. Production Heroku

  if (typeof process !== "undefined" && process.env?.REACT_APP_API_BASE) {
    return process.env.REACT_APP_API_BASE;
  }

  if (isDevelopment) {
    return "http://localhost:5000/api/study-groups";
  }

  // Production fallback
  return "https://study-group-backend-d8fc93ae1b7a.herokuapp.com/api/study-groups";
};

const getBackendBase = () => {
  if (typeof process !== "undefined" && process.env?.REACT_APP_BACKEND_BASE) {
    return process.env.REACT_APP_BACKEND_BASE;
  }

  if (isDevelopment) {
    return "http://localhost:5000";
  }

  return "https://study-group-backend-d8fc93ae1b7a.herokuapp.com";
};

export const CONFIG = {
  // API base URLs (auto-detects dev vs production)
  apiBase: getApiBase(),
  backendBase: getBackendBase(),

  // ZegoCloud Configuration
  zegocloud: {
    domain: "zegocloud",
    apiEndpoint: getBackendBase() + "/api/zegocloud",
  },

  debug: !isDevelopment, // Disable debug logs in production
  defaultAvatar: "U",
  clientMaxFileSizeBytes: 10 * 1024 * 1024, // 10 MB
};
