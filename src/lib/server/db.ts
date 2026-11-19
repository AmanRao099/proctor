import "server-only";
import { MongoClient, type Db, ObjectId } from "mongodb";

/*
 * One client per process. In dev, Next reloads modules on every edit, so the
 * client is parked on globalThis or every save would open a new pool.
 */

const globalForMongo = globalThis as unknown as {
  __proctorMongo?: Promise<MongoClient>;
  __proctorIndexes?: Promise<void>;
};

function client(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!globalForMongo.__proctorMongo) {
    globalForMongo.__proctorMongo = new MongoClient(uri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 8000,
    }).connect().catch((err) => {
      // Do not cache a failed connect: the next request should try again.
      globalForMongo.__proctorMongo = undefined;
      throw err;
    });
  }
  return globalForMongo.__proctorMongo;
}

export async function db(): Promise<Db> {
  const database = (await client()).db(process.env.MONGODB_DB || "proctor");
  if (!globalForMongo.__proctorIndexes) {
    globalForMongo.__proctorIndexes = ensureIndexes(database).catch((err) => {
      globalForMongo.__proctorIndexes = undefined;
      console.error("[db] index creation failed", err);
    });
  }
  await globalForMongo.__proctorIndexes;
  return database;
}

async function ensureIndexes(d: Db) {
  await Promise.all([
    d.collection("users").createIndex({ username: 1 }, { unique: true }),
    d.collection("users").createIndex({ role: 1, created_at: -1 }),
    d.collection("tests").createIndex({ status: 1, starts_at: 1 }),
    // One attempt per candidate per test. The start route relies on this.
    d.collection("attempts").createIndex({ test_id: 1, user_id: 1 }, { unique: true }),
    d.collection("attempts").createIndex({ test_id: 1, expires_at: 1, submitted_at: 1 }),
    d.collection("submissions").createIndex({ attempt_id: 1, at: -1 }),
    d.collection("login_throttle").createIndex({ until: 1 }, { expireAfterSeconds: 0 }),
    d.collection("attempts").createIndex({ submitted_at: 1, expires_at: 1 }),
    // One strike per forced hand-in, however often the hand-in is retried.
    d.collection("proctor_strikes").createIndex({ attempt_id: 1 }, { unique: true }),
    d.collection("proctor_strikes").createIndex({ user_id: 1, occurred_at: 1 }),
    d.collection("ban_appeals").createIndex(
      { user_id: 1 },
      { unique: true, partialFilterExpression: { status: "pending" }, name: "one_open_appeal_per_user" },
    ),
    d.collection("problems").createIndex({ is_deleted: 1, created_at: -1 }),
  ]);
}

export function oid(id: string): ObjectId | null {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === id ? new ObjectId(id) : null;
}

export { ObjectId };
