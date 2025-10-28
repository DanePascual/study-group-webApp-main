// Shared utilities for StudyGroup (ES module) - updated upload and safeUrl validation
import { CONFIG } from "./config.js";
import { auth, db } from "./firebase-init.js";
import { postFormWithAuth } from "../apiClient.js";

/* Toast helpers (unchanged) */
export function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) return;
  const toastId = "toast-" + Date.now();
  const iconMap = {
    success: "bi-check-circle-fill",
    error: "bi-exclamation-circle-fill",
    info: "bi-info-circle-fill",
    warning: "bi-exclamation-triangle-fill",
  };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.id = toastId;
  toast.innerHTML = `
    <div class="toast-icon"><i class="bi ${
      iconMap[type] || iconMap.info
    }"></i></div>
    <div class="toast-content"><div class="toast-title">${
      type.charAt(0).toUpperCase() + type.slice(1)
    }</div><div class="toast-message">${escapeHtml(message)}</div></div>
    <div class="toast-close" onclick="window.closeToast('${toastId}')"><i class="bi bi-x"></i></div>`;
  toastContainer.appendChild(toast);
  if (type === "success" || type === "info")
    setTimeout(() => closeToast(toastId), 4000);
}

export function closeToast(toastId) {
  const toast = document.getElementById(toastId);
  if (!toast) return;
  toast.style.opacity = "0";
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 300);
}

export function escapeHtml(str) {
  if (!str && str !== 0) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " bytes";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export function getFileIcon(ext) {
  switch ((ext || "").toLowerCase()) {
    case "pdf":
      return "bi bi-file-earmark-pdf text-danger";
    case "doc":
    case "docx":
      return "bi bi-file-earmark-word text-primary";
    case "ppt":
    case "pptx":
      return "bi bi-file-earmark-slides text-warning";
    case "xls":
    case "xlsx":
      return "bi bi-file-earmark-spreadsheet text-success";
    default:
      return "bi bi-file-earmark text-secondary";
  }
}

/* Validate URL: allow only http(s) or data:image/* (if you accept data URLs).
   Return true if safe, false otherwise. */
export function isSafeUrl(url) {
  if (!url) return false;
  try {
    // allow relative paths also
    if (url.startsWith("/")) return true;
    const u = new URL(url, window.location.origin);
    if (u.protocol === "http:" || u.protocol === "https:") return true;
    // allow inline data images (optionally)
    if (u.protocol === "data:") {
      // only allow image/* data URIs
      return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(url);
    }
    return false;
  } catch (e) {
    return false;
  }
}

/* Upload helper: POST to backend which stores in Supabase and returns {url, filename}
   Uses centralized postFormWithAuth to attach token and apply timeouts/retries. */
export async function uploadFileToBackend(roomId, file) {
  if (!file) throw new Error("No file provided");
  if (!roomId) throw new Error("Missing roomId");
  if (file.size > CONFIG.clientMaxFileSizeBytes) {
    throw new Error(
      `File too large. Max allowed is ${CONFIG.clientMaxFileSizeBytes} bytes.`
    );
  }

  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("roomId", roomId);

  const uploadPath = `/api/uploads/room-file`;
  try {
    // uses apiClient.postFormWithAuth which attaches token safely and doesn't set Content-Type
    const res = await postFormWithAuth(uploadPath, fd, { timeoutMs: 60000 });
    // Validate returned URL
    if (res && res.url && !isSafeUrl(res.url)) {
      throw new Error("Upload returned an unsafe URL");
    }
    return res; // { url, filename }
  } catch (err) {
    // try to parse body message if available (apiClient will attach .body for non-2xx)
    throw err;
  }
}

export const DEFAULTS = {
  MAX_FILE_BYTES: CONFIG.clientMaxFileSizeBytes || 10 * 1024 * 1024,
};
