// frontend/students/scripts/study-group-inside/video-manager.js
// CRITICAL FIX: Use normalized roomName from backend response, NOT from URL/database

export class VideoManager {
  constructor(userAuth, roomManager, opts = {}) {
    this.userAuth = userAuth;
    this.roomManager = roomManager;
    this.isInCall = false;
    this.isMuted = false;
    this.isCameraOff = false;
    this.isScreenSharing = false;
    this.videoMaximized = false;
    this.videoMinimized = false;
    this.jitsiApi = null;
    this.jitsiScriptLoaded = false;
    this.jitsiLoadPromise = null;
    this.jitsiLoadTimeout = opts.jitsiLoadTimeoutMs || 15000;
    this.jitsiDomainFallback = opts.jitsiDomainFallback || "8x8.vc";

    this.joinTimeoutMs = opts.joinTimeoutMs || 12000;
    this._joinTimeoutHandle = null;
  }

  init() {
    const videoCallBtn = document.getElementById("videoCallBtn");
    if (videoCallBtn) {
      videoCallBtn.addEventListener("click", () => {
        if (!this.isInCall) this.startVideoCall();
        else this.endVideoCall();
      });
    }

    document
      .getElementById("micBtn")
      ?.addEventListener("click", () => this.toggleMicrophone());
    document
      .getElementById("cameraBtn")
      ?.addEventListener("click", () => this.toggleCamera());
    document
      .getElementById("screenShareBtn")
      ?.addEventListener("click", () => this.toggleScreenShare());
    document
      .getElementById("leaveCallBtn")
      ?.addEventListener("click", () => this.endVideoCall());

    document
      .getElementById("minimizeBtn")
      ?.addEventListener("click", () => this.minimizeVideo());
    document
      .getElementById("maximizeBtn")
      ?.addEventListener("click", () => this.toggleMaximizeVideo());

    document
      .getElementById("videoHeader")
      ?.addEventListener("dblclick", () => this.toggleMaximizeVideo());
  }

  minimizeVideo() {
    const container = document.getElementById("videoContainer");
    if (!container) return;

    this.videoMinimized = true;
    this.videoMaximized = false;

    container.classList.remove("maximized");
    container.classList.add("minimized");

    console.debug("Video minimized");
  }

  toggleMaximizeVideo() {
    const container = document.getElementById("videoContainer");
    if (!container) return;

    if (this.videoMaximized) {
      this.videoMaximized = false;
      this.videoMinimized = false;
      container.classList.remove("maximized", "minimized");
      console.debug("Video returned to normal size");
    } else {
      this.videoMaximized = true;
      this.videoMinimized = false;
      container.classList.remove("minimized");
      container.classList.add("maximized");
      console.debug("Video maximized");
    }
  }

  _loadScript(url, timeoutMs = this.jitsiLoadTimeout) {
    if (this.jitsiScriptLoaded) return Promise.resolve();
    if (this.jitsiLoadPromise) return this.jitsiLoadPromise;

    this.jitsiLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      let called = false;

      const cleanup = () => {
        script.onload = null;
        script.onerror = null;
      };

      script.onload = () => {
        if (called) return;
        called = true;
        this.jitsiScriptLoaded = true;
        cleanup();
        if (typeof window.JitsiMeetExternalAPI !== "function") {
          return reject(
            new Error(
              "external_api.js loaded but JitsiMeetExternalAPI not available"
            )
          );
        }
        resolve();
      };

      script.onerror = (err) => {
        if (called) return;
        called = true;
        cleanup();
        reject(new Error("Failed to load external_api.js"));
      };

      document.head.appendChild(script);

      setTimeout(() => {
        if (called) return;
        called = true;
        cleanup();
        reject(new Error("Loading external_api.js timed out"));
      }, timeoutMs);
    });

    return this.jitsiLoadPromise;
  }

  async _tryLoadExternalApi(primaryUrl) {
    const candidates = [primaryUrl];

    try {
      const u = new URL(primaryUrl);
      const parts = u.pathname.split("/").filter(Boolean);
      if (
        parts.length >= 2 &&
        parts[parts.length - 1].toLowerCase() === "external_api.js"
      ) {
        const withoutKeyParts = parts.slice(0, parts.length - 1);
        if (withoutKeyParts.length >= 2) {
          const appOnlyParts = [withoutKeyParts[0]];
          const urlWithoutKey = `${u.protocol}//${u.host}/${appOnlyParts.join(
            "/"
          )}/external_api.js`;
          if (!candidates.includes(urlWithoutKey))
            candidates.push(urlWithoutKey);
        }
      }
      const rootUrl = `${u.protocol}//${u.host}/external_api.js`;
      if (!candidates.includes(rootUrl)) candidates.push(rootUrl);
    } catch (e) {}

    let lastErr = null;
    for (const c of candidates) {
      try {
        console.debug("Attempting to load external_api.js from:", c);
        this.jitsiScriptLoaded = false;
        this.jitsiLoadPromise = null;
        await this._loadScript(c);
        console.info("✅ Loaded external_api.js from:", c);
        return c;
      } catch (err) {
        lastErr = err;
        console.warn(
          "❌ Failed to load external_api.js from",
          c,
          err && err.message ? err.message : err
        );
      }
    }
    throw (
      lastErr || new Error("Failed to load external_api.js from candidates")
    );
  }

  _cleanJaasJwt(token) {
    if (!token || typeof token !== "string") return token;
    return token.trim();
  }

  async startVideoCall() {
    this.isInCall = true;
    const videoCallBtn = document.getElementById("videoCallBtn");
    const videoContainer = document.getElementById("videoContainer");
    const callIndicator = document.getElementById("callIndicator");
    const videoPlaceholder = document.getElementById("videoPlaceholder");
    const videoGrid = document.getElementById("videoGrid");

    try {
      if (videoCallBtn) {
        videoCallBtn.classList.add("active");
        videoCallBtn.innerHTML = '<i class="bi bi-telephone-x-fill"></i>';
        videoCallBtn.title = "End Call";
      }
      if (videoContainer) videoContainer.classList.add("active");
      if (callIndicator) callIndicator.style.display = "block";
      if (videoPlaceholder) {
        videoPlaceholder.style.display = "flex";
        videoPlaceholder.innerHTML = `<div class="spinner-border text-light" role="status"></div><div style="margin-top:15px;">Setting up video call...</div>`;
      }

      if (!window.firebase || !firebase.auth || !firebase.auth().currentUser) {
        throw new Error("User not authenticated; cannot request JaaS token.");
      }

      // FIX: Use the global firebase.auth().currentUser object to get the token.
      const idToken = await firebase.auth().currentUser.getIdToken(true);

      // Extract room ID
      const roomId =
        (this.roomManager &&
          (this.roomManager.currentRoomData?._id ||
            this.roomManager.currentRoomData?.id)) ||
        "meeting-" + Math.random().toString(36).slice(2, 9);

      console.debug("🔵 Step 0: Room ID extracted");
      console.debug("  roomId:", roomId);

      const apiBase =
        (window.__CONFIG__ && window.__CONFIG__.backendBase) ||
        (window.__CONFIG__ && window.__CONFIG__.apiBaseUrl) ||
        "http://localhost:5000";

      console.debug("🔵 Step 1: Requesting JaaS token...");
      console.debug("  apiBase:", apiBase);
      console.debug("  roomId sent to backend:", roomId);

      const resp = await fetch(`${apiBase}/api/jaas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ roomId }),
        credentials: "include",
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Server returned ${resp.status}: ${errBody}`);
      }

      const json = await resp.json();
      // CRITICAL: Extract the NORMALIZED room name from backend response
      const {
        roomName: normalizedRoomName,
        externalApiUrl,
        token: jaasJwt,
        expiresAt,
      } = json;

      console.debug("🟢 Step 2: Received response from backend");
      console.debug("  normalizedRoomName from backend:", normalizedRoomName);
      console.debug("  externalApiUrl:", externalApiUrl);
      console.debug("  expiresAt:", expiresAt);

      if (!normalizedRoomName || !externalApiUrl || !jaasJwt) {
        throw new Error("Invalid response from JaaS endpoint");
      }

      const cleanJaasJwt = this._cleanJaasJwt(jaasJwt);

      try {
        console.debug(
          "JWT preview (first 16 chars):",
          cleanJaasJwt?.slice(0, 16) + "..."
        );
      } catch (e) {
        console.warn("Failed to log token preview", e);
      }

      const loadedExternalApiUrl = await this._tryLoadExternalApi(
        externalApiUrl
      );

      let domain = this.jitsiDomainFallback;
      try {
        const parsed = new URL(loadedExternalApiUrl || externalApiUrl);
        domain = parsed.hostname || domain;
      } catch (e) {}

      domain = window.__CONFIG__?.jitsiConfig?.domain || domain;

      const parentNode = document.getElementById("videoGrid");
      if (!parentNode)
        throw new Error("Missing videoGrid element to attach meeting");

      const childId = "jitsi-child-container";
      const existingChild = parentNode.querySelector(`#${childId}`);
      if (existingChild) parentNode.removeChild(existingChild);

      const childDiv = document.createElement("div");
      childDiv.id = childId;
      childDiv.style.width = "100%";
      childDiv.style.height = "100%";
      parentNode.style.display = "block";
      parentNode.innerHTML = "";
      parentNode.appendChild(childDiv);

      const configuredJitsiOptions = {
        ...(window.__CONFIG__?.jitsiConfig?.options || {}),
      };
      if (configuredJitsiOptions.jwt) delete configuredJitsiOptions.jwt;

      // Extract app path from externalApiUrl
      let jitsiAppPath = "";
      try {
        const parsed = new URL(loadedExternalApiUrl || externalApiUrl);
        const pathname = parsed.pathname;
        const pathWithoutFile = pathname.replace(/\/external_api\.js$/, "");
        jitsiAppPath = pathWithoutFile.replace(/^\//, "");

        console.debug("🟡 Step 3: Extracted Jitsi app path");
        console.debug("  domain:", domain);
        console.debug("  jitsiAppPath:", jitsiAppPath);
      } catch (e) {
        console.warn("Failed to parse externalApiUrl:", e);
      }

      const options = {
        ...configuredJitsiOptions,
        roomName: normalizedRoomName, // ← CRITICAL: USE NORMALIZED NAME FROM BACKEND!
        parentNode: childDiv,
        jwt: cleanJaasJwt,
        width: "100%",
        height: "100%",
        ...(jitsiAppPath && { appId: jitsiAppPath }),
        userInfo: {
          displayName: firebase.auth().currentUser.displayName || "Participant",
          email: firebase.auth().currentUser.email || undefined,
        },
      };

      console.debug("🟠 Step 4: Jitsi options prepared");
      console.debug("  options.roomName:", options.roomName);
      console.debug("  options.appId:", options.appId);
      console.debug("  domain:", domain);

      // DIAGNOSTIC: Verify JWT matches options
      try {
        const parts = cleanJaasJwt.split(".");
        const payload = JSON.parse(
          atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
        );
        console.debug("🔴 Step 4.5: JWT Verification");
        console.debug("  JWT payload.room:", payload.room);
        console.debug("  options.roomName:", options.roomName);
        console.debug(
          "  Match?",
          payload.room === options.roomName ? "✅ YES" : "❌ NO"
        );
        if (payload.room !== options.roomName) {
          throw new Error(
            `Room mismatch! JWT has '${payload.room}' but options has '${options.roomName}'`
          );
        }
      } catch (e) {
        console.error("JWT verification failed:", e.message);
        throw e;
      }

      // Audio-first defaults (no camera by default; user can enable later)
      options.configOverwrite = {
        ...(options.configOverwrite || {}),
        startAudioOnly: true,
        startWithVideoMuted: true,
        startWithAudioMuted: false,
        prejoinPageEnabled: true,
      };

      // Optional: detect presence of a microphone WITHOUT triggering any camera prompt
      try {
        let hasAudioInput = false;
        if (navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          hasAudioInput = devices.some((d) => d.kind === "audioinput");
        }
        if (!hasAudioInput) {
          options.configOverwrite.startWithAudioMuted = true;
          console.debug("No microphone detected — will start muted.");
        }
      } catch (e) {
        console.debug("Mic detection failed; keeping default audio settings.");
      }

      console.debug("🟣 Step 5: Initializing JitsiMeetExternalAPI");
      console.debug("  Domain:", domain);
      console.debug("  Room Name:", options.roomName);
      console.debug("  App ID:", options.appId);

      try {
        this.jitsiApi = new JitsiMeetExternalAPI(domain, options);
        window._jitsiApi = this.jitsiApi;
        console.debug("✅ JitsiMeetExternalAPI initialized successfully");
      } catch (err) {
        throw new Error(
          `Failed to initialize Jitsi Meet API: ${
            err && err.message ? err.message : err
          }`
        );
      }

      if (
        this.jitsiApi &&
        typeof this.jitsiApi.addEventListeners === "function"
      ) {
        this.jitsiApi.addEventListeners({
          videoConferenceJoined: () => {
            console.log(
              "✅✅ JaaS: joined conference successfully!",
              normalizedRoomName
            );

            const videoPlaceholder =
              document.getElementById("videoPlaceholder");
            if (videoPlaceholder) {
              videoPlaceholder.style.display = "none";
              console.log("✅ Video placeholder hidden");
            }

            try {
              this.roomManager?.updateParticipantCallStatus?.(
                firebase.auth().currentUser.uid,
                true
              );
              window.chatModule?.sendSystemMessage?.(
                `${
                  firebase.auth().currentUser.displayName || "User"
                } joined the video call`
              );
            } catch (e) {}

            (window.showToast || console.log)(
              "Joined the video call",
              "success"
            );
          },
          videoConferenceLeft: () => {
            console.log("User left the conference");
          },
          audioMuteStatusChanged: (d) => {
            this.isMuted = !!d.muted;
            this.updateVideoControls();
          },
          videoMuteStatusChanged: (d) => {
            this.isCameraOff = !!d.muted;
            this.updateVideoControls();
          },
          screenSharingStatusChanged: (d) => {
            this.isScreenSharing = !!d.on;
            this.updateVideoControls();
          },
          readyToClose: () => {
            this.endVideoCall();
          },
          participantLeft: (p) => {
            console.log("participantLeft", p);
          },
          participantJoined: (p) => {
            console.log("participantJoined", p);
          },
          conferenceFailed: (info) => {
            console.warn("❌ conferenceFailed", info);
          },
          connectionFailed: (info) => {
            console.warn("❌ connectionFailed", info);
          },
          errorOccurred: (err) => {
            console.error("❌ Jitsi errorOccurred", err);
          },
        });
      }

      // Reflect audio-only default immediately in UI
      this.isCameraOff = true;
      this.updateVideoControls();

      setTimeout(() => {
        const videoPlaceholder = document.getElementById("videoPlaceholder");
        if (videoPlaceholder && videoPlaceholder.style.display !== "none") {
          console.log("⏱️ Timeout: Force hiding video placeholder");
          videoPlaceholder.style.display = "none";
        }
      }, 5000);

      this.updateVideoControls();
    } catch (err) {
      console.error("❌ Error starting JaaS call:", err);
      this.isInCall = false;

      const videoCallBtn = document.getElementById("videoCallBtn");
      const videoPlaceholder = document.getElementById("videoPlaceholder");
      const videoContainer = document.getElementById("videoContainer");

      if (videoCallBtn) {
        videoCallBtn.classList.remove("active");
        videoCallBtn.innerHTML = '<i class="bi bi-camera-video-fill"></i>';
        videoCallBtn.title = "Start Video Call";
      }
      if (videoContainer) videoContainer?.classList.remove("active");
      if (videoPlaceholder) {
        videoPlaceholder.style.display = "flex";
        videoPlaceholder.innerHTML = `<i class="bi bi-exclamation-triangle text-warning" style="font-size:32px;"></i><div>Failed to start video call. Please try again.</div>`;
      }
      (window.showToast || (() => {}))(
        "Failed to start video call: " + (err.message || "Unknown error"),
        "error"
      );
    }
  }

  endVideoCall() {
    try {
      if (this.jitsiApi && typeof this.jitsiApi.dispose === "function") {
        this.jitsiApi.dispose();
      } else if (
        this.jitsiApi &&
        typeof this.jitsiApi.executeCommand === "function"
      ) {
        try {
          this.jitsiApi.executeCommand("hangup");
        } catch (e) {}
      }
    } catch (e) {
      console.error("Error disposing JaaS API:", e);
    } finally {
      this.jitsiApi = null;
    }

    try {
      clearTimeout(this._joinTimeoutHandle);
    } catch (e) {}

    this.isInCall = false;
    this.videoMaximized = false;
    this.videoMinimized = false;

    const videoCallBtn = document.getElementById("videoCallBtn");
    const videoContainer = document.getElementById("videoContainer");
    const callIndicator = document.getElementById("callIndicator");
    const videoPlaceholder = document.getElementById("videoPlaceholder");
    const videoGrid = document.getElementById("videoGrid");

    if (videoCallBtn) {
      videoCallBtn.classList.remove("active");
      videoCallBtn.innerHTML = '<i class="bi bi-camera-video-fill"></i>';
      videoCallBtn.title = "Start Video Call";
    }
    if (videoContainer)
      videoContainer.classList.remove("active", "minimized", "maximized");
    if (callIndicator) callIndicator.style.display = "none";
    if (videoPlaceholder) {
      videoPlaceholder.style.display = "flex";
      videoPlaceholder.innerHTML = `<i class="bi bi-camera-video" style="font-size:32px;"></i><div>Click to start a video call</div>`;
    }
    if (videoGrid) {
      videoGrid.style.display = "none";
      videoGrid.innerHTML = "";
    }

    this.isMuted = false;
    this.isCameraOff = false;
    this.isScreenSharing = false;
    this.updateVideoControls();

    try {
      this.roomManager?.updateParticipantCallStatus?.(
        firebase.auth().currentUser.uid,
        false
      );
      window.chatModule?.sendSystemMessage?.(
        `${firebase.auth().currentUser.displayName || "User"} left the call`
      );
    } catch (e) {}
    (window.showToast || (() => {}))("You left the video call", "info");
  }

  toggleMicrophone() {
    if (this.jitsiApi) {
      try {
        this.jitsiApi.executeCommand("toggleAudio");
      } catch (e) {
        console.error(e);
      }
    } else {
      this.isMuted = !this.isMuted;
      this.updateVideoControls();
    }
  }

  toggleCamera() {
    if (this.jitsiApi) {
      try {
        this.jitsiApi.executeCommand("toggleVideo");
      } catch (e) {
        console.error(e);
      }
    } else {
      this.isCameraOff = !this.isCameraOff;
      this.updateVideoControls();
    }
  }

  toggleScreenShare() {
    if (this.jitsiApi) {
      try {
        this.jitsiApi.executeCommand("toggleShareScreen");
      } catch (e) {
        console.error(e);
      }
    } else {
      this.isScreenSharing = !this.isScreenSharing;
      this.updateVideoControls();
    }
  }

  updateVideoControls() {
    const micBtn = document.getElementById("micBtn");
    const cameraBtn = document.getElementById("cameraBtn");
    const screenShareBtn = document.getElementById("screenShareBtn");

    if (micBtn) {
      if (this.isMuted) {
        micBtn.classList.remove("active");
        micBtn.innerHTML = '<i class="bi bi-mic-mute-fill"></i>';
        micBtn.title = "Unmute (Alt+M)";
      } else {
        micBtn.classList.add("active");
        micBtn.innerHTML = '<i class="bi bi-mic-fill"></i>';
        micBtn.title = "Mute (Alt+M)";
      }
    }

    if (cameraBtn) {
      if (this.isCameraOff) {
        cameraBtn.classList.remove("active");
        cameraBtn.innerHTML = '<i class="bi bi-camera-video-off-fill"></i>';
        cameraBtn.title = "Turn Camera On (Alt+V)";
      } else {
        cameraBtn.classList.add("active");
        cameraBtn.innerHTML = '<i class="bi bi-camera-video-fill"></i>';
        cameraBtn.title = "Turn Camera Off (Alt+V)";
      }
    }

    if (screenShareBtn) {
      if (this.isScreenSharing) {
        screenShareBtn.classList.add("active");
        screenShareBtn.title = "Stop Sharing (Alt+S)";
      } else {
        screenShareBtn.classList.remove("active");
        screenShareBtn.title = "Share Screen (Alt+S)";
      }
    }
  }
}
