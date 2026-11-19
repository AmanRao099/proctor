/**
 * Create (or reset the password of) an admin account.
 *
 *   npm run seed:admin -- <username> "<Full name>" [password]
 *
 * Without a password one is generated and printed once. Running it also
 * turns off two-step sign-in, which is the recovery path for a lost phone.
 */
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

config({ path: ".env.local" });
config();

async function main() {
  const [usernameRaw, name = "Administrator", passwordArg] = process.argv.slice(2);
  if (!usernameRaw) {
    console.error('Usage: npm run seed:admin -- <username> "<Full name>" [password]');
    process.exit(1);
  }
  const username = usernameRaw.trim().toLowerCase();
  const password = passwordArg || randomBytes(9).toString("base64url");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const client = await new MongoClient(process.env.MONGODB_URI!).connect();
  try {
    const users = client.db(process.env.MONGODB_DB || "proctor").collection("users");
    await users.createIndex({ username: 1 }, { unique: true });
    const existing = await users.findOne({ username });
    if (existing && existing.role !== "admin") throw new Error(`${username} exists and is not an admin`);
    await users.updateOne(
      { username },
      {
        $set: { name, role: "admin", password_hash: await bcrypt.hash(password, 10), sid: null, disabled: false, totp_enabled: false, totp_secret: null, totp_pending: null },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true },
    );
    console.log(`${existing ? "Updated" : "Created"} admin "${username}"`);
    if (!passwordArg) console.log(`Password: ${password}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
