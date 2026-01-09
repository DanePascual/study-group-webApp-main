// PresenceManager class - Tracks online/offline status of participants in a study room
// Uses Firebase Realtime Database for real-time presence tracking

export class PresenceManager {
  constructor(roomId, userId) {
    this.roomId = roomId;
    this.userId = userId;
    this.database = null;
    this.presenceRef = null;
    this.roomPresenceRef = null;
    this.connectedRef = null;
    this.onlineUsers = new Map(); // Map of userId -> boolean (online status)
    this.listeners = []; // Callbacks to notify when presence changes
    this._unsubscribers = [];
  }

  async initialize() {
    try {
      // Get Firebase Realtime Database instance
      if (typeof firebase === "undefined" || !firebase.database) {
        console.warn("[presence] Firebase Realtime Database not available");
        return false;
      }

      this.database = firebase.database();

      // Reference to this user's presence in this room
      this.presenceRef = this.database.ref(
        `rooms/${this.roomId}/presence/${this.userId}`
      );

      // Reference to all presence data for this room
      this.roomPresenceRef = this.database.ref(`rooms/${this.roomId}/presence`);

      // Reference to the special ".info/connected" path
      this.connectedRef = this.database.ref(".info/connected");

      // Set up connection state listener
      this._setupConnectionListener();

      // Listen to room presence changes
      this._listenToRoomPresence();

      console.log("[presence] Initialized for room:", this.roomId);
      return true;
    } catch (err) {
      console.error("[presence] Error initializing:", err);
      return false;
    }
  }

  _setupConnectionListener() {
    const connectionHandler = this.connectedRef.on("value", (snapshot) => {
      if (snapshot.val() === true) {
        // We're connected (or reconnected)
        console.log("[presence] Connected to Firebase");

        // Set up onDisconnect to remove presence when user leaves
        this.presenceRef
          .onDisconnect()
          .remove()
          .then(() => {
            // Set user as online
            this.presenceRef.set({
              online: true,
              lastSeen: firebase.database.ServerValue.TIMESTAMP,
            });
          });
      }
    });

    this._unsubscribers.push(() => {
      this.connectedRef.off("value", connectionHandler);
    });
  }

  _listenToRoomPresence() {
    // Listen for any changes to presence in this room
    const presenceHandler = this.roomPresenceRef.on("value", (snapshot) => {
      const presenceData = snapshot.val() || {};

      // Update our local map
      this.onlineUsers.clear();
      Object.keys(presenceData).forEach((uid) => {
        const data = presenceData[uid];
        this.onlineUsers.set(uid, data.online === true);
      });

      console.log(
        "[presence] Updated online users:",
        Array.from(this.onlineUsers.entries())
          .filter(([_, online]) => online)
          .map(([uid]) => uid.substring(0, 8))
          .join(", ")
      );

      // Notify all listeners
      this._notifyListeners();
    });

    this._unsubscribers.push(() => {
      this.roomPresenceRef.off("value", presenceHandler);
    });
  }

  // Check if a specific user is online
  isUserOnline(userId) {
    return this.onlineUsers.get(userId) === true;
  }

  // Get all online user IDs
  getOnlineUserIds() {
    return Array.from(this.onlineUsers.entries())
      .filter(([_, online]) => online)
      .map(([uid]) => uid);
  }

  // Subscribe to presence changes
  onPresenceChange(callback) {
    this.listeners.push(callback);
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  _notifyListeners() {
    this.listeners.forEach((callback) => {
      try {
        callback(this.onlineUsers);
      } catch (err) {
        console.error("[presence] Error in listener callback:", err);
      }
    });
  }

  // Set user as online
  async setOnline() {
    try {
      if (this.presenceRef) {
        await this.presenceRef.set({
          online: true,
          lastSeen: firebase.database.ServerValue.TIMESTAMP,
        });
        console.log("[presence] Set user online");
      }
    } catch (err) {
      console.error("[presence] Error setting online:", err);
    }
  }

  // Set user as offline (manual)
  async setOffline() {
    try {
      if (this.presenceRef) {
        await this.presenceRef.remove();
        console.log("[presence] Set user offline");
      }
    } catch (err) {
      console.error("[presence] Error setting offline:", err);
    }
  }

  // Clean up all listeners
  destroy() {
    // Remove all listeners
    this._unsubscribers.forEach((unsub) => {
      try {
        unsub();
      } catch (e) {
        // ignore
      }
    });
    this._unsubscribers = [];
    this.listeners = [];

    // Set offline before destroying
    if (this.presenceRef) {
      this.presenceRef.remove().catch(() => {});
    }

    console.log("[presence] Destroyed");
  }
}
