# Inspra AI Voice Platform

Full-stack app split into:

- `frontend/` - React + Vite app
- `backend/` - Node.js + Express API
- Firebase Auth for login/signup/reset
- Firebase Firestore for clients, tasks, and prompt jobs

## Setup

### 1. Firebase

Create a Firebase project, then enable:

- Authentication -> Email/Password
- Firestore Database

### 2. Frontend environment

Add your Firebase web app keys in `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_FIREBASE_API_KEY=your_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. Backend environment

Create a Firebase service account and add these values in `backend/.env`:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Run

Install and run the backend:

```bash
cd backend
npm install
npm run dev
```

Install and run the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Current Features

- Login
- Signup
- Password reset
- Protected app shell
- Independent tabs for Clients, Tasks, Optimize Prompt, and New Prompt
- Firestore-backed clients and tasks
- Backend token verification with Firebase Admin
- Prompt generation and optimization job storage
