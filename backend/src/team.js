import { createAdminClient } from "./supabaseClient.js";

const VALID_ROLES = ["admin", "member"];

function toMember(u) {
  return {
    id: u.id,
    email: u.email || "",
    name: u.user_metadata?.name || u.user_metadata?.full_name || "",
    role: u.user_metadata?.role === "admin" ? "admin" : "member",
    createdAt: u.created_at
  };
}

export async function listMembers() {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    const err = new Error("Failed to load team members.");
    err.status = 500;
    throw err;
  }
  return (data.users || [])
    .map(toMember)
    .sort((a, b) => (a.email > b.email ? 1 : -1));
}

export async function setMemberRole(userId, role) {
  if (!VALID_ROLES.includes(role)) {
    const err = new Error("Role must be 'admin' or 'member'.");
    err.status = 400;
    throw err;
  }

  const admin = createAdminClient();
  const { data: got, error: getError } = await admin.auth.admin.getUserById(userId);
  if (getError || !got?.user) {
    const err = new Error("User not found.");
    err.status = 404;
    throw err;
  }

  const { data: updated, error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...got.user.user_metadata, role }
  });
  if (error) {
    const err = new Error("Failed to update role.");
    err.status = 500;
    throw err;
  }

  return toMember(updated.user);
}
