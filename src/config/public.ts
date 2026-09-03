import { z } from "zod";

/**
 * PUBLIC configuration.
 *
 * Every value here is safe to ship to the browser. It is derived only from
 * `NEXT_PUBLIC_*` variables, which Next.js inlines into the client bundle.
 * Never add a secret to this schema.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

/** Blank env vars (`FOO=`) are treated as unset. */
const blankAsUndefined = (v: string | undefined) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_APP_URL: blankAsUndefined(process.env.NEXT_PUBLIC_APP_URL),
  NEXT_PUBLIC_SUPABASE_URL: blankAsUndefined(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: blankAsUndefined(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
});

if (!parsed.success) {
  throw new Error(
    `Invalid public environment configuration:\n${parsed.error.toString()}`,
  );
}

export const publicConfig = {
  appUrl: parsed.data.NEXT_PUBLIC_APP_URL,
  supabase: {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
} as const;

export type PublicConfig = typeof publicConfig;
