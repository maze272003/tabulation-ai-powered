import { NextResponse, type NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventCode, username, password } = body ?? {};

    if (!eventCode || !username || !password) {
      return NextResponse.json(
        { ok: false, error: "Event code, username, and password are required", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { ok: false, error: "NEXT_PUBLIC_CONVEX_URL is not configured" },
        { status: 500 },
      );
    }

    const convex = new ConvexHttpClient(convexUrl);
    const normalizedCode = String(eventCode).trim().toUpperCase();
    const loginResult = await convex.action(api.eventAuth.login, {
      eventCode: normalizedCode,
      username: String(username).trim(),
      password: String(password),
    });

    const response = NextResponse.json({
      ok: true,
      session: {
        kind: loginResult.kind,
        displayName: loginResult.displayName,
        eventCode: normalizedCode,
        eventName: loginResult.eventName,
      },
    });

    response.cookies.set("event_session_token", loginResult.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: unknown) {
    const convexErr = err as { data?: { code?: string }; message?: string };
    const code = convexErr?.data?.code ?? "UNAUTHENTICATED";
    const message = convexErr?.message ?? "Authentication failed";
    const status = code === "FORBIDDEN" ? 403 : code === "VALIDATION_ERROR" ? 400 : 401;

    return NextResponse.json(
      { ok: false, error: message, code },
      { status },
    );
  }
}
