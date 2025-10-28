// frontend/student/scripts/apiClient.js
// Lightweight fetch wrapper that attaches Firebase ID token and retries once on 401.
// Production-ready improvements:
// - Convenience helpers: fetchWithAuth, fetchJsonWithAuth, postJsonWithAuth
// - Request timeout via AbortController (default 30s)
// - Automatic retry on transient network failures with exponential backoff
// - Proper header merging (case-insensitive handling)
// - Consistent error shaping with status and parsed body when available
// - New: postFormWithAuth / putFormWithAuth to centralize authenticated FormData uploads
//
// Backwards-compatibility:
// - Exports authFetch and authFetchJson aliases so older modules that import those names keep working.
//
// Usage:
// import { fetchWithAuth, fetchJsonWithAuth, postJsonWithAuth, getIdToken, postFormWithAuth } from "./apiClient.js";
// or (backwards compat) import { authFetch } from "./apiClient.js";

import { auth } from "../config/firebase.js";
import { apiUrl } from "../config/appConfig.js";

/**
 * Wait until Firebase auth state resolves (currentUser may be null if signed out).
 */
async function waitForAuth() {
  return new Promise((resolve) => {
    const u = auth.currentUser;
    if (u) return resolve(u);
    const unsub = auth.onAuthStateChanged((user) => {
      unsub();
      resolve(user);
    });
  });
}

/**
 * Get the current ID token from Firebase. If forceRefresh is true, forces a refresh.
 * Throws if the user is not signed in.
 */
export async function getIdToken(forceRefresh = false) {
  await waitForAuth();
  if (!auth || !auth.currentUser) throw new Error("Not signed in");
  return auth.currentUser.getIdToken(forceRefresh);
}

/**
 * Merge headers in a case-insensitive way. Returns a new Headers object.
 */
function mergeHeaders(existing = {}, additions = {}) {
  const headers = new Headers();

  // normalize and set existing
  if (existing instanceof Headers) {
    existing.forEach((v, k) => headers.set(k, v));
  } else if (typeof existing === "object" && existing !== null) {
    Object.keys(existing).forEach((k) => {
      headers.set(k, existing[k]);
    });
  }

  // apply additions (override)
  if (additions instanceof Headers) {
    additions.forEach((v, k) => headers.set(k, v));
  } else if (typeof additions === "object" && additions !== null) {
    Object.keys(additions).forEach((k) => {
      headers.set(k, additions[k]);
    });
  }

  return headers;
}

/**
 * Parse a response body safely. Returns null for 204, tries JSON then text.
 */
async function parseResponseBody(res) {
  if (!res) return null;
  if (res.status === 204) return null;
  const txt = await res.text().catch(() => "");
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

/**
 * Helper to build a full URL from a path or pass-through a full URL.
 */
function resolveUrl(urlOrPath) {
  return urlOrPath && urlOrPath.startsWith("http")
    ? urlOrPath
    : apiUrl(urlOrPath);
}

/**
 * Default sleep for backoff
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Core fetch wrapper that:
 * - resolves URL via apiUrl
 * - adds Authorization header when available
 * - retries once on 401 by forcing token refresh
 * - supports timeout via AbortController
 * - retries on transient network errors (optional)
 *
 * options:
 * - timeout: milliseconds for request timeout (default 30000)
 * - retries: number of transient-network retries (default 2)
 */
export async function fetchWithAuth(urlOrPath, options = {}) {
  const url = resolveUrl(urlOrPath);
  const timeout = typeof options.timeout === "number" ? options.timeout : 30000;
  const retries = Number.isInteger(options.retries) ? options.retries : 2;
  const backoffBase = 250; // ms

  // copy options to avoid mutation
  const baseOptions = { ...options };
  // Remove our custom options so fetch doesn't choke
  delete baseOptions.timeout;
  delete baseOptions.retries;

  // ensure headers object normalized
  baseOptions.headers = baseOptions.headers || {};

  // Prepare attempt function
  async function attempt(forceRefresh = false) {
    // Build a fresh AbortController for each attempt
    const controller = new AbortController();
    const signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      // Get token if available. If not signed-in, getIdToken will throw.
      let token = null;
      try {
        token = await getIdToken(forceRefresh).catch(() => null);
      } catch {
        token = null;
      }

      // Merge headers (preserve existing headers in options)
      const merged = mergeHeaders(baseOptions.headers, {});
      if (token) merged.set("Authorization", "Bearer " + token);
      // If body exists and no content-type provided, default to JSON
      if (baseOptions.body && !merged.has("Content-Type")) {
        merged.set("Content-Type", "application/json");
      }

      const fetchOpts = {
        ...baseOptions,
        headers: merged,
        signal,
      };

      const res = await fetch(url, fetchOpts);
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      // normalize AbortError message
      if (err && err.name === "AbortError") {
        const e = new Error("Request timed out");
        e.name = "TimeoutError";
        throw e;
      }
      throw err;
    }
  }

  // Try initial attempt; on 401, retry once forcing token refresh.
  // Additionally, implement simple transient retries for network errors.
  let attemptNum = 0;
  let lastErr = null;
  while (attemptNum <= retries) {
    try {
      const forceRefresh = attemptNum === 1; // try a forced refresh on second attempt
      const res = await attempt(forceRefresh);

      // If 401 on first attempt, and attemptNum === 0, try once more with forceRefresh.
      if (res && res.status === 401 && attemptNum === 0) {
        attemptNum++;
        continue;
      }
      return res;
    } catch (err) {
      // network / timeout error
      lastErr = err;
      // retry only on network errors (TypeError from fetch in some browsers/node-fetch)
      const isNetwork =
        err.name === "TypeError" ||
        err.name === "TimeoutError" ||
        /network|failed/i.test(err.message || "");

      if (!isNetwork) throw err;

      // if we still have retries left, back off then retry
      attemptNum++;
      if (attemptNum > retries) break;
      const backoff = backoffBase * Math.pow(2, attemptNum - 1);
      await sleep(backoff);
    }
  }

  // if we reach here, throw lastErr
  throw lastErr || new Error("Network request failed");
}

/**
 * Convenience: perform fetchWithAuth and parse JSON response.
 * Throws an Error with { status, body } on non-2xx.
 */
export async function fetchJsonWithAuth(urlOrPath, options = {}) {
  const res = await fetchWithAuth(urlOrPath, options);
  const parsed = await parseResponseBody(res).catch(() => null);

  if (!res.ok) {
    const err = new Error(
      parsed && parsed.error
        ? parsed.error
        : `Request failed with status ${res.status}`
    );
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

/**
 * Convenience: POST JSON and parse JSON response.
 */
export async function postJsonWithAuth(urlOrPath, obj = {}, options = {}) {
  const opts = {
    method: "POST",
    body: JSON.stringify(obj),
    ...options,
  };
  return fetchJsonWithAuth(urlOrPath, opts);
}

/**
 * Convenience: PATCH JSON and parse JSON response.
 */
export async function patchJsonWithAuth(urlOrPath, obj = {}, options = {}) {
  const opts = {
    method: "PATCH",
    body: JSON.stringify(obj),
    ...options,
  };
  return fetchJsonWithAuth(urlOrPath, opts);
}

/**
 * Convenience: DELETE with auth. Returns parsed body or null.
 */
export async function deleteWithAuth(urlOrPath, options = {}) {
  const opts = {
    method: "DELETE",
    ...options,
  };
  const res = await fetchWithAuth(urlOrPath, opts);
  if (!res.ok) {
    const parsed = await parseResponseBody(res).catch(() => null);
    const err = new Error(
      parsed && parsed.error
        ? parsed.error
        : `Request failed with status ${res.status}`
    );
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parseResponseBody(res);
}

/*
 * Backwards-compatibility exports
 * Some older files import `authFetch` or `authFetchJson`. Provide those aliases so you don't need to change many files at once.
 */
export const authFetch = fetchWithAuth;
export const authFetchJson = fetchJsonWithAuth;

// Default export for simple imports
export default fetchWithAuth;

/* -------------------------
   FormData helpers
   -------------------------
   postFormWithAuth(url, formData, opts={timeoutMs:0})
   putFormWithAuth(url, formData, opts={timeoutMs:0})
   These helpers:
   - attach Authorization header if token available
   - do NOT set Content-Type (browser will set proper multipart boundary)
   - parse JSON response on success and throw helpful Error on non-2xx
*/
async function _fetchFormWithToken(
  urlOrPath,
  { method = "POST", formData, timeoutMs = 0 } = {}
) {
  if (!formData) throw new Error("_fetchFormWithToken: formData is required");
  const url = resolveUrl(urlOrPath);

  // Acquire token but don't throw if unavailable; let server handle auth requirement
  let token = null;
  try {
    token = await getIdToken().catch(() => null);
  } catch {
    token = null;
  }

  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;

  const controller = timeoutMs ? new AbortController() : null;
  if (controller) {
    setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, timeoutMs);
  }

  try {
    const res = await fetch(url, {
      method,
      headers, // do NOT set Content-Type when sending FormData
      body: formData,
      credentials: "same-origin",
      signal: controller ? controller.signal : undefined,
    });

    const parsed = await parseResponseBody(res).catch(() => null);
    if (!res.ok) {
      const msg =
        (parsed && (parsed.error || parsed.message)) ||
        res.statusText ||
        `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = parsed;
      throw err;
    }
    return parsed;
  } catch (err) {
    if (err && err.name === "AbortError") {
      const e = new Error("Request timed out");
      e.name = "TimeoutError";
      throw e;
    }
    throw err;
  }
}

export async function postFormWithAuth(urlOrPath, formData, opts = {}) {
  return _fetchFormWithToken(urlOrPath, {
    method: "POST",
    formData,
    timeoutMs: opts.timeoutMs || 0,
  });
}

export async function putFormWithAuth(urlOrPath, formData, opts = {}) {
  return _fetchFormWithToken(urlOrPath, {
    method: "PUT",
    formData,
    timeoutMs: opts.timeoutMs || 0,
  });
}
