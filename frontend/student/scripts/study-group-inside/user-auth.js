// UserAuth class (ES module) with in-memory + localStorage TTL caching and dev read counter
// ✅ FIXED: Improved display name priority order
// URL (example permalink): https://github.com/DanePascual/study-group-webApp/blob/main/frontend/student/scripts/study-group-inside/user-auth.js

import { db, auth } from "./firebase-init.js";

export class UserAuth {
  constructor() {
    this.currentUser = null;
    this.isLoading = true;

    // in-memory cache: Map<uid, { info: {...}, ts: number }>
    this.userCache = new Map();

    // Cache TTL in ms (5 minutes)
    this.cacheTTL = 5 * 60 * 1000;

    // localStorage key for persistent cache
    this.localStorageKey = "__sg_user_display_cache_v1";

    // maximum entries to keep in localStorage (simple pruning)
    this.maxLocalEntries = 1000;

    // dev-only Firestore read counter for verification
    if (typeof window !== "undefined") {
      window.__firestoreUserDocReadCount =
        window.__firestoreUserDocReadCount || 0;
    }

    // load persisted entries into memory
    this._loadLocalCache();
  }

  async init() {
    return new Promise((resolve, reject) => {
      console.log("[UserAuth] Initializing auth...");
      auth.onAuthStateChanged(async (user) => {
        if (user) {
          try {
            await this.setCurrentUser(user);
            this.isLoading = false;
            resolve(this.currentUser);
          } catch (err) {
            console.error("[UserAuth] Error setting current user", err);
            this.isLoading = false;
            reject(err);
          }
        } else {
          // redirect to login (dynamic)
          const currentPath = window.location.pathname;
          const pathParts = currentPath.split("/");
          const loginPath =
            pathParts.slice(0, pathParts.length - 1).join("/") + "/login.html";
          window.location.href = window.location.origin + loginPath;
          reject(new Error("Not authenticated"));
        }
      });
    });
  }

  async setCurrentUser(user) {
    this.currentUser = {
      uid: user.uid,
      displayName: user.displayName || user.email?.split("@")[0] || "User",
      email: user.email,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
    };

    try {
      // small Firestore read to enrich current user (counts toward read counter)
      const userDoc = await db.collection("users").doc(user.uid).get();
      if (userDoc.exists) {
        const data = userDoc.data();
        this.currentUser = {
          ...this.currentUser,
          program: data.program || "",
          name: data.name || this.currentUser.displayName,
          avatar:
            data.avatar ||
            (this.currentUser.displayName || "U").substring(0, 1).toUpperCase(),
          photo: data.photo || this.currentUser.photoURL || null,
        };
      }
    } catch (err) {
      console.warn("[UserAuth] Could not fetch extra user data:", err);
    }

    const displayInfo = {
      displayName: this.currentUser.name || this.currentUser.displayName,
      avatar:
        this.currentUser.avatar ||
        (this.currentUser.displayName || "U").substring(0, 1).toUpperCase(),
      email: this.currentUser.email,
      photo: this.currentUser.photo || this.currentUser.photoURL || null,
    };

    // cache current user (memory + localStorage)
    this._cacheUser(this.currentUser.uid, displayInfo);

    return this.currentUser;
  }

  // Internal cache helpers
  _cacheUser(uid, info) {
    if (!uid || !info) return;
    const now = Date.now();
    this.userCache.set(uid, { info, ts: now });

    // persist to localStorage
    try {
      const raw = localStorage.getItem(this.localStorageKey);
      const store = raw ? JSON.parse(raw) : {};
      store[uid] = { info, ts: now };
      // simple pruning to avoid huge localStorage usage
      const keys = Object.keys(store);
      if (keys.length > this.maxLocalEntries) {
        // remove oldest entries
        const sorted = keys
          .map((k) => ({ k, ts: store[k]?.ts || 0 }))
          .sort((a, b) => a.ts - b.ts);
        const toRemove = sorted.slice(
          0,
          keys.length - this.maxLocalEntries + 10
        );
        toRemove.forEach((r) => delete store[r.k]);
      }
      localStorage.setItem(this.localStorageKey, JSON.stringify(store));
    } catch (e) {
      // ignore localStorage errors (quota / private mode)
      // keep in-memory cache only
    }

    // Also keep a global window cache for compatibility with other parts of the app
    if (typeof window !== "undefined") {
      window.__userDisplayCache = window.__userDisplayCache || {};
      window.__userDisplayCache[uid] = { ...info, __cachedAt: now };
    }
  }

  _getFromCache(uid) {
    if (!uid) return null;

    // check in-memory first
    const entry = this.userCache.get(uid);
    if (entry && Date.now() - entry.ts <= this.cacheTTL) {
      return entry.info;
    }
    if (entry) {
      // expired in-memory entry
      this.userCache.delete(uid);
    }

    // fallback: check localStorage persistent cache
    try {
      const raw = localStorage.getItem(this.localStorageKey);
      if (raw) {
        const store = JSON.parse(raw);
        const e = store && store[uid];
        if (e && Date.now() - e.ts <= this.cacheTTL) {
          // seed in-memory cache for faster repeated access
          this.userCache.set(uid, { info: e.info, ts: e.ts });
          return e.info;
        } else if (e) {
          // expired in localStorage; remove it lazily
          delete store[uid];
          localStorage.setItem(this.localStorageKey, JSON.stringify(store));
        }
      }
    } catch (err) {
      // ignore localStorage parse errors
    }

    return null;
  }

  // ✅ FIXED: Get single user display info with improved priority
  async getUserDisplayInfo(uid) {
    if (!uid)
      return {
        displayName: "Unknown",
        avatar: "U",
        email: null,
        photo: null,
      };

    // cache hit
    const cached = this._getFromCache(uid);
    if (cached) {
      console.log(`[UserAuth] Cache HIT for ${uid}:`, cached.displayName);
      return cached;
    }

    console.log(`[UserAuth] Cache MISS for ${uid}, fetching...`);

    // If it's the current user, return currentUser info and cache it
    if (this.currentUser && uid === this.currentUser.uid) {
      const info = {
        displayName: this.currentUser.name || this.currentUser.displayName,
        avatar:
          this.currentUser.avatar ||
          (this.currentUser.displayName || "U").substring(0, 1).toUpperCase(),
        email: this.currentUser.email,
        photo: this.currentUser.photo || this.currentUser.photoURL || null,
      };
      this._cacheUser(uid, info);
      return info;
    }

    // Try to read from Firestore users collection (increment dev read counter)
    try {
      if (typeof window !== "undefined") {
        window.__firestoreUserDocReadCount =
          (window.__firestoreUserDocReadCount || 0) + 1;
      }
      const doc = await db.collection("users").doc(uid).get();
      if (doc.exists) {
        const data = doc.data();

        // ✅ FIXED: Priority order for display name
        // 1. data.name (full name from profile)
        // 2. data.displayName (Firebase Auth display name)
        // 3. data.email split by @ (email prefix)
        // 4. uid.substring(0, 8) (last resort - UID prefix)
        const displayName =
          data.name ||
          data.displayName ||
          (data.email ? data.email.split("@")[0] : uid.substring(0, 8));

        const info = {
          displayName: displayName,
          avatar:
            data.avatar ||
            (displayName ? displayName.substring(0, 1).toUpperCase() : "U"),
          email: data.email,
          photo: data.photo || null,
        };

        console.log(`[UserAuth] Fetched ${uid} from Firestore:`, displayName);
        this._cacheUser(uid, info);
        return info;
      }
    } catch (err) {
      console.error(`[UserAuth] Error fetching user doc for ${uid}:`, err);
    }

    // fallback
    const fallback = {
      displayName: uid.substring(0, 8),
      avatar: "U",
      email: null,
      photo: null,
    };
    console.log(
      `[UserAuth] No Firestore doc for ${uid}, using fallback:`,
      fallback.displayName
    );
    this._cacheUser(uid, fallback);
    return fallback;
  }

  // ✅ FIXED: Batch fetch many user display infos with improved priority
  // Input: array of uids (may contain duplicates)
  // Output: object mapping uid => displayInfo
  async getUserDisplayInfos(uids = []) {
    const result = {};
    if (!Array.isArray(uids) || uids.length === 0) return result;

    // dedupe
    const unique = Array.from(new Set(uids.filter(Boolean)));
    console.log(`[UserAuth] Batch fetching ${unique.length} unique users`);

    // check cache first
    const missing = [];
    for (const uid of unique) {
      const c = this._getFromCache(uid);
      if (c) {
        result[uid] = c;
        console.log(`[UserAuth] Batch cache HIT: ${uid} = ${c.displayName}`);
      } else {
        missing.push(uid);
      }
    }

    if (missing.length === 0) {
      console.log("[UserAuth] All users found in cache");
      return result;
    }

    console.log(`[UserAuth] ${missing.length} users missing from cache`);

    // For current user, ensure cached first
    const stillMissing = [];
    for (const uid of missing) {
      if (this.currentUser && uid === this.currentUser.uid) {
        const info = {
          displayName: this.currentUser.name || this.currentUser.displayName,
          avatar:
            this.currentUser.avatar ||
            (this.currentUser.displayName || "U").substring(0, 1).toUpperCase(),
          email: this.currentUser.email,
          photo: this.currentUser.photo || this.currentUser.photoURL || null,
        };
        result[uid] = info;
        this._cacheUser(uid, info);
        console.log(
          `[UserAuth] Added current user to result: ${uid} = ${info.displayName}`
        );
      } else {
        stillMissing.push(uid);
      }
    }

    // Batch fetch remaining missing uids in parallel (Promise.all)
    if (stillMissing.length > 0) {
      console.log(
        `[UserAuth] Batch fetching ${stillMissing.length} users from Firestore`
      );
      try {
        // increment dev counter by number of docs we'll read (approx)
        if (typeof window !== "undefined") {
          window.__firestoreUserDocReadCount =
            (window.__firestoreUserDocReadCount || 0) + stillMissing.length;
        }
        const promises = stillMissing.map((uid) =>
          db
            .collection("users")
            .doc(uid)
            .get()
            .then((doc) => ({ uid, doc }))
        );
        const docs = await Promise.all(promises);

        for (const { uid, doc } of docs) {
          if (doc && doc.exists) {
            const data = doc.data();

            // ✅ FIXED: Same priority order
            // 1. data.name
            // 2. data.displayName
            // 3. email prefix
            // 4. UID prefix
            const displayName =
              data.name ||
              data.displayName ||
              (data.email ? data.email.split("@")[0] : uid.substring(0, 8));

            const info = {
              displayName: displayName,
              avatar:
                data.avatar ||
                (displayName ? displayName.substring(0, 1).toUpperCase() : "U"),
              email: data.email,
              photo: data.photo || null,
            };
            result[uid] = info;
            this._cacheUser(uid, info);
            console.log(
              `[UserAuth] Batch fetched from Firestore: ${uid} = ${displayName}`
            );
          } else {
            // ✅ NO FIRESTORE DOC - fallback to UID prefix
            const fallback = {
              displayName: uid.substring(0, 8),
              avatar: "U",
              email: null,
              photo: null,
            };
            result[uid] = fallback;
            this._cacheUser(uid, fallback);
            console.log(
              `[UserAuth] No Firestore doc, using fallback: ${uid} = ${fallback.displayName}`
            );
          }
        }
      } catch (err) {
        console.error("[UserAuth] Error batch fetching user docs:", err);
        // fill missing with fallbacks to avoid breaking callers
        for (const uid of stillMissing) {
          if (!result[uid]) {
            const fallback = {
              displayName: uid.substring(0, 8),
              avatar: "U",
              email: null,
              photo: null,
            };
            result[uid] = fallback;
            this._cacheUser(uid, fallback);
            console.log(
              `[UserAuth] Error fallback: ${uid} = ${fallback.displayName}`
            );
          }
        }
      }
    }

    console.log(
      `[UserAuth] Batch complete. Results:`,
      Object.entries(result).map(
        (e) => `${e[0].substring(0, 8)}=${e[1].displayName}`
      )
    );

    return result;
  }

  // Load persisted cache from localStorage into memory (prune expired)
  _loadLocalCache() {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(this.localStorageKey);
      if (!raw) return;
      const store = JSON.parse(raw);
      const now = Date.now();
      let changed = false;
      for (const uid of Object.keys(store)) {
        const e = store[uid];
        if (!e || !e.ts || !e.info) {
          delete store[uid];
          changed = true;
          continue;
        }
        if (now - e.ts > this.cacheTTL) {
          // expired - remove from store
          delete store[uid];
          changed = true;
          continue;
        }
        // seed in-memory cache
        this.userCache.set(uid, { info: e.info, ts: e.ts });
      }
      if (changed) {
        try {
          localStorage.setItem(this.localStorageKey, JSON.stringify(store));
        } catch (e) {
          // ignore
        }
      }
      console.log(
        `[UserAuth] Loaded ${this.userCache.size} users from localStorage cache`
      );
    } catch (err) {
      // ignore parse errors
    }
  }

  // Optional: clear persisted local cache (useful for debugging)
  clearLocalCache() {
    try {
      localStorage.removeItem(this.localStorageKey);
    } catch (e) {}
    this.userCache.clear();
    if (typeof window !== "undefined" && window.__userDisplayCache) {
      window.__userDisplayCache = {};
    }
    console.log("[UserAuth] Local cache cleared");
  }

  async logout() {
    try {
      await auth.signOut();
      const currentPath = window.location.pathname;
      const pathParts = currentPath.split("/");
      const loginPath =
        pathParts.slice(0, pathParts.length - 1).join("/") + "/login.html";
      window.location.href = window.location.origin + loginPath;
    } catch (err) {
      console.error("[UserAuth] Logout failed:", err);
      if (typeof window !== "undefined") {
        const showToast = window.showToast || (() => {});
        showToast("Error signing out. Please try again.", "error");
      }
    }
  }

  updateSidebarUserInfo() {
    try {
      const avatar = document.getElementById("sidebarAvatar");
      const name = document.getElementById("sidebarName");
      const course = document.getElementById("sidebarCourse");

      const currentName = name ? name.textContent.trim() : "";
      const nameIsDefault =
        !currentName ||
        currentName === "" ||
        currentName === "Loading..." ||
        currentName === "Not signed in";
      if (name && nameIsDefault && this.currentUser?.name) {
        name.textContent = this.currentUser.name;
      }

      const currentCourse = course ? course.textContent.trim() : "";
      const courseIsDefault =
        !currentCourse ||
        currentCourse === "" ||
        currentCourse === "Loading...";
      if (course && courseIsDefault) {
        course.textContent = this.currentUser.program || "";
      }

      if (avatar) {
        if (this.currentUser.photoURL) {
          avatar.style.backgroundImage = `url('${this.currentUser.photoURL}')`;
          avatar.style.backgroundSize = "cover";
          avatar.style.backgroundPosition = "center";
          avatar.textContent = "";
        } else if (this.currentUser.photo) {
          avatar.style.backgroundImage = `url('${this.currentUser.photo}')`;
          avatar.style.backgroundSize = "cover";
          avatar.style.backgroundPosition = "center";
          avatar.textContent = "";
        } else {
          const hasImg = avatar.querySelector && avatar.querySelector("img");
          if (!hasImg) {
            const currentAvatarText = avatar.textContent
              ? avatar.textContent.trim()
              : "";
            if (!currentAvatarText || currentAvatarText === "") {
              avatar.style.backgroundImage = "";
              const initial =
                this.currentUser.avatar ||
                (this.currentUser.displayName || "U")
                  .substring(0, 1)
                  .toUpperCase();
              avatar.textContent = initial;
            }
          }
        }
      }
    } catch (err) {
      console.warn(
        "[UserAuth] updateSidebarUserInfo failed:",
        err && err.message
      );
    }
  }
}
