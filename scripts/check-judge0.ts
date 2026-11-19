/**
 * Smoke test for the Judge0 connection: /about, then one Python and one C++
 * program through the same base64 batch path the app uses.
 *
 *   npm run check:judge0
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const URL_BASE = (process.env.JUDGE0_URL || "").replace(/\/+$/, "");
const headers: Record<string, string> = { "Content-Type": "application/json" };
if (process.env.JUDGE0_AUTH_TOKEN) headers[process.env.JUDGE0_AUTH_HEADER || "X-Auth-Token"] = process.env.JUDGE0_AUTH_TOKEN;
const b64 = (s: string) => Buffer.from(s).toString("base64");
const unb64 = (s: string | null) => (s ? Buffer.from(s, "base64").toString("utf8") : "");

async function main() {
  const about = await fetch(`${URL_BASE}/about`, { headers });
  console.log(`/about -> ${about.status}`, about.ok ? (await about.json()).version : await about.text());
  if (!about.ok) process.exit(1);

  const programs = [
    { lang: "python", id: 71, src: "a, b = map(int, input().split())\nprint(a + b)" },
    { lang: "cpp", id: 54, src: "#include <iostream>\nint main(){long a,b;std::cin>>a>>b;std::cout<<a+b<<\"\\n\";}" },
  ];
  const post = await fetch(`${URL_BASE}/submissions/batch?base64_encoded=true`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      submissions: programs.map((p) => ({ source_code: b64(p.src), language_id: p.id, stdin: b64("2 40") })),
    }),
  });
  const tokens = ((await post.json()) as { token: string }[]).map((t) => t.token);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const res = await fetch(`${URL_BASE}/submissions/batch?tokens=${tokens.join(",")}&base64_encoded=true&fields=status,stdout,stderr,compile_output,time`, { headers });
    const rows = ((await res.json()) as { submissions: { status: { id: number; description: string }; stdout: string | null; time: string }[] }).submissions;
    if (rows.every((r) => r.status.id > 2)) {
      rows.forEach((r, j) => console.log(`${programs[j].lang}: ${r.status.description}, stdout=${JSON.stringify(unb64(r.stdout))}, ${r.time}s`));
      const ok = rows.every((r) => unb64(r.stdout).trim() === "42");
      console.log(ok ? "Judge0 OK" : "Judge0 answered, but output was wrong");
      process.exit(ok ? 0 : 1);
    }
  }
  console.error("Timed out waiting for Judge0");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
