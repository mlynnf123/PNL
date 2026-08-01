export interface JobHistoryRow {
  id: string;
  occurredAt: string; // ISO
  action: string;
  actorName: string | null;
  reason: string | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
}

export interface LastEditView {
  actorName: string | null;
  occurredAt: string; // ISO
  action: string;
}
