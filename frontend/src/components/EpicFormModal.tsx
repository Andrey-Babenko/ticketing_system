import { useRef } from "react";
import Modal from "./Modal";
import { Field, TextArea, Button } from "./ui";
import type { ApiError } from "../api/client";

export type EpicFormMode =
  | { mode: "create"; teamId: number; teamName: string }
  | { mode: "edit"; epicId: number; teamId: number; originalTitle: string };

interface EpicFormModalProps {
  open: boolean;
  mode: EpicFormMode;
  title: string;
  description: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  error?: ApiError;
  pending?: boolean;
}

// Create and Edit share one modal (Slice-4 interview decision, mirroring Teams).
// The team is shown read-only in create mode and absent in edit mode — §5 immutability.
export default function EpicFormModal({
  open,
  mode,
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  onSubmit,
  onClose,
  error,
  pending,
}: EpicFormModalProps) {
  const titleInput = useRef<HTMLInputElement>(null);

  // Route the API error to the field it names; anything else is a form-level error
  // (review finding: a description error was rendering under the Title input).
  const fieldError = (name: string) => (error?.field === name ? error.message : undefined);
  const formError = error && error.field !== "title" && error.field !== "description" ? error.message : undefined;

  return (
    <Modal
      open={open}
      title={mode.mode === "edit" ? `Edit epic “${mode.originalTitle}”` : "Create epic"}
      onClose={onClose}
      closeDisabled={pending}
      initialFocusRef={titleInput}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {mode.mode === "create" && (
          <p className="mb-3 text-sm text-gray-600">
            Team: <strong className="text-gray-900">{mode.teamName}</strong>
            <span className="ml-1 text-xs text-gray-400">(fixed after creation)</span>
          </p>
        )}
        <Field
          label="Title"
          ref={titleInput}
          required
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          error={fieldError("title")}
        />
        <TextArea
          label="Description"
          hint="Optional"
          rows={4}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          error={fieldError("description")}
        />
        {formError && <p className="mb-3 text-sm text-red-600">{formError}</p>}
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
