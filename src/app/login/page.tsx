"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only ever an in-app path — `next` comes from our own redirect, but a
  // crafted link could still point somewhere else.
  const raw = params.get("next");
  const next = raw !== null && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const message =
          typeof body === "object" && body !== null
            ? (body as Record<string, unknown>).error
            : null;
        setError(typeof message === "string" ? message : "Could not sign in.");
        return;
      }
      router.replace(next);
      // The shell is a server component behind the cookie we just set.
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xs space-y-4">
      <div className="space-y-1 text-center">
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-secondary">
          <Lock className="size-5 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">To Do</h1>
        <p className="text-sm text-muted-foreground">
          Enter the password to continue.
        </p>
      </div>

      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoFocus
        autoComplete="current-password"
        aria-label="Password"
        aria-invalid={error !== null}
      />

      {error !== null && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" disabled={busy || !password} className="w-full">
        {busy && <Loader2 className="size-4 animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex h-full items-center justify-center px-6">
      {/* useSearchParams needs a Suspense boundary to prerender this route. */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
