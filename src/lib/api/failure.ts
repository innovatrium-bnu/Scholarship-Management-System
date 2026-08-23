import { toast } from "sonner";
import { ApiError } from "./client";

/**
 * Tell the person who attempted a write that it did not happen.
 *
 * Every mutation in this application used to be called without `await` and
 * without a `catch`, so execution ran straight into the optimistic success
 * path: the toast fired, the dialog closed, and the screen redrew as though
 * the write had landed. A 403, a 409, a 422, a 500, a gateway timeout and
 * being entirely offline were indistinguishable from success. Nothing rolled
 * back, because nothing knew anything had gone wrong.
 *
 * That mattered most for the refusals the server words carefully. The
 * assignment guard answers a duplicate award with "This student already holds
 * an active award for this scholarship. Revoke it before approving a renewal"
 * — the one place the product explains how to recover — and no user could ever
 * see it.
 *
 * `ApiError.userMessage` already turns a status into a sentence a registrar can
 * act on. This is the consumer it was missing everywhere except the sign-in
 * screen.
 */
export function reportFailure(error: unknown, whatFailed: string): void {
  if (error instanceof ApiError) {
    toast.error(`${whatFailed} ${error.userMessage}`);

    return;
  }

  // Not from the API layer at all — a bug in our own handler. Say something
  // truthful rather than nothing, and put the real error where a developer
  // will find it.
  console.error(whatFailed, error);
  toast.error(`${whatFailed} Something went wrong. No records were changed.`);
}
