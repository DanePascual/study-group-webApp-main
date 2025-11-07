// UiManager (ES module) - FIXED: Let sidebar.js handle theme
// ✅ UPDATED: Sidebar default closed on page load
// ✅ UPDATED: Leave Room button handler
// ✅ UPDATED: Password reset form with validation
// ✅ UPDATED: Fixed Security tab visibility with proper initialization order
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
    this.initializeLeaveRoom();
    this.initializePasswordReset();
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

      // Populate general tab
      document.getElementById("roomNameInput").value =
        this.roomManager.currentRoomData.name || "";
      document.getElementById("roomDescInput").value =
        this.roomManager.currentRoomData.description || "";

      // Update character count
      this.updateDescCharCount();

      // ✅ DEBUG: Log room data before checking visibility
      console.log("[ui-manager] openSettingsModal - Current Room Data:", {
        name: this.roomManager.currentRoomData.name,
        privacy: this.roomManager.currentRoomData.privacy,
        isPrivate: this.roomManager.currentRoomData.isPrivate,
        creator: this.roomManager.currentRoomData.creator,
        currentUser: this.userAuth.currentUser?.uid,
        isOwner: this.roomManager.isOwner,
      });

      // Reset password form
      document.getElementById("newPasswordInput").value = "";
      document.getElementById("confirmPasswordInput").value = "";
      this.resetPasswordRequirements();
      document.getElementById("passwordResetAlert").style.display = "none";

      // ✅ NEW: Show/hide Security tab based on owner + private room
      this.updateSecurityTabVisibility();

      const participantsList2 = document.getElementById("participantsList2");
      if (participantsList2) {
        // ✅ FIXED: Only show kick button if user is OWNER
        participantsList2.innerHTML = this.roomManager.participants
          .map((participant) => {
            const isCurrent = participant.id === this.userAuth.currentUser.uid;
            const canKick = this.roomManager.isOwner && !isCurrent;

            return `<div class="d-flex justify-content-between align-items-center p-2 border rounded mb-2"><div class="d-flex align-items-center gap-2"><div class="participant-avatar" style="width:24px;height:24px;font-size:12px;">${
              participant.avatar
            }</div><span>${participant.name}${
              isCurrent ? " (You)" : ""
            }</span>${
              participant.isHost
                ? '<span class="badge bg-primary">Host</span>'
                : ""
            }</div>${
              canKick
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

  // ✅ NEW: Character counter for description
  updateDescCharCount() {
    const descInput = document.getElementById("roomDescInput");
    const charCount = document.getElementById("descCharCount");

    if (descInput && charCount) {
      const count = descInput.value.length;
      charCount.textContent = `(${count}/500)`;

      descInput.addEventListener("input", () => {
        const newCount = descInput.value.length;
        charCount.textContent = `(${newCount}/500)`;
      });
    }
  }

  // ✅ FIXED: Show/hide Security tab with proper debugging
  updateSecurityTabVisibility() {
    const securityTabItem = document.getElementById("security-tab-item");

    // Check both isPrivate (from backend) and privacy property as fallback
    const isPrivateRoom =
      this.roomManager.currentRoomData?.isPrivate ||
      String(
        this.roomManager.currentRoomData?.privacy || "public"
      ).toLowerCase() === "private";

    const isOwner = this.roomManager.isOwner;

    console.log("[ui-manager] Security tab visibility check:", {
      roomPrivacy: this.roomManager.currentRoomData?.privacy,
      roomIsPrivate: this.roomManager.currentRoomData?.isPrivate,
      calculatedIsPrivateRoom: isPrivateRoom,
      isOwner: isOwner,
      willShow: isOwner && isPrivateRoom,
      securityTabItemExists: !!securityTabItem,
    });

    if (securityTabItem) {
      if (isOwner && isPrivateRoom) {
        securityTabItem.style.display = "block";
        console.log(
          "[ui-manager] ✅ Security tab VISIBLE (owner + private room)"
        );
      } else {
        securityTabItem.style.display = "none";
        const reason = !isOwner ? "not owner" : "not private";
        console.log(`[ui-manager] ❌ Security tab hidden (reason: ${reason})`);
      }
    } else {
      console.warn("[ui-manager] ⚠️ Security tab item element not found!");
    }
  }

  // ✅ NEW: Initialize password reset form
  initializePasswordReset() {
    const newPasswordInput = document.getElementById("newPasswordInput");
    const confirmPasswordInput = document.getElementById(
      "confirmPasswordInput"
    );
    const confirmPasswordResetBtn = document.getElementById(
      "confirmPasswordResetBtn"
    );

    if (newPasswordInput) {
      newPasswordInput.addEventListener("input", () => {
        this.validatePasswordRequirements(newPasswordInput.value);
        this.updatePasswordResetButtonState();
      });
    }

    if (confirmPasswordInput) {
      confirmPasswordInput.addEventListener("input", () => {
        this.updatePasswordResetButtonState();
      });
    }

    if (confirmPasswordResetBtn) {
      confirmPasswordResetBtn.addEventListener("click", () =>
        this.handlePasswordReset()
      );
    }
  }

  // ✅ NEW: Validate password requirements
  validatePasswordRequirements(password) {
    const requirements = {
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
    };

    const reqLength = document.getElementById("req-length");
    const reqUpper = document.getElementById("req-upper");
    const reqLower = document.getElementById("req-lower");
    const reqNumber = document.getElementById("req-number");

    if (reqLength) {
      reqLength.classList.toggle("met", requirements.length);
      if (requirements.length) {
        reqLength.querySelector("i").className = "bi bi-check-circle-fill";
      } else {
        reqLength.querySelector("i").className = "bi bi-circle";
      }
    }

    if (reqUpper) {
      reqUpper.classList.toggle("met", requirements.upper);
      if (requirements.upper) {
        reqUpper.querySelector("i").className = "bi bi-check-circle-fill";
      } else {
        reqUpper.querySelector("i").className = "bi bi-circle";
      }
    }

    if (reqLower) {
      reqLower.classList.toggle("met", requirements.lower);
      if (requirements.lower) {
        reqLower.querySelector("i").className = "bi bi-check-circle-fill";
      } else {
        reqLower.querySelector("i").className = "bi bi-circle";
      }
    }

    if (reqNumber) {
      reqNumber.classList.toggle("met", requirements.number);
      if (requirements.number) {
        reqNumber.querySelector("i").className = "bi bi-check-circle-fill";
      } else {
        reqNumber.querySelector("i").className = "bi bi-circle";
      }
    }

    return Object.values(requirements).every((v) => v);
  }

  // ✅ NEW: Update password reset button state
  updatePasswordResetButtonState() {
    const newPasswordInput = document.getElementById("newPasswordInput");
    const confirmPasswordInput = document.getElementById(
      "confirmPasswordInput"
    );
    const confirmPasswordResetBtn = document.getElementById(
      "confirmPasswordResetBtn"
    );

    const allRequirementsMet = this.validatePasswordRequirements(
      newPasswordInput?.value || ""
    );
    const passwordsMatch =
      newPasswordInput?.value === confirmPasswordInput?.value &&
      newPasswordInput?.value.length > 0;

    if (confirmPasswordResetBtn) {
      confirmPasswordResetBtn.disabled = !(
        allRequirementsMet && passwordsMatch
      );
    }
  }

  // ✅ NEW: Reset password requirements display
  resetPasswordRequirements() {
    const requirements = ["req-length", "req-upper", "req-lower", "req-number"];

    requirements.forEach((id) => {
      const req = document.getElementById(id);
      if (req) {
        req.classList.remove("met");
        const icon = req.querySelector("i");
        if (icon) {
          icon.className = "bi bi-circle";
        }
      }
    });
  }

  // ✅ NEW: Handle password reset
  async handlePasswordReset() {
    const newPasswordInput = document.getElementById("newPasswordInput");
    const confirmPasswordInput = document.getElementById(
      "confirmPasswordInput"
    );
    const alertDiv = document.getElementById("passwordResetAlert");
    const confirmPasswordResetBtn = document.getElementById(
      "confirmPasswordResetBtn"
    );

    const newPassword = newPasswordInput?.value || "";
    const confirmPassword = confirmPasswordInput?.value || "";

    // Validate
    if (newPassword !== confirmPassword) {
      this.showPasswordAlert("Passwords do not match", "danger", alertDiv);
      return;
    }

    if (newPassword.length < 8) {
      this.showPasswordAlert(
        "Password must be at least 8 characters",
        "danger",
        alertDiv
      );
      return;
    }

    // Disable button and show loading
    if (confirmPasswordResetBtn) {
      confirmPasswordResetBtn.disabled = true;
      const originalText = confirmPasswordResetBtn.innerHTML;
      confirmPasswordResetBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2"></span>Resetting...';

      try {
        await this.roomManager.resetRoomPassword(newPassword);

        this.showPasswordAlert(
          "✅ Password reset successfully! All members will need to use the new password.",
          "success",
          alertDiv
        );

        // Clear inputs
        if (newPasswordInput) newPasswordInput.value = "";
        if (confirmPasswordInput) confirmPasswordInput.value = "";
        this.resetPasswordRequirements();

        // Reset button after 3 seconds
        setTimeout(() => {
          confirmPasswordResetBtn.disabled = false;
          confirmPasswordResetBtn.innerHTML = originalText;
        }, 3000);
      } catch (err) {
        console.error("Error resetting password:", err);
        this.showPasswordAlert(
          err.message || "Failed to reset password",
          "danger",
          alertDiv
        );

        confirmPasswordResetBtn.disabled = false;
        confirmPasswordResetBtn.innerHTML = originalText;
      }
    }
  }

  // ✅ NEW: Show password alert
  showPasswordAlert(message, type, alertDiv) {
    if (alertDiv) {
      alertDiv.className = `alert alert-${type}`;
      alertDiv.innerHTML = message;
      alertDiv.style.display = "block";
      alertDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });

      if (type === "success") {
        setTimeout(() => {
          alertDiv.style.display = "none";
        }, 4000);
      }
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

  // ✅ NEW: Initialize Leave Room button
  initializeLeaveRoom() {
    const leaveRoomBtn = document.getElementById("leaveRoomBtn");
    if (leaveRoomBtn) {
      leaveRoomBtn.addEventListener("click", () => {
        console.log("[ui-manager] Leave Room button clicked");
        this.roomManager.leaveRoom();
      });
    }
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

    // ✅ FIXED: Sidebar default closed on study room page load
    console.log("[ui-manager] Initializing sidebar - DEFAULT CLOSED");
    this.setSidebar(false);

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
        if (sidebar.classList.contains("open")) this.setSidebar(false);
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
