import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/scholarship/ui-kit";
import { useStore } from "@/lib/scholarship/store";
import { can } from "@/lib/scholarship/roles";
import type { Capability } from "@/lib/scholarship/roles";

/**
 * Wraps a screen whose whole purpose is an action only some roles may take.
 *
 * The sidebar already hides these destinations from roles that cannot use
 * them, but hiding a link is not a control: the routes are real URLs, and a
 * bookmark, a browser history entry, or a link pasted into an email reaches
 * them regardless. Without this, a Reporting user landing on
 * `/scholarships/create` got the full five-step form, filled it in, pressed
 * Save, and received a 403 rendered as a failed save — the first mention of
 * permission arriving after the work was done.
 *
 * The capability named here is the same one the route's write endpoint is
 * gated on in routes/api.php, which is the point: the screen and the server
 * answer "may I" from one matrix rather than two. The server stays the control.
 * This is only about telling somebody sooner, and in a sentence they can act on.
 */
export function RequiresCapability({
  needs,
  what,
  children,
}: {
  needs: Capability;
  /** What the page does, finished by "You do not have permission to …". */
  what: string;
  children: ReactNode;
}) {
  const { role } = useStore();

  if (can(role, needs)) {
    return <>{children}</>;
  }

  return (
    <div className="p-8">
      <EmptyState
        icon={Lock}
        title="You do not have permission for this"
        message={`Your role is ${role}, which cannot ${what}. Ask the Registrar Office if you need it.`}
        action={
          <Button variant="outline" className="h-11 rounded-xl" asChild>
            <Link to="/">Back to home</Link>
          </Button>
        }
      />
    </div>
  );
}
