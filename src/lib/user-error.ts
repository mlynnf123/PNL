// User-facing error sanitization. The frontend must never show raw technical
// detail — provider API payloads (Groq/OpenAI JSON), SQL/Postgres errors, stack
// traces, tokens, or org ids. Our own domain errors carry human-written messages
// and are safe to surface; everything else collapses to a plain message.

// Domain error class names whose `message` is written for humans and safe to
// show as-is. Keep in sync with `this.name = '…'` across src/server + src/lib.
// Anything not listed is treated as technical and replaced with the fallback.
const SAFE_ERROR_NAMES = new Set<string>([
  'AuthorizationError',
  'CallAlreadyLinkedError',
  'CallNotFoundError',
  'CarrierScopeNotFoundError',
  'CloseAttemptNotFoundError',
  'CloseAttemptNotSubmittedError',
  'CloseGatesFailedError',
  'CollectionAlreadyReversedError',
  'CollectionTransactionNotFoundError',
  'CommissionBatchAlreadyExistsError',
  'CommissionBatchNotFoundError',
  'CommissionBatchNotProposedError',
  'CommissionBlockedError',
  'CommissionCapExceededError',
  'CommissionReconciliationError',
  'CommissionTransactionNotFoundError',
  'CompletionReviewNotFoundError',
  'ConcurrencyConflictError',
  'ContractDetailsRequiredError',
  'ContractNotFoundError',
  'CostTransactionNotDraftError',
  'CostTransactionNotFoundError',
  'DocumentNotFoundError',
  'DraftTransactionsRemainError',
  'DuplicateImportError',
  'DuplicateRecipientError',
  'EmailAlreadyRegisteredError',
  'EstimateDocumentNotFoundError',
  'EstimateLockedError',
  'EstimateNotFoundError',
  'ImportStateError',
  'JobAdjustmentNotDraftError',
  'JobAdjustmentNotFoundError',
  'JobNotClosedError',
  'JobNotFoundError',
  'JobNotOperationallyCompleteError',
  'LayoutNotFoundError',
  'LeadAlreadyConvertedError',
  'LeadNotFoundError',
  'NoEffectiveRuleSetError',
  'NoOrganizationError',
  'NoPrimarySalesRepError',
  'NonOwnerRecipientError',
  'RevenueComponentNotDraftError',
  'RevenueComponentNotFoundError',
  'RoleNotFoundError',
  'RollbackBlockedError',
  'RuleSetNotFoundError',
  'RuleSetStateError',
  'SameApproverError',
  'ScopeStateError',
  'SetterCostNotFoundError',
  'SplitEditForbiddenError',
  'TemplateNotFoundError',
  'UnknownPermissionError',
  'UserNotFoundError',
]);

// Map any thrown value to a message that's safe to show a user. Known domain
// errors pass through; anything else (provider/DB/network) becomes the fallback.
export function friendlyErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (err instanceof Error && SAFE_ERROR_NAMES.has(err.name)) return err.message;
  return fallback;
}

// Sanitize a stored/raw error STRING (e.g. carrier_scopes.parse_error, which
// holds the provider's raw response) into a short, plain message for display.
export function friendlyScopeError(raw: string | null | undefined): string {
  const s = (raw ?? '').toLowerCase();
  if (/413|too large|tokens per minute|\btpm\b|request too large|context length/.test(s))
    return 'This document was too large to read automatically. Try uploading fewer pages or a smaller file.';
  if (/429|rate limit|too many requests|service tier|quota/.test(s))
    return 'The AI service was busy. Please try again in a moment.';
  if (/timeout|timed out|network|fetch failed|econn|socket|unavailable|50\d/.test(s))
    return 'The AI service didn’t respond. Please try again.';
  return 'We couldn’t read this document automatically. Try re-uploading a clearer copy, or enter the figures manually.';
}
