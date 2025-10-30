// Entry module - wires everything together
// ✅ FIXED: Uses URL paths (/profile/uid) for user profile navigation
import { CONFIG } from "./config.js";
import { db, auth } from "./firebase-init.js";
import { UserAuth } from "./user-auth.js";
import { RoomManager } from "./room-manager.js";
import { ChatManager } from "./chat-manager.js";
import { VideoManager } from "./video-manager.js";
import { UiManager } from "./ui-manager.js";
import { showToast, closeToast } from "./utils.js";

// expose CONFIG to code expecting global window.__CONFIG__
window.__CONFIG__ = {
  ...CONFIG,
  clientMaxFileSizeBytes: CONFIG.clientMaxFileSizeBytes || 10 * 1024 * 1024,
};

// module level instances
let userModule, roomModule, chatModule, videoModule, uiModule;

// ✅ FIXED: Navigate to user profile using URL path (/profile/uid)
window.viewUserProfile = function (uid) {
  if (!uid) {
    console.warn("[index.js] No UID provided to viewUserProfile");
    return;
  }
  console.log(`[index.js] Navigating to profile of user: ${uid}`);
  // ✅ Uses URL path format: /profile/{uid}
  window.location.href = `/profile/${encodeURIComponent(uid)}`;
};

async function initializeApp() {
  try {
    // small compatibility: ensure firebase global exists
    if (typeof firebase === "undefined") {
      console.error(
        "Firebase compat SDK not loaded before module. Include firebase-app-compat, firebase-auth-compat and firebase-firestore-compat script tags before this module."
      );
      return;
    }

    showPageLoading();

    console.log("[index.js] Starting initialization...");

    userModule = new UserAuth();
    console.log("[index.js] UserAuth created");

    await userModule.init();
    console.log(
      "[index.js] UserAuth initialized, user:",
      userModule.currentUser?.displayName
    );

    roomModule = new RoomManager(userModule);
    console.log("[index.js] RoomManager created");

    await roomModule.loadRoomData();
    console.log(
      "[index.js] RoomData loaded:",
      roomModule.currentRoomData?.name
    );

    chatModule = new ChatManager(userModule, roomModule);
    console.log("[index.js] ChatManager created");

    videoModule = new VideoManager(userModule, roomModule);
    console.log("[index.js] VideoManager created");

    uiModule = new UiManager(userModule, roomModule);
    console.log("[index.js] UiManager created");

    // attach to window for legacy HTML handlers and debugging
    window.userModule = userModule;
    window.roomModule = roomModule;
    window.chatModule = chatModule;
    window.videoModule = videoModule;
    // expose the UiManager instance so the bridge and console see the same instance
    window.uiModule = uiModule;
    window.UiManager = UiManager;
    window.closeToast = closeToast;

    console.log("[index.js] All modules attached to window");

    // update UI
    userModule.updateSidebarUserInfo();
    console.log("[index.js] Sidebar user info updated");

    await roomModule.updateRoomDisplay();
    console.log("[index.js] Room display updated");

    roomModule.updateParticipantsList();
    console.log("[index.js] Participants list updated");

    // init modules
    chatModule.init();
    console.log("[index.js] ChatManager initialized");

    videoModule.init();
    console.log("[index.js] VideoManager initialized");

    uiModule.init();
    console.log("[index.js] UiManager initialized");

    setTimeout(() => {
      showToast(
        `Welcome to ${roomModule.currentRoomData?.name || "the study room"}!`,
        "success"
      );
      if (
        roomModule.isOwner &&
        !chatModule.messages.some(
          (m) =>
            m.isSystem &&
            m.text === `Room created by ${userModule.currentUser.displayName}`
        )
      ) {
        chatModule.sendSystemMessage(
          `Room created by ${userModule.currentUser.displayName}`
        );
      }
      if (
        roomModule.isOwner &&
        !chatModule.messages.some(
          (m) =>
            m.isSystem &&
            m.text ===
              "Click the camera button to start a video call. Double-click the video header for fullscreen mode."
        )
      ) {
        chatModule.sendSystemMessage(
          "Click the camera button to start a video call. Double-click the video header for fullscreen mode."
        );
      }
    }, 800);

    console.log(
      `[index.js] ✅ Study room ready for ${
        userModule.currentUser.displayName
      } at ${new Date().toLocaleString()}`
    );
  } catch (err) {
    console.error("[index.js] ❌ Error initializing app:", err);
    console.error("[index.js] Error stack:", err && err.stack);
    showToast(
      "Failed to initialize study room. Please try refreshing the page.",
      "error"
    );
    // ✅ ADDED: Retry after 2 seconds
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  } finally {
    hidePageLoading();
  }
}

/* small helpers referenced above but implemented here to avoid circular imports */
function showPageLoading() {
  let loadingOverlay = document.getElementById("pageLoadingOverlay");
  if (!loadingOverlay) {
    loadingOverlay = document.createElement("div");
    loadingOverlay.id = "pageLoadingOverlay";
    loadingOverlay.className = "loading-overlay";
    loadingOverlay.innerHTML = `<div class="loading-content"><div class="spinner-grow text-success"></div><p>Loading study room...</p></div>`;
    document.body.appendChild(loadingOverlay);
  }
  loadingOverlay.style.display = "flex";
}
function hidePageLoading() {
  const loadingOverlay = document.getElementById("pageLoadingOverlay");
  if (loadingOverlay) {
    loadingOverlay.classList.add("fade-out");
    setTimeout(() => {
      loadingOverlay.style.display = "none";
      loadingOverlay.classList.remove("fade-out");
    }, 300);
  }
}

/* start */
document.addEventListener("DOMContentLoaded", () => initializeApp());

/* cleanup on page exit */
window.addEventListener("beforeunload", () => {
  try {
    if (chatModule && typeof chatModule.unsubscribeMessages === "function") {
      chatModule.unsubscribeMessages();
    }
  } catch (e) {
    console.warn("Error unsubscribing chat messages:", e);
  }

  try {
    if (uiModule && typeof uiModule.cleanup === "function") {
      uiModule.cleanup();
    }
  } catch (e) {
    console.warn("Error during UI cleanup:", e);
  }

  try {
    // If a video call is active, attempt clean shutdown of the Jitsi instance
    if (videoModule && videoModule.isInCall) {
      try {
        if (typeof videoModule.endVideoCall === "function") {
          videoModule.endVideoCall();
        }
      } catch (e) {
        console.warn("Error ending video call during unload:", e);
      }
      // Also update participant status on server if possible
      try {
        if (
          roomModule &&
          typeof roomModule.updateParticipantCallStatus === "function" &&
          userModule &&
          userModule.currentUser
        ) {
          roomModule.updateParticipantCallStatus(
            userModule.currentUser.uid,
            false
          );
        }
      } catch (e) {
        console.warn(
          "Error updating participant call status during unload:",
          e
        );
      }
    }
  } catch (e) {
    console.warn("Video cleanup during unload failed:", e);
  }
});
