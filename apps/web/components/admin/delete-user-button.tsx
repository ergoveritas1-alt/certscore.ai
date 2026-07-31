"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type DeleteUserButtonProps = {
  action: (formData: FormData) => Promise<void>;
  email: string;
  userId: string;
};

export function DeleteUserButton({ action, email, userId }: DeleteUserButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        className="text-sm font-medium text-red-700 underline decoration-red-200 underline-offset-4 hover:text-red-900"
        onClick={() => setConfirming(true)}
        type="button"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="flex min-w-40 flex-col items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2">
      <p className="text-xs leading-4 text-red-800">Delete {email}? This removes their access and account.</p>
      <div className="flex items-center gap-2">
        <form action={action}>
          <input name="userId" type="hidden" value={userId} />
          <ConfirmDeleteButton />
        </form>
        <button className="text-xs font-medium text-slate-600 underline underline-offset-2" onClick={() => setConfirming(false)} type="button">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConfirmDeleteButton() {
  const { pending } = useFormStatus();

  return <button aria-busy={pending} className="rounded-md bg-red-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">{pending ? "Deleting…" : "Confirm delete"}</button>;
}
