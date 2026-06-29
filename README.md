# Inspra AI Voice Platform

Full-stack app split into:

- `frontend/` - React + Vite app
- `backend/` - Node.js + Express API
- Supabase Auth for login/signup/reset
- Supabase Postgres for clients, tasks, and prompt jobs

## Supabase Project

Project URL:

```text
https://ymsooxqtwlttpqjnmumb.supabase.co
```

Dashboard:

```text
https://supabase.com/dashboard/project/ymsooxqtwlttpqjnmumb
```

## Setup

### 1. Configure Supabase

In the Supabase dashboard:

1. Open `SQL Editor`.
2. Run the SQL in `supabase/schema.sql`.
3. Open `Authentication > Sign In / Providers > Email`.
4. For local development, disable email confirmation if you want signup to log in immediately.
5. Copy the project publishable key from the Connect dialog or `Settings > API Keys`.

### 2. Frontend environment

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_SUPABASE_URL=https://ymsooxqtwlttpqjnmumb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

### 3. Backend environment

Create `backend/.env`:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
SUPABASE_URL=https://ymsooxqtwlttpqjnmumb.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

The backend uses the caller's Supabase access token for database requests, so Row Level Security policies apply to every API call. Do not put a Supabase secret or service-role key in the frontend.

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
- Supabase-backed clients, tasks, and prompt jobs
- Backend token verification with Supabase Auth
- Prompt generation and optimization job storage
