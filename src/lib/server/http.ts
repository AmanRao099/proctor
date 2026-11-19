import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function ok<T extends object>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, ...data }, init);
}

export function fail(status: number, error: string, code?: string) {
  return NextResponse.json({ success: false, error, ...(code ? { code } : {}) }, { status });
}

/** Wrap a handler so thrown HttpErrors become JSON and nothing else leaks a stack. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message, err.code);
      if (err instanceof ZodError) {
        const first = err.issues[0];
        return fail(400, first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request");
      }
      console.error("[api]", err);
      return fail(500, "Something went wrong on our side. Try again.");
    }
  };
}

export async function body<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
  return schema.parse(raw);
}
