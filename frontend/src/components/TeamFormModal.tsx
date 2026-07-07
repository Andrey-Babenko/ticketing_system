import { useRef } from "react";
import Modal from "./Modal";
import { Field, Button } from "./ui";

export type TeamFormMode =
  | { mode: "create" }
  | { mode: "edit"; teamId: number; originalName: string };

interface TeamFormModalProps {
  open: boolean;
  mode: TeamFormMode;
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  error?: string;
  pending?: boolean;
}

// Create and Edit share one modal (Slice-3 decision) — only the container moved
// from an always-visible bottom card to a modal.
export default function TeamFormModal({
  open,
  mode,
  name,
  onNameChange,
  onSubmit,
  onClose,
  error,
  pending,
}: TeamFormModalProps) {
  const nameInput = useRef<HTMLInputElement>(null);

  return (
    <Modal
      open={open}
      title={mode.mode === "edit" ? `Rename team “${mode.originalName}”` : "Create team"}
      onClose={onClose}
      closeDisabled={pending}
      initialFocusRef={nameInput}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Field
          label="Team name"
          ref={nameInput}
          required
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          error={error}
        />
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} pending={pending} pendingLabel="Cancel">
            Cancel
          </Button>
          <Button pending={pending} pendingLabel="Saving…">
            {mode.mode === "edit" ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
