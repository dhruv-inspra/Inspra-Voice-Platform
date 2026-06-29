import { randomBytes } from "crypto";
import { createAdminClient } from "./supabaseClient.js";
import { sendInviteEmail } from "./email.js";

const INVITE_TTL_DAYS = 7;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function emailHasAccount(admin, email) {
  // Small teams: the first page of users is enough. Bump perPage if you grow.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return false;
  return (data?.users || []).some((u) => normalizeEmail(u.email) === normalizeEmail(email));
}

/**
 * Create (or refresh) an invitation and return its accept URL.
 * Mirrors WSC: one-time token, 7-day expiry, refuses duplicates of active invites.
 */
export async function createInvite({ email, role = "member", invitedBy, invitedByEmail, baseUrl }) {
  const admin = createAdminClient();
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || !cleanEmail.includes("@")) {
    const err = new Error("A valid email is required.");
    err.status = 400;
    throw err;
  }

  if (await emailHasAccount(admin, cleanEmail)) {
    const err = new Error("An account with this email already exists.");
    err.status = 400;
    throw err;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Refresh an existing (expired/accepted) invite for this email, else insert.
  const { data: existing } = await admin
    .from("invitations")
    .select("id, expires_at, accepted_at")
    .eq("email", cleanEmail)
    .maybeSingle();

  if (existing) {
    const isActive = !existing.accepted_at && new Date(existing.expires_at) > new Date();
    if (isActive) {
      const err = new Error("An active invitation already exists for this email.");
      err.status = 400;
      throw err;
    }
  }

  const payload = {
    email: cleanEmail,
    role,
    token,
    invited_by: invitedBy || null,
    expires_at: expiresAt,
    accepted_at: null
  };

  const query = existing
    ? admin.from("invitations").update(payload).eq("email", cleanEmail).select().single()
    : admin.from("invitations").insert(payload).select().single();

  const { data: invitation, error } = await query;
  if (error) {
    const err = new Error("Failed to create invitation.");
    err.status = 500;
    throw err;
  }

  const inviteUrl = `${baseUrl.replace(/\/$/, "")}/?invite=${token}`;

  const emailResult = await sendInviteEmail({
    to: cleanEmail,
    inviteUrl,
    role,
    invitedBy: invitedByEmail
  });

  return {
    invitation,
    inviteUrl,
    emailSent: emailResult.success === true,
    emailSkipped: emailResult.skipped === true,
    emailError: emailResult.success ? undefined : emailResult.error
  };
}

export async function listInvites() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .select("id, email, role, expires_at, accepted_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    const err = new Error("Failed to load invitations.");
    err.status = 500;
    throw err;
  }
  return data || [];
}

/**
 * Accept an invitation: validate the token, then create the user with the
 * admin API (email auto-confirmed). Returns the email so the client can sign in.
 */
export async function acceptInvite({ token, fullName, password }) {
  const admin = createAdminClient();

  if (!token || !fullName || !password) {
    const err = new Error("Name, password, and a valid invite are required.");
    err.status = 400;
    throw err;
  }
  if (String(password).length < 8) {
    const err = new Error("Password must be at least 8 characters.");
    err.status = 400;
    throw err;
  }

  const { data: invitation, error: fetchError } = await admin
    .from("invitations")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .maybeSingle();

  if (fetchError || !invitation) {
    const err = new Error("This invitation is invalid or has already been used.");
    err.status = 400;
    throw err;
  }

  if (new Date(invitation.expires_at) < new Date()) {
    const err = new Error("This invitation has expired. Ask an admin for a new one.");
    err.status = 400;
    throw err;
  }

  if (await emailHasAccount(admin, invitation.email)) {
    const err = new Error("An account with this email already exists.");
    err.status = 400;
    throw err;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: {
      name: fullName,
      full_name: fullName,
      role: invitation.role
    }
  });

  if (createError || !created?.user) {
    const err = new Error(createError?.message || "Failed to create the account.");
    err.status = 500;
    throw err;
  }

  await admin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("token", token);

  return { email: invitation.email };
}
