// VideoManager (ES module) - Jitsi Meet Integration
// Handles video call setup, participant management, and meeting controls

import { showToast } from "./utils.js";
import { CONFIG } from "./config.js";
import { fetchJsonWithAuth } from "../apiClient.js";
import { apiUrl } from "../../config/appConfig.js";

export class VideoManager {
  constructor(userAuth, roomManager) {
    this.userAuth = userAuth;
    this.roomManager = roomManager;

    // Video state
    this.isInCall = false;
    this.videoMaximized = false;
    this.videoMinimized = false;
    this.jitsiApi = null;
    this.jitsiContainer = null;

    // Controls state
    this.micEnabled = true;
    this.cameraEnabled = true;
    this.screenShareActive = false;

    // Room data
    this.roomId = null;
    this.roomName = null;
  }

  init() {
    this.setupEventListeners();
    this.loadJitsiScript();
    console.log("[VideoManager] Initialized");
  }

  setupEventListeners() {
    const videoCallBtn = document.getElementById("videoCallBtn");
    const micBtn = document.getElementById("micBtn");
    const cameraBtn = document.getElementById("cameraBtn");
    const screenShareBtn = document.getElementById("screenShareBtn");
    const leaveCallBtn = document.getElementById("leaveCallBtn");
    const minimizeBtn = document.getElementById("minimizeBtn");
    const maximizeBtn = document.getElementById("maximizeBtn");
    const closeVideoBtn = document.getElementById("closeVideoBtn");

    videoCallBtn?.addEventListener("click", () => this.toggleVideoCall());
    micBtn?.addEventListener("click", () => this.toggleMicrophone());
    cameraBtn?.addEventListener("click", () => this.toggleCamera());
    screenShareBtn?.addEventListener("click", () => this.toggleScreenShare());
    leaveCallBtn?.addEventListener("click", () => this.endVideoCall());
    minimizeBtn?.addEventListener("click", () => this.minimizeVideo());
    maximizeBtn?.addEventListener("click", () => this.maximizeVideo());
    closeVideoBtn?.addEventListener("click", () => this.closeVideo());

    // Double-click header to fullscreen
    const videoHeader = document.getElementById("videoHeader");
    videoHeader?.addEventListener("dblclick", () => this.maximizeVideo());

    // Expose to window for debugging
    window.videoManager = this;
  }

  loadJitsiScript() {
    // Load Jitsi Meet library
    if (document.getElementById("jitsi-script")) {
      console.log("[VideoManager] Jitsi script already loaded");
      return;
    }

    const script = document.createElement("script");
    script.id = "jitsi-script";
    script.src = "https://8x8.vc/external_api.js";
    script.async = true;
    script.onload = () => {
      console.log("[VideoManager] Jitsi Meet script loaded");
    };
    script.onerror = () => {
      console.error("[VideoManager] Failed to load Jitsi script");
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

      if (!window.JitsiMeetExternalAPI) {
        showToast(
          "Jitsi library not loaded. Please wait a moment and try again.",
          "error"
        );
        return;
      }

      showToast("Starting video call...", "info");

      // ===== Get room info =====
      this.roomId =
        this.roomManager.currentRoomData?._id ||
        this.roomManager.currentRoomData?.id;
      this.roomName = this.roomManager.currentRoomData?.name;

      if (!this.roomId || !this.roomName) {
        showToast("Room information not available", "error");
        return;
      }

      // ===== Get JWT token from backend using authFetch =====
      let token;
      let domain;
      try {
        const roomName =
          this.roomManager.currentRoomData?.name ||
          this.roomManager.currentRoomData?.title ||
          "study-room";

        console.log("[VideoManager] Requesting JWT token for room:", roomName);

        // ✅ Use fetchJsonWithAuth to include authentication automatically
        const data = await fetchJsonWithAuth("/api/jaas", {
          method: "POST",
          body: JSON.stringify({
            roomName: roomName,
          }),
        });

        if (!data || !data.token) {
          throw new Error(data?.error || "No token in response");
        }

        token = data.token;
        domain = data.domain || "8x8.vc";

        console.log("[VideoManager] JWT token obtained successfully");
      } catch (err) {
        console.error("[VideoManager] Failed to get JWT token:", err);
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

      // ===== Initialize Jitsi Meet =====
      const options = {
        roomName: roomName,
        jwt: token,
        width: "100%",
        height: "100%",
        parentNode: videoGrid,
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          disableDeepLinking: true,
          prejoinPageEnabled: false,
          enableInsecureRoomNameWarning: false,
          toolbarButtons: [
            "microphone",
            "camera",
            "desktop",
            "fullscreen",
            "fodeviceselection",
            "hangup",
            "profile",
            "settings",
            "raisehand",
            "chat",
            "participants-pane",
          ],
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
          DEFAULT_BACKGROUND: "#222222",
          MOBILE_APP_PROMO: false,
        },
        onload: () => {
          console.log("[VideoManager] Jitsi iframe loaded");
        },
      };

      try {
        this.jitsiApi = new window.JitsiMeetExternalAPI(domain, options);

        // ===== Setup event listeners =====
        this.jitsiApi.addEventListener("videoConferenceJoined", () => {
          console.log("[VideoManager] Joined video conference");
          this.isInCall = true;
          this.updateVideoUI();
          this.roomManager.updateParticipantCallStatus(
            this.userAuth.currentUser.uid,
            true
          );
          showToast("Connected to video call", "success");
        });

        this.jitsiApi.addEventListener("videoConferenceLeft", () => {
          console.log("[VideoManager] Left video conference");
          this.isInCall = false;
          this.updateVideoUI();
          this.roomManager.updateParticipantCallStatus(
            this.userAuth.currentUser.uid,
            false
          );
        });

        this.jitsiApi.addEventListener("participantJoined", (participant) => {
          console.log("[VideoManager] Participant joined:", participant.id);
          this.roomManager.updateParticipantCallStatus(participant.id, true);
        });

        this.jitsiApi.addEventListener("participantLeft", (participant) => {
          console.log("[VideoManager] Participant left:", participant.id);
          this.roomManager.updateParticipantCallStatus(participant.id, false);
        });

        this.jitsiApi.addEventListener("audioMuted", () => {
          this.micEnabled = false;
          this.updateControlButtons();
        });

        this.jitsiApi.addEventListener("audioUnmuted", () => {
          this.micEnabled = true;
          this.updateControlButtons();
        });

        this.jitsiApi.addEventListener("videoMuted", () => {
          this.cameraEnabled = false;
          this.updateControlButtons();
        });

        this.jitsiApi.addEventListener("videoUnmuted", () => {
          this.cameraEnabled = true;
          this.updateControlButtons();
        });

        this.jitsiApi.addEventListener(
          "screenSharingStatusChanged",
          (screen) => {
            this.screenShareActive = screen.on;
            this.updateControlButtons();
          }
        );
      } catch (err) {
        console.error("[VideoManager] Failed to initialize Jitsi:", err);
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
      if (this.jitsiApi) {
        this.jitsiApi.dispose();
        this.jitsiApi = null;
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

  toggleMicrophone() {
    if (this.jitsiApi) {
      try {
        this.jitsiApi.executeCommand("toggleAudio");
      } catch (err) {
        console.error("[VideoManager] Error toggling mic:", err);
      }
    }
  }

  toggleCamera() {
    if (this.jitsiApi) {
      try {
        this.jitsiApi.executeCommand("toggleVideo");
      } catch (err) {
        console.error("[VideoManager] Error toggling camera:", err);
      }
    }
  }

  toggleScreenShare() {
    if (this.jitsiApi) {
      try {
        this.jitsiApi.executeCommand("toggleShareScreen");
      } catch (err) {
        console.error("[VideoManager] Error toggling screen share:", err);
      }
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

    this.updateControlButtons();
  }

  updateControlButtons() {
    const micBtn = document.getElementById("micBtn");
    const cameraBtn = document.getElementById("cameraBtn");
    const screenShareBtn = document.getElementById("screenShareBtn");

    if (micBtn) {
      micBtn.classList.toggle("active", this.micEnabled);
    }
    if (cameraBtn) {
      cameraBtn.classList.toggle("active", this.cameraEnabled);
    }
    if (screenShareBtn) {
      screenShareBtn.classList.toggle("active", this.screenShareActive);
    }
  }
}
