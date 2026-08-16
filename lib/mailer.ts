import nodemailer, { type Transporter } from "nodemailer";

const INVITATION_VALIDITY_DAYS = 7;
const FROM_NAME = "Tabulation";

export interface InvitationEmailPayload {
  to: string;
  orgName: string;
  roleName: string;
  inviteUrl: string;
}

export class SmtpConfigError extends Error {
  constructor() {
    super("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD.");
    this.name = "SmtpConfigError";
  }
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  from: string;
}

function readSmtpConfig(): SmtpConfig {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    throw new SmtpConfigError();
  }
  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    from: SMTP_FROM || SMTP_USER,
  };
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport(readSmtpConfig());
  return transporter;
}

function buildInvitationMessage(payload: InvitationEmailPayload) {
  const { to, orgName, roleName, inviteUrl } = payload;
  const subject = `You're invited to join ${orgName} on Tabulation`;
  const text = [
    `You have been invited to join ${orgName} as ${roleName}.`,
    "",
    `Accept your invitation within ${INVITATION_VALIDITY_DAYS} days by visiting:`,
    inviteUrl,
    "",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n");
  const html = [
    `<p>You have been invited to join <strong>${orgName}</strong> as <strong>${roleName}</strong>.</p>`,
    `<p><a href="${inviteUrl}">Accept invitation</a></p>`,
    `<p style="color:#6b7280;font-size:13px">This link expires in ${INVITATION_VALIDITY_DAYS} days. `,
    "If you were not expecting this invitation, you can ignore this email.</p>",
  ].join("");
  return { to, subject, text, html };
}

export async function sendInvitationEmail(payload: InvitationEmailPayload): Promise<void> {
  const { from } = readSmtpConfig();
  const message = buildInvitationMessage(payload);
  await getTransporter().sendMail({ from: `"${FROM_NAME}" <${from}>`, ...message });
}
