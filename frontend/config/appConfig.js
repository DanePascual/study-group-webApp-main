// frontend/config/appConfig.js
// Central configuration for frontend apps (API base and helpers).

// PRODUCTION HEROKU URL
//const DEFAULT_API_BASE ="https://study-group-backend-d8fc93ae1b7a.herokuapp.com";

// For local development (comment out to use production):
const DEFAULT_API_BASE = "http://localhost:5000";

// Force use DEFAULT_API_BASE for local development (ignore cached window.API_BASE)
export const API_BASE = DEFAULT_API_BASE;

// Admin API uses same base as student API
export const ADMIN_API_BASE = API_BASE;

// Institutional email domain used across the client
export const INSTITUTION_EMAIL_DOMAIN = "paterostechnologicalcollege.edu.ph";

export function isInstitutionEmail(email) {
  if (typeof email !== "string") return false;
  const domain = INSTITUTION_EMAIL_DOMAIN.replace(
    /[-/\\^$*+?.()|[\]{}]/g,
    "\\$&"
  );
  const re = new RegExp(`^[^\\s@]+@${domain}$`);
  return re.test(email.trim());
}

export function apiUrl(path = "") {
  if (!path) return API_BASE;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return API_BASE.replace(/\/+$/, "") + normalized;
}

// NEW: Admin API URL helper
export function adminApiUrl(path = "") {
  if (!path) return ADMIN_API_BASE;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return ADMIN_API_BASE.replace(/\/+$/, "") + normalized;
}

// Make available globally for backward compatibility (if needed)
if (typeof window !== "undefined") {
  window.API_BASE = API_BASE;
  window.ADMIN_API_BASE = ADMIN_API_BASE;
  window.apiUrl = apiUrl;
  window.adminApiUrl = adminApiUrl;
  window.INSTITUTION_EMAIL_DOMAIN = INSTITUTION_EMAIL_DOMAIN;
  window.isInstitutionEmail = isInstitutionEmail;
}
