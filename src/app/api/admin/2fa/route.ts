import QRCode from "qrcode";
import { z } from "zod";
import { requireUser, type UserDoc } from "@/lib/server/auth";
import { db, oid } from "@/lib/server/db";
import { body, handle, HttpError, ok } from "@/lib/server/http";
import { newTotpSecret, openSecret, otpauthUri, sealSecret, verifyTotp } from "@/lib/server/totp";

export const dynamic = "force-dynamic";

const APP = process.env.NEXT_PUBLIC_APP_NAME || "Proctor";

async function me() {
  const admin = await requireUser("admin");
  const d = await db();
  const user = await d.collection<UserDoc>("users").findOne({ _id: oid(admin.id)! });
  if (!user) throw new HttpError(401, "Your session has ended. Sign in again.", "signed_out");
  return { d, user };
}

/** Is two-step sign-in on for this admin? */
export const GET = handle(async () => {
  const { user } = await me();
  return ok({ enabled: !!user.totp_enabled });
});

const schema = z.object({
  action: z.enum(["setup", "enable", "disable"]),
  code: z.string().trim().max(10).optional(),
});

/**
 * setup   a fresh secret (pending until confirmed) with its QR code
 * enable  confirm the pending secret with a current code
 * disable turn it off, with a current code from the existing secret
 */
export const POST = handle(async (req: Request) => {
  const { d, user } = await me();
  const input = await body(req, schema);
  const users = d.collection<UserDoc>("users");

  if (input.action === "setup") {
    if (user.totp_enabled) throw new HttpError(409, "Two-step sign-in is already on. Turn it off first to set up a new device.");
    const secret = newTotpSecret();
    await users.updateOne({ _id: user._id }, { $set: { totp_pending: sealSecret(secret) } });
    const uri = otpauthUri(secret, user.username, APP);
    const svg = await QRCode.toString(uri, { type: "svg", margin: 1, width: 200, color: { dark: "#2f3e46", light: "#ffffff" } });
    return ok({ secret, uri, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` });
  }

  if (input.action === "enable") {
    if (!user.totp_pending) throw new HttpError(409, "Start the setup first.");
    const step = verifyTotp(openSecret(user.totp_pending), input.code ?? "");
    if (step === null) throw new HttpError(400, "That code is not right. Check the time on your phone and use the current code.");
    await users.updateOne({ _id: user._id }, {
      $set: { totp_enabled: true, totp_secret: user.totp_pending, totp_pending: null, totp_last_step: step },
    });
    return ok({ enabled: true });
  }

  if (!user.totp_enabled || !user.totp_secret) throw new HttpError(409, "Two-step sign-in is not on.");
  if (verifyTotp(openSecret(user.totp_secret), input.code ?? "", -1) === null) {
    throw new HttpError(400, "That code is not right. Use the current code from your authenticator app.");
  }
  await users.updateOne({ _id: user._id }, { $set: { totp_enabled: false, totp_secret: null, totp_pending: null } });
  return ok({ enabled: false });
});
