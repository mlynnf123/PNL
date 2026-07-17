# Security and Audit Rules

- Enforce authorization in backend commands and queries; hiding a UI control is never sufficient.
- Sales representatives may access only explicitly permitted records tied to their identity and may not view Company Profit or another representative’s commission.
- Store documents privately and provide access only after record-level authorization through expiring links.
- Store secrets only in environment or secret-management configuration. Never commit secrets or expose them to the browser bundle.
- Create the business audit event in the same database transaction as the protected mutation.
- Audit events include actor, action, entity, job, timestamp, previous/new state, reason, source, correlation ID, and related approval/version.
- Application roles cannot update or delete audit events or approved financial snapshots.
- High-risk actions require a distinct second approver according to the workflow specification; the requester cannot approve their own second-approval step.
- Financial records are corrected with voids, reversals, credits, adjustments, reopening, and versions—not destructive deletion.
- Validate every import, mutation, and workflow command server-side with concise errors that do not reveal unauthorized data.
