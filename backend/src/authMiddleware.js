import { createSupabaseForToken } from "./supabaseClient.js";

// Bootstrap admins come from an allowlist; invited admins carry role in metadata.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function resolveIsAdmin(user) {
  const email = (user.email || "").toLowerCase();
  const role = user.user_metadata?.role;
  return ADMIN_EMAILS.includes(email) || role === "admin";
}

// Decode (without verifying) the payload of a Supabase JWT to read claims such
// as `aal`. The token's signature/expiry is still validated by getUser() below.
function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Missing auth token." });
    }

    const supabase = createSupabaseForToken(token);
    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: "Invalid or expired auth token." });
    }

    // Mandatory two-factor authentication: only sessions that have completed the
    // TOTP challenge (Authenticator Assurance Level 2) may reach protected data.
    const { aal } = decodeJwtPayload(token);
    if (aal !== "aal2") {
      return res
        .status(401)
        .json({ message: "Two-factor authentication required.", code: "mfa_required" });
    }

    req.supabase = supabase;
    req.user = {
      uid: user.id,
      email: user.email || "",
      name: user.user_metadata?.name || user.user_metadata?.full_name || user.email || "User",
      isAdmin: resolveIsAdmin(user)
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired auth token." });
  }
}

// Gate admin-only routes (invite management). Must run after requireAuth.
export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: "Admin access required." });
  }
  return next();
}
