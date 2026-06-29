import { createTwoFilesPatch } from "diff";
import type { ActionLog } from "./types";

export function formatPatch(filePath:string, before:string, after:string):string{
    return createTwoFilesPatch(filePath, filePath, before, after, "", "", {context:3}) // creates standard unifised diff we see in git
}

export function composeBeforeAfter(sorted: ActionLog[]): {
  before: string;
  after: string;
} {
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (last.type === "file_delete")
    return { before: last.details.before ?? "", after: "" }; // if final action was delete after will be an empty string
  const before =
    first.type === "file_create" ? "" : (first.details.before ?? ""); // if first action was create, before will be empty
  const after = last.details.after ?? ""; // after is always whatever the last action left
  return { before, after };
}