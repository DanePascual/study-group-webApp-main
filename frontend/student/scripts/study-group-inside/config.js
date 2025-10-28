// Central configuration for StudyGroup frontend (ES module)
// NOTE: Sensitive JaaS credentials (magic cookie / API secret) MUST NOT be exposed here.
// The client will request short-lived JaaS room tokens from the backend instead.
// Server must implement a protected endpoint (e.g. POST /api/jaas) that mints
// ephemeral tokens or returns a signed room identifier.

// This config is optimized for development/testing on localhost.
// When moving to production (studygroup.app), the apiBase will be automatically adjusted.

export const CONFIG = {
  // API base URLs - default to localhost for development
  // These will be overridden by window.__CONFIG__ if set in the HTML script tag
  //apiBase: "http://localhost:5000/api/study-groups",
  //backendBase: "http://localhost:5000",
  // ✅ PRODUCTION HEROKU URL
  apiBase:
    "https://study-group-backend-d8fc93ae1b7a.herokuapp.com/api/study-groups",
  backendBase: "https://study-group-backend-d8fc93ae1b7a.herokuapp.com",

  jitsiDomain: "8x8.vc", // JaaS / Jitsi domain (public)
  debug: true,
  defaultAvatar: "U",
  // used by utils/upload checks
  clientMaxFileSizeBytes: 10 * 1024 * 1024, // 10 MB

  // Jitsi (JaaS) configuration on client:
  // - the client MUST NOT contain the magic cookie / secret
  // - the client will call CONFIG.jitsi.tokenEndpoint to obtain a short-lived token/room info
  jitsiConfig: {
    domain: "8x8.vc",
    roomPrefix: "SampleApp", // client-side prefix only (non-secret)
    // Endpoint on your server that returns the ephemeral data required to join a JaaS meeting.
    // FIXED: Corrected endpoint path to match actual backend route
    // Backend mounts jaas router at /api/jaas with POST / as the token endpoint
    // So the full path is POST /api/jaas (not /api/jaas/token)
    tokenEndpoint: "/api/jaas",
    // Optional client-side options for embedding Jitsi (will be merged with server-provided options)
    options: {
      width: "100%",
      height: "100%",
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        disableDeepLinking: true,
        prejoinPageEnabled: false,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        TOOLBAR_BUTTONS: [
          "microphone",
          "camera",
          "desktop",
          "fullscreen",
          "fodeviceselection",
          "hangup",
          "profile",
        ],
      },
    },
  },
};
