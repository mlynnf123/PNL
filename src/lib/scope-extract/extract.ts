import { normalizeExtraction } from './normalize';
import { reconcileScope } from './validate';
import type { ScopeExtractionResult } from './types';

// Two models per modality on Groq, each its own tokens-per-minute bucket. A
// request that a primary rejects (413 too-large / model error) is retried on the
// fallback, which spreads load and dodges a single model's TPM ceiling. Swap any
// id (or the whole provider) via env without touching callers.
export const SCOPE_MODELS = {
  text: process.env.GROQ_SCOPE_TEXT_MODEL ?? 'openai/gpt-oss-120b',
  textFallback: process.env.GROQ_SCOPE_TEXT_MODEL_2 ?? 'openai/gpt-oss-20b',
  vision: process.env.GROQ_SCOPE_VISION_MODEL ?? 'qwen/qwen3.6-27b',
  visionFallback:
    process.env.GROQ_SCOPE_VISION_MODEL_2 ??
    process.env.GROQ_SCOPE_VISION_MODEL ??
    'qwen/qwen3.6-27b',
} as const;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Tokens/minute ceiling to stay under (Groq free tier ≈ 8000). Every request is
// budgeted so prompt + input + reply lands below this, which is what prevents the
// 413 "request too large" the big Xactimate scopes were hitting.
const TPM = Number(process.env.GROQ_SCOPE_TPM ?? 8000);
const REPLY_TOKENS = Number(process.env.GROQ_SCOPE_MAX_TOKENS ?? 1500);
// Dense financial text (digits, punctuation, currency) tokenizes at roughly
// 1.2–1.5 chars/token — far below prose's ~4. Budget with the pessimistic ratio.
const CHARS_PER_TOKEN = 1.4;
const SAFETY = 0.85; // headroom under the hard ceiling
// Cap chunks/batches so a pathological PDF can't fan out into dozens of calls.
const MAX_TEXT_CHUNKS = Number(process.env.GROQ_SCOPE_MAX_CHUNKS ?? 4);
// One page image per request by default: a single rendered scan page already
// runs ~4–5k tokens, so two would exceed the 8k free-tier TPM (that was the
// observed 413). The financial summary is almost always on page 1, and we still
// sweep the first few pages across separate requests, merging the results.
const VISION_IMAGES_PER_REQ = Number(process.env.GROQ_SCOPE_VISION_BATCH ?? 1);
// With reasoning disabled the vision model answers JSON directly (~a few hundred
// tokens), so a modest reply budget is plenty and keeps each page request small
// enough that several fit the per-minute token budget on the free tier. Salvage +
// JSON repair still backstop any truncation.
const VISION_REPLY_TOKENS = Number(process.env.GROQ_SCOPE_VISION_MAX_TOKENS ?? 1200);
// Pages actually sent to the vision model (one per request), chosen by the
// both-ends interleave so the sweep reaches the roof/summary figures whether they
// sit near the front or the back — not just the cover pages. Each page is paced by
// the per-minute rate limiter on the free tier, so this trades a slower parse for
// finding the figures. Raise/lower via env.
const MAX_VISION_REQUESTS = Number(process.env.GROQ_SCOPE_MAX_VISION_REQ ?? 5);

const PROMPT = `You extract facts from a property-insurance estimate (a carrier "scope") for a ROOFING contractor. Return ONLY a single JSON object, no prose, no markdown fences.

Rules:
- Use null for any field not present or unreadable. NEVER guess or invent a number, name, quantity, or date.
- Money as plain numbers (no $ or commas). A number shown in parentheses is negative.
- These are the carrier's stated figures only. Do not compute or assume anything the document does not print.

ROOF SECTION IS THE PRIORITY. These estimates often cover several areas/trades (Roof, Gutters, Siding, Elevations, Interior, Detached structures). Focus on the ROOFING work only.
- Find the roof section — a group/section/elevation titled "Roof", "Roofing", "Dwelling - Roof", "Main Roof", or the roof slopes/facets — and read its SECTION TOTALS.
- The rcv/acv/recoverable_depreciation/deductible you report should be the ROOF section's figures. The RCV is the roof section's replacement-cost total (often labeled "Total:", "Line Item Total", "Replacement Cost Value", or "RCV" at the end of the roof section) — it is right there in the roof section totals. Do NOT leave rcv null if a roof section total is visible.
- If the whole estimate is a single roof scope, its overall totals ARE the roof totals — use them.
- If figures exist both per-section and as a grand total across multiple trades, prefer the ROOF section's figures and add an issue noting the estimate also covers non-roof trades.
- The deductible and claim identity (claim number, insured, address, date of loss) are usually document-wide — take them from wherever printed.

JSON schema:
{
  "document_type": "initial_carrier_scope | revised_scope | payment_letter | denial | contractor_estimate | unknown",
  "carrier": string|null,
  "claim_number": string|null,
  "insured_name": string|null,
  "property_address": string|null,
  "estimate_number": string|null,
  "estimate_date": string|null,
  "date_of_loss": string|null,
  "rcv": number|null,
  "acv": number|null,
  "recoverable_depreciation": number|null,
  "non_recoverable_depreciation": number|null,
  "deductible": number|null,
  "net_claim": number|null,
  "prior_payments": number|null,
  "sales_tax": number|null,
  "overhead_and_profit": number|null,
  "line_items": [{"description": string, "quantity": number|null, "unit": string|null, "unit_price": number|null, "total": number|null, "category": string|null}],
  "issues": [{"severity": "warning|blocker", "category": string, "detail": string}]
}

Include at most 8 line items, the most significant roof lines only. Prioritize the summary money fields over line items. Output valid JSON only.`;

type Content = string | Array<Record<string, unknown>>;

const estTokens = (s: string) => Math.ceil(s.length / CHARS_PER_TOKEN);

// Per-request input budget (in chars) that keeps prompt + input + reply under the
// TPM ceiling with headroom.
const promptTokens = estTokens(PROMPT);
const INPUT_BUDGET_CHARS = Math.max(
  1200,
  Math.floor((Math.floor(TPM * SAFETY) - REPLY_TOKENS - promptTokens) * CHARS_PER_TOKEN),
);

// Lines that carry identity or money (the summary/recap wherever it sits) plus
// the header — the financially relevant content. Big scopes are mostly repeated
// line-item tables that would blow the budget.
const RELEVANT =
  /(\$|\d[\d,]*\.\d{2}|claim|insured|policy|carrier|\brcv\b|\bacv\b|replacement cost|actual cash|deprecia|deductible|\bnet\b|payable|overhead|profit|\btax\b|date of loss|loss date|estimate|adjuster|policyholder)/i;

// Split a scope's text into budget-sized chunks. Chunk 0 leads with the header
// (identity) then packs relevant lines; overflow relevant lines become
// line-item-only chunks. If the whole document already fits, it's one chunk.
function buildTextChunks(text: string): string[] {
  if (estTokens(text) <= INPUT_BUDGET_CHARS / CHARS_PER_TOKEN) return [text.trim()];

  const lines = text.split('\n');
  const header = lines.slice(0, 30);
  const rest = lines.slice(30).filter((l) => RELEVANT.test(l));

  const chunks: string[] = [];
  let cur = header.join('\n');
  let i = 0;
  while (i < rest.length && cur.length + rest[i].length + 1 <= INPUT_BUDGET_CHARS) {
    cur += `\n${rest[i]}`;
    i++;
  }
  chunks.push(cur.trim());

  while (i < rest.length && chunks.length < MAX_TEXT_CHUNKS) {
    let c = '';
    while (i < rest.length && c.length + rest[i].length + 1 <= INPUT_BUDGET_CHARS) {
      c += `\n${rest[i]}`;
      i++;
    }
    if (c.trim()) chunks.push(c.trim());
  }
  return chunks;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// POST to Groq trying each model in order. Retries 429/5xx with backoff on a
// given model; a 413 (too large) or 4xx model error falls through to the next
// model instead of failing. Throws only if every model is exhausted.
async function callGroq(
  models: string[],
  content: Content,
  opts: { maxTokens?: number; jsonMode?: boolean; reasoningEffort?: 'none' | 'default' } = {},
): Promise<{ text: string; model: string }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set');

  const tried = models.filter((m, idx) => m && models.indexOf(m) === idx);
  const maxRetries = 4;
  let lastErr = '';

  for (const model of tried) {
    let advance = false;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'User-Agent': 'jj-roofer-pro/1.0',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: opts.maxTokens ?? REPLY_TOKENS,
          ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
          ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'user', content }],
        }),
      });

      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = json.choices?.[0]?.message?.content;
        if (typeof text !== 'string') throw new Error('Groq returned no content');
        return { text, model };
      }

      const body = await res.text().catch(() => '');
      lastErr = `Groq ${res.status}: ${body.slice(0, 200)}`;

      // JSON mode can reject a completion as invalid (json_validate_failed) —
      // usually a slightly-off or truncated object. Groq returns the model's raw
      // output in error.failed_generation; salvage it so our lenient parser can
      // still pull the JSON object out of it.
      try {
        const parsed = JSON.parse(body) as {
          error?: { code?: string; failed_generation?: string };
        };
        if (parsed.error?.code === 'json_validate_failed' && parsed.error.failed_generation) {
          return { text: parsed.error.failed_generation, model };
        }
      } catch {
        // body wasn't JSON — fall through to normal handling
      }

      // Too large, or a request/model problem: this model can't serve it — try
      // the next model rather than burning retries.
      if (res.status === 413 || (res.status >= 400 && res.status < 429)) {
        advance = true;
        break;
      }
      // Throttled or transient server error: back off and retry the same model.
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(30000, 600 * 2 ** attempt) + Math.floor(Math.random() * 400);
        await sleep(wait);
        continue;
      }
      // Out of retries on this model — try the next one.
      advance = true;
      break;
    }
    if (advance) continue;
  }
  throw new Error(lastErr || 'Groq request failed on all models');
}

// Reasoning models (e.g. Qwen) prepend <think>…</think>; strip it, then take the
// outermost JSON object. Throws if no JSON object is present.
function parseModelJson(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/g, '') // closed reasoning blocks
    .replace(/<think>[\s\S]*$/g, '') // truncated/unclosed reasoning at the end
    .replace(/```(?:json)?/gi, '') // stray markdown fences
    .trim();
  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('Model did not return a JSON object');
  const body = cleaned.slice(start);

  // Fast path: first { … last } parses cleanly.
  const end = body.lastIndexOf('}');
  if (end > 0) {
    try {
      return JSON.parse(body.slice(0, end + 1));
    } catch {
      // fall through to repair (truncated object)
    }
  }
  return repairAndParse(body);
}

// Best-effort recovery for a truncated JSON object (e.g. the reply was cut off
// mid-generation): close any open string, drop a dangling key/comma, and append
// the missing closing brackets/braces so at least the completed fields survive.
function repairAndParse(body: string): unknown {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let out = '';
  for (const ch of body) {
    out += ch;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (inString) out += '"';
  out = out.replace(/,\s*$/, '').replace(/:\s*$/, ': null');
  while (stack.length) out += stack.pop();
  return JSON.parse(out);
}

// Merge several partial extractions (one per chunk/batch): first non-null wins for
// scalars, line_items and issues accumulate. Identity/money come from the first
// chunk; later chunks mainly contribute line items.
function mergeRaw(parts: unknown[]): unknown {
  const out: Record<string, unknown> = {};
  const items: unknown[] = [];
  const issues: unknown[] = [];
  for (const p of parts) {
    if (!p || typeof p !== 'object') continue;
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (k === 'line_items') {
        if (Array.isArray(v)) items.push(...v);
        continue;
      }
      if (k === 'issues') {
        if (Array.isArray(v)) issues.push(...v);
        continue;
      }
      if (out[k] == null && v != null) out[k] = v;
    }
  }
  out.line_items = items.slice(0, 25);
  out.issues = issues;
  return out;
}

function finish(
  raw: unknown,
  model: string,
  mode: 'native_text' | 'vision',
): ScopeExtractionResult {
  const extraction = normalizeExtraction(raw);
  // When several pages are merged, a cover page's "no figures here / incomplete
  // document" complaint is stale if a later page actually supplied the money. Drop
  // those page-local complaints once a core carrier figure is present, and dedupe.
  const haveCoreMoney = !!(extraction.rcv || extraction.acv || extraction.netClaim);
  const seen = new Set<string>();
  extraction.issues = extraction.issues.filter((iss) => {
    const stale =
      haveCoreMoney && /incomplete|missing|cover|only the|not.*visible|lacks/i.test(iss.detail);
    if (stale) return false;
    const key = `${iss.category}|${iss.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Merge the model's own issues with deterministic (code) reconciliation.
  extraction.issues = [...extraction.issues, ...reconcileScope(extraction)];
  return { extraction, raw, model, mode };
}

// Native-text path: the caller extracted the PDF text; the text/reasoning model
// structures it. Chunked to stay under the token/minute limit, then merged. The
// two text models alternate as primary so load spreads across both TPM buckets.
export async function extractScopeFromText(text: string): Promise<ScopeExtractionResult> {
  const chunks = buildTextChunks(text);
  const parts: unknown[] = [];
  let usedModel = SCOPE_MODELS.text;

  for (let i = 0; i < chunks.length; i++) {
    // Alternate which model leads; the other is the fallback for that request.
    const order =
      i % 2 === 0
        ? [SCOPE_MODELS.text, SCOPE_MODELS.textFallback]
        : [SCOPE_MODELS.textFallback, SCOPE_MODELS.text];
    const { text: out, model } = await callGroq(
      order,
      `${PROMPT}\n\n---DOCUMENT TEXT---\n${chunks[i]}`,
      { jsonMode: true },
    );
    if (i === 0) usedModel = model;
    try {
      parts.push(parseModelJson(out));
    } catch {
      // A chunk that didn't return JSON is skipped, not fatal — others carry it.
    }
    if (i < chunks.length - 1) await sleep(1200);
  }

  if (!parts.length) throw new Error('Scope text extraction returned no parseable result');
  return finish(mergeRaw(parts), usedModel, 'native_text');
}

// Order pages so a limited sweep is most likely to hit the figures: the carrier
// summary/roof totals sit either near the front OR near the back (recap page),
// while pages 1–2 are often cover/terms. Interleave from both ends —
// [first, last, second, second-last, …] — so both regions are reached within the
// first few requests instead of burning them all on the cover.
function interleaveEnds<T>(arr: T[]): T[] {
  const out: T[] = [];
  let i = 0;
  let j = arr.length - 1;
  while (i <= j) {
    out.push(arr[i]);
    if (i !== j) out.push(arr[j]);
    i++;
    j--;
  }
  return out;
}

// Vision path: the caller rendered scanned pages to data-URL images. Send them one
// per request (free-tier token budget) so no single call exceeds the limit, then
// merge. Vision models alternate as primary.
export async function extractScopeFromImages(
  imageDataUrls: string[],
): Promise<ScopeExtractionResult> {
  const ordered = interleaveEnds(imageDataUrls);
  const batches: string[][] = [];
  for (let i = 0; i < ordered.length && batches.length < MAX_VISION_REQUESTS; i += VISION_IMAGES_PER_REQ) {
    batches.push(ordered.slice(i, i + VISION_IMAGES_PER_REQ));
  }
  if (!batches.length) throw new Error('No page images to extract');

  const parts: unknown[] = [];
  let usedModel = SCOPE_MODELS.vision;

  for (let i = 0; i < batches.length; i++) {
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: PROMPT }];
    for (const url of batches[i]) content.push({ type: 'image_url', image_url: { url } });
    const order =
      i % 2 === 0
        ? [SCOPE_MODELS.vision, SCOPE_MODELS.visionFallback]
        : [SCOPE_MODELS.visionFallback, SCOPE_MODELS.vision];
    const { text: out, model } = await callGroq(order, content, {
      jsonMode: true,
      maxTokens: VISION_REPLY_TOKENS,
      // Disable the model's internal reasoning — it was consuming the whole token
      // budget and emitting nothing. With it off, qwen answers the JSON directly.
      reasoningEffort: 'none',
    });
    if (i === 0) usedModel = model;
    try {
      parts.push(parseModelJson(out));
    } catch {
      // Skip an unparseable batch; the summary pages usually parse first.
    }
    if (i < batches.length - 1) await sleep(1500);
  }

  if (!parts.length) throw new Error('Scope image extraction returned no parseable result');
  return finish(mergeRaw(parts), usedModel, 'vision');
}
