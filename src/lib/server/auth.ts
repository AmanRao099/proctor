import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db, oid } from "./db";
import { HttpError } from "./http";
import { SESSION_COOKIE, SESSION_HOURS, signSession, verifySession } from "./session";
import type { Role, SessionUser } from "@/lib/shared/types";

export interface UserDoc {
  _id: import("mongodb").ObjectId;
  username: string;
  name: string;
  email?: string;
  role: Role;
  password_hash: string;
  sid: string | null;
  disabled?: boolean;
  created_at: Date;
  last_login_at?: Date;
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);

/** Readable one-time passwords for bulk-created candidates (no 0/O/1/l). */
export function generatePassword(length = 10): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

// ─── Login throttling ─────────────────────────────────────────────────────────
// Five wrong passwords for one username locks it for 15 minutes. Keyed on the
// username, not the IP: a lab of candidates shares one IP behind NAT.

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

async function throttleCheck(username: string) {
  const d = await db();
  const row = await d.collection("login_throttle").findOne({ _id: username as never });
  if (row && row.count >= MAX_FAILURES && row.until > new Date()) {
    const mins = Math.ceil((row.until.getTime() - Date.now()) / 60000);
    throw new HttpError(429, `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }
}

async function throttleFail(username: string) {
  const d = await db();
  await d.collection("login_throttle").updateOne(
    { _id: username as never },
    { $inc: { count: 1 }, $set: { until: new Date(Date.now() + LOCK_MINUTES * 60000) } },
    { upsert: true },
  );
}

async function throttleClear(username: string) {
  const d = await db();
  await d.collection("login_throttle").deleteOne({ _id: username as never });
}

// ─── Login / logout ───────────────────────────────────────────────────────────

let dummy: string | null = null;
function dummyHash() {
  if (!dummy) dummy = bcrypt.hashSync(randomBytes(12).toString("hex"), 10);
  return dummy;
}

/**
 * Verify credentials and open a session. A fresh `sid` is written to the user,
 * so any session on another device stops working on its next request.
 */
export async function login(usernameRaw: string, password: string): Promise<SessionUser> {
  const username = normalizeUsername(usernameRaw);
  await throttleCheck(username);
  const d = await db();
  const user = await d.collection<UserDoc>("users").findOne({ username });
  // Compare against a dummy hash when the user is missing, so response time
  // does not reveal which usernames exist.
  const hash = user?.password_hash ?? dummyHash();
  const valid = await bcrypt.compare(password, hash);
  if (!user || !valid) {
    await throttleFail(username);
    throw new HttpError(401, "That username and password do not match.");
  }
  if (user.disabled) throw new HttpError(403, "This account has been disabled. Contact your test administrator.");
  await throttleClear(username);

  const sid = randomBytes(16).toString("hex");
  await d.collection<UserDoc>("users").updateOne(
    { _id: user._id },
    { $set: { sid, last_login_at: new Date() } },
  );
  const token = await signSession({ sub: String(user._id), role: user.role, sid });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return { id: String(user._id), username: user.username, name: user.name, role: user.role };
}

export async function logout() {
  const jar = await cookies();
  const claims = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (claims) {
    const id = oid(claims.sub);
    if (id) {
      const d = await db();
      await d.collection<UserDoc>("users").updateOne({ _id: id, sid: claims.sid }, { $set: { sid: null } });
    }
  }
  jar.delete(SESSION_COOKIE);
}

// ─── Current user ─────────────────────────────────────────────────────────────

/** The signed-in user, checked against the database. Null when signed out. */
export async function currentUser(): Promise<SessionUser | null> {
  const claims = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const id = oid(claims.sub);
  if (!id) return null;
  const d = await db();
  const user = await d.collection<UserDoc>("users").findOne(
    { _id: id },
    { projection: { username: 1, name: 1, role: 1, sid: 1, disabled: 1 } },
  );
  if (!user || user.disabled || user.sid !== claims.sid) return null;
  return { id: String(user._id), username: user.username, name: user.name, role: user.role };
}

export async function requireUser(role?: Role): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Your session has ended. Sign in again.", "signed_out");
  if (role && user.role !== role) throw new HttpError(403, "You do not have access to this.");
  return user;
}
