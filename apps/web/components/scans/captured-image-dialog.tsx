"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function CapturedImageDialog({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      aria-label="Captured image"
      className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl open:flex backdrop:bg-slate-950/50"
      onCancel={event => { event.preventDefault(); onDismiss(); }}
    >
      {children}
    </dialog>,
    document.body
  );
}
