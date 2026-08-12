import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PROTECTED = [/^\/app(\/|$)/, /^\/platform(\/|$)/, /^\/invite\//];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((re) => re.test(pathname))) return NextResponse.next();

  if (getSessionCookie(req)) return NextResponse.next();

  const signIn = new URL("/sign-in", req.url);
  signIn.searchParams.set("next", pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/app/:path*", "/platform/:path*", "/invite/:path*"],
};
