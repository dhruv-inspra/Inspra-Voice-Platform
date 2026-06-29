// Read-only: list every account with its role and whether it resolves as admin.
// Usage (from backend/):  node scripts/list-users.mjs

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const admins = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const supa = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supa.auth.admin.listUsers();
if (error) {
  console.log("listUsers error:", error.message);
  process.exit(1);
}

console.log(`ADMIN_EMAILS bootstrap: ${admins.length ? admins.join(", ") : "(none)"}\n`);
for (const u of data.users) {
  const email = (u.email || "").toLowerCase();
  const role = u.user_metadata?.role || "(none)";
  const isAdmin = role === "admin" || admins.includes(email);
  console.log(`- ${email.padEnd(40)} role: ${String(role).padEnd(8)} admin: ${isAdmin}`);
}
