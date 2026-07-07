import { useRef } from "react";
import { useId } from "react";
import Modal from "./Modal";
import { Field, Button } from "./ui";

export type EpicFormMode =
  | { mode: "create"; teamName: string }
  | { mode: "edit"; epicId: number; originalTitle: string };

interface EpicFormModalProps {
  open: boolean;
  mode: EpicFormMode;
  title: string;
  description: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  error?: string;
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
  const descriptionId = useId();

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
          error={error}
        />
        <div className="mb-3">
          <label htmlFor={descriptionId} className="mb-1 block text-sm font-medium text-gray-700">
            Description <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            id={descriptionId}
            rows={4}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
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
