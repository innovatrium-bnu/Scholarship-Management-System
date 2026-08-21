import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError, type Envelope } from "@/lib/api/client";
import type { Capability } from "@/lib/scholarship/roles";
import type { Role } from "@/lib/scholarship/types";

/**
 * Who is signed in.
 *
 * Replaces the role picker in the top bar, which roles.ts always described as a
 * stand-in: "when auth lands, `can()` starts reading a session instead of a
 * picked role, and no screen has to change". This is that session. `can()` is
 * untouched, and so are the screens that call it — they read the role from the
 * store exactly as before, it simply is no longer theirs to choose.
 */
export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  /**
   * What this role may do, straight from the server's own matrix.
   *
   * Used to hide controls the API would refuse anyway. Never the check itself:
   * every route carries its own gate, and a client that ignored this list would
   * get a 403 rather than its way.
   */
  capabilities: Capability[];
}

interface SessionCtx {
  user: SessionUser | null;
  /** True only while the first "who am I" is still in flight. */
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (capability: Capability) => boolean;
}

const Ctx = createContext<SessionCtx | null>(null);

export const sessionKey = ["session"] as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const session = useQuery({
    queryKey: sessionKey,
    queryFn: async () => {
      try {
        const { data } = await api.get<Envelope<SessionUser>>("/auth/me");
        return data;
      } catch (error) {
        // Not signed in is an answer, not a failure. Letting the 401 propagate
        // would put the whole app in an error boundary on first load, which is
        // the one state every visitor starts in.
        if (error instanceof ApiError && error.isUnauthenticated) return null;
        throw error;
      }
    },
    // A session does not go stale on its own, and refetching it on every window
    // focus would log the user out visibly the moment it does expire.
    staleTime: Infinity,
    retry: false,
  });

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<Envelope<SessionUser>>("/auth/login", { email, password });
      queryClient.setQueryData(sessionKey, data);
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await api.post("/auth/logout");
    queryClient.setQueryData(sessionKey, null);
    // Everything cached was fetched as somebody. Clearing rather than
    // invalidating means the next person to sign in on this machine cannot see
    // a flash of the last person's data while the refetch is in flight.
    queryClient.clear();
  }, [queryClient]);

  const user = session.data ?? null;

  const can = useCallback(
    (capability: Capability) => user?.capabilities.includes(capability) ?? false,
    [user],
  );

  return (
    <Ctx.Provider value={{ user, isLoading: session.isPending, signIn, signOut, can }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/** The mutation the sign-in form drives, with its pending and error state. */
export function useSignIn() {
  const { signIn } = useSession();

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),
  });
}
