"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface GeneratedPasswordAlertProps {
  isOpen:   boolean;
  onClose:  () => void;
  password: string;
  userName: string;
}

export function GeneratedPasswordAlert({ isOpen, onClose, password, userName }: GeneratedPasswordAlertProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="User Created"
      size="sm"
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--color-text)" }}>{userName}</span>{" "}
          has been created. Share the generated password below — it will not be shown again.
        </p>
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border"
          style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
        >
          <code className="text-sm font-mono font-semibold tracking-wider" style={{ color: "var(--color-text)" }}>
            {password}
          </code>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 p-1.5 rounded transition-colors hover:bg-[var(--color-surface)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </Modal>
  );
}
