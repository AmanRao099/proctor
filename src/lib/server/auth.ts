import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db, oid } from "./db";
import { HttpError } from "./http";
import { SESSION_COOKIE, SESSION_HOURS, signSession, verifySession } from "./session";
import { SignJWT, jwtVerify } from "jose";
import { openSecret, verifyTotp } from "./totp";
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
  /** Two-step sign-in (admins). The secret is sealed, see totp.ts. */
  totp_enabled?: boolean;
  totp_secret?: string | null;
  totp_pending?: string | null;
  totp_last_step?: number;
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
//
// Two counters, so guessing is slowed without letting anyone lock a student
// out on test day just by knowing their username:
//   - username + IP: 5 failures lock that pair for 15 minutes. A lab behind
//     one NAT address shares an IP, but each student has their own pair.
//   - username alone: 30 failures from anywhere lock it for 15 minutes, a
//     ceiling for guessing spread across many addresses.
// A correct password clears the pair; an admin can clear both (Students).

const PAIR_MAX = 5;
const USER_MAX = 30;
const LOCK_MINUTES = 15;

const pairKey = (u: string, ip: string) => `p:${u}|${ip}`;
const userKey = (u: string) => `u:${u}`;

async function throttleCheck(username: string, ip: string) {
  const d = await db();
  const rows = await d.collection("login_throttle")
    .find({ _id: { $in: [pairKey(username, ip), userKey(username)] } as never })
    .toArray();
  const now = new Date();
  for (const row of rows) {
    const max = String(row._id).startsWith("p:") ? PAIR_MAX : USER_MAX;
    if (row.count >= max && row.until > now) {
      const mins = Math.ceil((row.until.getTime() - now.getTime()) / 60000);
      throw new HttpError(429, `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask your organiser to unlock your account.`);
    }
  }
}

async function throttleFail(username: string, ip: string) {
  const d = await db();
  const until = new Date(Date.now() + LOCK_MINUTES * 60000);
  await Promise.all([pairKey(username, ip), userKey(username)].map((k) =>
    d.collection("login_throttle").updateOne({ _id: k as never }, { $inc: { count: 1 }, $set: { until } }, { upsert: true })));
}

async function throttleClear(username: string, ip: string) {
  const d = await db();
  await d.collection("login_throttle").deleteOne({ _id: pairKey(username, ip) as never });
}

/** Admin action: lift every login lock on a username. */
export async function unlockLogin(username: string) {
  const d = await db();
  const u = normalizeUsername(username);
  await d.collection("login_throttle").deleteMany({ _id: { $in: [userKey(u)] } as never });
  // Pair keys carry the IP after the username; match the prefix exactly.
  const pairs = await d.collection("login_throttle").find({}, { projection: { _id: 1 } }).toArray();
  const mine = pairs.map((r) => String(r._id)).filter((k) => k.startsWith(`p:${u}|`));
  if (mine.length) await d.collection("login_throttle").deleteMany({ _id: { $in: mine } as never });
}

// ─── Login / logout ───────────────────────────────────────────────────────────

let dummy: string | null = null;
function dummyHash() {
  if (!dummy) dummy = bcrypt.hashSync(randomBytes(12).toString("hex"), 10);
  return dummy;
}

async function openSession(user: Pick<UserDoc, "_id" | "username" | "name" | "role">): Promise<SessionUser> {
  const d = await db();
  const sid = randomBytes(16).toString("hex");
  await d.collection<UserDoc>("users").updateOne({ _id: user._id }, { $set: { sid, last_login_at: new Date() } });
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

export type LoginResult = { user: SessionUser } | { totp_required: true; ticket: string };

/**
 * Verify credentials. Users without an authenticator get a session straight
 * away; an admin who turned on two-step sign-in gets a 5-minute ticket for
 * the code step instead. A new session gets a fresh `sid`, so any session on
 * another device stops working on its next request.
 */
export async function login(usernameRaw: string, password: string, ip: string): Promise<LoginResult> {
  const username = normalizeUsername(usernameRaw);
  await throttleCheck(username, ip);
  const d = await db();
  const user = await d.collection<UserDoc>("users").findOne({ username });
  // Compare against a dummy hash when the user is missing, so response time
  // does not reveal which usernames exist.
  const hash = user?.password_hash ?? dummyHash();
  const valid = await bcrypt.compare(password, hash);
  if (!user || !valid) {
    await throttleFail(username, ip);
    throw new HttpError(401, "That username and password do not match.");
  }
  if (user.disabled) throw new HttpError(403, "This account has been disabled. Contact your test administrator.");
  if (user.totp_enabled && user.totp_secret) {
    return { totp_required: true, ticket: await signTicket(String(user._id)) };
  }
  await throttleClear(username, ip);
  return { user: await openSession(user) };
}

/** Second step for two-step admins: the ticket from login plus a 6-digit code. */
export async function loginWithCode(ticket: string, code: string, ip: string): Promise<SessionUser> {
  const sub = await readTicket(ticket);
  if (!sub) throw new HttpError(401, "This sign-in expired. Enter your password again.", "ticket_expired");
  const d = await db();
  const user = await d.collection<UserDoc>("users").findOne({ _id: oid(sub)! });
  if (!user || user.disabled || !user.totp_secret) throw new HttpError(401, "This sign-in expired. Enter your password again.", "ticket_expired");
  await throttleCheck(user.username, ip);
  const step = verifyTotp(openSecret(user.totp_secret), code, user.totp_last_step ?? -1);
  if (step === null) {
    await throttleFail(user.username, ip);
    throw new HttpError(401, "That code is not right. Use the current code from your authenticator app.");
  }
  // Recorded atomically: the same code cannot be used twice.
  const res = await d.collection<UserDoc>("users").updateOne(
    { _id: user._id, $or: [{ totp_last_step: { $exists: false } }, { totp_last_step: { $lt: step } }] },
    { $set: { totp_last_step: step } },
  );
  if (!res.matchedCount) throw new HttpError(401, "That code was already used. Wait for the next one.");
  await throttleClear(user.username, ip);
  return openSession(user);
}

async function signTicket(sub: string) {
  return new SignJWT({ purpose: "totp" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(`${process.env.SESSION_SECRET}:ticket`));
}

async function readTicket(ticket: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(ticket, new TextEncoder().encode(`${process.env.SESSION_SECRET}:ticket`), { algorithms: ["HS256"] });
    return payload.purpose === "totp" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
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
