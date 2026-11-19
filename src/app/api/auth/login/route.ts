import { z } from "zod";
import { login } from "@/lib/server/auth";
import { body, handle, ok } from "@/lib/server/http";

const schema = z.object({
  username: z.string().trim().min(1, "Enter your username").max(120),
  password: z.string().min(1, "Enter your password").max(200),
});

export const POST = handle(async (req: Request) => {
  const { username, password } = await body(req, schema);
  const user = await login(username, password);
  return ok({ user });
});
