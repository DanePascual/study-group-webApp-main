// ChatManager (ES module) - Clean, stable non-virtualized implementation
// ✅ FIXED: Enrich author names from userAuth cache instead of using raw Firestore data
// ✅ FIXED: Make author names and avatars clickable to view profile

import { db } from "./firebase-init.js";
import {
  showToast,
  escapeHtml,
  getFileIcon,
  formatFileSize,
  uploadFileToBackend,
} from "./utils.js";

export class ChatManager {
  constructor(userAuth, roomManager) {
    this.userAuth = userAuth;
    this.roomManager = roomManager;

    this.messages = [];
    this.sharedFiles = [];
    this.unsubscribeMessages = null;

    // visible-author update debounce
    this._visibleUpdateTimer = null;
    this._visibleUpdateDelay = 150; // ms

    // prefetch buffer (visible +/- this many messages)
    this.prefetchBuffer = 8;

    // grouping threshold (ms) for consecutive messages to be "continued"
    this._groupThresholdMs = 5 * 60 * 1000;

    this._scrollHandlerAttached = false;
    this._authorNamesCache = {}; // ✅ NEW: Cache author names
  }

  // Robust timestamp parsing helper.
  _toDate(ts) {
    try {
      if (!ts) return new Date();
      if (typeof ts === "object" && typeof ts.toDate === "function")
        return ts.toDate();
      if (ts instanceof Date) return ts;
      if (typeof ts === "number") return new Date(ts);
      if (typeof ts === "string") {
        const parsed = Date.parse(ts);
        if (!Number.isNaN(parsed)) return new Date(parsed);
      }
      const d = new Date(ts);
      if (d.toString() === "Invalid Date") return new Date();
      return d;
    } catch (e) {
      return new Date();
    }
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

    fileInput?.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (
        file.size >
        (window.__CONFIG__.clientMaxFileSizeBytes || 10 * 1024 * 1024)
      ) {
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
          this.renderMessages({ scrollForOwnMessage: true });
          await messagesRef.add({
            authorUid: this.userAuth.currentUser.uid,
            author:
              this.userAuth.currentUser.name ||
              this.userAuth.currentUser.displayName,
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
          this.renderMessages({ scrollForOwnMessage: true });
          await messagesRef.add({
            authorUid: this.userAuth.currentUser.uid,
            author:
              this.userAuth.currentUser.name ||
              this.userAuth.currentUser.displayName,
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

    this.loadMessages();
  }

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
    if (chatMessages)
      chatMessages.innerHTML = `<div class="loading-messages"><div class="spinner-border spinner-border-sm text-secondary" role="status"></div><span>Loading messages...</span></div>`;

    if (this.unsubscribeMessages) {
      try {
        this.unsubscribeMessages();
      } catch (e) {}
      this.unsubscribeMessages = null;
    }

    let retryDelay = 1000,
      maxDelay = 30000;
    const subscribe = () => {
      this.unsubscribeMessages = messagesRef.onSnapshot(
        (snapshot) => {
          this.messages = [];
          snapshot.forEach((doc) =>
            this.messages.push({ id: doc.id, ...doc.data() })
          );

          // rebuild sharedFiles
          const filesMap = new Map();
          for (const msg of this.messages) {
            if (msg.isSystem) continue;
            if (msg.imageUrl) {
              const key = msg.imageUrl;
              if (!filesMap.has(key)) {
                filesMap.set(key, {
                  id: `file-${this._makeHash(key)}`,
                  name:
                    msg.fileName ||
                    this._extractFilenameFromUrl(key) ||
                    "image",
                  url: key,
                  type: "image",
                  sender:
                    msg.author ||
                    (msg.authorUid === this.userAuth.currentUser.uid
                      ? "You"
                      : msg.authorUid),
                  senderUid: msg.authorUid || null,
                  timestamp:
                    msg.timestamp && msg.timestamp.toDate
                      ? msg.timestamp.toDate().toISOString()
                      : (msg.timestamp || new Date()).toString(),
                  extension: this._extractExtension(msg.fileName || key),
                });
              }
            }
            if (msg.fileUrl) {
              const key = msg.fileUrl;
              if (!filesMap.has(key)) {
                filesMap.set(key, {
                  id: `file-${this._makeHash(key)}`,
                  name:
                    msg.fileName || this._extractFilenameFromUrl(key) || "file",
                  url: key,
                  type: "file",
                  sender:
                    msg.author ||
                    (msg.authorUid === this.userAuth.currentUser.uid
                      ? "You"
                      : msg.authorUid),
                  senderUid: msg.authorUid || null,
                  timestamp:
                    msg.timestamp && msg.timestamp.toDate
                      ? msg.timestamp.toDate().toISOString()
                      : (msg.timestamp || new Date()).toString(),
                  extension: this._extractExtension(msg.fileName || key),
                });
              }
            }
          }
          this.sharedFiles = Array.from(filesMap.values()).reverse();

          // Detect if user was near bottom before re-render
          const chatEl = document.getElementById("chatMessages");
          let wasNearBottom = true;
          if (chatEl) {
            wasNearBottom =
              chatEl.scrollHeight - (chatEl.scrollTop + chatEl.clientHeight) <=
              120;
          }

          this.renderMessages({ scrollIfNearBottom: wasNearBottom });
          this.updateFilesListInSettings();

          retryDelay = 1000;
        },
        (error) => {
          console.error("Error listening for messages (will retry):", error);
          showToast("Lost connection to messages. Reconnecting...", "warning");
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

  // ✅ FIXED: Enrich author name from userAuth instead of using raw Firestore author
  async _getEnrichedAuthorName(msg) {
    // If it's the current user
    if (msg.authorUid === this.userAuth.currentUser.uid) {
      return (
        this.userAuth.currentUser.name ||
        this.userAuth.currentUser.displayName ||
        "You"
      );
    }

    // Check cache first
    if (this._authorNamesCache[msg.authorUid]) {
      return this._authorNamesCache[msg.authorUid];
    }

    // Try to fetch from userAuth
    try {
      const info = await this.userAuth.getUserDisplayInfo(msg.authorUid);
      const displayName = info.displayName || msg.authorUid.substring(0, 8);
      this._authorNamesCache[msg.authorUid] = displayName;
      return displayName;
    } catch (err) {
      console.error("Error fetching author name:", err);
      const fallback = msg.authorUid.substring(0, 8);
      this._authorNamesCache[msg.authorUid] = fallback;
      return fallback;
    }
  }

  // Render messages with author name outside the bubble
  renderMessages(options = {}) {
    const { scrollIfNearBottom = false, scrollForOwnMessage = false } = options;
    const chatMessages = document.getElementById("chatMessages");
    if (!chatMessages) return;

    if (!this.messages || this.messages.length === 0) {
      chatMessages.innerHTML = `<div class="empty-state"><i class="bi bi-chat-dots empty-state-icon"></i><div>No messages yet</div><div>Start the conversation!</div></div>`;
      return;
    }

    const wasNearBottomBefore =
      scrollIfNearBottom ||
      chatMessages.scrollHeight -
        (chatMessages.scrollTop + chatMessages.clientHeight) <=
        120;

    chatMessages.innerHTML = "";
    let currentDate = "";

    let prevAuthorUid = null;
    let prevTimestampMs = 0;

    for (const msg of this.messages) {
      const msgDate = this._toDate(msg.timestamp).toLocaleDateString();
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        const dateSeparator = document.createElement("div");
        dateSeparator.className = "date-separator";
        dateSeparator.innerHTML = `<span>${msgDate}</span>`;
        chatMessages.appendChild(dateSeparator);
      }

      const msgTs = this._toDate(msg.timestamp).getTime();
      const sameAuthor =
        prevAuthorUid && msg.authorUid && prevAuthorUid === msg.authorUid;
      const withinThreshold =
        Math.abs(msgTs - prevTimestampMs) <= this._groupThresholdMs;
      const continued = sameAuthor && withinThreshold;

      const messageElement = document.createElement("div");
      messageElement.setAttribute("data-message-id", msg.id || "");
      messageElement.setAttribute("data-author-uid", msg.authorUid || "");
      const isSelf = msg.authorUid === this.userAuth.currentUser.uid;
      messageElement.className = `chat-message ${isSelf ? "self" : ""} ${
        continued ? "continued" : ""
      }`;

      const timeStr = this._toDate(msg.timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      if (msg.isSystem) {
        messageElement.className = "chat-message system";
        messageElement.innerHTML = `<div class="message-avatar" style="background:#999;"><i class="bi bi-info-circle"></i></div><div><div class="message-bubble system-bubble"><div class="message-content" style="font-style: italic; color: var(--medium-text);">${escapeHtml(
          msg.text
        )}</div><div class="message-meta"><span>System</span><span>${timeStr}</span></div></div></div>`;
        chatMessages.appendChild(messageElement);
        prevAuthorUid = null;
        prevTimestampMs = 0;
        continue;
      }

      let avatarHtml = "";
      let authorNameHtml = "";
      if (!continued) {
        // ✅ FIXED: Use enriched author name
        const enrichedAuthorName =
          this._authorNamesCache[msg.authorUid] ||
          msg.author ||
          (msg.authorUid ? msg.authorUid.substring(0, 8) : "Unknown");

        const placeholderAvatar =
          enrichedAuthorName && enrichedAuthorName[0]
            ? enrichedAuthorName[0].toUpperCase()
            : "U";

        // ✅ NEW: Make avatar clickable
        avatarHtml = `<div class="message-avatar placeholder-avatar" style="cursor: pointer;" onclick="window.viewUserProfile('${
          msg.authorUid
        }')" title="View ${escapeHtml(
          enrichedAuthorName
        )}'s profile">${escapeHtml(placeholderAvatar)}</div>`;

        // ✅ NEW: Make author name clickable
        authorNameHtml = `<div class="message-author" style="cursor: pointer; color: var(--primary-color);" onclick="window.viewUserProfile('${
          msg.authorUid
        }')" title="View ${escapeHtml(
          enrichedAuthorName
        )}'s profile">${escapeHtml(enrichedAuthorName)}</div>`;
      } else {
        avatarHtml = `<div class="message-avatar message-avatar-placeholder"></div>`;
        authorNameHtml = "";
      }

      let contentHtml = "";
      if (msg.imageUrl) {
        contentHtml = `<img src="${msg.imageUrl}" alt="Shared image" class="message-image" onclick="window.openImageModal('${msg.imageUrl}')">`;
      } else if (msg.fileUrl && msg.fileName) {
        const fileIcon = getFileIcon(
          msg.fileName.split(".").pop().toLowerCase()
        );
        contentHtml = `<div class="d-flex align-items-center gap-2 mb-1"><i class="${fileIcon} fs-4"></i><div><div style="font-weight:500;">${escapeHtml(
          msg.fileName
        )}</div><div style="font-size:12px;color:var(--medium-text);">${
          formatFileSize(msg.fileSize) || ""
        }</div></div></div><a href="${msg.fileUrl}" download="${escapeHtml(
          msg.fileName
        )}" class="btn btn-sm btn-outline-success mt-2"><i class="bi bi-download"></i> Download</a>`;
      } else {
        contentHtml = escapeHtml(msg.text || "");
      }

      let statusHtml = "";
      if (isSelf) {
        if (msg.status === "sending")
          statusHtml =
            '<span class="message-status sending" title="Sending..."><i class="bi bi-clock"></i></span>';
        else if (msg.status === "error")
          statusHtml = `<span class="message-status error" title="Failed to send. Click to retry." onclick="chatModule.retryMessage('${msg.id}')"><i class="bi bi-exclamation-circle"></i></span>`;
        else
          statusHtml =
            '<span class="message-status sent" title="Sent"><i class="bi bi-check2"></i></span>';
      }

      messageElement.innerHTML = `${avatarHtml}<div class="message-body">${authorNameHtml}<div class="message-bubble"><div class="message-content">${contentHtml}</div><div class="message-meta"><span class="message-time">${timeStr}</span>${statusHtml}</div></div></div>`;

      chatMessages.appendChild(messageElement);

      prevAuthorUid = msg.authorUid || null;
      prevTimestampMs = msgTs;
    }

    this._attachScrollHandler();
    this._scheduleVisibleUpdate(true);

    try {
      if (scrollForOwnMessage) {
        chatMessages.scrollTo({
          top: chatMessages.scrollHeight,
          behavior: "smooth",
        });
      } else if (wasNearBottomBefore) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    } catch (e) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  _attachScrollHandler() {
    const chatMessages = document.getElementById("chatMessages");
    if (!chatMessages) return;
    if (this._scrollHandlerAttached) return;
    const onScroll = () => {
      this._scheduleVisibleUpdate();
    };
    chatMessages.addEventListener("scroll", onScroll, { passive: true });
    this._scrollHandlerAttached = true;
  }

  _scheduleVisibleUpdate(immediate = false) {
    if (this._visibleUpdateTimer) clearTimeout(this._visibleUpdateTimer);
    if (immediate) this._updateVisibleAuthors();
    else
      this._visibleUpdateTimer = setTimeout(
        () => this._updateVisibleAuthors(),
        this._visibleUpdateDelay
      );
  }

  async _updateVisibleAuthors() {
    const chatMessages = document.getElementById("chatMessages");
    if (!chatMessages) return;
    const children = Array.from(chatMessages.children);
    const messageEls = children.filter(
      (el) => !!(el.getAttribute && el.getAttribute("data-message-id"))
    );
    if (messageEls.length === 0) return;

    const containerRect = chatMessages.getBoundingClientRect();
    const visibleIdx = [];
    for (let i = 0; i < messageEls.length; i++) {
      const rect = messageEls[i].getBoundingClientRect();
      if (rect.bottom >= containerRect.top && rect.top <= containerRect.bottom)
        visibleIdx.push(i);
    }

    if (visibleIdx.length === 0) {
      const start = 0,
        end = Math.min(messageEls.length - 1, this.prefetchBuffer);
      await this._prefetchAndApply(messageEls, start, end);
      return;
    }

    const firstVisible = visibleIdx[0],
      lastVisible = visibleIdx[visibleIdx.length - 1];
    const immediateUids = new Set();
    for (let i = firstVisible; i <= lastVisible; i++) {
      const uid = messageEls[i].getAttribute("data-author-uid");
      if (!uid || uid === this.userAuth.currentUser.uid) continue;
      const cached = this.userAuth._getFromCache
        ? this.userAuth._getFromCache(uid)
        : null;
      if (!cached) immediateUids.add(uid);
    }

    let authorsMap = {};
    const immediateArray = Array.from(immediateUids);
    if (immediateArray.length > 0) {
      try {
        authorsMap = await this.userAuth.getUserDisplayInfos(immediateArray);
      } catch (err) {
        console.error("Error fetching visible author infos:", err);
        authorsMap = {};
      }
    }

    for (let i = firstVisible; i <= lastVisible; i++) {
      const el = messageEls[i];
      const uid = el.getAttribute("data-author-uid");
      const nameNode = el.querySelector(".message-author");
      const avatarNode = el.querySelector(".message-avatar");
      if (!uid) continue;

      if (uid === this.userAuth.currentUser.uid) {
        const currentName =
          this.userAuth.currentUser.name ||
          this.userAuth.currentUser.displayName ||
          "You";
        if (nameNode) nameNode.textContent = currentName;
        if (avatarNode) {
          if (
            this.userAuth.currentUser.photo ||
            this.userAuth.currentUser.photoURL
          ) {
            avatarNode.style.backgroundImage = `url('${
              this.userAuth.currentUser.photo ||
              this.userAuth.currentUser.photoURL
            }')`;
            avatarNode.style.backgroundSize = "cover";
            avatarNode.style.backgroundPosition = "center";
            avatarNode.textContent = "";
          } else {
            avatarNode.style.backgroundImage = "";
            avatarNode.textContent =
              currentName && currentName[0]
                ? currentName[0].toUpperCase()
                : "U";
          }
        }
        continue;
      }

      let info =
        authorsMap[uid] ||
        (this.userAuth._getFromCache ? this.userAuth._getFromCache(uid) : null);
      if (!info) {
        try {
          info = await this.userAuth.getUserDisplayInfo(uid);
        } catch (e) {
          info = { displayName: uid.substring(0, 8), avatar: "U", photo: null };
        }
      }

      if (nameNode)
        nameNode.textContent = info.displayName || uid.substring(0, 8);
      if (avatarNode) {
        if (info.photo) {
          avatarNode.style.backgroundImage = `url('${info.photo}')`;
          avatarNode.style.backgroundSize = "cover";
          avatarNode.style.backgroundPosition = "center";
          avatarNode.textContent = "";
        } else {
          avatarNode.style.backgroundImage = "";
          avatarNode.textContent =
            info.avatar ||
            (info.displayName && info.displayName[0]
              ? info.displayName[0].toUpperCase()
              : "U");
        }
      }
    }

    const preStart = Math.max(0, firstVisible - this.prefetchBuffer);
    const preEnd = Math.min(
      messageEls.length - 1,
      lastVisible + this.prefetchBuffer
    );
    const prefetchSet = new Set();
    for (let i = preStart; i <= preEnd; i++) {
      const uid = messageEls[i].getAttribute("data-author-uid");
      if (!uid || uid === this.userAuth.currentUser.uid) continue;
      const cached = this.userAuth._getFromCache
        ? this.userAuth._getFromCache(uid)
        : null;
      if (!cached && !immediateUids.has(uid)) prefetchSet.add(uid);
    }
    const toPrefetch = Array.from(prefetchSet);
    if (toPrefetch.length > 0)
      this.userAuth
        .getUserDisplayInfos(toPrefetch)
        .catch((e) => console.debug("Prefetch failed:", e));
  }

  async _prefetchAndApply(messageEls, start, end) {
    const uids = new Set();
    for (let i = start; i <= end; i++) {
      const uid = messageEls[i]?.getAttribute("data-author-uid");
      if (!uid || uid === this.userAuth.currentUser.uid) continue;
      const cached = this.userAuth._getFromCache
        ? this.userAuth._getFromCache(uid)
        : null;
      if (!cached) uids.add(uid);
    }
    if (uids.size === 0) return;
    try {
      const map = await this.userAuth.getUserDisplayInfos(Array.from(uids));
      for (let i = start; i <= end; i++) {
        const el = messageEls[i];
        if (!el) continue;
        const uid = el.getAttribute("data-author-uid");
        if (!uid) continue;
        const info =
          map[uid] ||
          (this.userAuth._getFromCache
            ? this.userAuth._getFromCache(uid)
            : null);
        if (!info) continue;
        const nameNode = el.querySelector(".message-author");
        const avatarNode = el.querySelector(".message-avatar");
        if (nameNode)
          nameNode.textContent = info.displayName || uid.substring(0, 8);
        if (avatarNode) {
          if (info.photo) {
            avatarNode.style.backgroundImage = `url('${info.photo}')`;
            avatarNode.style.backgroundSize = "cover";
            avatarNode.style.backgroundPosition = "center";
            avatarNode.textContent = "";
          } else {
            avatarNode.style.backgroundImage = "";
            avatarNode.textContent =
              info.avatar ||
              (info.displayName && info.displayName[0]
                ? info.displayName[0].toUpperCase()
                : "U");
          }
        }
      }
    } catch (e) {
      console.debug("Prefetch-and-apply failed:", e);
    }
  }

  addMessageToDOM(container, msg) {
    const messageElement = document.createElement("div");
    messageElement.setAttribute("data-message-id", msg.id || "");
    const timeStr = this._toDate(msg.timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    if (msg.isSystem) {
      messageElement.className = "chat-message system";
      messageElement.innerHTML = `<div class="message-avatar" style="background:#999;"><i class="bi bi-info-circle"></i></div><div><div class="message-bubble"><div class="message-content" style="font-style: italic; color: var(--medium-text);">${escapeHtml(
        msg.text
      )}</div><div class="message-meta"><span>System</span><span>${timeStr}</span></div></div></div>`;
    } else {
      messageElement.className = `chat-message ${
        msg.isOwnMessage ? "self" : ""
      }`;
      const avatarHtml = msg.authorPhoto
        ? `<div class="message-avatar" style="background-image: url('${msg.authorPhoto}'); background-size: cover; background-position: center;"></div>`
        : `<div class="message-avatar">${escapeHtml(msg.authorAvatar)}</div>`;
      let contentHtml = "";
      if (msg.imageUrl) {
        contentHtml = `<img src="${msg.imageUrl}" alt="Shared image" class="message-image" onclick="window.openImageModal('${msg.imageUrl}')">`;
      } else if (msg.fileUrl && msg.fileName) {
        const fileIcon = getFileIcon(
          msg.fileName.split(".").pop().toLowerCase()
        );
        contentHtml = `<div class="d-flex align-items-center gap-2 mb-1"><i class="${fileIcon} fs-4"></i><div><div style="font-weight:500;">${escapeHtml(
          msg.fileName
        )}</div><div style="font-size:12px;color:var(--medium-text);">${
          formatFileSize(msg.fileSize) || ""
        }</div></div></div><a href="${msg.fileUrl}" download="${escapeHtml(
          msg.fileName
        )}" class="btn btn-sm btn-outline-success mt-2"><i class="bi bi-download"></i> Download</a>`;
      } else {
        contentHtml = escapeHtml(msg.text || "");
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

      messageElement.innerHTML = `${avatarHtml}<div><div class="message-bubble"><div class="message-content">${contentHtml}</div><div class="message-meta"><span>${escapeHtml(
        msg.authorName
      )}</span><span>${timeStr}</span>${statusHtml}</div></div></div>`;
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
      this.renderMessages({ scrollForOwnMessage: true });
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
        author:
          this.userAuth.currentUser.name ||
          this.userAuth.currentUser.displayName,
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
        author:
          this.userAuth.currentUser.name ||
          this.userAuth.currentUser.displayName,
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
        authorUid: this.userAuth.currentUser.uid,
        author: "system",
        text,
        isSystem: true,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error("Error sending system message:", err);
    }
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
            : getFileIcon(file.extension || "");
        return `<div class="card mb-2"><div class="card-body p-2"><div class="d-flex justify-content-between align-items-center"><div class="d-flex align-items-center gap-2"><i class="${fileIcon}" style="font-size:1.5rem;"></i><div><div class="fw-bold">${escapeHtml(
          file.name
        )}</div><small class="text-muted">Shared by ${escapeHtml(
          file.sender
        )} • ${formattedDate}</small></div></div><a href="${
          file.url
        }" class="btn btn-sm btn-outline-primary" download="${escapeHtml(
          file.name
        )}"><i class="bi bi-download"></i></a></div></div></div>`;
      })
      .join("");
  }

  _extractFilenameFromUrl(url) {
    try {
      const p = new URL(url).pathname;
      const parts = p.split("/");
      return parts[parts.length - 1] || null;
    } catch (e) {
      const parts = (url || "").split("/");
      return parts[parts.length - 1] || null;
    }
  }

  _extractExtension(nameOrUrl) {
    const n = (nameOrUrl || "").split(".").pop();
    if (!n || n.length > 6) return "";
    return n.toLowerCase();
  }

  _makeHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h = h & h;
    }
    return Math.abs(h).toString(36);
  }
}
