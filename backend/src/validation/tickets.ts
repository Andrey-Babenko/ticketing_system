import { z } from "zod";
import { INT4_MAX } from "../lib/ids.js";

// §6 — exactly these canonical values; the UI maps them to human labels.
const type = z.enum(["bug", "feature", "fix"]);
const state = z.enum(["new", "ready_for_implementation", "in_progress", "ready_for_acceptance", "done"]);

const teamId = z.number().int().positive().max(INT4_MAX);
const epicId = z.number().int().positive().max(INT4_MAX).nullable();
const title = z.string().trim().min(1, "Title is required").max(500);
const body = z.string().trim().min(1, "Body is required").max(50000);

// .strict(): unknown keys → 400 — standing convention for new write schemas (Slice-5 decision).
export const ticketCreateSchema = z
  .object({
    teamId,
    type,
    state: state.optional(), // defaults to "new"; any of the five accepted (§8)
    epicId: epicId.optional(),
    title,
    body,
  })
  .strict();

// ADR-5: any subset; the route validates the MERGED result against §6's rules.
export const ticketUpdateSchema = z
  .object({
    teamId: teamId.optional(),
    type: type.optional(),
    state: state.optional(),
    epicId: epicId.optional(), // null = clear; absent = keep (route checks key presence)
    title: title.optional(),
    body: body.optional(),
  })
  .strict();
