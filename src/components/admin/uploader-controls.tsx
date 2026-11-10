"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { issueUploadPasskeyAction, type IssuedPasskey } from "@/lib/admin/actions";

/**
 * Turns a staff member into an uploader, or gives them a new upload passkey. The passkey is shown
 * here once; only its hash is stored, so the admin copies it and passes it on privately.
 */
export function IssueUploadPasskey({
  userId,
  email,
  isUploader,
}: {
  userId: string;
  email: string;
  isUploader: boolean;
}) {
  const [state, action] = useActionState<IssuedPasskey, FormData>(
    issueUploadPasskeyAction.bind(null, userId),
    null,
  );
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-3">
      <form action={action}>
        <SubmitButton
          variant="outline"
          size="sm"
          pendingText="Making passkey…"
          confirm={
            isUploader
              ? `Give ${email} a new upload passkey? Their old one stops working now.`
              : `Let ${email} upload, replace, edit and delete certificates with their own passkey?`
          }
        >
          <KeyRound /> {isUploader ? "New upload passkey" : "Make uploader"}
        </SubmitButton>
      </form>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state && "passkey" in state ? (
        <div
          role="status"
          className="grid gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm"
        >
          <p>
            Upload passkey for <span className="font-medium wrap-anywhere">{state.email}</span>. It
            is shown only now: copy it and give it to them privately.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code
              data-testid="issued-upload-passkey"
              className="rounded-md bg-white px-3 py-2 font-mono text-base tracking-wider break-all ring-1 ring-border"
            >
              {state.passkey}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.passkey);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
