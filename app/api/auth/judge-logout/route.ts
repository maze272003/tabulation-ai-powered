import { NextResponse, type NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("event_session_token")?.value;
    if (token) {
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      if (convexUrl) {
        const convex = new ConvexHttpClient(convexUrl);
        try {
          await convex.mutation(api.eventAuth.logout, { sessionToken: token });
        } catch {
          // Ignore logout failures during cookie clearing
        }
      }
    }
  } finally {
    const response = NextResponse.json({ ok: true });
    response.cookies.set("event_session_token", "", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });
    return response;
  }
}
