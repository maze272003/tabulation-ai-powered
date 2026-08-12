import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = [/^\/app(\/|$)/, /^\/platform(\/|$)/, /^\/invite\//];

const SESSION_COOKIE_DOT = "better-auth.session_token";
const SESSION_COOKIE_DASH = "better-auth-session_token";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((re) => re.test(pathname))) return NextResponse.next();

  const hasSession =
    Boolean(req.cookies.get(SESSION_COOKIE_DOT)?.value) ||
    Boolean(req.cookies.get(SESSION_COOKIE_DASH)?.value);
  if (hasSession) return NextResponse.next();

  const signIn = new URL("/sign-in", req.url);
  signIn.searchParams.set("next", pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/app/:path*", "/platform/:path*", "/invite/:path*"],
};
