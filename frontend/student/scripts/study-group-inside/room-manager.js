// RoomManager class (ES module) — FIXED: Auto-join + proper participant loading + RACE CONDITION FIX + DEACTIVATION CHECK
// ✅ CRITICAL: Synchronous map instead of Promise.all to prevent re-render conflicts
// ✅ UPDATED: Changed "Online" to "Member" status
// ✅ UPDATED: Added leaveRoom functionality
// ✅ UPDATED: Added resetRoomPassword functionality for Option A
// ✅ UPDATED: Fixed privacy check to use fallback logic for isPrivate
// ✅ UPDATED: Bulletproof URL construction for password reset
// ✅ NEW: Room deactivation check with UI lockdown

import { db } from "./firebase-init.js";
import { fetchJsonWithAuth, postJsonWithAuth } from "../apiClient.js";

export class RoomManager {
  constructor(userAuth) {
    this.userAuth = userAuth;
    this.currentRoomData = null;
    this.isOwner = false;
    this.participants = [];
    this.isLoading = true;
    this.isRoomDeactivated = false;
    this._isUpdatingParticipants = false; // ✅ NEW: Prevent concurrent updates
  }

  async loadRoomData() {
    this.isLoading = true;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const roomId = urlParams.get("room");

      if (!roomId) {
        console.error("[room-manager] No room ID in URL");
        throw new Error("Room ID not found in URL");
      }

      console.log(`[room-manager] Loading room: ${roomId}`);

      const apiUrl = `${window.__CONFIG__.apiBase}/${roomId}`;
      console.log(`[room-manager] Fetching from: ${apiUrl}`);

      const data = await fetchJsonWithAuth(apiUrl, {
        method: "GET",
      });

      if (!data) {
        throw new Error("No room data returned");
      }

      console.log(`[room-manager] Room loaded successfully:`, data);

      // ✅ DEBUG: Log the exact properties we're getting
      console.log("[room-manager] Backend response includes:", {
        hasPrivacy: !!data.privacy,
        privacy: data.privacy,
        hasIsPrivate: !!data.isPrivate,
        isPrivate: data.isPrivate,
        hasPasswordHash: !!data.passwordHash,
        hasPassword: !!data.hasPassword,
        isActive: data.isActive,
        creator: data.creator,
        currentUser: this.userAuth.currentUser?.uid,
      });

      this.currentRoomData = data;
      this.isOwner =
        this.currentRoomData.creator === this.userAuth.currentUser.uid;

      // ✅ NEW: Check if room is deactivated
      this.isRoomDeactivated = this.currentRoomData.isActive === false;

      console.log("[room-manager] After assignment - currentRoomData:", {
        privacy: this.currentRoomData.privacy,
        isPrivate: this.currentRoomData.isPrivate,
        isActive: this.currentRoomData.isActive,
        isDeactivated: this.isRoomDeactivated,
        isOwner: this.isOwner,
      });

      // ✅ NEW: If room is deactivated, show lock and return early
      if (this.isRoomDeactivated) {
        console.warn("[room-manager] ⚠️ ROOM IS DEACTIVATED - Locking UI");
        this.isLoading = false;
        return this.currentRoomData;
      }

      // ✅ AUTO-JOIN: Add user to participants if not already
      await this.autoJoinRoom();

      // ✅ CRITICAL: Load participants with new stable approach
      await this.loadParticipantsInfo();
      this.isLoading = false;
      return this.currentRoomData;
    } catch (err) {
      console.error("[room-manager] Error loading room:", err);
      this.isLoading = false;

      if (typeof window.showToast === "function") {
        window.showToast(`Failed to load room: ${err.message}`, "error");
      }

      setTimeout(() => {
        window.location.href = "study-rooms.html";
      }, 2000);

      throw err;
    }
  }

  // ✅ AUTO-JOIN: Add user to room participants if not already present
  async autoJoinRoom() {
    try {
      const currentUid = this.userAuth.currentUser?.uid;
      const participants = this.currentRoomData?.participants || [];

      // If already in participants, skip joining
      if (participants.includes(currentUid)) {
        console.log(
          `[room-manager] User ${currentUid} already in room participants`
        );
        return;
      }

      // Not in participants - join now!
      const roomId = this.currentRoomData._id || this.currentRoomData.id;
      console.log(`[room-manager] Auto-joining room: ${roomId}`);

      const joinResponse = await postJsonWithAuth(
        `${window.__CONFIG__.apiBase}/${roomId}/join`,
        {}
      );

      console.log(
        `[room-manager] Successfully joined room. Participants count:`,
        joinResponse.participantCount
      );

      // Update local room data with new participants
      this.currentRoomData.participants = [...participants, currentUid];
    } catch (err) {
      console.warn(
        "[room-manager] Auto-join failed (may already be member):",
        err
      );
      // Don't throw - user might already be in room
    }
  }

  // ✅ CRITICAL FIX: Prevent race condition by fetching ALL data first
  async loadParticipantsInfo() {
    // ✅ NEW: Prevent concurrent updates
    if (this._isUpdatingParticipants) {
      console.warn(
        "[room-manager] Already updating participants, skipping duplicate call"
      );
      return;
    }

    this._isUpdatingParticipants = true;

    try {
      this.participants = [];
      const currentUid = this.userAuth.currentUser?.uid;

      console.log(
        "[room-manager] Starting loadParticipantsInfo for user:",
        currentUid
      );

      // Check if participants array exists AND has items
      if (
        !this.currentRoomData?.participants ||
        !Array.isArray(this.currentRoomData.participants) ||
        this.currentRoomData.participants.length === 0
      ) {
        console.log("[room-manager] No participants, loading self only");
        const selfInfo = await this.userAuth.getUserDisplayInfo(currentUid);
        this.participants = [
          {
            id: currentUid,
            name: selfInfo.displayName,
            avatar: selfInfo.avatar,
            photo:
              this.userAuth.currentUser.photoURL ||
              this.userAuth.currentUser.photo ||
              null,
            status: "member",
            isHost: this.isOwner,
            inCall: false,
          },
        ];
        this.updateParticipantsList();
        this._isUpdatingParticipants = false;
        return;
      }

      // ✅ CRITICAL: Get all participant UIDs first
      const uids = Array.from(
        new Set(this.currentRoomData.participants.filter(Boolean))
      );

      console.log(`[room-manager] Loading ${uids.length} participants:`, uids);

      // ✅ CRITICAL: Batch fetch ALL participant display infos in ONE call
      const infosMap = await this.userAuth.getUserDisplayInfos(uids);

      console.log(
        "[room-manager] Fetched participant infos:",
        Object.entries(infosMap)
          .map((e) => `${e[0].substring(0, 8)}=${e[1].displayName}`)
          .join(", ")
      );

      // ✅ CRITICAL FIX: Synchronous map (NOT async) to prevent race conditions
      // All data is already fetched, just build the array without any async calls
      this.participants = uids.map((uid) => {
        try {
          const info = infosMap[uid] || {
            displayName: uid.substring(0, 8),
            avatar: "U",
            photo: null,
          };

          let photo = null;
          if (uid === currentUid) {
            photo =
              this.userAuth.currentUser.photoURL ||
              this.userAuth.currentUser.photo ||
              info.photo ||
              null;
          } else {
            photo = info.photo || null;
          }

          const participant = {
            id: uid,
            name: info.displayName || uid.substring(0, 8),
            avatar: info.avatar || "U",
            photo: photo,
            status: "member",
            isHost: this.currentRoomData.creator === uid,
            inCall: false,
          };

          console.log(
            `[room-manager] Built participant: ${uid.substring(0, 8)} = ${
              participant.name
            }`
          );

          return participant;
        } catch (err) {
          console.error("Error building participant info for", uid, err);
          return {
            id: uid,
            name: uid.substring(0, 8),
            avatar: "U",
            photo: null,
            status: "member",
            isHost: this.currentRoomData.creator === uid,
            inCall: false,
          };
        }
      });

      console.log(
        "[room-manager] All participants loaded successfully:",
        this.participants.map((p) => p.name).join(", ")
      );

      // ✅ CRITICAL: Update UI once with complete data
      this.updateParticipantsList();
    } catch (err) {
      console.error("[room-manager] Error loading participants:", err);
    } finally {
      this._isUpdatingParticipants = false;
    }
  }

  // ✅ STABLE: Render participants list from the in-memory array
  updateParticipantsList() {
    const participantsList = document.getElementById("participantsList");
    if (!participantsList) return;

    console.log(
      "[room-manager] Updating participants list UI with:",
      this.participants.map((p) => p.name).join(", ")
    );

    participantsList.innerHTML = this.participants
      .map((p) => {
        const isCurrent = p.id === this.userAuth.currentUser.uid;
        const canKick = this.isOwner && !isCurrent;

        const avatarHtml = p.photo
          ? `<div class="participant-avatar" style="background-image: url('${p.photo}'); background-size: cover; background-position: center;"></div>`
          : `<div class="participant-avatar">${p.avatar}</div>`;

        return `<div class="participant-item" data-user-id="${
          p.id
        }">${avatarHtml}<div class="participant-info"><div class="participant-name">${
          p.name
        }${isCurrent ? " (You)" : ""}</div><div class="participant-status">${
          p.isHost ? "Host" : p.inCall ? "In Call" : "Member"
        }</div></div>${
          canKick
            ? `<div class="participant-actions"><button class="kick-btn" onclick="window.kickParticipant('${p.id}')" title="Kick user"><i class="bi bi-x-lg"></i></button></div>`
            : ""
        }</div>`;
      })
      .join("");

    const participantCount = document.getElementById("participantCount");
    if (participantCount)
      participantCount.textContent = String(this.participants.length);

    console.log("[room-manager] Participants list UI updated");
  }

  // ✅ UPDATE: Mark participant as in/out of call
  updateParticipantCallStatus(userId, inCall) {
    const p = this.participants.find((x) => x.id === userId);
    if (p) {
      p.inCall = inCall;
      this.updateParticipantsList();
    }
  }

  // ✅ UPDATE: Room display information
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
        inviteInput.value = `${baseUrl}?room=${encodeURIComponent(
          roomId
        )}&invite=true`;
      }
    } catch (err) {
      console.warn("updateRoomDisplay failed:", err);
    }
  }

  // ✅ SAVE: Room settings (name & description)
  async saveRoomSettings() {
    if (!this.currentRoomData) {
      window.showToast?.("Room data not loaded", "error");
      return;
    }

    try {
      const roomNameInput = document.getElementById("roomNameInput");
      const roomDescInput = document.getElementById("roomDescInput");

      if (!roomNameInput) {
        throw new Error("Room name input not found");
      }

      const newName = roomNameInput.value.trim();
      const newDesc = roomDescInput ? roomDescInput.value.trim() : "";

      if (!newName) {
        window.showToast?.("Room name cannot be empty", "error");
        return;
      }

      const roomId = this.currentRoomData._id || this.currentRoomData.id;
      await fetchJsonWithAuth(`${window.__CONFIG__.apiBase}/${roomId}`, {
        method: "PUT",
        body: JSON.stringify({ name: newName, description: newDesc }),
        headers: { "Content-Type": "application/json" },
      });

      this.currentRoomData.name = newName;
      this.currentRoomData.description = newDesc;

      this.updateRoomDisplay();

      const modalEl = document.getElementById("settingsModal");
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }

      window.showToast?.("Room settings updated successfully", "success");
    } catch (err) {
      console.error("Error saving room settings:", err);
      const msg =
        (err && err.body && (err.body.error || err.body.message)) ||
        err.message ||
        "unknown error";
      window.showToast?.("Failed to save settings: " + msg, "error");
    }
  }

  // ✅ DELETE: Remove room (owner only)
  async deleteRoom() {
    if (!this.isOwner) {
      window.showToast?.("Only the room owner can delete this room.", "error");
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

      await fetchJsonWithAuth(`${window.__CONFIG__.apiBase}/${roomId}`, {
        method: "DELETE",
      });

      window.showToast?.(
        "Room deleted successfully! Redirecting...",
        "success"
      );

      const modalEl = document.getElementById("settingsModal");
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }

      setTimeout(() => (window.location.href = "study-rooms.html"), 1200);
    } catch (err) {
      console.error("Error deleting room:", err);
      const msg = (err && err.message) || "unknown error";
      window.showToast?.("Could not delete room: " + msg, "error");
    }
  }

  // ✅ KICK: Remove participant from room (owner only)
  async kickParticipant(userId) {
    if (!this.isOwner) {
      window.showToast?.(
        "Only the room owner can remove participants.",
        "error"
      );
      return;
    }

    if (
      !confirm(
        "Are you sure you want to remove this participant from the room?"
      )
    )
      return;

    try {
      const roomId = this.currentRoomData._id || this.currentRoomData.id;

      await fetchJsonWithAuth(
        `${
          window.__CONFIG__.apiBase
        }/${roomId}/participants/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
        }
      );

      this.participants = this.participants.filter((p) => p.id !== userId);
      this.updateParticipantsList();

      window.showToast?.("Participant removed successfully", "success");
    } catch (err) {
      console.error("Error removing participant:", err);
      window.showToast?.(
        "Could not remove participant: " + (err.message || "unknown error"),
        "error"
      );
    }
  }

  // ✅ LEAVE: Leave room functionality
  async leaveRoom() {
    if (!this.currentRoomData) {
      window.showToast?.("Room data not loaded", "error");
      return;
    }

    if (
      !confirm(
        "Are you sure you want to leave this study room? You can rejoin later using the invite link."
      )
    )
      return;

    try {
      const roomId = this.currentRoomData._id || this.currentRoomData.id;
      const currentUid = this.userAuth.currentUser.uid;

      console.log(
        `[room-manager] Removing user ${currentUid} from room ${roomId}`
      );

      await fetchJsonWithAuth(
        `${
          window.__CONFIG__.apiBase
        }/${roomId}/participants/${encodeURIComponent(currentUid)}`,
        {
          method: "DELETE",
        }
      );

      window.showToast?.("You have left the study room", "success");

      setTimeout(() => {
        window.location.href = "study-rooms.html";
      }, 1000);
    } catch (err) {
      console.error("Error leaving room:", err);
      const msg =
        (err && err.body && (err.body.error || err.body.message)) ||
        err.message ||
        "unknown error";
      window.showToast?.(
        "Could not leave room: " + msg + ". Please try again.",
        "error"
      );
    }
  }

  // ✅ NEW: Reset room password - OPTION A (Private rooms only)
  async resetRoomPassword(newPassword) {
    // Validation
    if (!this.isOwner) {
      throw new Error("Only the room owner can reset the password");
    }

    // ✅ FIXED: Check privacy property as fallback since isPrivate might be undefined
    const roomPrivacy = String(
      this.currentRoomData?.privacy || "public"
    ).toLowerCase();
    const isPrivateRoom =
      this.currentRoomData?.isPrivate || roomPrivacy === "private";

    console.log("[room-manager] Password reset validation:", {
      roomPrivacy,
      isPrivateRoom,
      isOwner: this.isOwner,
    });

    if (!isPrivateRoom) {
      throw new Error("Password reset is only available for private rooms");
    }

    if (!newPassword || typeof newPassword !== "string") {
      throw new Error("Password is required");
    }

    const sanitizedPassword = newPassword.trim();

    if (sanitizedPassword.length < 8) {
      throw new Error("Password must be at least 8 characters long");
    }

    if (sanitizedPassword.length > 100) {
      throw new Error("Password must be less than 100 characters");
    }

    if (!/[A-Z]/.test(sanitizedPassword)) {
      throw new Error("Password must contain at least one uppercase letter");
    }

    if (!/[a-z]/.test(sanitizedPassword)) {
      throw new Error("Password must contain at least one lowercase letter");
    }

    if (!/[0-9]/.test(sanitizedPassword)) {
      throw new Error("Password must contain at least one number");
    }

    try {
      const roomId = this.currentRoomData._id || this.currentRoomData.id;

      console.log("[room-manager] Resetting password for room:", roomId);
      console.log("[room-manager] Room privacy:", roomPrivacy);
      console.log("[room-manager] Is private room:", isPrivateRoom);

      // ✅ BULLETPROOF: Build URL step by step
      const apiBase = window.__CONFIG__.apiBase;
      console.log("[room-manager] API Base URL:", apiBase);
      console.log("[room-manager] Room ID:", roomId);

      // Construct URL without template literals
      let resetUrl = apiBase;
      if (!resetUrl.endsWith("/")) {
        resetUrl = resetUrl + "/";
      }
      resetUrl = resetUrl + roomId + "/password";

      console.log("[room-manager] ✅ Final API URL:", resetUrl);
      console.log("[room-manager] Full Request:", {
        method: "PUT",
        url: resetUrl,
        body: { password: "***" },
      });

      const response = await fetchJsonWithAuth(resetUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: sanitizedPassword }),
      });

      console.log("[room-manager] ✅ Password reset successfully");
      console.log("[room-manager] Response:", response);

      return response;
    } catch (err) {
      console.error("[room-manager] Error resetting password:", err);
      console.error("[room-manager] Error details:", err.status, err.body);
      console.error("[room-manager] Error message:", err.message);
      throw new Error(err.message || "Failed to reset room password");
    }
  }
}
