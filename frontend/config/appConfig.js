// frontend/config/appConfig.js
// Central configuration for frontend apps (API base and helpers).

// PRODUCTION HEROKU URL
const DEFAULT_API_BASE ="https://study-group-backend-d8fc93ae1b7a.herokuapp.com";

// For local development (comment out to use production):
// const DEFAULT_API_BASE = "http://localhost:5000";

export const API_BASE =
  (typeof window !== "undefined" && window.API_BASE) || DEFAULT_API_BASE;

export function apiUrl(path = "") {
  if (!path) return API_BASE;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return API_BASE.replace(/\/+$/, "") + normalized;
}
