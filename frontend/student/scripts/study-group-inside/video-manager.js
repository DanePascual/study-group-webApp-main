// VideoManager (ES module) - ZegoCloud Integration
// Handles video call setup using ZegoCloud UI Kit

import { showToast } from "./utils.js";
import { CONFIG } from "./config.js";
import { postJsonWithAuth } from "../apiClient.js";

export class VideoManager {
  constructor(userAuth, roomManager) {
    this.userAuth = userAuth;
    this.roomManager = roomManager;

    // Video state
    this.isInCall = false;
    this.videoMaximized = false;
    this.videoMinimized = false;
    this.zegoInstance = null;
    this.videoContainer = null;

    // Room data
    this.roomID = null;
    this.roomName = null;
  }

  init() {
    this.setupEventListeners();
    this.loadZegoCloudScript();
    console.log("[VideoManager] Initialized");
  }

  setupEventListeners() {
    const videoCallBtn = document.getElementById("videoCallBtn");
    const leaveCallBtn = document.getElementById("leaveCallBtn");
    const minimizeBtn = document.getElementById("minimizeBtn");
    const maximizeBtn = document.getElementById("maximizeBtn");
    const closeVideoBtn = document.getElementById("closeVideoBtn");

    videoCallBtn?.addEventListener("click", () => this.toggleVideoCall());
    leaveCallBtn?.addEventListener("click", () => this.endVideoCall());
    minimizeBtn?.addEventListener("click", () => this.minimizeVideo());
    maximizeBtn?.addEventListener("click", () => this.maximizeVideo());
    closeVideoBtn?.addEventListener("click", () => this.closeVideo());

    // Expose to window for debugging
    window.videoManager = this;
  }

  loadZegoCloudScript() {
    // Load ZegoCloud UI Kit library
    if (document.getElementById("zegocloud-script")) {
      console.log("[VideoManager] ZegoCloud script already loaded");
      return;
    }

    const script = document.createElement("script");
    script.id = "zegocloud-script";
    script.src =
      "https://unpkg.com/@zegocloud/zego-uikit-prebuilt/zego-uikit-prebuilt.js";
    script.async = true;
    script.onload = () => {
      console.log("[VideoManager] ZegoCloud Meet script loaded");
    };
    script.onerror = () => {
      console.error("[VideoManager] Failed to load ZegoCloud script");
      showToast(
        "Failed to load video library. Please refresh the page.",
        "error"
      );
    };
    document.head.appendChild(script);
  }

  async toggleVideoCall() {
    if (this.isInCall) {
      this.endVideoCall();
    } else {
      this.startVideoCall();
    }
  }

  async startVideoCall() {
    try {
      if (this.isInCall) {
        showToast("Video call already active", "info");
        return;
      }

      if (!window.ZegoUIKitPrebuilt) {
        showToast(
          "ZegoCloud library not loaded. Please wait a moment and try again.",
          "error"
        );
        return;
      }

      showToast("Starting video call...", "info");

      // ===== Get room info =====
      this.roomID =
        this.roomManager.currentRoomData?._id ||
        this.roomManager.currentRoomData?.id;
      this.roomName = this.roomManager.currentRoomData?.name;

      if (!this.roomID || !this.roomName) {
        showToast("Room information not available", "error");
        return;
      }

      // ===== Get token from backend =====
      let tokenData;
      try {
        console.log(
          "[VideoManager] Requesting ZegoCloud token for room:",
          this.roomName
        );

        const data = await postJsonWithAuth("/api/zegocloud", {
          roomID: this.roomID,
        });

        console.log("[VideoManager] ZegoCloud token response:", data);

        if (!data || !data.appID) {
          throw new Error(data?.error || "No token data in response");
        }

        tokenData = data;
        console.log("[VideoManager] ZegoCloud token obtained successfully");
      } catch (err) {
        console.error("[VideoManager] Failed to get ZegoCloud token:", err);
        showToast(`Failed to start video call: ${err.message}`, "error");
        return;
      }

      // ===== Setup video container =====
      const videoContainer = document.getElementById("videoContainer");
      if (!videoContainer) {
        showToast("Video container not found in DOM", "error");
        return;
      }

      // Create or clear the video grid
      let videoGrid = document.getElementById("videoGrid");
      if (!videoGrid) {
        videoGrid = document.createElement("div");
        videoGrid.id = "videoGrid";
        videoGrid.className = "video-grid";
        const videoBody = videoContainer.querySelector(".video-body");
        if (videoBody) {
          videoBody.appendChild(videoGrid);
        }
      }
      videoGrid.innerHTML = "";
      videoGrid.style.display = "block";

      // Hide placeholder
      const placeholder = document.getElementById("videoPlaceholder");
      if (placeholder) {
        placeholder.style.display = "none";
      }

      // ===== Initialize ZegoCloud =====
      try {
        console.log(
          "[VideoManager] Creating ZegoCloud instance for room:",
          this.roomID
        );

        // Generate kit token using ZegoCloud method
        const kitToken = window.ZegoUIKitPrebuilt.generateKitTokenForTest(
          tokenData.appID,
          tokenData.serverSecret,
          tokenData.roomID,
          tokenData.userID,
          tokenData.userName
        );

        // Create ZegoCloud instance
        this.zegoInstance = window.ZegoUIKitPrebuilt.create(kitToken);

        // Join room with configuration
        this.zegoInstance.joinRoom({
          container: videoGrid,
          sharedLinks: [
            {
              name: "Personal link",
              url:
                window.location.protocol +
                "//" +
                window.location.host +
                window.location.pathname +
                "?roomID=" +
                tokenData.roomID,
            },
          ],
          scenario: {
            mode: window.ZegoUIKitPrebuilt.VideoConference,
          },
          turnOnMicrophoneWhenJoining: true,
          turnOnCameraWhenJoining: false, // Microphone-only setup
          showMyCameraToggleButton: true,
          showMyMicrophoneToggleButton: true,
          showAudioVideoSettingsButton: true,
          showScreenSharingButton: true,
          showTextChat: false, // Use your own chat
          showUserList: true,
          maxUsers: 100,
          layout: "Auto",
          showLayoutButton: true,
          onJoinRoom: () => {
            console.log("[VideoManager] Joined video conference");
            this.isInCall = true;
            this.updateVideoUI();
            this.roomManager.updateParticipantCallStatus(
              this.userAuth.currentUser.uid,
              true
            );
            showToast("Connected to video call", "success");
          },
          onLeaveRoom: () => {
            console.log("[VideoManager] Left video conference");
            this.isInCall = false;
            this.updateVideoUI();
            this.roomManager.updateParticipantCallStatus(
              this.userAuth.currentUser.uid,
              false
            );
          },
        });
      } catch (err) {
        console.error("[VideoManager] Failed to initialize ZegoCloud:", err);
        showToast("Failed to start video conference", "error");
        return;
      }

      // Show video container
      videoContainer.classList.add("active");
      this.updateVideoUI();
    } catch (err) {
      console.error("[VideoManager] Error starting video call:", err);
      showToast(`Error starting video call: ${err.message}`, "error");
    }
  }

  endVideoCall() {
    try {
      if (this.zegoInstance) {
        this.zegoInstance.destroy();
        this.zegoInstance = null;
      }

      this.isInCall = false;
      this.videoMaximized = false;
      this.videoMinimized = false;

      const videoContainer = document.getElementById("videoContainer");
      if (videoContainer) {
        videoContainer.classList.remove("active", "maximized", "minimized");
      }

      const placeholder = document.getElementById("videoPlaceholder");
      if (placeholder) {
        placeholder.style.display = "flex";
      }

      const videoGrid = document.getElementById("videoGrid");
      if (videoGrid) {
        videoGrid.style.display = "none";
      }

      this.updateVideoUI();
      this.roomManager.updateParticipantCallStatus(
        this.userAuth.currentUser.uid,
        false
      );

      showToast("Video call ended", "info");
    } catch (err) {
      console.error("[VideoManager] Error ending video call:", err);
      showToast("Error ending video call", "error");
    }
  }

  minimizeVideo() {
    const videoContainer = document.getElementById("videoContainer");
    if (videoContainer) {
      videoContainer.classList.add("minimized");
      videoContainer.classList.remove("maximized");
      this.videoMinimized = true;
      this.videoMaximized = false;
    }
  }

  maximizeVideo() {
    const videoContainer = document.getElementById("videoContainer");
    if (videoContainer) {
      videoContainer.classList.add("maximized");
      videoContainer.classList.remove("minimized");
      this.videoMaximized = true;
      this.videoMinimized = false;
    }
  }

  closeVideo() {
    this.endVideoCall();
  }

  updateVideoUI() {
    const videoCallBtn = document.getElementById("videoCallBtn");
    const callIndicator = document.getElementById("callIndicator");

    if (this.isInCall) {
      videoCallBtn?.classList.add("active");
      if (callIndicator) callIndicator.style.display = "block";
    } else {
      videoCallBtn?.classList.remove("active");
      if (callIndicator) callIndicator.style.display = "none";
    }
  }
}
