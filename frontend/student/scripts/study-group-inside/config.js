// Central configuration for StudyGroup frontend (ES module)
// Updated for microphone-only setup (no camera)

export const CONFIG = {
  // API base URLs
  apiBase:
    "https://study-group-backend-d8fc93ae1b7a.herokuapp.com/api/study-groups",
  backendBase: "https://study-group-backend-d8fc93ae1b7a.herokuapp.com",

  jitsiDomain: "8x8.vc",
  debug: true,
  defaultAvatar: "U",
  clientMaxFileSizeBytes: 10 * 1024 * 1024, // 10 MB

  jitsiConfig: {
    domain: "8x8.vc",
    virtualHost: "my-video-app",
    // ✅ CORRECTED: Full URL to backend endpoint
    tokenEndpoint:
      "https://study-group-backend-d8fc93ae1b7a.herokuapp.com/api/jaas",
    options: {
      width: "100%",
      height: "100%",
      configOverwrite: {
        // ✅ UPDATED: Start with audio enabled (mic on) but video disabled (no camera)
        startWithAudioMuted: false,
        startWithVideoMuted: true, // Video starts muted since no camera
        disableDeepLinking: true,
        prejoinPageEnabled: false,
        enableInsecureRoomNameWarning: false,
        toolbarButtons: [
          "microphone", // ✅ Mic control (enabled)
          "camera", // Camera button (will be disabled/grayed out)
          "desktop",
          "fullscreen",
          "fodeviceselection",
          "hangup",
          "profile",
          "settings",
          "raisehand",
          "chat",
        ],
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        DISABLE_VIDEO_BACKGROUND: true, // No video background since video is off
        MOBILE_APP_PROMO: false,
        DEFAULT_BACKGROUND: "#222222",
        // ✅ Hide camera button from toolbar since no camera
        TOOLBAR_BUTTONS: [
          "microphone", // Keep mic
          "desktop",
          "fullscreen",
          "fodeviceselection",
          "hangup",
          "profile",
          "settings",
          "raisehand",
          "chat",
        ],
      },
    },
  },
};
