import { z } from "zod";
import { loginWithCode } from "@/lib/server/auth";
import { body, handle, ok } from "@/lib/server/http";
import { clientIp } from "@/lib/server/ip";

const schema = z.object({
  ticket: z.string().min(10).max(2000),
  code: z.string().trim().min(6, "Enter the 6-digit code").max(10),
});

/** Code step of two-step sign-in. */
export const POST = handle(async (req: Request) => {
  const { ticket, code } = await body(req, schema);
  return ok({ user: await loginWithCode(ticket, code, clientIp(req)) });
});
