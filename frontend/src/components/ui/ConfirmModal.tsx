"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmModalProps {
  isOpen:         boolean;
  onClose:        () => void;
  title:          string;
  body:           React.ReactNode;
  confirmLabel?:  string;
  cancelLabel?:   string;
  variant?:       "danger" | "primary";
  onConfirm:      () => void;
  onCancel?:      () => void;
  isLoading?:     boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel  = "Cancel",
  variant      = "danger",
  onConfirm,
  onCancel,
  isLoading,
}: ConfirmModalProps) {
  function handleCancel() {
    if (onCancel) {
      onCancel();
    } else {
      onClose();
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} isLoading={isLoading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        {body}
      </div>
    </Modal>
  );
}
