import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/server/session";

/*
 * Routing guard only. It decides where a request may go from the signed
 * cookie; every API route re-checks the session against the database.
 *
 * Also the CSRF guard: a state-changing API call must come from this origin.
 * The session cookie is SameSite=Lax already; this closes the rest.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (MUTATING.has(req.method)) {
      const origin = req.headers.get("origin");
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
      if (origin && host && new URL(origin).host !== host) {
        return NextResponse.json({ success: false, error: "Cross-origin request refused" }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const home = claims?.role === "admin" ? "/admin" : "/dashboard";

  if (pathname === "/login") {
    return claims ? NextResponse.redirect(new URL(home, req.url)) : NextResponse.next();
  }
  if (!claims) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (pathname === "/") return NextResponse.redirect(new URL(home, req.url));
  if (pathname.startsWith("/admin") && claims.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if ((pathname.startsWith("/dashboard") || pathname.startsWith("/test")) && claims.role !== "candidate") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|vendor/|favicon|.*\\.(?:svg|png|ico|txt)$).*)"],
};
