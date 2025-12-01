# Study Group WebApp - Complete Project Overview

## Project Structure

This is a full-stack web application for collaborative study groups with admin dashboard functionality. It uses:

- **Backend**: Express.js + Firebase Admin + Supabase
- **Frontend**: Vanilla JavaScript + Bootstrap
- **Database**: Firebase Firestore + Supabase PostgreSQL
- **Hosting**: Firebase Hosting (frontend) + Heroku (backend)

---

## Root Level Files

### `package.json`

- Name: `study-group-backend`
- Version: 1.0.0
- Main entry: `backend/server.js`
- Node: 22.x, npm: 10.x
- **Dependencies**:
  - Express 4.18.2
  - Firebase Admin 13.5.0
  - Firebase Client 12.2.1
  - Supabase JS 2.58.0
  - Nodemailer 7.0.6
  - Multer 1.4.5 (file uploads)
  - bcrypt/bcryptjs (password hashing)
  - express-rate-limit 7.1.5
  - jsonwebtoken 9.0.2
  - sanitize-html 2.17.0
  - @google-cloud/firestore 7.11.6

### `firebase.json`

- Hosting configuration for Firebase
- Public directory: `frontend/`
- Rewrites for profile pages and student pages
- Ignores: `firebase.json`, `.firebase/`, `node_modules/`, `backend/`, markdown files

### `Procfile`

- For Heroku deployment: `web: node backend/server.js`

### `test-mail.js`

- Testing script for Nodemailer email sending
- Uses Gmail SMTP service
- Tests sending from environment variables: `GMAIL_USER`, `GMAIL_PASS`

---

## Backend (`backend/`)

### Core Files

#### `server.js` (207 lines)

**Main Express server with:**

- Request logging middleware
- CORS configuration with whitelist validation
  - Allows: `http://localhost:5500`, `https://studygroup.app`, `https://www.studygroup.app`
  - Supports local development hosts
- Body parsers (JSON/URL-encoded, 15MB limit)
- Health check endpoint: `GET /healthz`
- Route mounting:
  - `/api/auth` - Authentication routes
  - `/api/users` - User management
  - `/api/todos` - Todo management
  - `/api/resources` - Resources
  - `/api/reports` - Report submission
  - `/api/uploads` - File uploads
  - `/api/topics` - Topics + TopicPosts
  - `/api/comments` - Comments
  - `/api/posts` - Post likes

### Configuration (`backend/config/`)

#### `firebase-admin.js` (141 lines)

- Initializes Firebase Admin SDK
- Supports three credential methods:
  1. `FIREBASE_SERVICE_ACCOUNT_JSON` (full JSON string)
  2. Individual env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
  3. Local file fallback: `./serviceAccountKey.json` (dev only)
- Sets `GOOGLE_CLOUD_PROJECT` and `GCLOUD_PROJECT` env vars
- No secret logging, safe diagnostics only
- Project ID: `study-group-webapp-93fc2`

#### `firebase.js`

- Client-side Firebase initialization (modular v9)
- Exports: `auth`, `db` (Firestore), `storage`
- Public config (safe for frontend):
  ```
  projectId: study-group-webapp-93fc2
  storageBucket: study-group-webapp-93fc2.firebasestorage.app
  ```

#### `firestore-client.js` (199 lines)

- Explicit Firestore client using @google-cloud/firestore
- First preference: reuses firebase-admin's instance
- Fallback: constructs explicit client from service account
- Load service account from env vars or `./serviceAccountKey.json`
- Normalizes private keys with escaped newlines

#### `supabase.js`

- Creates Supabase admin client (service role key)
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Optional initialization (doesn't exit if missing)

### Middleware (`backend/middleware/`)

#### `firebaseAuthMiddleware.js`

- Verifies Firebase ID tokens from `Authorization: Bearer <token>` header
- Attaches user info to `req.user`:
  ```javascript
  {
    uid: string,
    email: string | null,
    name: string | null,
    admin: boolean,
    isAdmin: boolean,
    adminRole: string | null,
    adminPermissions: object,
    adminStatus: string | null
  }
  ```
- Checks Firestore `admins` collection
- Updates admin `lastActive` and `loginCount`
- Returns 401 for missing/invalid tokens

#### `adminAuthMiddleware.js`

- Verifies Firebase ID tokens with admin custom claims
- Checks Firebase custom claims: `admin` or `superadmin`
- Checks Firestore `admins` collection
- Validates admin status: `active`, `suspended`, or `removed`
- Attaches admin-specific user data to `req.user`
- Returns 403 for non-admins or suspended accounts

### Routes (`backend/routes/`)

#### `auth.js` (569 lines)

**Authentication endpoints:**

- POST `/api/auth/request-otp` - Request OTP for email
- POST `/api/auth/verify-otp` - Verify OTP and create user
- POST `/api/auth/login` - Login with email/password
- POST `/api/auth/request-password-reset` - Send password reset email
- POST `/api/auth/reset-password` - Reset password with token

**Features:**

- Nodemailer with Gmail SMTP
- Rate limiting: 5 attempts per 15 min (OTP verify), 3 per min (signup/OTP request)
- Password validation:
  - Min 8 characters
  - Uppercase, lowercase, number, special char required
  - Special chars: `!@#$%^&*()`
- Allowed courses: `BSIT`, `CCS`, `BSOA`, `COA`, `ABA`
- OTP stored in Firestore with 10-minute expiration
- Secure email domain validation: `@paterostechnologicalcollege.edu.ph`

#### `users.js` (291 lines)

**User management:**

- GET `/api/users/list` - All users (public, no auth)
- GET `/api/users/profile` - Current user's profile (protected)
- PUT `/api/users/profile` - Update profile (protected)
- DELETE `/api/users/:id` (admin only)

**Profile fields:**

- Name, email, student number, program, year level
- Institution, specialization, graduation date
- Bio, photo, photoFilename
- createdAt, lastUpdated

**Security:**

- Email is read-only (cannot be updated)
- Field length limits: name (255), bio (2000), etc.
- Sanitization of all inputs
- College domain validation

#### `todos.js`

**Todo management (protected):**

- GET `/api/todos` - User's todos
- POST `/api/todos` - Create todo
- PUT `/api/todos/:id` - Update todo
- DELETE `/api/todos/:id` - Delete todo

**Todo fields:**

- text, completed, reminder, created, priority
- Empty string reminder converted to null

#### `topics.js` (685 lines)

**Discussion topics (using Supabase):**

- GET `/api/topics` - List all topics
- GET `/api/topics/:id` - Get single topic
- POST `/api/topics` - Create topic
- PUT `/api/topics/:id` - Update topic
- DELETE `/api/topics/:id` - Delete topic (admin)

**Topic fields:**

- title, description, category, tags
- author_id, author_name, author info with avatars
- created_at, updated_at
- post_count, view_count
- pinned status

**Features:**

- Search and filtering by category
- Sorting: newest, oldest, activity
- View count tracking
- User data resolution with avatar URLs

#### `topicPosts.js`

**Forum posts within topics:**

- PUT `/api/topics/:topicId/posts/:postId` - Update post
- DELETE `/api/topics/:topicId/posts/:postId` - Delete post

#### `comments.js`

**Comments on posts:**

- POST `/api/topics/:topicId/posts/:postId/comments` - Create comment
- GET `/api/topics/:topicId/posts/:postId/comments` - Get comments
- PATCH `/api/comments/:commentId` - Update comment
- DELETE `/api/comments/:commentId` - Delete comment
- POST `/api/comments/:commentId/like` - Like comment

#### `postLikes.js`

**Like functionality:**

- GET `/api/posts/:postId/likes` - Get post likes
- POST `/api/posts/:postId/like` - Toggle like

#### `resources.js`

**Learning resources management**

#### `reports.js`

**User report submission**

#### `uploads.js`

**File upload handling (Multer + Supabase)**

#### `zegocloud.js`

**Video/audio integration (ZegoCloud SDK)**

### Admin Routes (`backend/routes/admin/`)

- `admins.js` - Admin user management
- `audit-logs.js` - Activity logging
- `dashboard.js` - Admin statistics
- `reports.js` - Report management
- `study-rooms.js` - Study room management
- `users.js` - User management (admin)

### Services (`backend/services/`)

#### `topicsService.js`

**Service wrapper for topics using Supabase:**

- `createTopic()` - Create new topic
- `listTopics()` - List with search, sort, category filter
- `incrementView()` - Track view counts

#### `studyGroupService.js`

**Study group management service**

### Other Files

#### `set-admin-claims.js`

- Script to set custom claims for admin user
- Hardcoded UID: `lxiTe9mYpIboDUzN4UubwP0ppkF2` (DanePascual)
- Sets claims: `{ admin: true, superadmin: true }`

#### `.env` (not in repo)

**Required environment variables:**

```
GMAIL_USER=your-gmail@gmail.com
GMAIL_PASS=your-app-password
FIREBASE_PROJECT_ID=study-group-webapp-93fc2
FIREBASE_CLIENT_EMAIL=...@iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
NODE_ENV=production
FRONTEND_ORIGIN=http://localhost:5500,https://studygroup.app
FRONTEND_DOMAIN=studygroup.app
FRONTEND_PROTOCOL=https
```

---

## Frontend (`frontend/`)

### Root Files

#### `index.html` (258 lines)

- Landing/marketing page
- Hero section with CTA buttons
- Features section
- How it Works section
- Responsive design with Bootstrap 5.3.0
- Dark/light theme toggle
- Navigation to login page

#### `404.html`

- Firebase-hosted 404 page

### Configuration (`frontend/config/`)

#### `firebase.js` (ES Modules v9)

**Firebase client initialization:**

- Exports: `app`, `auth`, `db`, `getIdToken()`, `onAuthStateChanged()`
- Public API config (safe for client)
- Helper: `getIdToken(forceRefresh)` - gets Firebase ID token
- Helper: `onAuthStateChanged(callback)` - auth state listener

#### `appConfig.js`

**API configuration:**

- `API_BASE`: `https://study-group-backend-d8fc93ae1b7a.herokuapp.com` (production)
- Dev: uncomment to use `http://localhost:5000`
- Exports: `apiUrl()`, `adminApiUrl()` helpers
- Global window exports for backward compatibility

### Student Pages (`frontend/student/pages/`)

- `landing-page.html` - Public landing page
- `login.html` - Login form
- `sign-up.html` - Signup form
- `reset-password.html` - Password reset
- `dashboard.html` - Main student dashboard
- `profile.html` - User profile editor
- `study-rooms.html` - Study rooms browser
- `study-room-inside.html` - Inside a study room
- `topic.html` - Discussion topic page
- `post.html` - Single post view
- `discussion.html` - Discussion threads
- `resources.html` - Learning resources
- `report.html` - Report submission form

### Student Scripts (`frontend/student/scripts/`)

#### `apiClient.js` (387 lines)

**Production-ready HTTP client:**

- `fetchWithAuth(url, options)` - Core wrapper
- `fetchJsonWithAuth(url, options)` - Parse JSON response
- `postJsonWithAuth(url, body, options)` - POST JSON
- `putJsonWithAuth(url, body, options)` - PUT JSON
- `deleteWithAuth(url, options)` - DELETE
- `postFormWithAuth(url, formData, options)` - POST FormData
- `putFormWithAuth(url, formData, options)` - PUT FormData
- `getIdToken(forceRefresh)` - Get Firebase token

**Features:**

- Automatic Authorization header injection
- 30-second timeout default (configurable)
- Automatic retry on 401 (token refresh + retry)
- Retry on transient network errors (2 retries default)
- Exponential backoff (250ms base)
- Case-insensitive header merging
- Handles 204 No Content
- Timeout via AbortController
- URL resolution via `apiUrl()`

**Backward compatibility:**

- Exports `authFetch` and `authFetchJson` aliases

#### `login.js` (489 lines)

**Login functionality:**

- Email/password authentication
- Remember me checkbox
- Forgot password modal with email reset
- Ban check after successful login
- Session persistence
- User-friendly error messages (no Firebase errors)
- Validates college email domain: `@paterostechnologicalcollege.edu.ph`

**Ban check:**

- Queries Firestore `users` collection
- Checks `isBanned` flag
- Reads `bannedReason`, `bannedAt`

#### `sign-up.js`

**User registration:**

- OTP-based registration
- Request OTP endpoint
- Verify OTP endpoint
- Creates user in Firestore
- College email domain validation
- Course selection

#### `reset-password.js`

**Password reset flow**

#### `dashboard.js`

**Main student dashboard**

#### `profile.js`

**User profile management**

#### `study-rooms.js`

**Browse and join study rooms**

#### `topic.js`

**Discussion topics/forums**

#### `post.js`

**Individual post view**

#### `discussion.js`

**Discussion threads management**

#### `resources.js`

**Learning resources**

#### `report.js`

**Report submission**

#### `sidebar.js`

**Common sidebar component**

#### `topicsClient.js`

**Client for topics API**

#### `landing-page.js`

**Landing page interactivity**

### Study Group Inside (`frontend/student/scripts/study-group-inside/`)

**Real-time study room features:**

#### `firebase-init.js`

- Firebase initialization for study group rooms

#### `chat-manager.js`

- Real-time chat functionality

#### `config.js`

- Configuration for study room features

#### `index.js`

- Main entry point for study room

#### `room-manager.js`

- Manage room state and participants

#### `ui-manager.js`

- Study room UI components

#### `user-auth.js`

- User authentication for study room

#### `video-manager.js`

- ZegoCloud video/audio integration

#### `utils.js`

- Utility functions

### Student Styles (`frontend/student/styles/`)

- `landing-page.css` - Landing page styling
- `login.css` - Login form styling
- `sign-up.css` - Signup form styling
- `dashboard.css` - Dashboard layout
- `profile.css` - Profile page
- `study-rooms.css` - Study rooms list
- `study-room-inside.css` - Inside room view
- `discussion.css` - Discussion threads
- `post.css` - Post styling
- `topic.css` - Topic styling
- `resources.css` - Resources page
- `report.css` - Report form
- `reset-password.css` - Password reset
- `sidebar.css` - Sidebar component

### Admin Panel (`frontend/admin/`)

#### Admin Pages

- `index.html` - Admin dashboard main
- `dashboard.html` - Dashboard overview
- `admins.html` - Admin user management
- `users.html` - User management
- `reports.html` - Report management
- `audit-logs.html` - Activity logs
- `study-rooms.html` - Study room management

#### Admin Scripts (`frontend/admin/js/`)

- `admin-auth.js` - Admin authentication
- `admin-dashboard.js` - Dashboard functionality
- `admin-admins.js` - Admin user management
- `admin-users.js` - User management
- `admin-reports.js` - Report handling
- `admin-audit-logs.js` - Audit log viewing
- `admin-study-rooms.js` - Study room management

#### Admin Styles (`frontend/admin/css/`)

- `admin-shared.css` - Common admin styles
- `dashboard.css` - Dashboard styling
- `admins.css` - Admin list styling
- `users.css` - User list styling
- `reports.css` - Report styling
- `audit-logs.css` - Log styling
- `study-rooms.css` - Room styling
- `welcome.css` - Welcome page
- `original-shared-css.txt` - Legacy CSS

---

## Key Features & Architecture

### Authentication Flow

1. **User Registration**:

   - OTP sent to college email
   - OTP verified → User created in Firestore
   - Firebase Auth user created

2. **User Login**:

   - Email/password to Firebase
   - Get ID token
   - Ban check against Firestore
   - Redirect to dashboard

3. **Admin Authentication**:
   - Firebase custom claims (`admin`, `superadmin`)
   - Firestore `admins` collection lookup
   - Status validation: active/suspended/removed

### Data Storage

- **Firestore Collections**:
  - `users` - User profiles
  - `todos` - User todo items
  - `admins` - Admin users with roles
  - `otps` - OTP tokens (10-minute expiry)
- **Supabase Tables**:
  - `topics` - Discussion topics
  - (Post, comment, like tables via PostgreSQL)

### API Security

- CORS whitelist validation
- Bearer token authentication (Firebase ID tokens)
- Rate limiting on auth endpoints
- Input sanitization
- Email domain validation
- Admin role-based access control
- Request timeout (30 seconds)

### File Storage

- Supabase Storage bucket: `profiles`
- Structure: `profiles/<uid>/<uuid>.png`
- Profile photos with public URLs

### Email Service

- Nodemailer + Gmail SMTP
- OTP emails
- Password reset emails
- Admin notification emails

---

## Security Considerations

1. **Credentials**:

   - Firebase service account stored in `.env` or environment variables
   - Supabase service role key in `.env` only
   - Not committed to git

2. **Client Security**:

   - Firebase public config is safe to expose
   - All sensitive operations server-side
   - Email never editable by client

3. **Admin Privileges**:

   - Custom claims required (Firebase)
   - Firestore admin document required
   - Status validation on every request

4. **Rate Limiting**:

   - OTP verification: 5 attempts/15 min
   - Signup: 3 attempts/min
   - OTP request: 3 requests/min

5. **Token Management**:
   - 30-second request timeout
   - Auto-refresh on 401
   - Force refresh option for sensitive ops

---

## Deployment

### Backend (Heroku)

- Entry: `node backend/server.js`
- Node 22.x, npm 10.x
- Environment variables via Heroku config vars

### Frontend (Firebase Hosting)

- Directory: `frontend/`
- Rewrites for SPA routing
- Static assets cached

### Environment Setup

```bash
# Install dependencies
npm install

# Local dev (backend)
npm run dev

# Deploy backend to Heroku
git push heroku main

# Deploy frontend to Firebase
firebase deploy
```

---

## Notable Code Patterns

1. **Error Handling**: User-friendly messages, no Firebase error leakage
2. **Middleware Pattern**: Reusable auth and validation middleware
3. **Service Layer**: Abstracted database operations
4. **API Client**: Retry logic, timeout, token injection
5. **Config Management**: Centralized via env vars
6. **Firestore Queries**: Indexed by uid for performance

---

This project is a well-structured, production-ready study group collaboration platform with comprehensive authentication, real-time features, and admin functionality.
