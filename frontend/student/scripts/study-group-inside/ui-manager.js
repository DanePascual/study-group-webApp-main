// UiManager (ES module) - FIXED: Let sidebar.js handle theme
import { showToast, closeToast } from "./utils.js";

export class UiManager {
  constructor(userAuth, roomManager) {
    this.userAuth = userAuth;
    this.roomManager = roomManager;
    this.autoSaveInterval = null;
  }

  init() {
    // ✅ REMOVED: initializeTheme() - sidebar.js handles this globally
    this.initializeSettingsModal();
    this.initializeInviteSystem();
    this.initializeSidebar();
    this.setupKeyboardShortcuts();
    this.initializeAutoSave();

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn)
      logoutBtn.addEventListener("click", () => this.userAuth.logout());

    window.openImageModal = UiManager.openImageModal;
    window.kickParticipant = (id) => this.roomManager.kickParticipant?.(id);
    window.closeToast = closeToast;
  }

  // ✅ DELETED: initializeTheme() method entirely

  initializeSettingsModal() {
    const settingsBtn = document.getElementById("settingsBtn");
    if (settingsBtn) {
      settingsBtn.style.display = "block";
      settingsBtn.addEventListener("click", () => this.openSettingsModal());
    }

    const saveSettingsBtn = document.getElementById("saveSettingsBtn");
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener("click", async (e) => {
        if (!this.roomManager) {
          console.error("UiManager: roomManager is not set", this);
          showToast("Unable to save room settings: internal error", "error");
          return;
        }
        if (typeof this.roomManager.saveRoomSettings !== "function") {
          console.error(
            "UiManager: saveRoomSettings is not a function on roomManager",
            this.roomManager
          );
          showToast(
            "Save not available: room manager not initialized",
            "error"
          );
          return;
        }
        try {
          await this.roomManager.saveRoomSettings();
        } catch (err) {
          console.error("Error calling saveRoomSettings:", err);
          showToast(
            "Failed to save settings: " +
              (err && err.message ? err.message : "unknown error"),
            "error"
          );
        }
      });
    }

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
        // ✅ FIXED: Only show kick button if user is OWNER
        participantsList2.innerHTML = this.roomManager.participants
          .map((participant) => {
            const isCurrent = participant.id === this.userAuth.currentUser.uid;
            const canKick = this.roomManager.isOwner && !isCurrent; // ✅ FIXED!

            return `<div class="d-flex justify-content-between align-items-center p-2 border rounded mb-2"><div class="d-flex align-items-center gap-2"><div class="participant-avatar" style="width:24px;height:24px;font-size:12px;">${
              participant.avatar
            }</div><span>${participant.name}${
              isCurrent ? " (You)" : ""
            }</span>${
              participant.isHost
                ? '<span class="badge bg-primary">Host</span>'
                : ""
            }</div>${
              canKick // ✅ Only show button if canKick is true
                ? `<button class="btn btn-outline-danger btn-sm" onclick="window.kickParticipant('${participant.id}')"><i class="bi bi-x-lg"></i> Kick</button>`
                : ""
            }</div>`;
          })
          .join("");
      }

      if (window.chatModule) window.chatModule.updateFilesListInSettings();
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
      if (e.altKey && e.key === "m" && window.videoModule?.isInCall) {
        e.preventDefault();
        window.videoModule.toggleMicrophone();
      }
      if (e.altKey && e.key === "v" && window.videoModule?.isInCall) {
        e.preventDefault();
        window.videoModule.toggleCamera();
      }
      if (e.altKey && e.key === "s" && window.videoModule?.isInCall) {
        e.preventDefault();
        window.videoModule.toggleScreenShare();
      }
      if (e.altKey && e.key === "j" && !window.videoModule?.isInCall) {
        e.preventDefault();
        window.videoModule.startVideoCall();
      }
      if (e.altKey && e.key === "l" && window.videoModule?.isInCall) {
        e.preventDefault();
        window.videoModule.endVideoCall();
      }
      if (
        e.altKey &&
        e.key === "ArrowUp" &&
        window.videoModule?.isInCall &&
        !window.videoModule.videoMaximized
      ) {
        e.preventDefault();
        document.getElementById("maximizeBtn")?.click();
      }
      if (
        e.altKey &&
        e.key === "ArrowDown" &&
        window.videoModule?.isInCall &&
        window.videoModule.videoMaximized
      ) {
        e.preventDefault();
        document.getElementById("maximizeBtn")?.click();
      } else if (
        e.altKey &&
        e.key === "ArrowDown" &&
        window.videoModule?.isInCall &&
        !window.videoModule.videoMinimized
      ) {
        e.preventDefault();
        document.getElementById("minimizeBtn")?.click();
      }
      if (e.key === "Escape") {
        const sidebar = document.getElementById("sidebar");
        if (window.innerWidth <= 768 && sidebar.classList.contains("open"))
          this.setSidebar(false);
        else if (
          window.videoModule?.isInCall &&
          window.videoModule.videoMaximized
        )
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

    menuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();

      const isCurrentlyOpen = sidebar.classList.contains("open");

      console.log(
        "Toggle clicked in UI manager, current state:",
        isCurrentlyOpen
      );

      this.setSidebar(!isCurrentlyOpen);
    });

    document.addEventListener("click", (e) => {
      if (
        window.innerWidth <= 768 &&
        sidebar.classList.contains("open") &&
        !sidebar.contains(e.target) &&
        !menuToggle.contains(e.target)
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

    console.log(`UI-Manager setSidebar: ${open ? "OPENING" : "CLOSING"}`);

    sidebar.style.transform = "";
    sidebar.style.transition = "";
    mainContent.style.transition = "";

    if (open) {
      sidebar.classList.add("open");
      mainContent.classList.add("shifted");

      try {
        localStorage.setItem("sidebarOpen", "true");
      } catch (e) {}
    } else {
      sidebar.classList.remove("open");
      mainContent.classList.remove("shifted");

      try {
        localStorage.setItem("sidebarOpen", "false");
      } catch (e) {}
    }

    console.log("Final sidebar class:", sidebar.className);
    console.log("Final mainContent class:", mainContent.className);
    console.log("sidebar style.transform:", sidebar.style.transform);
    console.log("mainContent style.marginLeft:", mainContent.style.marginLeft);
  }

  static openImageModal(imageUrl) {
    const modal = document.createElement("div");
    modal.className = "modal fade";
    modal.innerHTML = `<div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Image</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body text-center"><img src="${imageUrl}" alt="Shared image" style="max-width:100%;height:auto;max-height:70vh;"></div><div class="modal-footer"><a href="${imageUrl}" class="btn btn-outline-primary" download target="_blank"><i class="bi bi-download"></i> Download</a><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div></div></div>`;
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
        if (window.__CONFIG__?.debug)
          console.log("Room data auto-saved:", new Date().toLocaleTimeString());
      }
    }, 30000);
  }

  cleanup() {
    if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);
  }
}
