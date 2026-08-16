import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";
import { SmtpConfigError, sendInvitationEmail } from "@/lib/mailer";

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

interface SendInvitationRequestBody {
  orgSlug?: unknown;
  token?: unknown;
}

function parseRequestBody(body: unknown): { orgSlug: string; token: string } | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { orgSlug, token } = body as SendInvitationRequestBody;
  if (typeof orgSlug !== "string" || orgSlug.length === 0) {
    return null;
  }
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    return null;
  }
  return { orgSlug, token };
}

function buildInviteUrl(token: string): string {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${baseUrl}/invite/${token}`;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let parsedBody: { orgSlug: string; token: string } | null = null;
  try {
    parsedBody = parseRequestBody(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!parsedBody) {
    return NextResponse.json({ error: "orgSlug and token are required" }, { status: 400 });
  }
  const { orgSlug, token } = parsedBody;

  // listForOrg enforces `organization.members.manage` on the Convex side,
  // so only org admins reach the send step.
  let pendingInvitations: { token: string }[];
  try {
    pendingInvitations = await fetchAuthQuery(api.invitations.listForOrg, { orgSlug });
  } catch {
    return NextResponse.json({ error: "Not allowed to manage this organization" }, { status: 403 });
  }

  if (!pendingInvitations.some((invitation) => invitation.token === token)) {
    return NextResponse.json({ error: "Pending invitation not found for this organization" }, { status: 404 });
  }

  const invitationDetails = await fetchAuthQuery(api.invitations.getByToken, { token });
  if (!invitationDetails) {
    return NextResponse.json({ error: "Pending invitation not found for this organization" }, { status: 404 });
  }

  try {
    await sendInvitationEmail({
      to: invitationDetails.email,
      orgName: invitationDetails.orgName,
      roleName: invitationDetails.roleName,
      inviteUrl: buildInviteUrl(token),
    });
  } catch (error) {
    if (error instanceof SmtpConfigError) {
      console.error("[invitations/send] SMTP is not configured");
      return NextResponse.json({ error: "Email delivery is not configured" }, { status: 500 });
    }
    console.error("[invitations/send] failed to send invitation email:", error);
    return NextResponse.json({ error: "Failed to send invitation email" }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}
