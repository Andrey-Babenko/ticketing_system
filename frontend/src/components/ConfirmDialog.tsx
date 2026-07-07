import type { ReactNode } from "react";
import { useRef } from "react";
import { Button } from "./ui";
import Modal from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Reusable confirmation dialog — team delete now, ticket delete in Slice 5 (§6).
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Delete",
  pendingLabel,
  pending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={open}
      title={title}
      role="alertdialog"
      onClose={onCancel}
      closeDisabled={pending}
      initialFocusRef={cancelRef}
    >
      <div className="mb-4 text-sm text-gray-700">{children}</div>
      <div className="flex justify-end gap-2">
        <Button
          ref={cancelRef}
          type="button"
          variant="secondary"
          pending={pending}
          pendingLabel="Cancel"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          pending={pending}
          pendingLabel={pendingLabel ?? `${confirmLabel}…`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
