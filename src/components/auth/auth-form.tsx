"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { LumenWordmark } from "@/components/ui/lumen-mark";
import { getSupabaseBrowserClient } from "@/lib/db/client";

type Mode = "login" | "signup";

const AUTH_MESSAGES: Record<string, string> = {
  "invalid login credentials": "That email and password don't match.",
  "user already registered": "An account with that email already exists.",
  "email not confirmed":
    "Check your inbox to confirm your email before signing in.",
  "password should be at least 6 characters":
    "Use a password with at least 6 characters.",
};

function friendly(message: string): string {
  const key = message.toLowerCase();
  for (const [needle, text] of Object.entries(AUTH_MESSAGES)) {
    if (key.includes(needle)) return text;
  }
  return message;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/studio";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" | "loading" }
    | { kind: "error"; message: string }
    | { kind: "check-email" }
  >({ kind: "idle" });

  const loading = status.kind === "loading";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "loading" });

    let supabase;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      setStatus({
        kind: "error",
        message:
          "Lumen isn't connected to Supabase yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setStatus({ kind: "error", message: friendly(error.message) });
        return;
      }
      if (data.session) {
        router.replace(next);
        router.refresh();
        return;
      }
      setStatus({ kind: "check-email" });
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setStatus({ kind: "error", message: friendly(error.message) });
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (status.kind === "check-email") {
    return (
      <div className="text-center">
        <LumenWordmark size="lg" className="justify-center" />
        <h1 className="mt-8 text-lg font-semibold tracking-tight">
          Confirm your email
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
          We sent a confirmation link to{" "}
          <span className="text-[var(--color-ink)]">{email}</span>. Open it to
          finish creating your account.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-[13px] font-medium text-[var(--color-accent)] hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <LumenWordmark size="lg" className="justify-center" />
      <h1 className="mt-8 text-center text-lg font-semibold tracking-tight">
        {mode === "login" ? "Sign in to Lumen" : "Create your Lumen account"}
      </h1>
      <p className="mt-1.5 text-center text-[13px] text-[var(--color-ink-muted)]">
        {mode === "login"
          ? "Continue your personalised learning path."
          : "Your adaptive learning studio, ready in a minute."}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@university.edu"
        />
        <TextField
          label="Password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {status.kind === "error" ? (
          <p
            role="alert"
            className="rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_8%,transparent)] px-3 py-2 text-[12px] text-[var(--color-danger)]"
          >
            {status.message}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={loading} className="w-full">
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-[var(--color-ink-muted)]">
        {mode === "login" ? (
          <>
            New to Lumen?{" "}
            <Link
              href="/signup"
              className="font-medium text-[var(--color-accent)] hover:underline"
            >
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-[var(--color-accent)] hover:underline"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
