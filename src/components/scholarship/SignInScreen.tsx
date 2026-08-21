import { useState, type FormEvent } from "react";

import { ApiError } from "@/lib/api/client";
import { useSignIn } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The sign-in screen.
 *
 * Everything behind it needs a session, so this is what stands in for the whole
 * application when there is not one, rather than being a route somebody can be
 * redirected to and back from. There is nothing in this system a signed-out
 * visitor is allowed to see.
 */
export function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useSignIn();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    signIn.mutate({ email, password });
  };

  /*
   * One message, whatever went wrong.
   *
   * The server already answers the same way for a wrong password as for an
   * address it has never seen, so that the form cannot be used to ask which
   * addresses have accounts. Showing whatever it said keeps that true here.
   */
  const problem =
    signIn.error instanceof ApiError
      ? signIn.error.userMessage
      : signIn.error
        ? "Could not reach the server. Check your connection and try again."
        : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Scholarship Management
          </h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Beaconhouse National University
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-border bg-card p-6"
        >
          <div className="space-y-2">
            <Label htmlFor="email">University email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={signIn.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={signIn.isPending}
            />
          </div>

          {problem ? (
            // role="alert" so it is announced rather than only seen; a failed
            // sign-in is the one message on this screen that matters.
            <p role="alert" className="text-sm font-medium text-destructive">
              {problem}
            </p>
          ) : null}

          <Button type="submit" className="h-11 w-full" disabled={signIn.isPending}>
            {signIn.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Accounts are created by a system administrator. If you cannot sign in, ask them rather
          than trying again.
        </p>
      </div>
    </div>
  );
}
