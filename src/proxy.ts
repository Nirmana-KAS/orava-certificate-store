import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["__Host-orava_session", "orava_session"];

/** Pages that need a session. A missing cookie is sent to sign-in before any page code runs. */
function needsSession(pathname: string): "admin" | "staff" | null {
  if (pathname.startsWith("/admin/login") || pathname.startsWith("/admin/setup")) return null;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname.startsWith("/certificates")) return "staff";
  return null;
}

function contentSecurityPolicy(nonce: string, request: NextRequest): string {
  const dev = process.env.NODE_ENV === "development";
  const https = request.nextUrl.protocol === "https:";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by Next.js and Radix; scripts stay strictly nonce-based
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    https ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const area = needsSession(pathname);
  if (area && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const url = request.nextUrl.clone();
    url.pathname = area === "admin" ? "/admin/login" : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, request);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-orava-path", pathname);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|opengraph-image.png|manifest.webmanifest|robots.txt|brand/|icons/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
