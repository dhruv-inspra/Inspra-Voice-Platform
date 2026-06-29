// Promote (or demote) a user to admin by email — the WSC-style way to bootstrap
// the first admin. After the first admin exists, add further admins by inviting
// them with role = Administrator (no script needed).
//
// Usage (from the backend/ folder):
//   node scripts/set-admin.mjs someone@example.com           # make admin
//   node scripts/set-admin.mjs someone@example.com --demote  # back to member
//
// Requires SUPABASE_URL + SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in backend/.env.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] || "").toLowerCase();
const demote = process.argv.includes("--demote");

if (!email) {
  console.log("Usage: node scripts/set-admin.mjs <email> [--demote]");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in backend/.env");
  process.exit(1);
}

const supa = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await supa.auth.admin.listUsers();
if (error) {
  console.log("listUsers error:", error.message);
  process.exit(1);
}

const user = data.users.find((u) => (u.email || "").toLowerCase() === email);
if (!user) {
  console.log(`No account found for ${email}.`);
  process.exit(1);
}

const role = demote ? "member" : "admin";
const { data: updated, error: updateError } = await supa.auth.admin.updateUserById(user.id, {
  user_metadata: { ...user.user_metadata, role }
});
if (updateError) {
  console.log("update error:", updateError.message);
  process.exit(1);
}

console.log(`${email} is now role: ${updated.user.user_metadata?.role}`);
console.log("They should refresh the app (or log out/in) to pick up the change.");
