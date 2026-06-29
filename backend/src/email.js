// Invite email sending. Two transports, in priority order:
//   1. SMTP (e.g. Gmail with an app password) — works for ANY recipient with no
//      domain verification. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.
//   2. Resend REST API — set RESEND_API_KEY. Note: the shared test sender
//      (onboarding@resend.dev) only delivers to the Resend account owner;
//      verify a domain to email anyone.
// If neither is configured (or sending fails) the invite still succeeds and the
// admin shares the link manually.

import nodemailer from "nodemailer";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function resendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function isEmailConfigured() {
  return smtpConfigured() || resendConfigured();
}

function fromAddress() {
  return (
    process.env.EMAIL_FROM ||
    (smtpConfigured() ? `Voice Agent OS <${process.env.SMTP_USER}>` : "Voice Agent OS <onboarding@resend.dev>")
  );
}

function inviteEmailHtml({ inviteUrl, role, invitedBy }) {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
  <body style="margin:0;background:#0b0e13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e8eef5;">
    <div style="max-width:560px;margin:0 auto;padding:28px 18px;">
      <div style="background:linear-gradient(135deg,#2bd4a6,#5aa2ff);border-radius:16px 16px 0 0;padding:30px 28px;">
        <div style="font-size:20px;font-weight:700;color:#07090d;">Voice Agent OS</div>
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:rgba(7,9,13,0.7);margin-top:2px;">Inspra AI</div>
      </div>
      <div style="background:#11161d;border:1px solid #232a33;border-top:none;border-radius:0 0 16px 16px;padding:30px 28px;">
        <h1 style="margin:0 0 12px;font-size:22px;color:#ffffff;">You're invited</h1>
        <p style="margin:0 0 18px;line-height:1.6;color:#c2ccd8;">
          You've been invited to join the Voice Agent OS workspace as a <strong style="color:#fff;">${role}</strong>.
          ${invitedBy ? `<br/><span style="color:#8a97a6;font-size:14px;">Invited by ${invitedBy}.</span>` : ""}
        </p>
        <p style="margin:0 0 24px;line-height:1.6;color:#c2ccd8;">
          Click below to set your password and secure the account with two-factor authentication.
        </p>
        <div style="text-align:center;margin:0 0 24px;">
          <a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#2bd4a6,#5aa2ff);color:#07090d;font-weight:700;text-decoration:none;padding:14px 30px;border-radius:12px;">Accept invitation</a>
        </div>
        <p style="margin:0 0 8px;color:#8a97a6;font-size:13px;">Or paste this link into your browser:</p>
        <p style="margin:0;padding:12px;background:#0b1016;border:1px solid #232a33;border-radius:8px;word-break:break-all;font-size:13px;color:#9fe8d4;">${inviteUrl}</p>
        <hr style="border:none;border-top:1px solid #232a33;margin:26px 0;" />
        <p style="margin:0;color:#6c7888;font-size:12px;">This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.</p>
      </div>
    </div>
  </body>
</html>`;
}

const SUBJECT = "You're invited to Voice Agent OS";

async function sendViaSmtp({ to, html }) {
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  const info = await transporter.sendMail({
    from: fromAddress(),
    to,
    subject: SUBJECT,
    html
  });
  return { success: true, id: info.messageId };
}

async function sendViaResend({ to, html }) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: fromAddress(), to: [to], subject: SUBJECT, html })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || data?.error?.message || "Failed to send email";
    return { success: false, error: message };
  }
  return { success: true, id: data?.id };
}

/**
 * Send an invitation email. Returns { success, id?, error?, skipped? }.
 * Never throws — invite creation must not fail because email did.
 */
export async function sendInviteEmail({ to, inviteUrl, role = "member", invitedBy }) {
  if (!isEmailConfigured()) {
    return { success: false, skipped: true, error: "Email not configured" };
  }

  const html = inviteEmailHtml({ inviteUrl, role, invitedBy });

  try {
    if (smtpConfigured()) {
      return await sendViaSmtp({ to, html });
    }
    return await sendViaResend({ to, html });
  } catch (error) {
    console.error("Error sending invite email:", error?.message || error);
    return { success: false, error: error?.message || "Failed to send email" };
  }
}
