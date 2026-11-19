import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/lib/shared/types";

/*
 * Session token. Edge-safe (no Node APIs, no database) so middleware can use
 * it to route. Middleware only decides where a request may GO; every API route
 * re-checks the session against the database (see auth.ts), which is what
 * makes a newer login on another device end this one.
 */

export const SESSION_COOKIE = "pt_session";
export const SESSION_HOURS = 12;

export interface SessionClaims {
  sub: string;
  role: Role;
  /** Session id. Must equal users.sid, so only the latest login is valid. */
  sid: string;
}

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const role = payload.role;
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
    if (role !== "admin" && role !== "candidate") return null;
    return { sub: payload.sub, role, sid: payload.sid };
  } catch {
    return null;
  }
}
