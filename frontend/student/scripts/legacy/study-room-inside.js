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
  backendBase: "http://localhost:5000", // ensure uploads call goes to backend (not static file server)
  jitsiDomain: "meet.jit.si", // For future Jitsi integration
  debug: true,
  defaultAvatar: "U",
};

// Ensure firebase sdk is present
if (typeof firebase === "undefined") {
  console.error("Firebase SDK not loaded!");
} else {
  // Firestore & Auth (compat)
  const db = firebase.firestore();
  const auth = firebase.auth();

  // Globals
  let userModule;
  let roomModule;
  let chatModule;
  let videoModule;
  let uiModule;

  // Cache for user display info
  const userDisplayCache = {};

  // Client-side max upload size (match server multer): 10MB
  const CLIENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

  // -------------------
  // Helper: Upload File to backend (which stores in Supabase)
  // -------------------
  async function uploadFileToBackend(roomId, file) {
    if (!file) throw new Error("No file provided");
    if (!roomId) throw new Error("Missing roomId");

    if (file.size > CLIENT_MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File too large. Max allowed is ${CLIENT_MAX_FILE_SIZE_BYTES} bytes.`
      );
    }

    // Guard: ensure user still authenticated before attempting token fetch
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      throw new Error(
        "Not authenticated (cannot upload). Please sign in again."
      );
    }

    const token = await currentUser.getIdToken();
    const fd = new FormData();
    fd.append("file", file, file.name);
    fd.append("roomId", roomId);

    const uploadUrl = `${CONFIG.backendBase.replace(
      /\/$/,
      ""
    )}/api/uploads/room-file`;

    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
      body: fd,
    });

    if (!res.ok) {
      let body = null;
      try {
        body = await res.json();
      } catch (e) {}
      const errMsg =
        body && body.error
          ? body.error
          : `Upload failed (status ${res.status})`;
      throw new Error(errMsg);
    }

    return await res.json(); // { url, filename }
  }

  // -------------------
  // UserAuth - handles Firebase user and cached display info
  // -------------------
  class UserAuth {
    constructor() {
      this.currentUser = null;
      this.isLoading = true;
    }

    async init() {
      return new Promise((resolve, reject) => {
        console.log("Initializing auth...");
        auth.onAuthStateChanged(async (user) => {
          if (user) {
            try {
              await this.setCurrentUser(user);
              this.isLoading = false;
              resolve(this.currentUser);
            } catch (err) {
              console.error("Error setting current user", err);
              this.isLoading = false;
              reject(err);
            }
          } else {
            // redirect to login (dynamic)
            const currentPath = window.location.pathname;
            const pathParts = currentPath.split("/");
            const loginPath =
              pathParts.slice(0, pathParts.length - 1).join("/") +
              "/login.html";
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
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (userDoc.exists) {
          const data = userDoc.data();
          this.currentUser = {
            ...this.currentUser,
            program: data.program || "",
            name: data.name || this.currentUser.displayName,
            avatar:
              data.avatar ||
              (this.currentUser.displayName || "U")
                .substring(0, 1)
                .toUpperCase(),
            photo: data.photo || this.currentUser.photoURL || null,
          };
        }
      } catch (err) {
        console.warn("Could not fetch extra user data:", err);
      }

      userDisplayCache[user.uid] = {
        displayName: this.currentUser.name || this.currentUser.displayName,
        avatar:
          this.currentUser.avatar ||
          (this.currentUser.displayName || "U").substring(0, 1).toUpperCase(),
        email: this.currentUser.email,
        photo: this.currentUser.photo || this.currentUser.photoURL || null,
      };

      return this.currentUser;
    }

    async getUserDisplayInfo(uid) {
      if (!uid)
        return {
          displayName: "Unknown",
          avatar: CONFIG.defaultAvatar,
          email: null,
          photo: null,
        };
      if (userDisplayCache[uid]) return userDisplayCache[uid];

      if (this.currentUser && uid === this.currentUser.uid) {
        return {
          displayName: this.currentUser.name || this.currentUser.displayName,
          avatar:
            this.currentUser.avatar ||
            (this.currentUser.displayName || "U").substring(0, 1).toUpperCase(),
          email: this.currentUser.email,
          photo: this.currentUser.photo || this.currentUser.photoURL || null,
        };
      }

      try {
        const doc = await db.collection("users").doc(uid).get();
        if (doc.exists) {
          const data = doc.data();
          const info = {
            displayName:
              data.name || data.email?.split("@")[0] || uid.substring(0, 8),
            avatar:
              data.avatar ||
              (data.name ? data.name.substring(0, 1).toUpperCase() : "U"),
            email: data.email,
            photo: data.photo || null,
          };
          userDisplayCache[uid] = info;
          return info;
        }
      } catch (err) {
        console.error("Error fetching user doc:", err);
      }

      // fallback
      return {
        displayName: uid.substring(0, 8),
        avatar: CONFIG.defaultAvatar,
        email: null,
        photo: null,
      };
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
        console.error("Logout failed:", err);
        showToast("Error signing out. Please try again.", "error");
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
        console.warn("updateSidebarUserInfo failed:", err && err.message);
      }
    }
  }

  // -------------------
  // RoomManager - loads room metadata and participants
  // -------------------
  class RoomManager {
    constructor(userAuth) {
      this.userAuth = userAuth;
      this.currentRoomData = null;
      this.isOwner = false;
      this.participants = [];
      this.isLoading = true;
    }

    async loadRoomData() {
      this.isLoading = true;
      const urlParams = new URLSearchParams(window.location.search);
      const roomId = urlParams.get("room");
      if (!roomId) {
        showToast("Room ID not found in URL", "error");
        window.location.href = "study-rooms.html";
        return null;
      }

      try {
        const res = await fetch(`${CONFIG.apiBase}/${roomId}`);
        if (!res.ok)
          throw new Error(`Failed to load room (status ${res.status})`);
        this.currentRoomData = await res.json();
        this.isOwner =
          this.currentRoomData.creator === this.userAuth.currentUser.uid;
        await this.loadParticipantsInfo();
        this.isLoading = false;
        return this.currentRoomData;
      } catch (err) {
        console.error("Error loading room:", err);
        showToast("Failed to load room: " + err.message, "error");
        this.isLoading = false;
        setTimeout(() => {
          window.location.href = "study-rooms.html";
        }, 2000);
        return null;
      }
    }

    async loadParticipantsInfo() {
      this.participants = [];
      if (
        !this.currentRoomData?.participants ||
        !Array.isArray(this.currentRoomData.participants)
      ) {
        // fallback include current user
        const selfInfo = await this.userAuth.getUserDisplayInfo(
          this.userAuth.currentUser.uid
        );
        this.participants = [
          {
            id: this.userAuth.currentUser.uid,
            name: selfInfo.displayName,
            avatar: selfInfo.avatar,
            photo:
              this.userAuth.currentUser.photoURL ||
              this.userAuth.currentUser.photo ||
              null,
            status: "online",
            isHost: this.isOwner,
            inCall: false,
          },
        ];
        return;
      }

      const promises = this.currentRoomData.participants.map(async (uid) => {
        try {
          const info = await this.userAuth.getUserDisplayInfo(uid);
          let photo = null;
          if (uid === this.userAuth.currentUser.uid) {
            photo =
              this.userAuth.currentUser.photoURL ||
              this.userAuth.currentUser.photo;
          } else {
            const doc = await db.collection("users").doc(uid).get();
            if (doc.exists && doc.data().photo) photo = doc.data().photo;
          }
          return {
            id: uid,
            name: info.displayName,
            avatar: info.avatar,
            photo: photo || info.photo || null,
            status: "online",
            isHost: this.currentRoomData.creator === uid,
            inCall: false,
          };
        } catch (err) {
          console.error("Error loading participant:", err);
          return {
            id: uid,
            name: uid.substring(0, 8),
            avatar: CONFIG.defaultAvatar,
            photo: null,
            status: "online",
            isHost: this.currentRoomData.creator === uid,
            inCall: false,
          };
        }
      });

      this.participants = await Promise.all(promises);
    }

    updateParticipantsList() {
      const participantsList = document.getElementById("participantsList");
      if (!participantsList) return;
      participantsList.innerHTML = this.participants
        .map((p) => {
          const isCurrent = p.id === this.userAuth.currentUser.uid;
          const canKick = this.isOwner && !isCurrent;
          const avatarHtml = p.photo
            ? `<div class="participant-avatar" style="background-image: url('${
                p.photo
              }'); background-size: cover; background-position: center;"><div class="status-indicator ${
                p.inCall ? "status-in-call" : "status-online"
              }"></div></div>`
            : `<div class="participant-avatar">${
                p.avatar
              }<div class="status-indicator ${
                p.inCall ? "status-in-call" : "status-online"
              }"></div></div>`;
          return `
          <div class="participant-item" data-user-id="${p.id}">
            ${avatarHtml}
            <div class="participant-info">
              <div class="participant-name">${p.name}${
            isCurrent ? " (You)" : ""
          }</div>
              <div class="participant-status">${
                p.isHost ? "Host" : p.inCall ? "In Call" : "Online"
              }</div>
            </div>
            ${
              canKick
                ? `<div class="participant-actions"><button class="kick-btn" onclick="window.kickParticipant('${p.id}')" title="Kick user"><i class="bi bi-x-lg"></i></button></div>`
                : ""
            }
          </div>
        `;
        })
        .join("");
      const participantCount = document.getElementById("participantCount");
      if (participantCount)
        participantCount.textContent = this.participants.length;
    }

    updateParticipantCallStatus(userId, inCall) {
      const p = this.participants.find((x) => x.id === userId);
      if (p) {
        p.inCall = inCall;
        this.updateParticipantsList();
      }
    }

    // Added: updateRoomDisplay (was missing in previous update)
    async updateRoomDisplay() {
      try {
        if (!this.currentRoomData) return;

        const nameEl = document.getElementById("roomNameDisplay");
        const pageTitleEl = document.getElementById("pageTitle");
        const titleDisplay = document.getElementById("roomTitleDisplay");
        const createdTime = document.getElementById("roomCreatedTime");
        const badge = document.getElementById("createdByBadge");
        const participantCount = document.getElementById("participantCount");
        const inviteInput = document.getElementById("inviteLink");

        if (nameEl) nameEl.textContent = this.currentRoomData.name || "";
        if (pageTitleEl)
          pageTitleEl.textContent = `${
            this.currentRoomData.name || ""
          } - StudyGroup`;
        if (titleDisplay)
          titleDisplay.textContent = this.currentRoomData.name || "";

        if (createdTime) {
          const created = this.currentRoomData.createdAt;
          let createdStr = "";
          if (created && typeof created.toDate === "function")
            createdStr = created.toDate().toUTCString();
          else if (created) createdStr = new Date(created).toUTCString();
          createdTime.textContent = createdStr
            ? `Created on ${createdStr} UTC`
            : "";
        }

        if (participantCount)
          participantCount.textContent = String(this.participants.length || 0);

        if (badge) {
          if (this.isOwner) {
            badge.textContent = "Created by You";
            badge.style.display = "inline-block";
          } else if (this.currentRoomData.creator) {
            try {
              const creatorInfo = await this.userAuth.getUserDisplayInfo(
                this.currentRoomData.creator
              );
              badge.textContent = `Created by ${
                creatorInfo.displayName || this.currentRoomData.creator
              }`;
              badge.style.display = "inline-block";
            } catch (e) {
              badge.textContent = `Created by ${
                this.currentRoomData.creator || ""
              }`;
              badge.style.display = "inline-block";
            }
          } else {
            badge.style.display = "none";
          }
        }

        if (inviteInput) {
          const baseUrl = window.location.origin + window.location.pathname;
          const roomId = this.currentRoomData._id || this.currentRoomData.id;
          inviteInput.value = `${baseUrl}?room=${roomId}&invite=true`;
        }
      } catch (err) {
        console.warn("updateRoomDisplay failed:", err);
      }
    }

    async saveRoomSettings() {
      const newName = document.getElementById("roomNameInput").value.trim();
      const newDesc = document.getElementById("roomDescInput").value.trim();
      if (!newName) {
        showToast("Room name cannot be empty", "error");
        return;
      }
      this.currentRoomData.name = newName;
      this.currentRoomData.description = newDesc;
      this.updateRoomDisplay();
      try {
        const roomId = this.currentRoomData._id || this.currentRoomData.id;
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch(`${CONFIG.apiBase}/${roomId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ name: newName, description: newDesc }),
        });
        if (!res.ok) throw new Error(res.statusText);
        const modalEl = document.getElementById("settingsModal");
        if (modalEl) {
          const modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();
        }
        showToast("Room settings updated successfully", "success");
        chatModule.sendSystemMessage(`Room name changed to "${newName}"`);
      } catch (err) {
        console.error("Error updating room:", err);
        showToast("Failed to save settings on server: " + err.message, "error");
      }
    }

    async deleteRoom() {
      if (!this.isOwner) {
        showToast("Only the room owner can delete this room.", "error");
        return;
      }
      if (
        !confirm(
          "Are you sure you want to delete this room? This action cannot be undone and all messages will be lost."
        )
      )
        return;
      try {
        const roomId = this.currentRoomData._id || this.currentRoomData.id;
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch(`${CONFIG.apiBase}/${roomId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) throw new Error(res.statusText);
        showToast("Room deleted successfully! Redirecting...", "success");
        const modalEl = document.getElementById("settingsModal");
        if (modalEl) {
          const modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();
        }
        setTimeout(() => (window.location.href = "study-rooms.html"), 1200);
      } catch (err) {
        console.error("Error deleting room:", err);
        showToast("Could not delete room: " + err.message, "error");
      }
    }
  } // end RoomManager

  // -------------------
  // ChatManager - messaging and file sharing
  // -------------------
  class ChatManager {
    constructor(userAuth, roomManager) {
      this.userAuth = userAuth;
      this.roomManager = roomManager;
      this.messages = [];
      this.sharedFiles = [];
      this.unsubscribeMessages = null;
    }

    init() {
      const messageInput = document.getElementById("messageInput");
      const sendBtn = document.getElementById("sendMessageBtn");
      const attachBtn = document.getElementById("attachBtn");
      const fileInput = document.getElementById("fileInput");

      messageInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      sendBtn?.addEventListener("click", () => this.sendMessage());

      attachBtn?.addEventListener("click", () => fileInput?.click());

      // File input handler: upload -> backend -> write Firestore doc with returned URL
      fileInput?.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > CLIENT_MAX_FILE_SIZE_BYTES) {
          showToast("File is too large. Maximum size is 10MB.", "error");
          fileInput.value = "";
          return;
        }

        showToast(`Uploading ${file.name}...`, "info");

        const roomId =
          this.roomManager.currentRoomData &&
          (this.roomManager.currentRoomData._id ||
            this.roomManager.currentRoomData.id);
        if (!roomId) {
          showToast("Room not loaded", "error");
          fileInput.value = "";
          return;
        }

        const isImage = file.type && file.type.startsWith("image/");

        try {
          const { url } = await uploadFileToBackend(roomId, file);
          const messagesRef = db
            .collection("studyGroups")
            .doc(roomId)
            .collection("messages");

          // optimistic UI entry
          const tempId = `temp-${Date.now()}`;
          if (isImage) {
            this.messages.push({
              id: tempId,
              authorUid: this.userAuth.currentUser.uid,
              text: "",
              imageUrl: null,
              status: "sending",
              timestamp: new Date(),
            });
            this.renderMessages();
            await messagesRef.add({
              authorUid: this.userAuth.currentUser.uid,
              author: this.userAuth.currentUser.displayName,
              text: "",
              isSystem: false,
              imageUrl: url,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });
            showToast("Image shared successfully", "success");
          } else {
            this.messages.push({
              id: tempId,
              authorUid: this.userAuth.currentUser.uid,
              text: "",
              fileUrl: null,
              fileName: file.name,
              status: "sending",
              timestamp: new Date(),
            });
            this.renderMessages();
            await messagesRef.add({
              authorUid: this.userAuth.currentUser.uid,
              author: this.userAuth.currentUser.displayName,
              text: "",
              isSystem: false,
              fileUrl: url,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });
            showToast("File shared successfully", "success");
          }
        } catch (err) {
          console.error("Failed to upload file and send message:", err);
          showToast("Failed to upload file. Try again.", "error");
          const lastTemp = this.messages
            .slice()
            .reverse()
            .find((m) => m.status === "sending");
          if (lastTemp) {
            const idx = this.messages.findIndex((m) => m.id === lastTemp.id);
            if (idx !== -1) {
              this.messages[idx].status = "error";
              this.renderMessages();
            }
          }
        } finally {
          fileInput.value = "";
        }
      });

      // start listening
      this.loadMessages();
    }

    // Improved loadMessages with reconnect and exponential backoff
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

      if (chatMessages) {
        chatMessages.innerHTML = `<div class="loading-messages"><div class="spinner-border spinner-border-sm text-secondary" role="status"></div><span>Loading messages...</span></div>`;
      }

      if (this.unsubscribeMessages) {
        try {
          this.unsubscribeMessages();
        } catch (e) {}
        this.unsubscribeMessages = null;
      }

      let retryDelay = 1000;
      const maxDelay = 30000;

      const subscribe = () => {
        this.unsubscribeMessages = messagesRef.onSnapshot(
          (snapshot) => {
            this.messages = [];
            snapshot.forEach((doc) =>
              this.messages.push({ id: doc.id, ...doc.data() })
            );
            this.renderMessages();
            retryDelay = 1000; // reset backoff on success
          },
          (error) => {
            console.error("Error listening for messages (will retry):", error);
            showToast(
              "Lost connection to messages. Reconnecting...",
              "warning"
            );
            try {
              if (this.unsubscribeMessages) this.unsubscribeMessages();
            } catch (e) {}
            this.unsubscribeMessages = null;
            setTimeout(() => {
              retryDelay = Math.min(maxDelay, retryDelay * 2);
              subscribe();
            }, retryDelay);
          }
        );
      };

      subscribe();
    }

    async renderMessages() {
      const chatMessages = document.getElementById("chatMessages");
      if (!chatMessages) return;

      if (this.messages.length === 0) {
        chatMessages.innerHTML = `<div class="empty-state"><i class="bi bi-chat-dots empty-state-icon"></i><div>No messages yet</div><div>Start the conversation!</div></div>`;
        return;
      }

      chatMessages.innerHTML = "";
      let currentDate = "";

      for (const msg of this.messages) {
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

        if (msg.isSystem) {
          this.addMessageToDOM(chatMessages, {
            isSystem: true,
            text: msg.text,
            timestamp: msg.timestamp?.toDate?.() || msg.timestamp || new Date(),
          });
        } else {
          const isOwn =
            msg.authorUid === this.userAuth.currentUser.uid ||
            msg.author === this.userAuth.currentUser.displayName;
          let authorInfo;
          if (isOwn) {
            authorInfo = {
              displayName: "You",
              avatar:
                this.userAuth.currentUser.avatar ||
                (this.userAuth.currentUser.displayName || "U")
                  .substring(0, 1)
                  .toUpperCase(),
              photo:
                this.userAuth.currentUser.photo ||
                this.userAuth.currentUser.photoURL,
            };
          } else {
            try {
              const authorUid =
                msg.authorUid ||
                (typeof msg.author === "string" ? msg.author : null);
              authorInfo = await this.userAuth.getUserDisplayInfo(authorUid);
            } catch (err) {
              console.error("Error getting author display:", err);
              authorInfo = {
                displayName: msg.author || "Unknown User",
                avatar: CONFIG.defaultAvatar,
                photo: null,
              };
            }
          }

          this.addMessageToDOM(chatMessages, {
            id: msg.id,
            authorUid: msg.authorUid,
            authorName: authorInfo.displayName,
            authorAvatar: authorInfo.avatar,
            authorPhoto: authorInfo.photo,
            isOwnMessage: isOwn,
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

      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    addMessageToDOM(container, msg) {
      const messageElement = document.createElement("div");
      messageElement.setAttribute("data-message-id", msg.id || "");
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
        messageElement.innerHTML = `<div class="message-avatar" style="background: #999;"><i class="bi bi-info-circle"></i></div><div><div class="message-bubble"><div class="message-content" style="font-style: italic; color: var(--medium-text);">${msg.text}</div><div class="message-meta"><span>System</span><span>${timeStr}</span></div></div></div>`;
      } else {
        messageElement.className = `chat-message ${
          msg.isOwnMessage ? "self" : ""
        }`;
        const avatarHtml = msg.authorPhoto
          ? `<div class="message-avatar" style="background-image: url('${msg.authorPhoto}'); background-size: cover; background-position: center;"></div>`
          : `<div class="message-avatar">${msg.authorAvatar}</div>`;
        let contentHtml = "";
        if (msg.imageUrl) {
          contentHtml = `<img src="${msg.imageUrl}" alt="Shared image" class="message-image" onclick="window.openImageModal('${msg.imageUrl}')">`;
        } else if (msg.fileUrl && msg.fileName) {
          const fileIcon = this.getFileIcon(
            msg.fileName.split(".").pop().toLowerCase()
          );
          contentHtml = `<div class="d-flex align-items-center gap-2 mb-1"><i class="${fileIcon} fs-4"></i><div><div style="font-weight:500;">${
            msg.fileName
          }</div><div style="font-size:12px;color:var(--medium-text);">${
            msg.fileSize || ""
          }</div></div></div><a href="${msg.fileUrl}" download="${
            msg.fileName
          }" class="btn btn-sm btn-outline-success mt-2"><i class="bi bi-download"></i> Download</a>`;
        } else {
          contentHtml = msg.text || "";
        }

        let statusHtml = "";
        if (msg.isOwnMessage) {
          if (msg.status === "sending")
            statusHtml =
              '<span class="message-status sending" title="Sending..."><i class="bi bi-clock"></i></span>';
          else if (msg.status === "error")
            statusHtml = `<span class="message-status error" title="Failed to send. Click to retry." onclick="chatModule.retryMessage('${msg.id}')"><i class="bi bi-exclamation-circle"></i></span>`;
          else
            statusHtml =
              '<span class="message-status sent" title="Sent"><i class="bi bi-check2"></i></span>';
        }

        messageElement.innerHTML = `${avatarHtml}<div><div class="message-bubble"><div class="message-content">${contentHtml}</div><div class="message-meta"><span>${msg.authorName}</span><span>${timeStr}</span>${statusHtml}</div></div></div>`;
      }

      container.appendChild(messageElement);
    }

    async sendMessage() {
      const messageInput = document.getElementById("messageInput");
      const text = messageInput?.value.trim();
      if (!text) return;

      const roomId =
        this.roomManager.currentRoomData._id ||
        this.roomManager.currentRoomData.id;
      const tempId = `temp-${Date.now()}`;
      const chatMessages = document.getElementById("chatMessages");
      if (chatMessages) {
        const emptyState = chatMessages.querySelector(".empty-state");
        if (emptyState) emptyState.remove();
        this.messages.push({
          id: tempId,
          authorUid: this.userAuth.currentUser.uid,
          text,
          isSystem: false,
          status: "sending",
          timestamp: new Date(),
        });
        this.renderMessages();
      }

      const originalText = messageInput.value;
      messageInput.value = "";

      const messagesRef = db
        .collection("studyGroups")
        .doc(roomId)
        .collection("messages");
      try {
        const docRef = await messagesRef.add({
          authorUid: this.userAuth.currentUser.uid,
          author: this.userAuth.currentUser.displayName,
          text,
          isSystem: false,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
        const idx = this.messages.findIndex((m) => m.id === tempId);
        if (idx !== -1) {
          this.messages[idx].id = docRef.id;
          this.messages[idx].status = "sent";
        }
      } catch (err) {
        console.error("Failed to send message:", err);
        const idx = this.messages.findIndex((m) => m.id === tempId);
        if (idx !== -1) {
          this.messages[idx].status = "error";
          this.renderMessages();
        }
        showToast(
          "Failed to send message. Click on the error icon to retry.",
          "error"
        );
        messageInput.value = originalText;
      }
    }

    async retryMessage(messageId) {
      const message = this.messages.find((m) => m.id === messageId);
      if (!message) return;
      message.status = "sending";
      this.renderMessages();
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
          author: this.userAuth.currentUser.displayName,
          text: message.text,
          isSystem: false,
          imageUrl: message.imageUrl,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
        this.messages = this.messages.filter((m) => m.id !== messageId);
        showToast("Message sent successfully", "success");
      } catch (err) {
        console.error("Failed to retry message:", err);
        message.status = "error";
        this.renderMessages();
        showToast("Failed to send message. Please try again.", "error");
      }
    }

    // Send system message using authenticated user to satisfy Firestore rules
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
          authorUid: this.userAuth.currentUser.uid, // write performed by auth user
          author: "system", // keep label for UI/backwards compatibility
          text,
          isSystem: true,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.error("Error sending system message:", err);
      }
    }

    // Legacy compatibility helpers that now upload via backend
    sendImageMessage(file) {
      if (!file) return;
      (async () => {
        try {
          const roomId =
            this.roomManager.currentRoomData._id ||
            this.roomManager.currentRoomData.id;
          const { url } = await uploadFileToBackend(roomId, file);
          const messagesRef = db
            .collection("studyGroups")
            .doc(roomId)
            .collection("messages");
          await messagesRef.add({
            authorUid: this.userAuth.currentUser.uid,
            author: this.userAuth.currentUser.displayName,
            text: "",
            isSystem: false,
            imageUrl: url,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          });
          showToast("Image shared successfully", "success");
        } catch (err) {
          console.error("Legacy sendImageMessage failed:", err);
          showToast("Failed to send image. Please try again.", "error");
        }
      })();
    }

    sendDocumentMessage(file) {
      if (!file) return;
      (async () => {
        try {
          const roomId =
            this.roomManager.currentRoomData._id ||
            this.roomManager.currentRoomData.id;
          const { url } = await uploadFileToBackend(roomId, file);
          const messagesRef = db
            .collection("studyGroups")
            .doc(roomId)
            .collection("messages");
          await messagesRef.add({
            authorUid: this.userAuth.currentUser.uid,
            author: this.userAuth.currentUser.displayName,
            text: "",
            isSystem: false,
            fileUrl: url,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          });
          showToast("File shared successfully", "success");
        } catch (err) {
          console.error("Legacy sendDocumentMessage failed:", err);
          showToast("Failed to send file. Please try again.", "error");
        }
      })();
    }

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
      this.updateFilesListInSettings();
    }

    updateFilesListInSettings() {
      const filesListElement = document.getElementById("filesList");
      if (!filesListElement) return;
      if (this.sharedFiles.length === 0) {
        filesListElement.innerHTML = `<div class="text-center p-4 text-muted"><i class="bi bi-file-earmark-x" style="font-size:2rem;"></i><p class="mt-2">No files have been shared in this session</p></div>`;
        return;
      }
      filesListElement.innerHTML = this.sharedFiles
        .map((file) => {
          const date = new Date(file.timestamp);
          const formattedDate = date.toLocaleString();
          const fileIcon =
            file.type === "image"
              ? "bi bi-file-earmark-image text-primary"
              : this.getFileIcon(file.extension || "");
          return `
          <div class="card mb-2"><div class="card-body p-2"><div class="d-flex justify-content-between align-items-center"><div class="d-flex align-items-center gap-2"><i class="${fileIcon}" style="font-size:1.5rem;"></i><div><div class="fw-bold">${file.name}</div><small class="text-muted">Shared by ${file.sender} • ${formattedDate}</small></div></div><a href="${file.url}" class="btn btn-sm btn-outline-primary" download="${file.name}"><i class="bi bi-download"></i></a></div></div></div>`;
        })
        .join("");
    }

    getFileType(ext) {
      switch ((ext || "").toLowerCase()) {
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

    getFileIcon(ext) {
      switch ((ext || "").toLowerCase()) {
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

    formatFileSize(bytes) {
      if (!bytes) return "";
      if (bytes < 1024) return bytes + " bytes";
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1048576).toFixed(1) + " MB";
    }
  } // end ChatManager

  // -------------------
  // VideoManager - simulation kept; drag handlers bound safely
  // -------------------
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
      this.jitsiApi = null;
    }

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

      videoCallBtn?.addEventListener("click", () => {
        if (!this.isInCall) this.startVideoCall();
        else {
          if (videoContainer && !videoContainer.classList.contains("active"))
            videoContainer.classList.add("active");
          else this.endVideoCall();
        }
      });

      minimizeBtn?.addEventListener("click", () => {
        this.videoMinimized = !this.videoMinimized;
        videoContainer.classList.toggle("minimized", this.videoMinimized);
        this.videoMaximized = false;
        videoContainer.classList.remove("maximized");
        minimizeBtn.innerHTML = this.videoMinimized
          ? '<i class="bi bi-arrows-angle-expand"></i>'
          : '<i class="bi bi-dash-lg"></i>';
        minimizeBtn.title = this.videoMinimized ? "Restore" : "Minimize";
        maximizeBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';
        maximizeBtn.title = "Maximize (Alt+Up)";
      });

      maximizeBtn?.addEventListener("click", () => {
        this.videoMaximized = !this.videoMaximized;
        videoContainer.classList.toggle("maximized", this.videoMaximized);
        this.videoMinimized = false;
        videoContainer.classList.remove("minimized");
        if (this.videoMaximized) {
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
          videoContainer.style.position = "fixed";
          videoContainer.style.width = "360px";
          videoContainer.style.height = "240px";
          videoContainer.style.bottom = "100px";
          videoContainer.style.right = "30px";
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
      micBtn?.addEventListener("click", () => this.toggleMicrophone());
      cameraBtn?.addEventListener("click", () => this.toggleCamera());
      screenShareBtn?.addEventListener("click", () => this.toggleScreenShare());
      leaveCallBtn?.addEventListener("click", () => this.endVideoCall());

      videoHeader?.addEventListener("dblclick", () => {
        const maximizeBtnEl = document.getElementById("maximizeBtn");
        if (maximizeBtnEl) maximizeBtnEl.click();
      });

      // Bind drag functions safely (use optional chaining when adding listeners, call bound methods)
      videoHeader?.addEventListener("mousedown", (e) => this.startDrag?.(e));
      document.addEventListener("mousemove", (e) => this.drag?.(e));
      document.addEventListener("mouseup", () => this.endDrag?.());

      videoHeader?.addEventListener("touchstart", (e) =>
        this.startDragTouch?.(e)
      );
      document.addEventListener("touchmove", (e) => this.dragTouch?.(e));
      document.addEventListener("touchend", () => this.endDrag?.());

      videoHeader?.addEventListener("dragstart", (e) => e.preventDefault());
    }

    loadJitsiScript() {
      return new Promise((resolve, reject) => {
        if (document.getElementById("jitsi-api")) return resolve();
        const script = document.createElement("script");
        script.id = "jitsi-api";
        script.src = `https://${CONFIG.jitsiDomain}/external_api.js`;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    }

    async startVideoCall() {
      this.isInCall = true;
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
      if (videoPlaceholder) {
        videoPlaceholder.style.display = "flex";
        videoPlaceholder.innerHTML = `<div class="spinner-border text-light" role="status"></div><div style="margin-top:15px;">Setting up video call...</div>`;
      }

      try {
        setTimeout(() => {
          if (videoPlaceholder) videoPlaceholder.style.display = "none";
          if (videoGrid) {
            videoGrid.style.display = "block";
            videoGrid.innerHTML = `<div class="video-participant" id="self-video"><i class="bi bi-person-circle" style="font-size:36px;"></i><div class="participant-label">${this.userAuth.currentUser.displayName} (You)</div></div>`;
          }
          this.roomManager.updateParticipantCallStatus(
            this.userAuth.currentUser.uid,
            true
          );
          chatModule.sendSystemMessage(
            `${this.userAuth.currentUser.displayName} joined the call`
          );
          showToast("You've joined the video call", "success");
        }, 1500);
      } catch (err) {
        console.error("Error starting video call:", err);
        showToast("Failed to start video call. Please try again.", "error");
      }
    }

    endVideoCall() {
      this.isInCall = false;
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
      if (videoContainer) {
        videoContainer.style.position = "fixed";
        videoContainer.style.width = "360px";
        videoContainer.style.height = "240px";
        videoContainer.style.bottom = "100px";
        videoContainer.style.right = "30px";
        videoContainer.style.zIndex = "1000";
        videoContainer.style.borderRadius = "12px";
        videoContainer.style.border = "2px solid var(--primary-color)";
      }

      this.isMuted = false;
      this.isCameraOff = false;
      this.isScreenSharing = false;
      this.videoMinimized = false;
      this.videoMaximized = false;
      this.updateVideoControls();
      this.roomManager.updateParticipantCallStatus(
        this.userAuth.currentUser.uid,
        false
      );
      showToast("You left the video call", "info");
      chatModule.sendSystemMessage(
        `${this.userAuth.currentUser.displayName} left the call`
      );
    }

    toggleMicrophone() {
      this.isMuted = !this.isMuted;
      this.updateVideoControls();
      showToast(`Microphone ${this.isMuted ? "muted" : "unmuted"}`, "info");
    }
    toggleCamera() {
      this.isCameraOff = !this.isCameraOff;
      const selfVideo = document.getElementById("self-video");
      if (selfVideo)
        selfVideo.innerHTML = this.isCameraOff
          ? `<i class="bi bi-person-circle" style="font-size:36px;"></i><div class="participant-label">${this.userAuth.currentUser.displayName} (You)</div>`
          : `<div style="font-size:14px;">Camera On</div><div class="participant-label">${this.userAuth.currentUser.displayName} (You)</div>`;
      this.updateVideoControls();
      showToast(
        `Camera ${this.isCameraOff ? "turned off" : "turned on"}`,
        "info"
      );
    }
    toggleScreenShare() {
      this.isScreenSharing = !this.isScreenSharing;
      const selfVideo = document.getElementById("self-video");
      if (selfVideo && this.isScreenSharing) {
        selfVideo.innerHTML = `<div style="text-align:center;"><i class="bi bi-display" style="font-size:24px;"></i><div style="font-size:12px;">Screen sharing active</div></div><div class="participant-label">${this.userAuth.currentUser.displayName} (You)</div>`;
      } else if (selfVideo) {
        selfVideo.innerHTML = this.isCameraOff
          ? `<i class="bi bi-person-circle" style="font-size:36px;"></i><div class="participant-label">${this.userAuth.currentUser.displayName} (You)</div>`
          : `<div style="font-size:14px;">Camera On</div><div class="participant-label">${this.userAuth.currentUser.displayName} (You)</div>`;
      }
      this.updateVideoControls();
      showToast(
        `Screen sharing ${this.isScreenSharing ? "started" : "stopped"}`,
        "info"
      );
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

    // Dragging implementations
    startDrag(e) {
      const videoContainer = document.getElementById("videoContainer");
      if (!videoContainer) return;
      if (this.videoMaximized) {
        this.videoMaximized = false;
        videoContainer.classList.remove("maximized");
        const maximizeBtn = document.getElementById("maximizeBtn");
        if (maximizeBtn) {
          maximizeBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';
          maximizeBtn.title = "Maximize (Alt+Up)";
        }
        videoContainer.style.position = "fixed";
        videoContainer.style.width = "360px";
        videoContainer.style.height = "240px";
        videoContainer.style.top = e.clientY - 30 + "px";
        videoContainer.style.left = e.clientX - 100 + "px";
        videoContainer.style.zIndex = "1000";
        videoContainer.style.borderRadius = "12px";
        videoContainer.style.border = "2px solid var(--primary-color)";
        setTimeout(() => {
          const rect = videoContainer.getBoundingClientRect();
          this.dragStartX = e.clientX;
          this.dragStartY = e.clientY;
          this.dragOffsetX = rect.left;
          this.dragOffsetY = rect.top;
          videoContainer.classList.add("dragging");
        }, 10);
      } else {
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
      let newLeft = this.dragOffsetX + deltaX;
      let newTop = this.dragOffsetY + deltaY;
      newLeft = Math.max(0, Math.min(window.innerWidth - rect.width, newLeft));
      newTop = Math.max(0, Math.min(window.innerHeight - rect.height, newTop));
      videoContainer.style.left = newLeft + "px";
      videoContainer.style.top = newTop + "px";
      videoContainer.style.right = "auto";
      videoContainer.style.bottom = "auto";
      e.preventDefault();
    }

    startDragTouch(e) {
      const videoContainer = document.getElementById("videoContainer");
      if (!videoContainer) return;
      const touch = e.touches[0];
      if (this.videoMaximized) {
        this.videoMaximized = false;
        videoContainer.classList.remove("maximized");
        const maximizeBtn = document.getElementById("maximizeBtn");
        if (maximizeBtn) {
          maximizeBtn.innerHTML = '<i class="bi bi-arrows-angle-expand"></i>';
          maximizeBtn.title = "Maximize (Alt+Up)";
        }
        videoContainer.style.position = "fixed";
        videoContainer.style.width = "360px";
        videoContainer.style.height = "240px";
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
      let newLeft = this.dragOffsetX + deltaX;
      let newTop = this.dragOffsetY + deltaY;
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
      if (videoContainer) videoContainer.classList.remove("dragging");
      this.dragStartX = null;
      this.dragStartY = null;
    }
  } // end VideoManager

  // -------------------
  // UI helpers (theme, toasts, settings modal, etc.)
  // -------------------
  class UiManager {
    constructor(userAuth, roomManager) {
      this.userAuth = userAuth;
      this.roomManager = roomManager;
      this.autoSaveInterval = null;
    }

    init() {
      this.initializeTheme();
      this.initializeSettingsModal();
      this.initializeInviteSystem();
      this.initializeSidebar();
      this.setupKeyboardShortcuts();
      this.initializeAutoSave();

      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn)
        logoutBtn.addEventListener("click", () => this.userAuth.logout());

      window.openImageModal = UiManager.openImageModal;
      window.kickParticipant = (id) => this.roomManager.kickParticipant(id);
      window.closeToast = closeToast;
    }

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

    initializeSettingsModal() {
      const settingsBtn = document.getElementById("settingsBtn");
      if (settingsBtn) {
        settingsBtn.style.display = "block";
        settingsBtn.addEventListener("click", () => this.openSettingsModal());
      }
      const saveSettingsBtn = document.getElementById("saveSettingsBtn");
      if (saveSettingsBtn)
        saveSettingsBtn.addEventListener("click", () =>
          this.roomManager.saveRoomSettings()
        );
      const deleteRoomBtn = document.getElementById("deleteRoomBtn");
      if (deleteRoomBtn)
        deleteRoomBtn.addEventListener("click", () =>
          this.roomManager.deleteRoom()
        );
    }

    openSettingsModal() {
      try {
        const modalEl = document.getElementById("settingsModal");
        if (!modalEl) {
          console.error("Settings modal not found");
          return;
        }
        const modal = new bootstrap.Modal(modalEl);
        document.getElementById("roomNameInput").value =
          this.roomManager.currentRoomData.name || "";
        document.getElementById("roomDescInput").value =
          this.roomManager.currentRoomData.description || "";
        const participantsList2 = document.getElementById("participantsList2");
        if (participantsList2) {
          participantsList2.innerHTML = this.roomManager.participants
            .map((participant) => {
              return `<div class="d-flex justify-content-between align-items-center p-2 border rounded mb-2"><div class="d-flex align-items-center gap-2"><div class="participant-avatar" style="width:24px;height:24px;font-size:12px;">${
                participant.avatar
              }</div><span>${participant.name}${
                participant.id === this.userAuth.currentUser.uid ? " (You)" : ""
              }</span>${
                participant.isHost
                  ? '<span class="badge bg-primary">Host</span>'
                  : ""
              }</div>${
                participant.id !== this.userAuth.currentUser.uid
                  ? `<button class="btn btn-outline-danger btn-sm" onclick="window.kickParticipant('${participant.id}')"><i class="bi bi-x-lg"></i> Kick</button>`
                  : ""
              }</div>`;
            })
            .join("");
        }
        chatModule.updateFilesListInSettings();
        const deleteBtn = document.getElementById("deleteRoomBtn");
        if (deleteBtn)
          deleteBtn.style.display = this.roomManager.isOwner
            ? "inline-block"
            : "none";
        modal.show();
      } catch (err) {
        console.error("Error opening settings modal:", err);
        showToast("Unable to open settings modal", "error");
      }
    }

    initializeInviteSystem() {
      const inviteBtn = document.getElementById("inviteBtn");
      const copyLinkBtn = document.getElementById("copyLinkBtn");
      inviteBtn?.addEventListener("click", () => {
        const modalEl = document.getElementById("inviteModal");
        if (modalEl) {
          const modal = new bootstrap.Modal(modalEl);
          modal.show();
        }
      });
      copyLinkBtn?.addEventListener("click", () => {
        const inviteLink = document.getElementById("inviteLink");
        if (!inviteLink) return;
        inviteLink.select();
        try {
          navigator.clipboard
            .writeText(inviteLink.value)
            .then(() => showToast("Invite link copied to clipboard", "success"))
            .catch((err) => {
              console.error("Clipboard failed:", err);
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

    setupKeyboardShortcuts() {
      document.addEventListener("keydown", (e) => {
        if (e.altKey && e.key === "m" && videoModule.isInCall) {
          e.preventDefault();
          videoModule.toggleMicrophone();
        }
        if (e.altKey && e.key === "v" && videoModule.isInCall) {
          e.preventDefault();
          videoModule.toggleCamera();
        }
        if (e.altKey && e.key === "s" && videoModule.isInCall) {
          e.preventDefault();
          videoModule.toggleScreenShare();
        }
        if (e.altKey && e.key === "j" && !videoModule.isInCall) {
          e.preventDefault();
          videoModule.startVideoCall();
        }
        if (e.altKey && e.key === "l" && videoModule.isInCall) {
          e.preventDefault();
          videoModule.endVideoCall();
        }
        if (
          e.altKey &&
          e.key === "ArrowUp" &&
          videoModule.isInCall &&
          !videoModule.videoMaximized
        ) {
          e.preventDefault();
          document.getElementById("maximizeBtn")?.click();
        }
        if (
          e.altKey &&
          e.key === "ArrowDown" &&
          videoModule.isInCall &&
          videoModule.videoMaximized
        ) {
          e.preventDefault();
          document.getElementById("maximizeBtn")?.click();
        } else if (
          e.altKey &&
          e.key === "ArrowDown" &&
          videoModule.isInCall &&
          !videoModule.videoMinimized
        ) {
          e.preventDefault();
          document.getElementById("minimizeBtn")?.click();
        }
        if (e.key === "Escape") {
          const sidebar = document.getElementById("sidebar");
          if (window.innerWidth <= 768 && sidebar.classList.contains("open"))
            this.setSidebar(false);
          else if (videoModule.isInCall && videoModule.videoMaximized)
            document.getElementById("maximizeBtn")?.click();
        }
      });
    }

    initializeSidebar() {
      const sidebar = document.getElementById("sidebar");
      const mainContent = document.getElementById("mainContent");
      const menuToggle = document.getElementById("menuToggle");
      if (!sidebar || !mainContent || !menuToggle) return;
      if (window.innerWidth > 768) this.setSidebar(true);
      menuToggle.addEventListener("click", () =>
        this.setSidebar(!sidebar.classList.contains("open"))
      );
      document.addEventListener("click", (e) => {
        if (
          window.innerWidth <= 768 &&
          !sidebar.contains(e.target) &&
          !menuToggle.contains(e.target) &&
          sidebar.classList.contains("open")
        ) {
          this.setSidebar(false);
        }
      });
      window.addEventListener("resize", () => {
        if (window.innerWidth > 768) {
          if (!sidebar.classList.contains("open")) this.setSidebar(true);
        } else {
          if (sidebar.classList.contains("open")) this.setSidebar(false);
        }
      });
    }

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

    static openImageModal(imageUrl) {
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
              <img src="${imageUrl}" alt="Shared image" style="max-width:100%;height:auto;max-height:70vh;">
            </div>
            <div class="modal-footer">
              <a href="${imageUrl}" class="btn btn-outline-primary" download target="_blank"><i class="bi bi-download"></i> Download</a>
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      try {
        const bs = new bootstrap.Modal(modal);
        bs.show();
        modal.addEventListener("hidden.bs.modal", () => modal.remove());
      } catch (err) {
        console.error("Error showing image modal:", err);
        modal.remove();
        showToast("Failed to open image preview", "error");
      }
    }

    initializeAutoSave() {
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
          if (CONFIG.debug)
            console.log(
              "Room data auto-saved:",
              new Date().toLocaleTimeString()
            );
        }
      }, 30000);
    }

    cleanup() {
      if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);
    }
  } // end UiManager

  // -------------------
  // Toast + Loading helpers
  // -------------------
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
      <div class="toast-icon"><i class="bi ${
        iconMap[type] || iconMap.info
      }"></i></div>
      <div class="toast-content"><div class="toast-title">${
        type.charAt(0).toUpperCase() + type.slice(1)
      }</div><div class="toast-message">${message}</div></div>
      <div class="toast-close" onclick="window.closeToast('${toastId}')"><i class="bi bi-x"></i></div>`;
    toastContainer.appendChild(toast);
    if (type === "success" || type === "info")
      setTimeout(() => closeToast(toastId), 4000);
  }

  function closeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (!toast) return;
    toast.style.opacity = "0";
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }

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

  // -------------------
  // App init + cleanup
  // -------------------
  async function initializeApp() {
    try {
      showPageLoading();
      userModule = new UserAuth();
      await userModule.init();
      roomModule = new RoomManager(userModule);
      await roomModule.loadRoomData();
      chatModule = new ChatManager(userModule, roomModule);
      videoModule = new VideoManager(userModule, roomModule);
      uiModule = new UiManager(userModule, roomModule);

      userModule.updateSidebarUserInfo();
      roomModule.updateRoomDisplay && roomModule.updateRoomDisplay();
      roomModule.updateParticipantsList();

      chatModule.init();
      videoModule.init();
      uiModule.init();

      window.userModule = userModule;
      window.roomModule = roomModule;
      window.chatModule = chatModule;
      window.videoModule = videoModule;
      window.UiManager = UiManager;
      // prefer single global closeToast name:
      window.closeToast = closeToast;

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
      }, 1000);

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

  window.addEventListener("beforeunload", () => {
    if (chatModule && chatModule.unsubscribeMessages)
      try {
        chatModule.unsubscribeMessages();
      } catch (e) {}
    if (uiModule) uiModule.cleanup();
    if (videoModule && videoModule.isInCall)
      roomModule.updateParticipantCallStatus(userModule.currentUser.uid, false);
  });

  document.addEventListener("DOMContentLoaded", () => initializeApp());
} // end firebase check
