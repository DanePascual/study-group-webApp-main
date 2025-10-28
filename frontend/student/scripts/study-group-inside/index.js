// Entry module - wires everything together
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

    userModule = new UserAuth();
    await userModule.init();

    roomModule = new RoomManager(userModule);
    await roomModule.loadRoomData();

    chatModule = new ChatManager(userModule, roomModule);
    videoModule = new VideoManager(userModule, roomModule);
    uiModule = new UiManager(userModule, roomModule);

    // attach to window for legacy HTML handlers and debugging
    window.userModule = userModule;
    window.roomModule = roomModule;
    window.chatModule = chatModule;
    window.videoModule = videoModule;
    // expose the UiManager instance so the bridge and console see the same instance
    window.uiModule = uiModule;
    window.UiManager = UiManager;
    window.closeToast = closeToast;

    // update UI
    userModule.updateSidebarUserInfo();
    await roomModule.updateRoomDisplay();
    roomModule.updateParticipantsList();

    // init modules
    chatModule.init();
    videoModule.init();
    uiModule.init();

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
      `Study room ready for ${
        userModule.currentUser.displayName
      } at ${new Date().toLocaleString()}`
    );
  } catch (err) {
    console.error("Error initializing app:", err);
    showToast(
      "Failed to initialize study room. Please try refreshing the page.",
      "error"
    );
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
