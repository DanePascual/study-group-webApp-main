/**
 * StudyGroup - Virtual Study Room with Firebase Auth and Jitsi Integration
 *
 * Features:
 * - Firebase Authentication with UID-based permissions
 * - Real-time messaging with Firestore
 * - Jitsi Meet video conferencing (prepared for future integration)
 * - Draggable, resizable video container
 * - Dark mode support
 * - Responsive design
 *
 * Notes:
 * - This file uses the Firebase compat SDK (loaded from the page) to match existing code.
 * - Sidebar updates are defensive: we do not overwrite a server-provided <img> avatar or non-default sidebar name set by sidebar.js.
 */

// Configuration
const CONFIG = {
  apiBase: "http://localhost:5000/api/study-groups",
  jitsiDomain: "meet.jit.si", // For future Jitsi integration
  debug: true,
  defaultAvatar: "U",
};

// Initialize Firebase using the compat version
// Note: The HTML page should include firebase-app-compat, firebase-auth-compat, firebase-firestore-compat
if (typeof firebase === "undefined") {
  console.error("Firebase SDK not loaded!");
} else {
  // Firebase is already initialized from the HTML script tags
  const db = firebase.firestore();
  const auth = firebase.auth();

  // Global variables and module instances
  let userModule;
  let roomModule;
  let chatModule;
  let videoModule;
  let uiModule;

  // Cache for user display information (map UID to display info)
  const userDisplayCache = {};

  /**
   * Auth Module - Handles user authentication and profile data
   */
  class UserAuth {
    constructor() {
      this.currentUser = null;
      this.isLoading = true;
    }

    // Initialize auth state
    async init() {
      return new Promise((resolve, reject) => {
        console.log("Initializing auth...");
        auth.onAuthStateChanged(async (user) => {
          if (user) {
            console.log("User authenticated:", user.uid);
            try {
              await this.setCurrentUser(user);
              this.isLoading = false;
              resolve(this.currentUser);
            } catch (error) {
              console.error("Error initializing user:", error);
              this.isLoading = false;
              reject(error);
            }
          } else {
            console.log("No authenticated user, redirecting to login");
            // FIX: Use dynamic path resolution instead of hardcoded path
            const currentPath = window.location.pathname;
            const pathParts = currentPath.split("/");
            const loginPath =
              pathParts.slice(0, pathParts.length - 1).join("/") +
              "/login.html";

            // Use the full URL with origin
            window.location.href = window.location.origin + loginPath;
            console.log(
              "Redirecting to login:",
              window.location.origin + loginPath
            );
            reject(new Error("Not authenticated"));
          }
        });
      });
    }

    // Set current user with Firebase user object
    async setCurrentUser(user) {
      // Basic user info
      this.currentUser = {
        uid: user.uid,
        displayName: user.displayName || user.email?.split("@")[0] || "User",
        email: user.email,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified,
      };

      // Get additional user data from Firestore
      try {
        const userDocRef = db.collection("users").doc(user.uid);
        const userDoc = await userDocRef.get();

        if (userDoc.exists) {
          const userData = userDoc.data();
          this.currentUser = {
            ...this.currentUser,
            program: userData.program || "",
            name: userData.name || this.currentUser.displayName,
            avatar:
              userData.avatar ||
              this.currentUser.displayName.substring(0, 1).toUpperCase(),
          };
        }
      } catch (error) {
        console.warn("Could not fetch additional user data:", error);
      }

      // Cache own user info
      userDisplayCache[user.uid] = {
        displayName: this.currentUser.name || this.currentUser.displayName,
        avatar:
          this.currentUser.avatar ||
          this.currentUser.displayName.substring(0, 1).toUpperCase(),
        email: this.currentUser.email,
      };

      return this.currentUser;
    }

    // Get display info for a user by UID
    async getUserDisplayInfo(uid) {
      // Return from cache if available
      if (userDisplayCache[uid]) {
        return userDisplayCache[uid];
      }

      // For current user, use current user info
      if (this.currentUser && uid === this.currentUser.uid) {
        return {
          displayName: this.currentUser.name || this.currentUser.displayName,
          avatar:
            this.currentUser.avatar ||
            this.currentUser.displayName.substring(0, 1).toUpperCase(),
          email: this.currentUser.email,
        };
      }

      // Otherwise fetch from Firestore
      try {
        const userDoc = await db.collection("users").doc(uid).get();

        if (userDoc.exists) {
          const userData = userDoc.data();
          const displayInfo = {
            displayName:
              userData.name ||
              userData.email?.split("@")[0] ||
              uid.substring(0, 8),
            avatar:
              userData.avatar ||
              (userData.name
                ? userData.name.substring(0, 1).toUpperCase()
                : "U"),
            email: userData.email,
          };

          // Cache for future use
          userDisplayCache[uid] = displayInfo;
          return displayInfo;
        }

        // Fallback if user doc doesn't exist
        return {
          displayName: uid.substring(0, 8),
          avatar: CONFIG.defaultAvatar,
          email: null,
        };
      } catch (error) {
        console.error(`Error fetching user display info for ${uid}:`, error);

        // Fallback on error
        return {
          displayName: uid.substring(0, 8),
          avatar: CONFIG.defaultAvatar,
          email: null,
        };
      }
    }

    // Log out the current user
    async logout() {
      try {
        await auth.signOut();

        // Show logout message
        const logoutMessage = document.createElement("div");
        logoutMessage.className = "logout-message";
        logoutMessage.innerHTML = `
          <div class="logout-message-content">
            <i class="bi bi-check-circle-fill"></i>
            <p>You have been successfully logged out.</p>
            <p class="redirect-text">Redirecting to login page...</p>
          </div>
        `;
        document.body.appendChild(logoutMessage);

        // FIX: Use dynamic path resolution instead of hardcoded path
        setTimeout(() => {
          // Get current path components and build the correct URL
          const currentPath = window.location.pathname;
          const pathParts = currentPath.split("/");
          const loginPath =
            pathParts.slice(0, pathParts.length - 1).join("/") + "/login.html";

          // Use the full URL with origin
          window.location.href = window.location.origin + loginPath;
          console.log(
            "Redirecting to login:",
            window.location.origin + loginPath
          );
        }, 2000);
      } catch (error) {
        console.error("Error signing out:", error);
        showToast("Error signing out. Please try again.", "error");
      }
    }

    // Update sidebar with user info (DEFENSIVE)
    updateSidebarUserInfo() {
      try {
        const avatar = document.getElementById("sidebarAvatar");
        const name = document.getElementById("sidebarName");
        const course = document.getElementById("sidebarCourse");

        // Only overwrite the displayed name if sidebar still shows a default marker
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

        // Only set initials if there's no <img> (so we don't overwrite server-provided photo)
        if (avatar) {
          const hasImg = avatar.querySelector && avatar.querySelector("img");
          if (!hasImg) {
            const currentAvatarText = avatar.textContent
              ? avatar.textContent.trim()
              : "";
            if (!currentAvatarText || currentAvatarText === "") {
              const initial =
                this.currentUser.avatar ||
                (this.currentUser.displayName || "U")
                  .substring(0, 1)
                  .toUpperCase();
              avatar.textContent = initial;
            }
          }
        }
      } catch (err) {
        console.warn("updateSidebarUserInfo failed:", err && err.message);
      }
    }
  }

  /**
   * Room Module - Manages room data and participants
   */
  class RoomManager {
    constructor(userAuth) {
      this.userAuth = userAuth;
      this.currentRoomData = null;
      this.isOwner = false;
      this.participants = [];
      this.isLoading = true;
    }

    // Load room data from API
    async loadRoomData() {
      this.isLoading = true;

      const urlParams = new URLSearchParams(window.location.search);
      const roomId = urlParams.get("room");

      if (!roomId) {
        showToast("Room ID not found in URL", "error");
        window.location.href = "study-rooms.html";
        return;
      }

      try {
        const response = await fetch(`${CONFIG.apiBase}/${roomId}`);
        if (!response.ok) {
          throw new Error(`Failed to load room (Status: ${response.status})`);
        }

        this.currentRoomData = await response.json();
        console.log("Room data loaded:", this.currentRoomData);

        // Check if current user is the room owner (using UID)
        this.isOwner =
          this.currentRoomData.creator === this.userAuth.currentUser.uid;
        console.log(
          `Room owner check: ${
            this.isOwner ? "You are the owner" : "You are not the owner"
          }`
        );

        // Process participants
        await this.loadParticipantsInfo();

        this.isLoading = false;
        return this.currentRoomData;
      } catch (error) {
        console.error("Error loading room:", error);
        showToast("Failed to load room: " + error.message, "error");
        this.isLoading = false;

        setTimeout(() => {
          window.location.href = "study-rooms.html";
        }, 2000);

        return null;
      }
    }

    // Load participant display info
    async loadParticipantsInfo() {
      this.participants = [];

      // Handle empty or missing participants array
      if (
        !this.currentRoomData.participants ||
        !Array.isArray(this.currentRoomData.participants)
      ) {
        console.warn("No participants found in room data");

        // Always include current user if no participants
        const currentUserInfo = await this.userAuth.getUserDisplayInfo(
          this.userAuth.currentUser.uid
        );
        this.participants = [
          {
            id: this.userAuth.currentUser.uid,
            name: currentUserInfo.displayName,
            avatar: currentUserInfo.avatar,
            status: "online",
            isHost: this.isOwner,
            inCall: false,
          },
        ];

        return;
      }

      // Process all participants
      const participantPromises = this.currentRoomData.participants.map(
        async (uid) => {
          try {
            const userInfo = await this.userAuth.getUserDisplayInfo(uid);
            return {
              id: uid, // Store the UID as id
              name: userInfo.displayName,
              avatar: userInfo.avatar,
              status: "online",
              isHost: this.currentRoomData.creator === uid,
              inCall: false,
            };
          } catch (error) {
            console.error(`Error loading participant info for ${uid}:`, error);
            return {
              id: uid,
              name: uid.substring(0, 8), // Fallback to partial UID
              avatar: CONFIG.defaultAvatar,
              status: "online",
              isHost: this.currentRoomData.creator === uid,
              inCall: false,
            };
          }
        }
      );

      this.participants = await Promise.all(participantPromises);
    }

    // Update participants list UI
    updateParticipantsList() {
      const participantsList = document.getElementById("participantsList");
      if (!participantsList) return;

      participantsList.innerHTML = this.participants
        .map((participant) => {
          const isCurrentUser =
            participant.id === this.userAuth.currentUser.uid;
          const canKick = this.isOwner && !isCurrentUser;

          return `
            <div class="participant-item" data-user-id="${participant.id}">
              <div class="participant-avatar">${participant.avatar}
                <div class="status-indicator ${
                  participant.inCall ? "status-in-call" : "status-online"
                }"></div>
              </div>
              <div class="participant-info">
                <div class="participant-name">${participant.name}${
            isCurrentUser ? " (You)" : ""
          }</div>
                <div class="participant-status">${
                  participant.isHost
                    ? "Host"
                    : participant.inCall
                    ? "In Call"
                    : "Online"
                }</div>
              </div>
              ${
                canKick
                  ? `
                <div class="participant-actions">
                  <button class="kick-btn" onclick="window.kickParticipant('${participant.id}')" title="Kick user">
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
              `
                  : ""
              }
            </div>
          `;
        })
        .join("");

      const participantCount = document.getElementById("participantCount");
      if (participantCount) {
        participantCount.textContent = this.participants.length;
      }
    }

    // Update participant call status
    updateParticipantCallStatus(userId, inCall) {
      const participant = this.participants.find((p) => p.id === userId);
      if (participant) {
        participant.inCall = inCall;
        this.updateParticipantsList();
      }
    }

    // Kick participant (owner only)
    async kickParticipant(userId) {
      if (!this.isOwner) {
        showToast("Only the room owner can kick participants", "error");
        return;
      }

      if (userId === this.userAuth.currentUser.uid) {
        showToast("You cannot kick yourself", "error");
        return;
      }

      // Get user display name for confirmation
      let displayName;
      try {
        const userInfo = await this.userAuth.getUserDisplayInfo(userId);
        displayName = userInfo.displayName;
      } catch (error) {
        displayName = userId.substring(0, 8);
      }

      if (
        confirm(`Are you sure you want to kick ${displayName} from the room?`)
      ) {
        try {
          // Try to remove from server
          const roomId = this.currentRoomData._id || this.currentRoomData.id;
          const response = await fetch(
            `${CONFIG.apiBase}/${roomId}/participants/${userId}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
              },
            }
          );

          if (!response.ok) {
            throw new Error(
              `Failed to remove participant: ${response.statusText}`
            );
          }

          // Remove from local array
          this.participants = this.participants.filter((p) => p.id !== userId);
          this.updateParticipantsList();

          showToast(`${displayName} has been kicked from the room`, "success");
          chatModule.sendSystemMessage(
            `${displayName} was removed from the room by ${this.userAuth.currentUser.name}`
          );
        } catch (error) {
          console.error("Error kicking participant:", error);

          // Optimistic UI update even if server fails
          this.participants = this.participants.filter((p) => p.id !== userId);
          this.updateParticipantsList();

          showToast(`${displayName} has been kicked from the room`, "success");
          chatModule.sendSystemMessage(
            `${displayName} was removed from the room`
          );
        }
      }
    }

    // Update room display with current data
    async updateRoomDisplay() {
      const nameEl = document.getElementById("roomNameDisplay");
      const pageTitleEl = document.getElementById("pageTitle");
      const titleDisplay = document.getElementById("roomTitleDisplay");
      const createdTime = document.getElementById("roomCreatedTime");

      if (nameEl) nameEl.textContent = this.currentRoomData.name;
      if (pageTitleEl)
        pageTitleEl.textContent = `${this.currentRoomData.name} - StudyGroup`;
      if (titleDisplay) titleDisplay.textContent = this.currentRoomData.name;
      if (createdTime)
        createdTime.textContent = `Created on ${
          this.currentRoomData.createdAt || ""
        } UTC`;
      const participantCount = document.getElementById("participantCount");
      if (participantCount)
        participantCount.textContent = this.participants.length;

      // Update creator badge with display name
      const badge = document.getElementById("createdByBadge");
      if (badge) {
        if (this.isOwner) {
          badge.textContent = "Created by You";
          badge.style.display = "inline-block";
        } else if (this.currentRoomData.creator) {
          try {
            // Get creator display name from UID
            const creatorInfo = await this.userAuth.getUserDisplayInfo(
              this.currentRoomData.creator
            );
            badge.textContent = `Created by ${creatorInfo.displayName}`;
          } catch (error) {
            console.error("Error getting creator info:", error);
            // Fallback to email or UID
            badge.textContent = `Created by ${
              this.currentRoomData.creatorEmail ||
              this.currentRoomData.creator.substring(0, 8)
            }`;
          }
          badge.style.display = "inline-block";
        } else {
          badge.style.display = "none";
        }
      }

      // Set invite link
      const baseUrl = window.location.origin + window.location.pathname;
      const inviteUrl = `${baseUrl}?room=${
        this.currentRoomData._id || this.currentRoomData.id
      }&invite=true`;
      const inviteInput = document.getElementById("inviteLink");
      if (inviteInput) inviteInput.value = inviteUrl;
    }

    // Save room settings
    async saveRoomSettings() {
      const newName = document.getElementById("roomNameInput").value.trim();
      const newDesc = document.getElementById("roomDescInput").value.trim();

      if (!newName) {
        showToast("Room name cannot be empty", "error");
        return;
      }

      // Update room data
      this.currentRoomData.name = newName;
      this.currentRoomData.description = newDesc;

      // Update UI
      this.updateRoomDisplay();

      // Save to server
      try {
        const roomId = this.currentRoomData._id || this.currentRoomData.id;
        const idToken = await auth.currentUser.getIdToken();

        const response = await fetch(`${CONFIG.apiBase}/${roomId}`, {
          method: "PUT", // Changed from PATCH to PUT to match your server route
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            name: newName,
            description: newDesc,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to update room: ${response.statusText}`);
        }

        // Close modal
        const modalElement = document.getElementById("settingsModal");
        if (modalElement) {
          const modal = bootstrap.Modal.getInstance(modalElement);
          if (modal) modal.hide();
        }

        showToast("Room settings updated successfully", "success");
        chatModule.sendSystemMessage(`Room name changed to "${newName}"`);
      } catch (error) {
        console.error("Error updating room settings:", error);
        showToast(
          "Failed to save settings on server: " + error.message,
          "error"
        );
      }
    }

    // Delete room (owner only)
    async deleteRoom() {
      if (!this.isOwner) {
        showToast("Only the room owner can delete this room.", "error");
        return;
      }

      if (
        !confirm(
          "Are you sure you want to delete this room? This action cannot be undone and all messages will be lost."
        )
      ) {
        return;
      }

      try {
        const roomId = this.currentRoomData._id || this.currentRoomData.id;
        const idToken = await auth.currentUser.getIdToken();

        const response = await fetch(`${CONFIG.apiBase}/${roomId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to delete room: ${response.statusText}`);
        }

        showToast("Room deleted successfully! Redirecting...", "success");

        // Close modal if open
        const modalElement = document.getElementById("settingsModal");
        if (modalElement) {
          const modal = bootstrap.Modal.getInstance(modalElement);
          if (modal) modal.hide();
        }

        // Redirect after delay
        setTimeout(() => {
          window.location.href = "study-rooms.html";
        }, 1200);
      } catch (error) {
        console.error("Error deleting room:", error);
        showToast("Could not delete room: " + error.message, "error");
      }
    }
  }

  /**
   * Chat Module - Handles messaging functionality
   */
  class ChatManager {
    constructor(userAuth, roomManager) {
      this.userAuth = userAuth;
      this.roomManager = roomManager;
      this.messages = [];
      this.sharedFiles = [];
      this.unsubscribeMessages = null;
    }

    // Initialize chat listeners
    init() {
      const messageInput = document.getElementById("messageInput");
      const sendBtn = document.getElementById("sendMessageBtn");
      const attachBtn = document.getElementById("attachBtn");
      const fileInput = document.getElementById("fileInput");

      // Send message on Enter key
      messageInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      sendBtn?.addEventListener("click", () => this.sendMessage());

      // Attach file functionality
      attachBtn?.addEventListener("click", () => {
        fileInput?.click();
      });

      fileInput?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file size (5MB max)
        const MAX_FILE_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
          showToast("File is too large. Maximum size is 5MB.", "error");
          fileInput.value = "";
          return;
        }

        // Show loading indicator
        showToast(`Uploading ${file.name}...`, "info");

        // Process file by type
        const isImage = file.type.startsWith("image/");
        const fileExt = file.name.split(".").pop().toLowerCase();

        const reader = new FileReader();
        reader.onload = (e) => {
          const fileData = e.target.result;

          if (isImage) {
            this.sendImageMessage(file, fileData);
          } else {
            this.sendDocumentMessage(file, fileExt, fileData);
          }
        };

        reader.onerror = () => {
          showToast("Failed to read file. Please try again.", "error");
        };

        reader.readAsDataURL(file);
        fileInput.value = "";
      });

      // Load messages
      this.loadMessages();
    }

    // Load messages from Firestore
    loadMessages() {
      if (!this.roomManager.currentRoomData) return;

      const roomId =
        this.roomManager.currentRoomData._id ||
        this.roomManager.currentRoomData.id;
      const messagesRef = db
        .collection("studyGroups")
        .doc(roomId)
        .collection("messages")
        .orderBy("timestamp", "asc");

      const chatMessages = document.getElementById("chatMessages");

      // Show loading state
      if (chatMessages) {
        chatMessages.innerHTML = `
          <div class="loading-messages">
            <div class="spinner-border spinner-border-sm text-secondary" role="status"></div>
            <span>Loading messages...</span>
          </div>
        `;
      }

      // Unsubscribe from previous listener if exists
      if (this.unsubscribeMessages) {
        this.unsubscribeMessages();
      }

      // Set up real-time listener
      this.unsubscribeMessages = messagesRef.onSnapshot(
        (snapshot) => {
          this.messages = [];
          snapshot.forEach((doc) => {
            this.messages.push({
              id: doc.id,
              ...doc.data(),
            });
          });
          this.renderMessages();
        },
        (error) => {
          console.error("Error listening for messages:", error);
          if (chatMessages) {
            chatMessages.innerHTML = `
              <div class="error-state">
                <i class="bi bi-exclamation-triangle"></i>
                <p>Failed to load messages</p>
                <button class="btn btn-sm btn-outline-secondary" onclick="chatModule.loadMessages()">
                  <i class="bi bi-arrow-clockwise"></i> Retry
                </button>
              </div>
            `;
          }
          showToast("Unable to load chat messages.", "error");
        }
      );
    }

    // Render messages in UI
    async renderMessages() {
      const chatMessages = document.getElementById("chatMessages");
      if (!chatMessages) return;

      if (this.messages.length === 0) {
        chatMessages.innerHTML = `
          <div class="empty-state">
            <i class="bi bi-chat-dots empty-state-icon"></i>
            <div>No messages yet</div>
            <div>Start the conversation!</div>
          </div>
        `;
        return;
      }

      chatMessages.innerHTML = "";
      let currentDate = "";

      // Process messages with display names
      for (const msg of this.messages) {
        // Add date separator if needed
        const msgDate = new Date(
          msg.timestamp?.toDate?.() || msg.timestamp || new Date()
        ).toLocaleDateString();
        if (msgDate !== currentDate) {
          currentDate = msgDate;

          const dateSeparator = document.createElement("div");
          dateSeparator.className = "date-separator";
          dateSeparator.innerHTML = `<span>${msgDate}</span>`;
          chatMessages.appendChild(dateSeparator);
        }

        // Process message content
        if (msg.isSystem) {
          this.addMessageToDOM(chatMessages, {
            isSystem: true,
            text: msg.text,
            timestamp: msg.timestamp?.toDate?.() || msg.timestamp || new Date(),
          });
        } else {
          // For regular messages, check if we need author display info
          const isOwnMessage =
            msg.authorUid === this.userAuth.currentUser.uid ||
            msg.author === this.userAuth.currentUser.displayName; // Backward compatibility
          let authorInfo;

          if (isOwnMessage) {
            authorInfo = {
              displayName: "You",
              avatar:
                this.userAuth.currentUser.avatar ||
                this.userAuth.currentUser.displayName[0].toUpperCase(),
            };
          } else {
            try {
              // Get author display info from UID or legacy author field
              const authorUid =
                msg.authorUid ||
                (typeof msg.author === "string" ? msg.author : null);
              authorInfo = await this.userAuth.getUserDisplayInfo(authorUid);
            } catch (error) {
              console.error("Error getting message author info:", error);
              authorInfo = {
                displayName: msg.author || "Unknown User",
                avatar:
                  msg.author && typeof msg.author === "string"
                    ? msg.author.substring(0, 1).toUpperCase()
                    : CONFIG.defaultAvatar,
              };
            }
          }

          this.addMessageToDOM(chatMessages, {
            id: msg.id,
            authorUid: msg.authorUid,
            authorName: authorInfo.displayName,
            authorAvatar: authorInfo.avatar,
            isOwnMessage,
            text: msg.text,
            timestamp: msg.timestamp?.toDate?.() || msg.timestamp || new Date(),
            imageUrl: msg.imageUrl,
            fileUrl: msg.fileUrl,
            fileName: msg.fileName,
            fileType: msg.fileType,
            fileSize: msg.fileSize,
            status: msg.status || "sent",
          });
        }
      }

      // Scroll to bottom
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Add message to DOM with proper formatting
    addMessageToDOM(container, msg) {
      const messageElement = document.createElement("div");
      messageElement.setAttribute("data-message-id", msg.id || "");

      // Format timestamp
      const timestamp =
        msg.timestamp instanceof Date
          ? msg.timestamp
          : new Date(msg.timestamp || Date.now());

      const timeStr = timestamp.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      if (msg.isSystem) {
        messageElement.className = "chat-message system";
        messageElement.innerHTML = `
          <div class="message-avatar" style="background: #999;">
            <i class="bi bi-info-circle"></i>
          </div>
          <div>
            <div class="message-bubble">
              <div class="message-content" style="font-style: italic; color: var(--medium-text);">${msg.text}</div>
              <div class="message-meta">
                <span>System</span>
                <span>${timeStr}</span>
              </div>
            </div>
          </div>
        `;
      } else {
        messageElement.className = `chat-message ${
          msg.isOwnMessage ? "self" : ""
        }`;

        let contentHtml = "";

        if (msg.imageUrl) {
          // Image message
          contentHtml = `<img src="${msg.imageUrl}" alt="Shared image" class="message-image" onclick="window.openImageModal('${msg.imageUrl}')">`;
        } else if (msg.fileUrl && msg.fileName) {
          // File message (document)
          const fileIcon = this.getFileIcon(
            msg.fileName.split(".").pop().toLowerCase()
          );
          contentHtml = `
            <div class="d-flex align-items-center gap-2 mb-1">
              <i class="${fileIcon} fs-4"></i>
              <div>
                <div style="font-weight: 500;">${msg.fileName}</div>
                <div style="font-size: 12px; color: var(--medium-text);">${
                  msg.fileSize || ""
                }</div>
              </div>
            </div>
            <a href="${msg.fileUrl}" download="${
            msg.fileName
          }" class="btn btn-sm btn-outline-success mt-2">
              <i class="bi bi-download"></i> Download
            </a>
          `;
        } else {
          // Text message
          contentHtml = msg.text;
        }

        // Status indicator for own messages
        let statusHtml = "";
        if (msg.isOwnMessage) {
          if (msg.status === "sending") {
            statusHtml =
              '<span class="message-status sending" title="Sending..."><i class="bi bi-clock"></i></span>';
          } else if (msg.status === "error") {
            statusHtml = `<span class="message-status error" title="Failed to send. Click to retry." onclick="chatModule.retryMessage('${msg.id}')"><i class="bi bi-exclamation-circle"></i></span>`;
          } else {
            statusHtml =
              '<span class="message-status sent" title="Sent"><i class="bi bi-check2"></i></span>';
          }
        }

        messageElement.innerHTML = `
          <div class="message-avatar">${msg.authorAvatar}</div>
          <div>
            <div class="message-bubble">
              <div class="message-content">${contentHtml}</div>
              <div class="message-meta">
                <span>${msg.authorName}</span>
                <span>${timeStr}</span>
                ${statusHtml}
              </div>
            </div>
          </div>
        `;
      }

      container.appendChild(messageElement);
    }

    // Send text message
    async sendMessage() {
      const messageInput = document.getElementById("messageInput");
      const text = messageInput?.value.trim();

      if (!text) return;

      const roomId =
        this.roomManager.currentRoomData._id ||
        this.roomManager.currentRoomData.id;

      // Create temporary ID for optimistic UI update
      const tempId = `temp-${Date.now()}`;

      // Optimistically add to UI with "sending" status
      const chatMessages = document.getElementById("chatMessages");
      if (chatMessages) {
        const emptyState = chatMessages.querySelector(".empty-state");
        if (emptyState) emptyState.remove();

        this.messages.push({
          id: tempId,
          authorUid: this.userAuth.currentUser.uid,
          text: text,
          isSystem: false,
          status: "sending",
          timestamp: new Date(),
        });

        this.renderMessages();
      }

      // Clear input field
      const originalText = messageInput.value;
      messageInput.value = "";

      // Send to Firestore
      const messagesRef = db
        .collection("studyGroups")
        .doc(roomId)
        .collection("messages");

      try {
        const docRef = await messagesRef.add({
          authorUid: this.userAuth.currentUser.uid, // Store UID, not display name
          author: this.userAuth.currentUser.displayName, // Keep author for backward compatibility
          text: text,
          isSystem: false,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });

        // Update status in messages array
        const idx = this.messages.findIndex((m) => m.id === tempId);
        if (idx !== -1) {
          this.messages[idx].id = docRef.id;
          this.messages[idx].status = "sent";
        }
      } catch (error) {
        console.error("Failed to send message:", error);

        // Update status to error
        const idx = this.messages.findIndex((m) => m.id === tempId);
        if (idx !== -1) {
          this.messages[idx].status = "error";
          this.renderMessages();
        }

        showToast(
          "Failed to send message. Click on the error icon to retry.",
          "error"
        );

        // Restore text to input
        messageInput.value = originalText;
      }
    }

    // Retry sending a failed message
    async retryMessage(messageId) {
      const message = this.messages.find((m) => m.id === messageId);
      if (!message) return;

      // Update status in UI
      message.status = "sending";
      this.renderMessages();

      // Try to send again
      const roomId =
        this.roomManager.currentRoomData._id ||
        this.roomManager.currentRoomData.id;
      const messagesRef = db
        .collection("studyGroups")
        .doc(roomId)
        .collection("messages");

      try {
        await messagesRef.add({
          authorUid: this.userAuth.currentUser.uid,
          author: this.userAuth.currentUser.displayName, // For backward compatibility
          text: message.text,
          isSystem: false,
          imageUrl: message.imageUrl,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });

        // Remove the failed message from array - it will be added by the listener
        this.messages = this.messages.filter((m) => m.id !== messageId);
        showToast("Message sent successfully", "success");
      } catch (error) {
        console.error("Failed to retry sending message:", error);
        message.status = "error";
        this.renderMessages();
        showToast("Failed to send message. Please try again.", "error");
      }
    }

    // Send system message
    async sendSystemMessage(text) {
      if (!this.roomManager.currentRoomData) return;

      const roomId =
        this.roomManager.currentRoomData._id ||
        this.roomManager.currentRoomData.id;
      const messagesRef = db
        .collection("studyGroups")
        .doc(roomId)
        .collection("messages");

      try {
        await messagesRef.add({
          authorUid: "system",
          author: "system", // For backward compatibility
          text,
          isSystem: true,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        console.error("Error sending system message:", error);
      }
    }

    // Send image message
    sendImageMessage(file, imageDataUrl) {
      // Add to shared files
      this.addSharedFile({
        name: file.name || `Image ${new Date().toLocaleTimeString()}`,
        url: imageDataUrl,
        type: "image",
        size: this.formatFileSize(file.size),
      });

      // Send image message to Firestore
      const roomId =
        this.roomManager.currentRoomData._id ||
        this.roomManager.currentRoomData.id;
      const messagesRef = db
        .collection("studyGroups")
        .doc(roomId)
        .collection("messages");

      messagesRef
        .add({
          authorUid: this.userAuth.currentUser.uid,
          author: this.userAuth.currentUser.displayName, // For backward compatibility
          text: "",
          isSystem: false,
          imageUrl: imageDataUrl,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .then(() => {
          showToast("Image shared successfully", "success");
        })
        .catch((error) => {
          console.error("Failed to send image:", error);
          showToast("Failed to send image. Please try again.", "error");
        });
    }

    // Send document message
    sendDocumentMessage(file, fileExt, fileDataUrl) {
      const fileType = this.getFileType(fileExt);

      // Add to shared files
      this.addSharedFile({
        name: file.name,
        url: fileDataUrl,
        type: fileType,
        size: this.formatFileSize(file.size),
        extension: fileExt,
      });

      // Send document message to Firestore
      const roomId =
        this.roomManager.currentRoomData._id ||
        this.roomManager.currentRoomData.id;
      const messagesRef = db
        .collection("studyGroups")
        .doc(roomId)
        .collection("messages");

      messagesRef
        .add({
          authorUid: this.userAuth.currentUser.uid,
          author: this.userAuth.currentUser.displayName, // For backward compatibility
          text: "",
          isSystem: false,
          fileUrl: fileDataUrl,
          fileName: file.name,
          fileType: fileType,
          fileSize: this.formatFileSize(file.size),
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .then(() => {
          showToast(`${fileType} file shared successfully`, "success");
        })
        .catch((error) => {
          console.error("Failed to send document:", error);
          showToast("Failed to send file. Please try again.", "error");
        });
    }

    // Add file to shared files list
    addSharedFile(file) {
      this.sharedFiles.push({
        id: Date.now(),
        name: file.name,
        url: file.url,
        type: file.type || "image",
        sender: this.userAuth.currentUser.displayName,
        senderUid: this.userAuth.currentUser.uid,
        timestamp: new Date().toISOString(),
        extension: file.extension,
      });

      // Update files list in settings if it's open
      this.updateFilesListInSettings();
    }

    // Update files list in settings modal
    updateFilesListInSettings() {
      const filesListElement = document.getElementById("filesList");
      if (!filesListElement) return;

      if (this.sharedFiles.length === 0) {
        filesListElement.innerHTML = `
          <div class="text-center p-4 text-muted">
            <i class="bi bi-file-earmark-x" style="font-size: 2rem;"></i>
            <p class="mt-2">No files have been shared in this session</p>
          </div>
        `;
        return;
      }

      filesListElement.innerHTML = this.sharedFiles
        .map((file) => {
          const date = new Date(file.timestamp);
          const formattedDate = date.toLocaleString();
          let fileIcon =
            file.type === "image"
              ? "bi bi-file-earmark-image text-primary"
              : this.getFileIcon(file.extension || "");

          return `
            <div class="card mb-2">
              <div class="card-body p-2">
                <div class="d-flex justify-content-between align-items-center">
                  <div class="d-flex align-items-center gap-2">
                    <i class="${fileIcon}" style="font-size: 1.5rem;"></i>
                    <div>
                      <div class="fw-bold">${file.name}</div>
                      <small class="text-muted">Shared by ${file.sender} • ${formattedDate}</small>
                    </div>
                  </div>
                  <a href="${file.url}" class="btn btn-sm btn-outline-primary" download="${file.name}">
                    <i class="bi bi-download"></i>
                  </a>
                </div>
              </div>
            </div>
          `;
        })
        .join("");
    }

    // Helper function to get file type based on extension
    getFileType(ext) {
      switch (ext?.toLowerCase()) {
        case "pdf":
          return "PDF";
        case "doc":
        case "docx":
          return "Word";
        case "ppt":
        case "pptx":
          return "PowerPoint";
        case "xls":
        case "xlsx":
          return "Excel";
        default:
          return "Document";
      }
    }

    // Helper function to get appropriate icon for file type
    getFileIcon(ext) {
      switch (ext?.toLowerCase()) {
        case "pdf":
          return "bi bi-file-earmark-pdf text-danger";
        case "doc":
        case "docx":
          return "bi bi-file-earmark-word text-primary";
        case "ppt":
        case "pptx":
          return "bi bi-file-earmark-slides text-warning";
        case "xls":
        case "xlsx":
          return "bi bi-file-earmark-spreadsheet text-success";
        default:
          return "bi bi-file-earmark text-secondary";
      }
    }

    // Helper function to format file size
    formatFileSize(bytes) {
      if (!bytes) return "";
      if (bytes < 1024) return bytes + " bytes";
      else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
      else return (bytes / 1048576).toFixed(1) + " MB";
    }
  }

  /**
   * Video Module - Handles video call functionality
   */
  class VideoManager {
    constructor(userAuth, roomManager) {
      this.userAuth = userAuth;
      this.roomManager = roomManager;
      this.isInCall = false;
      this.isMuted = false;
      this.isCameraOff = false;
      this.isScreenSharing = false;
      this.videoMinimized = false;
      this.videoMaximized = false;
      this.dragStartX = null;
      this.dragStartY = null;
      this.dragOffsetX = null;
      this.dragOffsetY = null;
      this.jitsiApi = null; // Will hold Jitsi Meet API instance in future
    }

    // Initialize video container and controls
    init() {
      const videoCallBtn = document.getElementById("videoCallBtn");
      const videoContainer = document.getElementById("videoContainer");
      const videoHeader = document.getElementById("videoHeader");
      const minimizeBtn = document.getElementById("minimizeBtn");
      const maximizeBtn = document.getElementById("maximizeBtn");
      const closeVideoBtn = document.getElementById("closeVideoBtn");
      const micBtn = document.getElementById("micBtn");
      const cameraBtn = document.getElementById("cameraBtn");
      const screenShareBtn = document.getElementById("screenShareBtn");
      const leaveCallBtn = document.getElementById("leaveCallBtn");

      // Start/end call
      videoCallBtn?.addEventListener("click", () => {
        if (!this.isInCall) {
          this.startVideoCall();
        } else {
          // If call is active but container is not visible, show it
          if (videoContainer && !videoContainer.classList.contains("active")) {
            videoContainer.classList.add("active");
          } else {
            this.endVideoCall();
          }
        }
      });

      // Window controls
      minimizeBtn?.addEventListener("click", () => {
        this.videoMinimized = !this.videoMinimized;
        videoContainer.classList.toggle("minimized", this.videoMinimized);
        this.videoMaximized = false;
        videoContainer.classList.remove("maximized");
        minimizeBtn.innerHTML = this.videoMinimized
          ? '<i class="bi bi-arrows-angle-expand"></i>'
          : '<i class="bi bi-dash-lg"></i>';
        minimizeBtn.title = this.videoMinimized ? "Restore" : "Minimize";

        // Update maximize button when we minimize
        maximizeBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';
        maximizeBtn.title = "Maximize (Alt+Up)";
      });

      // Maximize/restore
      maximizeBtn?.addEventListener("click", () => {
        this.videoMaximized = !this.videoMaximized;
        videoContainer.classList.toggle("maximized", this.videoMaximized);
        this.videoMinimized = false;
        videoContainer.classList.remove("minimized");

        if (this.videoMaximized) {
          // Fullscreen mode
          videoContainer.style.position = "fixed";
          videoContainer.style.top = "0";
          videoContainer.style.left = "0";
          videoContainer.style.width = "100%";
          videoContainer.style.height = "100%";
          videoContainer.style.zIndex = "2000";
          videoContainer.style.borderRadius = "0";
          videoContainer.style.border = "none";

          maximizeBtn.innerHTML = '<i class="bi bi-fullscreen-exit"></i>';
          maximizeBtn.title = "Exit Fullscreen (Alt+Down)";
        } else {
          // Restore to normal floating window
          videoContainer.style.position = "fixed";
          videoContainer.style.width = "360px";
          videoContainer.style.height = "240px";
          videoContainer.style.bottom = "100px";
          videoContainer.style.right = "30px";
          videoContainer.style.top = "auto";
          videoContainer.style.left = "auto";
          videoContainer.style.zIndex = "1000";
          videoContainer.style.borderRadius = "12px";
          videoContainer.style.border = "2px solid var(--primary-color)";

          maximizeBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';
          maximizeBtn.title = "Maximize (Alt+Up)";
        }

        minimizeBtn.innerHTML = '<i class="bi bi-dash-lg"></i>';
        minimizeBtn.title = "Minimize (Alt+Down)";
      });

      closeVideoBtn?.addEventListener("click", () => this.endVideoCall());

      // Call controls
      micBtn?.addEventListener("click", () => this.toggleMicrophone());
      cameraBtn?.addEventListener("click", () => this.toggleCamera());
      screenShareBtn?.addEventListener("click", () => this.toggleScreenShare());
      leaveCallBtn?.addEventListener("click", () => this.endVideoCall());

      // Double-click header to toggle maximize
      videoHeader?.addEventListener("dblclick", () => {
        maximizeBtn.click();
      });

      // Dragging functionality
      videoHeader?.addEventListener("mousedown", (e) => this.startDrag(e));
      document.addEventListener("mousemove", (e) => this.drag(e));
      document.addEventListener("mouseup", () => this.endDrag());

      // Touch support
      videoHeader?.addEventListener("touchstart", (e) =>
        this.startDragTouch(e)
      );
      document.addEventListener("touchmove", (e) => this.dragTouch(e));
      document.addEventListener("touchend", () => this.endDrag());

      // Prevent defaults to enable drag
      videoHeader?.addEventListener("dragstart", (e) => e.preventDefault());
    }

    // Load Jitsi Meet script (for future integration)
    loadJitsiScript() {
      return new Promise((resolve, reject) => {
        if (document.getElementById("jitsi-api")) {
          resolve();
          return;
        }

        const script = document.createElement("script");
        script.id = "jitsi-api";
        script.src = `https://${CONFIG.jitsiDomain}/external_api.js`;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    }

    // Start video call
    async startVideoCall() {
      this.isInCall = true;

      // Update UI
      const videoCallBtn = document.getElementById("videoCallBtn");
      const videoContainer = document.getElementById("videoContainer");
      const callIndicator = document.getElementById("callIndicator");
      const videoPlaceholder = document.getElementById("videoPlaceholder");
      const videoGrid = document.getElementById("videoGrid");

      videoCallBtn.classList.add("active");
      videoCallBtn.innerHTML = '<i class="bi bi-telephone-x-fill"></i>';
      videoCallBtn.title = "End Call";

      videoContainer.classList.add("active");
      if (callIndicator) callIndicator.style.display = "block";

      // Show loading indicator
      if (videoPlaceholder) {
        videoPlaceholder.style.display = "flex";
        videoPlaceholder.innerHTML = `
          <div class="spinner-border text-light" role="status"></div>
          <div style="margin-top: 15px;">Setting up video call...</div>
        `;
      }

      try {
        // Future Jitsi integration would go here
        // For now, simulate video call with a delay
        setTimeout(() => {
          // Hide placeholder, prepare container
          if (videoPlaceholder) videoPlaceholder.style.display = "none";
          if (videoGrid) {
            videoGrid.style.display = "block";
            videoGrid.innerHTML = `
              <div class="video-participant" id="self-video">
                <i class="bi bi-person-circle" style="font-size: 36px;"></i>
                <div class="participant-label">${this.userAuth.currentUser.displayName} (You)</div>
              </div>
            `;
          }

          // Update participant status
          this.roomManager.updateParticipantCallStatus(
            this.userAuth.currentUser.uid,
            true
          );
          chatModule.sendSystemMessage(
            `${this.userAuth.currentUser.displayName} joined the call`
          );
          showToast("You've joined the video call", "success");
        }, 1500);
      } catch (error) {
        console.error("Error starting video call:", error);
        showToast("Failed to start video call. Please try again.", "error");
      }
    }

    // End video call
    endVideoCall() {
      this.isInCall = false;

      // Update UI
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

      if (videoContainer) {
        videoContainer.classList.remove("active", "minimized", "maximized");
      }

      if (callIndicator) {
        callIndicator.style.display = "none";
      }

      // Reset video container
      if (videoPlaceholder) {
        videoPlaceholder.style.display = "flex";
        videoPlaceholder.innerHTML = `
          <i class="bi bi-camera-video" style="font-size: 32px;"></i>
          <div>Click to start a video call</div>
        `;
      }

      if (videoGrid) {
        videoGrid.style.display = "none";
        videoGrid.innerHTML = "";
      }

      // Reset container style if needed
      if (videoContainer) {
        videoContainer.style.position = "fixed";
        videoContainer.style.width = "360px";
        videoContainer.style.height = "240px";
        videoContainer.style.bottom = "100px";
        videoContainer.style.right = "30px";
        videoContainer.style.top = "auto";
        videoContainer.style.left = "auto";
        videoContainer.style.zIndex = "1000";
        videoContainer.style.borderRadius = "12px";
        videoContainer.style.border = "2px solid var(--primary-color)";
      }

      // Reset controls
      const minimizeBtn = document.getElementById("minimizeBtn");
      const maximizeBtn = document.getElementById("maximizeBtn");

      if (minimizeBtn) {
        minimizeBtn.innerHTML = '<i class="bi bi-dash-lg"></i>';
        minimizeBtn.title = "Minimize (Alt+Down)";
      }

      if (maximizeBtn) {
        maximizeBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';
        maximizeBtn.title = "Maximize (Alt+Up)";
      }

      this.isMuted = false;
      this.isCameraOff = false;
      this.isScreenSharing = false;
      this.videoMinimized = false;
      this.videoMaximized = false;
      this.updateVideoControls();

      // Update participant status
      this.roomManager.updateParticipantCallStatus(
        this.userAuth.currentUser.uid,
        false
      );

      showToast("You left the video call", "info");
      chatModule.sendSystemMessage(
        `${this.userAuth.currentUser.displayName} left the call`
      );
    }

    // Toggle microphone state
    toggleMicrophone() {
      this.isMuted = !this.isMuted;
      this.updateVideoControls();
      showToast(`Microphone ${this.isMuted ? "muted" : "unmuted"}`, "info");
    }

    // Toggle camera state
    toggleCamera() {
      this.isCameraOff = !this.isCameraOff;

      // Update UI in simulated mode
      const selfVideo = document.getElementById("self-video");
      if (selfVideo) {
        selfVideo.innerHTML = this.isCameraOff
          ? `<i class="bi bi-person-circle" style="font-size: 36px;"></i>
             <div class="participant-label">${this.userAuth.currentUser.displayName} (You)</div>`
          : `<div style="font-size: 14px;">Camera On</div>
             <div class="participant-label">${this.userAuth.currentUser.displayName} (You)</div>`;
      }

      this.updateVideoControls();
      showToast(
        `Camera ${this.isCameraOff ? "turned off" : "turned on"}`,
        "info"
      );
    }

    // Toggle screen share state
    toggleScreenShare() {
      this.isScreenSharing = !this.isScreenSharing;

      // Update UI in simulated mode
      const selfVideo = document.getElementById("self-video");
      if (selfVideo && this.isScreenSharing) {
        selfVideo.innerHTML = `
          <div style="text-align: center;">
            <i class="bi bi-display" style="font-size: 24px;"></i>
            <div style="font-size: 12px;">Screen sharing active</div>
          </div>
          <div class="participant-label">${this.userAuth.currentUser.displayName} (You)</div>
        `;
      } else if (selfVideo) {
        selfVideo.innerHTML = this.isCameraOff
          ? `<i class="bi bi-person-circle" style="font-size: 36px;"></i>
             <div class="participant-label">${this.userAuth.currentUser.displayName} (You)</div>`
          : `<div style="font-size: 14px;">Camera On</div>
             <div class="participant-label">${this.userAuth.currentUser.displayName} (You)</div>`;
      }

      this.updateVideoControls();
      showToast(
        `Screen sharing ${this.isScreenSharing ? "started" : "stopped"}`,
        "info"
      );
    }

    // Update video control UI
    updateVideoControls() {
      const micBtn = document.getElementById("micBtn");
      const cameraBtn = document.getElementById("cameraBtn");
      const screenShareBtn = document.getElementById("screenShareBtn");

      // Update microphone button
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

      // Update camera button
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

      // Update screen share button
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

    // Dragging functionality for video container - includes touch and mouse events
    startDrag(e) {
      const videoContainer = document.getElementById("videoContainer");
      if (!videoContainer) return;

      // If maximized, restore to normal size first when user tries to drag
      if (this.videoMaximized) {
        this.videoMaximized = false;
        videoContainer.classList.remove("maximized");

        // Update maximize button appearance
        const maximizeBtn = document.getElementById("maximizeBtn");
        if (maximizeBtn) {
          maximizeBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';
          maximizeBtn.title = "Maximize (Alt+Up)";
        }

        // Position the container near the cursor for better UX
        videoContainer.style.position = "fixed";
        videoContainer.style.width = "360px";
        videoContainer.style.height = "240px";
        videoContainer.style.bottom = "auto";
        videoContainer.style.right = "auto";
        videoContainer.style.top = e.clientY - 30 + "px";
        videoContainer.style.left = e.clientX - 100 + "px";
        videoContainer.style.zIndex = "1000";
        videoContainer.style.borderRadius = "12px";
        videoContainer.style.border = "2px solid var(--primary-color)";

        // Add a slight delay before starting the drag
        setTimeout(() => {
          const rect = videoContainer.getBoundingClientRect();
          this.dragStartX = e.clientX;
          this.dragStartY = e.clientY;
          this.dragOffsetX = rect.left;
          this.dragOffsetY = rect.top;
          videoContainer.classList.add("dragging");
        }, 10);
      } else {
        // Normal drag behavior
        const rect = videoContainer.getBoundingClientRect();
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragOffsetX = rect.left;
        this.dragOffsetY = rect.top;
        videoContainer.classList.add("dragging");
      }

      e.preventDefault();
    }

    drag(e) {
      if (!this.dragStartX || !this.dragStartY) return;

      const videoContainer = document.getElementById("videoContainer");
      if (!videoContainer) return;

      const rect = videoContainer.getBoundingClientRect();

      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;

      // Constrain to viewport
      let newLeft = this.dragOffsetX + deltaX;
      let newTop = this.dragOffsetY + deltaY;

      // Keep within viewport bounds
      newLeft = Math.max(0, Math.min(window.innerWidth - rect.width, newLeft));
      newTop = Math.max(0, Math.min(window.innerHeight - rect.height, newTop));

      videoContainer.style.left = newLeft + "px";
      videoContainer.style.top = newTop + "px";
      videoContainer.style.right = "auto";
      videoContainer.style.bottom = "auto";

      e.preventDefault();
    }

    // Touch support for mobile devices
    startDragTouch(e) {
      const videoContainer = document.getElementById("videoContainer");
      if (!videoContainer) return;

      const touch = e.touches[0];

      // If maximized, restore to normal size first
      if (this.videoMaximized) {
        this.videoMaximized = false;
        videoContainer.classList.remove("maximized");

        // Update maximize button appearance
        const maximizeBtn = document.getElementById("maximizeBtn");
        if (maximizeBtn) {
          maximizeBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';
          maximizeBtn.title = "Maximize (Alt+Up)";
        }

        // Position the container near the touch point
        videoContainer.style.position = "fixed";
        videoContainer.style.width = "360px";
        videoContainer.style.height = "240px";
        videoContainer.style.bottom = "auto";
        videoContainer.style.right = "auto";
        videoContainer.style.top = touch.clientY - 30 + "px";
        videoContainer.style.left = touch.clientX - 100 + "px";
        videoContainer.style.zIndex = "1000";
        videoContainer.style.borderRadius = "12px";
        videoContainer.style.border = "2px solid var(--primary-color)";

        setTimeout(() => {
          const rect = videoContainer.getBoundingClientRect();
          this.dragStartX = touch.clientX;
          this.dragStartY = touch.clientY;
          this.dragOffsetX = rect.left;
          this.dragOffsetY = rect.top;
          videoContainer.classList.add("dragging");
        }, 10);
      } else {
        const rect = videoContainer.getBoundingClientRect();
        this.dragStartX = touch.clientX;
        this.dragStartY = touch.clientY;
        this.dragOffsetX = rect.left;
        this.dragOffsetY = rect.top;
        videoContainer.classList.add("dragging");
      }

      e.preventDefault();
    }

    dragTouch(e) {
      if (!this.dragStartX || !this.dragStartY) return;

      const videoContainer = document.getElementById("videoContainer");
      if (!videoContainer) return;

      const rect = videoContainer.getBoundingClientRect();
      const touch = e.touches[0];

      const deltaX = touch.clientX - this.dragStartX;
      const deltaY = touch.clientY - this.dragStartY;

      // Constrain to viewport
      let newLeft = this.dragOffsetX + deltaX;
      let newTop = this.dragOffsetY + deltaY;

      // Keep within viewport bounds
      newLeft = Math.max(0, Math.min(window.innerWidth - rect.width, newLeft));
      newTop = Math.max(0, Math.min(window.innerHeight - rect.height, newTop));

      videoContainer.style.left = newLeft + "px";
      videoContainer.style.top = newTop + "px";
      videoContainer.style.right = "auto";
      videoContainer.style.bottom = "auto";

      e.preventDefault();
    }

    endDrag() {
      const videoContainer = document.getElementById("videoContainer");
      if (videoContainer) {
        videoContainer.classList.remove("dragging");
      }
      this.dragStartX = null;
      this.dragStartY = null;
    }
  }

  /**
   * UI Module - Handles UI components and interactions
   */
  class UiManager {
    constructor(userAuth, roomManager) {
      this.userAuth = userAuth;
      this.roomManager = roomManager;
      this.autoSaveInterval = null;
    }
    // Initialize UI components
    init() {
      this.initializeTheme();
      this.initializeSettingsModal();
      this.initializeInviteSystem();
      this.initializeSidebar();
      this.setupKeyboardShortcuts();
      this.initializeAutoSave();

      // Set up logout button
      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", () => this.userAuth.logout());
      }

      // Setup global event handlers
      window.openImageModal = this.openImageModal;
      window.kickParticipant = (userId) =>
        this.roomManager.kickParticipant(userId);
      window.closeToast = this.closeToast;
    }

    // Initialize theme toggle functionality
    initializeTheme() {
      const themeToggle = document.getElementById("themeToggle");
      const body = document.body;

      const savedTheme = localStorage.getItem("theme") || "light";
      if (savedTheme === "dark") {
        body.classList.add("dark-mode");
        if (themeToggle) themeToggle.innerHTML = '<i class="bi bi-sun"></i>';
      }

      themeToggle?.addEventListener("click", () => {
        body.classList.toggle("dark-mode");
        const isDark = body.classList.contains("dark-mode");
        themeToggle.innerHTML = isDark
          ? '<i class="bi bi-sun"></i>'
          : '<i class="bi bi-moon"></i>';
        localStorage.setItem("theme", isDark ? "dark" : "light");

        showToast(
          `Theme switched to ${isDark ? "dark" : "light"} mode`,
          "info"
        );
      });
    }

    // Initialize settings modal functionality
    initializeSettingsModal() {
      const settingsBtn = document.getElementById("settingsBtn");
      if (settingsBtn) {
        // Show settings button for everyone
        settingsBtn.style.display = "block";
        settingsBtn.addEventListener("click", () => this.openSettingsModal());
      }

      const saveSettingsBtn = document.getElementById("saveSettingsBtn");
      if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener("click", () =>
          this.roomManager.saveRoomSettings()
        );
      }

      const deleteRoomBtn = document.getElementById("deleteRoomBtn");
      if (deleteRoomBtn) {
        deleteRoomBtn.addEventListener("click", () =>
          this.roomManager.deleteRoom()
        );
      }
    }

    // Open settings modal with current data
    openSettingsModal() {
      try {
        const modalElement = document.getElementById("settingsModal");
        if (!modalElement) {
          console.error("Settings modal element not found");
          return;
        }

        const modal = new bootstrap.Modal(modalElement);

        // Populate current values
        document.getElementById("roomNameInput").value =
          this.roomManager.currentRoomData.name || "";
        document.getElementById("roomDescInput").value =
          this.roomManager.currentRoomData.description || "";

        // Populate participants list for management
        const participantsList2 = document.getElementById("participantsList2");
        if (participantsList2) {
          participantsList2.innerHTML = this.roomManager.participants
            .map(
              (participant) => `
                <div class="d-flex justify-content-between align-items-center p-2 border rounded mb-2">
                  <div class="d-flex align-items-center gap-2">
                    <div class="participant-avatar" style="width: 24px; height: 24px; font-size: 12px;">${
                      participant.avatar
                    }</div>
                    <span>${participant.name}${
                participant.id === this.userAuth.currentUser.uid ? " (You)" : ""
              }</span>
                    ${
                      participant.isHost
                        ? '<span class="badge bg-primary">Host</span>'
                        : ""
                    }
                  </div>
                  ${
                    participant.id !== this.userAuth.currentUser.uid
                      ? `
                    <button class="btn btn-outline-danger btn-sm" onclick="window.kickParticipant('${participant.id}')">
                      <i class="bi bi-x-lg"></i> Kick
                    </button>
                  `
                      : ""
                  }
                </div>
              `
            )
            .join("");
        }

        // Update files list
        chatModule.updateFilesListInSettings();

        // Show/hide Delete Room button based on ownership
        const deleteBtn = document.getElementById("deleteRoomBtn");
        if (deleteBtn) {
          deleteBtn.style.display = this.roomManager.isOwner
            ? "inline-block"
            : "none";
        }

        // Show the modal
        modal.show();
      } catch (error) {
        console.error("Error opening settings modal:", error);
        showToast("Unable to open settings modal", "error");
      }
    }

    // Initialize invite functionality
    initializeInviteSystem() {
      const inviteBtn = document.getElementById("inviteBtn");
      const copyLinkBtn = document.getElementById("copyLinkBtn");

      inviteBtn?.addEventListener("click", () => {
        const modalElement = document.getElementById("inviteModal");
        if (modalElement) {
          try {
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
          } catch (error) {
            console.error("Error showing invite modal:", error);
          }
        }
      });

      copyLinkBtn?.addEventListener("click", () => {
        const inviteLink = document.getElementById("inviteLink");
        if (!inviteLink) return;

        inviteLink.select();

        try {
          navigator.clipboard
            .writeText(inviteLink.value)
            .then(() => {
              showToast("Invite link copied to clipboard", "success");
            })
            .catch((err) => {
              console.error("Clipboard API failed:", err);
              // Fallback
              document.execCommand("copy");
              showToast("Invite link copied to clipboard", "success");
            });
        } catch (err) {
          console.error("Error copying invite link:", err);
          showToast(
            "Failed to copy link. Please select and copy manually.",
            "error"
          );
        }
      });
    }

    // Set up keyboard shortcuts
    setupKeyboardShortcuts() {
      document.addEventListener("keydown", (e) => {
        // Alt+M to toggle microphone when in call
        if (e.altKey && e.key === "m" && videoModule.isInCall) {
          e.preventDefault();
          videoModule.toggleMicrophone();
        }

        // Alt+V to toggle camera when in call
        if (e.altKey && e.key === "v" && videoModule.isInCall) {
          e.preventDefault();
          videoModule.toggleCamera();
        }

        // Alt+S to toggle screen share when in call
        if (e.altKey && e.key === "s" && videoModule.isInCall) {
          e.preventDefault();
          videoModule.toggleScreenShare();
        }

        // Alt+J to join call when not in call
        if (e.altKey && e.key === "j" && !videoModule.isInCall) {
          e.preventDefault();
          videoModule.startVideoCall();
        }

        // Alt+L to leave call when in call
        if (e.altKey && e.key === "l" && videoModule.isInCall) {
          e.preventDefault();
          videoModule.endVideoCall();
        }

        // Alt+Up to maximize video window
        if (
          e.altKey &&
          e.key === "ArrowUp" &&
          videoModule.isInCall &&
          !videoModule.videoMaximized
        ) {
          e.preventDefault();
          document.getElementById("maximizeBtn").click();
        }

        // Alt+Down to minimize/restore video window
        if (
          e.altKey &&
          e.key === "ArrowDown" &&
          videoModule.isInCall &&
          videoModule.videoMaximized
        ) {
          e.preventDefault();
          document.getElementById("maximizeBtn").click();
        } else if (
          e.altKey &&
          e.key === "ArrowDown" &&
          videoModule.isInCall &&
          !videoModule.videoMinimized
        ) {
          e.preventDefault();
          document.getElementById("minimizeBtn").click();
        }

        // Escape to close sidebar on mobile or restore video from maximized
        if (e.key === "Escape") {
          const sidebar = document.getElementById("sidebar");
          if (window.innerWidth <= 768 && sidebar.classList.contains("open")) {
            this.setSidebar(false);
          } else if (videoModule.isInCall && videoModule.videoMaximized) {
            document.getElementById("maximizeBtn").click();
          }
        }
      });
    }

    // Initialize sidebar functionality
    initializeSidebar() {
      const sidebar = document.getElementById("sidebar");
      const mainContent = document.getElementById("mainContent");
      const menuToggle = document.getElementById("menuToggle");

      if (!sidebar || !mainContent || !menuToggle) return;

      // Default open on desktop
      if (window.innerWidth > 768) this.setSidebar(true);

      menuToggle.addEventListener("click", () => {
        this.setSidebar(!sidebar.classList.contains("open"));
      });

      document.addEventListener("click", (e) => {
        if (window.innerWidth <= 768) {
          if (
            !sidebar.contains(e.target) &&
            !menuToggle.contains(e.target) &&
            sidebar.classList.contains("open")
          ) {
            this.setSidebar(false);
          }
        }
      });

      // Handle window resize
      window.addEventListener("resize", () => {
        if (window.innerWidth > 768) {
          if (!sidebar.classList.contains("open")) {
            this.setSidebar(true);
          }
        } else {
          if (sidebar.classList.contains("open")) {
            this.setSidebar(false);
          }
        }
      });
    }

    // Set sidebar state (open/closed)
    setSidebar(open) {
      const sidebar = document.getElementById("sidebar");
      const mainContent = document.getElementById("mainContent");

      if (!sidebar || !mainContent) return;

      if (open) {
        sidebar.classList.add("open");
        mainContent.classList.add("shifted");
      } else {
        sidebar.classList.remove("open");
        mainContent.classList.remove("shifted");
      }
    }

    // Open image modal for full-screen viewing
    static openImageModal(imageUrl) {
      // Create a simple image modal
      const modal = document.createElement("div");
      modal.className = "modal fade";
      modal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Image</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body text-center">
              <img src="${imageUrl}" alt="Shared image" style="max-width: 100%; height: auto; max-height: 70vh;">
            </div>
            <div class="modal-footer">
              <a href="${imageUrl}" class="btn btn-outline-primary" download target="_blank">
                <i class="bi bi-download"></i> Download
              </a>
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      try {
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();

        modal.addEventListener("hidden.bs.modal", () => {
          modal.remove();
        });
      } catch (error) {
        console.error("Error showing image modal:", error);
        modal.remove();
        showToast("Failed to open image preview", "error");
      }
    }

    // Initialize auto-save for room data
    initializeAutoSave() {
      // Auto-save room data every 30 seconds
      this.autoSaveInterval = setInterval(() => {
        if (this.roomManager.currentRoomData) {
          const allRoomsData = JSON.parse(
            localStorage.getItem("allRoomsData") || "{}"
          );
          allRoomsData[this.roomManager.currentRoomData.id] = {
            ...this.roomManager.currentRoomData,
            lastActivity: new Date().toISOString(),
          };
          localStorage.setItem("allRoomsData", JSON.stringify(allRoomsData));

          if (CONFIG.debug) {
            console.log(
              "Room data auto-saved:",
              new Date().toLocaleTimeString()
            );
          }
        }
      }, 30000);
    }

    // Cleanup resources
    cleanup() {
      if (this.autoSaveInterval) {
        clearInterval(this.autoSaveInterval);
      }
    }
  }

  /**
   * Toast Notification System
   */
  function showToast(message, type = "success") {
    const toastContainer = document.getElementById("toastContainer");
    if (!toastContainer) return;

    const toastId = "toast-" + Date.now();

    const iconMap = {
      success: "bi-check-circle-fill",
      error: "bi-exclamation-circle-fill",
      info: "bi-info-circle-fill",
      warning: "bi-exclamation-triangle-fill",
    };

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.id = toastId;

    toast.innerHTML = `
      <div class="toast-icon">
        <i class="bi ${iconMap[type] || iconMap.info}"></i>
      </div>
      <div class="toast-content">
        <div class="toast-title">${
          type.charAt(0).toUpperCase() + type.slice(1)
        }</div>
        <div class="toast-message">${message}</div>
      </div>
      <div class="toast-close" onclick="window.closeToast('${toastId}')">
        <i class="bi bi-x"></i>
      </div>
    `;

    toastContainer.appendChild(toast);

    // Auto hide after 4 seconds for success and info
    if (type === "success" || type === "info") {
      setTimeout(() => {
        closeToast(toastId);
      }, 4000);
    }
  }

  function closeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (toast) {
      toast.style.opacity = "0";
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }
  }

  /**
   * Loading Overlay
   */
  function showPageLoading() {
    let loadingOverlay = document.getElementById("pageLoadingOverlay");

    if (!loadingOverlay) {
      loadingOverlay = document.createElement("div");
      loadingOverlay.id = "pageLoadingOverlay";
      loadingOverlay.className = "loading-overlay";
      loadingOverlay.innerHTML = `
        <div class="loading-content">
          <div class="spinner-grow text-success"></div>
          <p>Loading study room...</p>
        </div>
      `;
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

  /**
   * Main Application Initialization
   */
  async function initializeApp() {
    try {
      showPageLoading();

      // Initialize modules
      userModule = new UserAuth();
      await userModule.init();

      roomModule = new RoomManager(userModule);
      await roomModule.loadRoomData();

      chatModule = new ChatManager(userModule, roomModule);
      videoModule = new VideoManager(userModule, roomModule);
      uiModule = new UiManager(userModule, roomModule);

      // Update UI with data
      userModule.updateSidebarUserInfo();
      roomModule.updateRoomDisplay();
      roomModule.updateParticipantsList();

      // Initialize interactive components
      chatModule.init();
      videoModule.init();
      uiModule.init();

      // Set up global objects for access from HTML
      window.userModule = userModule;
      window.roomModule = roomModule;
      window.chatModule = chatModule;
      window.videoModule = videoModule;
      window.UiManager = UiManager;
      window.closeToastFunction = closeToast;

      // Show welcome message
      setTimeout(() => {
        showToast(
          `Welcome to ${roomModule.currentRoomData?.name || "the study room"}!`,
          "success"
        );

        // Only send system messages if owner and they don't already exist
        if (
          roomModule.isOwner &&
          !chatModule.messages.some(
            (msg) =>
              msg.isSystem &&
              msg.text ===
                `Room created by ${userModule.currentUser.displayName}`
          )
        ) {
          chatModule.sendSystemMessage(
            `Room created by ${userModule.currentUser.displayName}`
          );
        }

        if (
          roomModule.isOwner &&
          !chatModule.messages.some(
            (msg) =>
              msg.isSystem &&
              msg.text ===
                "Click the camera button to start a video call. Double-click the video header for fullscreen mode."
          )
        ) {
          chatModule.sendSystemMessage(
            "Click the camera button to start a video call. Double-click the video header for fullscreen mode."
          );
        }
      }, 1000);

      // Log session info
      console.log(
        `Study room ready for ${
          userModule.currentUser.displayName
        } at ${new Date().toLocaleString()}`
      );
      console.log(
        `Current session: ${
          userModule.currentUser.displayName
        } logged in at ${new Date().toISOString()}`
      );
      console.log(`Tip: Access shared files through the Settings > Files tab`);

      // Custom message for user DanePascual
      if (userModule.currentUser.displayName === "DanePascual") {
        console.log(
          `Welcome back, DanePascual! Current time: ${new Date().toLocaleString()}`
        );
      }
    } catch (error) {
      console.error("Error initializing app:", error);
      showToast(
        "Failed to initialize study room. Please try refreshing the page.",
        "error"
      );
    } finally {
      hidePageLoading();
    }
  }

  /**
   * Clean up resources when leaving the page
   */
  window.addEventListener("beforeunload", () => {
    // Clean up resources
    if (chatModule && chatModule.unsubscribeMessages) {
      chatModule.unsubscribeMessages();
    }

    if (uiModule) {
      uiModule.cleanup();
    }

    // If in call, update status
    if (videoModule && videoModule.isInCall) {
      roomModule?.updateParticipantCallStatus(
        userModule?.currentUser?.uid,
        false
      );
    }
  });

  // Start the application when DOM is loaded
  document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
  });
}
