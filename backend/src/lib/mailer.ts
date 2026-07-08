import nodemailer from "nodemailer";

// Mailpit by default; a real relay (e.g. relay1.dataart.com:587, §3) is reached by
// setting SMTP_HOST/PORT and, when required, SMTP_USER/PASS + SMTP_SECURE.
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: process.env.SMTP_SECURE === "true",
  ...(process.env.SMTP_USER
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
    : {}),
});

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const base = process.env.APP_BASE_URL ?? "http://localhost:8080";
  const link = `${base}/verify?token=${encodeURIComponent(token)}`;
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "noreply@ticketing.local",
    to,
    subject: "Verify your email",
    text: `Welcome!\n\nVerify your account:\n${link}\n\nThe link expires in 24 hours.`,
    html: `<p>Welcome!</p><p><a href="${link}">Verify your account</a> — the link expires in 24 hours.</p>`,
  });
}

// S8.4/ADR-17: 1h expiry (shorter than verification's 24h — a reset token grants
// account takeover, a verification token does not).
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const base = process.env.APP_BASE_URL ?? "http://localhost:8080";
  const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "noreply@ticketing.local",
    to,
    subject: "Reset your password",
    text: `Reset your password:\n${link}\n\nThe link expires in 1 hour. If you didn't request this, ignore this email.`,
    html: `<p><a href="${link}">Reset your password</a> — the link expires in 1 hour.</p><p>If you didn't request this, ignore this email.</p>`,
  });
}
