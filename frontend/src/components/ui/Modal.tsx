"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ModalSize = "sm" | "md" | "lg" | "xl" | "half" | "full";

interface ModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  title?:        string;
  /** Rendered between the title and the close button in the modal header */
  headerExtra?:  React.ReactNode;
  children:      React.ReactNode;
  size?:         ModalSize;
  footer?:       React.ReactNode;
  className?:    string;
}

const sizeClasses: Record<ModalSize, string> = {
  sm:   "max-w-sm",
  md:   "max-w-md",
  lg:   "max-w-lg",
  xl:   "max-w-2xl",
  half: "max-w-[75vw]",
  full: "max-w-[95vw]",
};

export function Modal({
  isOpen,
  onClose,
  title,
  headerExtra,
  children,
  size = "md",
  footer,
  className,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
    >
      <div
        className={cn(
          "w-full rounded-2xl shadow-card-lg max-h-[90vh] animate-slide-up flex flex-col",
          sizeClasses[size],
          className
        )}
        style={{ background: "var(--color-bg)" }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        {title && (
          <div
            className="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b"
            style={{
              borderColor: "var(--color-border)",
              background:  "var(--color-surface)",
            }}
          >
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
              {title}
            </h2>
            <div className="flex items-center gap-2 ml-auto">
              {headerExtra}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-5 flex-1 overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t"
            style={{
              borderColor: "var(--color-border)",
              background:  "var(--color-surface)",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
