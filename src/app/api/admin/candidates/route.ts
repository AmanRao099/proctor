import { z } from "zod";
import { generatePassword, hashPassword, normalizeUsername, requireUser, type UserDoc } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { body, handle, HttpError, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireUser("admin");
  const d = await db();
  const users = await d.collection<UserDoc>("users")
    .find({ role: "candidate" }, { projection: { password_hash: 0, sid: 0 } })
    .sort({ created_at: -1 })
    .limit(20_000)
    .toArray();
  return ok({
    candidates: users.map((u) => ({
      id: String(u._id),
      username: u.username,
      name: u.name,
      email: u.email ?? "",
      disabled: !!u.disabled,
      created_at: u.created_at.toISOString(),
      last_login_at: u.last_login_at?.toISOString() ?? null,
    })),
  });
});

const USERNAME = /^[a-z0-9._@-]{3,64}$/;

const createSchema = z.object({
  candidates: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    username: z.string().trim().max(64).optional(),
    email: z.string().trim().max(200).optional(),
    password: z.string().min(8).max(100).optional(),
  })).min(1).max(2000),
  /** Prefix for generated usernames when a row has none, e.g. "acme" gives acme001. */
  prefix: z.string().trim().max(20).optional(),
});

/**
 * Create candidate accounts in bulk. Passwords are generated unless given and
 * returned ONCE in this response; only their hashes are stored.
 */
export const POST = handle(async (req: Request) => {
  await requireUser("admin");
  const input = await body(req, createSchema);
  const d = await db();
  const users = d.collection<UserDoc>("users");

  const prefix = normalizeUsername(input.prefix || "cand").replace(/[^a-z0-9]/g, "") || "cand";
  // Next free number for the prefix, so generated usernames never collide.
  const existing = await users.find({ username: { $regex: `^${prefix}\\d+$` } }, { projection: { username: 1 } }).toArray();
  let next = existing.reduce((max, u) => Math.max(max, Number(u.username.slice(prefix.length)) || 0), 0) + 1;

  const rows = input.candidates.map((c) => {
    let username = c.username ? normalizeUsername(c.username) : "";
    if (!username && c.email) username = normalizeUsername(c.email);
    if (!username) username = `${prefix}${String(next++).padStart(3, "0")}`;
    if (!USERNAME.test(username)) {
      throw new HttpError(400, `"${username}" is not a valid username (3-64 of a-z, 0-9, . _ @ -).`);
    }
    return { ...c, username, password: c.password || generatePassword() };
  });

  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.username)) throw new HttpError(400, `"${r.username}" appears twice in the list.`);
    seen.add(r.username);
  }
  const taken = await users.find({ username: { $in: rows.map((r) => r.username) } }, { projection: { username: 1 } }).toArray();
  if (taken.length) {
    throw new HttpError(409, `Already exists: ${taken.slice(0, 5).map((t) => t.username).join(", ")}${taken.length > 5 ? "..." : ""}`);
  }

  const now = new Date();
  const docs = await Promise.all(rows.map(async (r) => ({
    username: r.username,
    name: r.name,
    email: r.email || undefined,
    role: "candidate" as const,
    password_hash: await hashPassword(r.password),
    sid: null,
    created_at: now,
  })));
  await users.insertMany(docs as never[]);

  return ok({
    created: rows.map((r) => ({ name: r.name, username: r.username, email: r.email ?? "", password: r.password })),
  }, { status: 201 });
});
