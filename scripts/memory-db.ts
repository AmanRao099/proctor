/**
 * Local MongoDB for development, no install needed. Data lives in .data/mongo
 * so it survives restarts. Matches MONGODB_URI=mongodb://127.0.0.1:27018 in
 * .env.local. Production uses a real MongoDB (Atlas or self-hosted).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";

async function main() {
  const dbPath = join(process.cwd(), ".data", "mongo");
  mkdirSync(dbPath, { recursive: true });
  const server = await MongoMemoryServer.create({
    instance: { port: 27018, ip: "127.0.0.1", dbPath, storageEngine: "wiredTiger" },
  });
  console.log(`[memory-db] MongoDB running at ${server.getUri()} (data in .data/mongo). Ctrl+C to stop.`);
  const stop = async () => {
    await server.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
