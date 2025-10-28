# legacy / backup

This folder contains legacy or backup copies of previously-monolithic scripts.
Purpose:

- Keep a versioned backup of the old study-room-inside.js file for reference or rollback.
- Ensure legacy code is not accidentally loaded in production.

Files:

- study-room-inside.js - legacy monolith. Kept for debugging / historical reference.

Notes:

- Do NOT include or reference files from this folder in HTML pages.
- If you need to restore the monolith, you can either move this file back or check out the file from git history.
