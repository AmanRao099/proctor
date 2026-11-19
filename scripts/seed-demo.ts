/**
 * Demo data for local testing: two problems in a test that is open now, and
 * three candidate logins (demo001-demo003) assigned to it.
 *
 *   npm run seed:demo
 *
 * Refuses to run against a database that already has tests, so it cannot
 * scribble over real data.
 */
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

config({ path: ".env.local" });
config();

const ALL = ["python", "cpp", "c", "java", "javascript"];

const problems = [
  {
    id: randomBytes(6).toString("hex"),
    title: "Pair sum count",
    statement:
      "You are given an array of `n` integers and a target `k`. Count the pairs of indices `i < j` with `a[i] + a[j] = k`.\n\nThe answer can be large, so use 64-bit integers.",
    input_format: "The first line holds `n` and `k`.\nThe second line holds `n` integers.",
    output_format: "Print one integer: the number of pairs.",
    constraints: "1 <= n <= 2 * 10^5\n-10^9 <= a[i], k <= 10^9",
    marks: 20,
    cpu_time_limit: 2,
    memory_limit_kb: 256000,
    languages: ALL,
    starter: {},
    cases: [
      { input: "5 6\n1 5 7 -1 5\n", output: "3\n", hidden: false },
      { input: "4 2\n1 1 1 1\n", output: "6\n", hidden: false },
      { input: "3 10\n1 2 3\n", output: "0\n", hidden: true },
      { input: "6 0\n0 0 0 1 -1 2\n", output: "4\n", hidden: true },
    ].map((c) => ({ ...c, id: randomBytes(6).toString("hex") })),
  },
  {
    id: randomBytes(6).toString("hex"),
    title: "Balanced brackets",
    statement:
      "For each string of brackets `()[]{}`, print `YES` if it is balanced and `NO` otherwise.\n\nA string is balanced when every opening bracket is closed by the same type, in the right order.",
    input_format: "The first line holds `t`, the number of strings. Each of the next `t` lines holds one string.",
    output_format: "Print `t` lines, each `YES` or `NO`.",
    constraints: "1 <= t <= 1000\n1 <= length <= 10^4",
    marks: 30,
    cpu_time_limit: 2,
    memory_limit_kb: 256000,
    languages: ALL,
    starter: {},
    cases: [
      { input: "3\n()[]{}\n([)]\n{[()]}\n", output: "YES\nNO\nYES\n", hidden: false },
      { input: "2\n(((\n)(\n", output: "NO\nNO\n", hidden: true },
      { input: "1\n[[{{(())}}]]\n", output: "YES\n", hidden: true },
    ].map((c) => ({ ...c, id: randomBytes(6).toString("hex") })),
  },
];

async function main() {
  const client = await new MongoClient(process.env.MONGODB_URI!).connect();
  try {
    const d = client.db(process.env.MONGODB_DB || "proctor");
    if (await d.collection("tests").countDocuments()) {
      console.error("This database already has tests. seed:demo only runs on an empty database.");
      process.exit(1);
    }
    await d.collection("users").createIndex({ username: 1 }, { unique: true });
    const creds: { username: string; password: string }[] = [];
    const ids = [];
    for (const [i, name] of ["Ananya Rao", "Farhan Qureshi", "Meera Pillai"].entries()) {
      const username = `demo00${i + 1}`;
      const password = randomBytes(6).toString("base64url");
      const res = await d.collection("users").findOneAndUpdate(
        { username },
        { $set: { name, role: "candidate", password_hash: await bcrypt.hash(password, 10), sid: null }, $setOnInsert: { created_at: new Date() } },
        { upsert: true, returnDocument: "after" },
      );
      ids.push(res!._id);
      creds.push({ username, password });
    }
    const now = Date.now();
    const admin = await d.collection("users").findOne({ role: "admin" });
    await d.collection("tests").insertOne({
      title: "Demo coding round",
      instructions: "Two problems. Read from standard input and print to standard output.\nYou can Run against the examples as often as you like; Submit runs the hidden tests too.",
      duration_minutes: 45,
      starts_at: new Date(now - 60 * 60 * 1000),
      ends_at: new Date(now + 24 * 60 * 60 * 1000),
      status: "published",
      proctored: true,
      show_results: true,
      proctoring: {
        max_violations: 5, face_detection_enabled: true, multi_person_detection_enabled: true,
        phone_detection_enabled: false, face_absence_grace_checks: 3, camera_sensitivity: "low",
        audio_detection_enabled: false, mic_sensitivity: "medium", tab_switch_enabled: true,
        block_right_click: true, block_dev_tools: true, require_fullscreen: true,
      },
      problems,
      assign_all: false,
      candidate_ids: ids,
      created_by: admin?._id ?? null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    console.log("Demo test created and open for 24 hours. Candidate logins:");
    for (const c of creds) console.log(`  ${c.username}  ${c.password}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
