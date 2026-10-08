import { db } from "./db";
import { now } from "./auth";

// Who changed whose points, when and by how much: one line per admin action
// (approve, reject, adjust, undo, edit). Kept separately from the ledger
// because undoing deletes ledger rows, and the history of that must stay.
// Never throws: a missing audit line must not undo the change it describes.
export type AuditAction = "approve" | "reject" | "adjust" | "undo" | "edit";

export async function audit(admin: { id?: unknown; display_name: string }, action: AuditAction, summary: string, points: number | null = null) {
  try {
    await db
      .prepare("INSERT INTO point_audit (created_at,admin_id,admin_name,action,summary,points) VALUES (?,?,?,?,?,?)")
      .bind(now(), admin.id ?? null, admin.display_name, action, summary.slice(0, 300), points)
      .run();
  } catch {}
}
