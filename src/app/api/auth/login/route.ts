import { z } from "zod";
import { login } from "@/lib/server/auth";
import { body, handle, ok } from "@/lib/server/http";
import { clientIp } from "@/lib/server/ip";

const schema = z.object({
  username: z.string().trim().min(1, "Enter your username").max(120),
  password: z.string().min(1, "Enter your password").max(200),
});

/** Password step. Returns the user, or `totp_required` + a ticket for the code step. */
export const POST = handle(async (req: Request) => {
  const { username, password } = await body(req, schema);
  return ok(await login(username, password, clientIp(req)));
});
