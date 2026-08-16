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
    let code = "UNAUTHENTICATED";
    let message = "Authentication failed. Please check your credentials.";

    if (err && typeof err === "object") {
      const maybeData = (err as { data?: unknown }).data;
      if (maybeData && typeof maybeData === "object") {
        const dataObj = maybeData as { code?: string; message?: string };
        if (typeof dataObj.code === "string") code = dataObj.code;
        if (typeof dataObj.message === "string") message = dataObj.message;
      } else if (typeof maybeData === "string") {
        message = maybeData;
      } else if (typeof (err as { message?: unknown }).message === "string") {
        const rawMsg = (err as { message: string }).message;
        const match = rawMsg.match(/Uncaught ConvexError:\s*(.+?)(?:\s+at handler|$)/);
        if (match && match[1]) {
          message = match[1].trim();
        } else if (!rawMsg.includes("Server Error") && !rawMsg.includes("Request ID:")) {
          message = rawMsg;
        }
      }
    }

    const status =
      code === "FORBIDDEN"
        ? 403
        : code === "NOT_FOUND"
          ? 404
          : code === "CONFLICT"
            ? 409
            : code === "VALIDATION_ERROR"
              ? 400
              : 401;

    return NextResponse.json(
      { ok: false, error: message, code },
      { status },
    );
  }
}
