import { normalizeExtraction } from './normalize';
import { reconcileScope } from './validate';
import type { ScopeExtractionResult } from './types';

// Two-model split on Groq: a text/reasoning model structures native-text PDFs,
// a vision model reads scanned/image pages. Both return the same schema. Swap
// these ids (or the whole provider) without touching callers.
export const SCOPE_MODELS = {
  text: process.env.GROQ_SCOPE_TEXT_MODEL ?? 'openai/gpt-oss-120b',
  vision: process.env.GROQ_SCOPE_VISION_MODEL ?? 'qwen/qwen3.6-27b',
} as const;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const PROMPT = `You extract facts from a property-insurance estimate (a carrier "scope"). Return ONLY a single JSON object, no prose, no markdown fences.

Rules:
- Use null for any field not present or unreadable. NEVER guess or invent a number, name, quantity, or date.
- Money as plain numbers (no $ or commas). A number shown in parentheses is negative.
- These are the carrier's stated figures only. Do not compute or assume anything the document does not print.

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

Include at most 25 line items (the most significant). Output valid JSON only.`;

type Content = string | Array<Record<string, unknown>>;

// Keep the request under free-tier token/minute limits: send only the lines that
// carry identity or money (the summary/recap, wherever it sits in the document),
// plus the header. Big Xactimate PDFs are mostly repeated line-item tables that
// would blow the budget; this preserves the financially relevant content.
const RELEVANT =
  /(\$|\d[\d,]*\.\d{2}|claim|insured|policy|carrier|\brcv\b|\bacv\b|replacement cost|actual cash|deprecia|deductible|\bnet\b|payable|overhead|profit|\btax\b|date of loss|loss date|estimate|adjuster|policyholder)/i;

function condenseScopeText(text: string, maxChars = 9000): string {
  if (text.length <= maxChars) return text;
  const lines = text.split('\n');
  const header = lines.slice(0, 30);
  const relevant = lines.filter((l, i) => i >= 30 && RELEVANT.test(l));
  const combined = [...header, ...relevant].join('\n');
  return (combined.length <= maxChars ? combined : combined.slice(0, maxChars)).trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// POST to Groq with retry/backoff on rate limits (429) and transient 5xx —
// Groq's free tier throttles, and vision runs make several calls.
async function callGroq(
  model: string,
  content: Content,
  opts: { maxTokens?: number; jsonMode?: boolean } = {},
): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set');

  const maxRetries = 5;
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
        max_tokens: opts.maxTokens ?? 2200,
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
      return text;
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(30000, 600 * 2 ** attempt) + Math.floor(Math.random() * 400);
      await sleep(wait);
      continue;
    }
    const body = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${body.slice(0, 300)}`);
  }
}

// Reasoning models (e.g. Qwen) prepend <think>…</think>; strip it, then take the
// outermost JSON object. Throws if no JSON object is present.
function parseModelJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model did not return a JSON object');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function finish(
  raw: unknown,
  model: string,
  mode: 'native_text' | 'vision',
): ScopeExtractionResult {
  const extraction = normalizeExtraction(raw);
  // Merge the model's own issues with deterministic (code) reconciliation.
  extraction.issues = [...extraction.issues, ...reconcileScope(extraction)];
  return { extraction, raw, model, mode };
}

// Native-text path: the caller extracted the PDF text; the text/reasoning model
// structures it. Cheapest and most accurate for clean Xactimate exports.
export async function extractScopeFromText(text: string): Promise<ScopeExtractionResult> {
  const raw = parseModelJson(
    await callGroq(
      SCOPE_MODELS.text,
      `${PROMPT}\n\n---DOCUMENT TEXT---\n${condenseScopeText(text)}`,
      { maxTokens: 2200, jsonMode: true },
    ),
  );
  return finish(raw, SCOPE_MODELS.text, 'native_text');
}

// Vision path: the caller rendered scanned pages to data-URL images; the vision
// model reads them. Send the financial-summary pages (typically the first few).
export async function extractScopeFromImages(
  imageDataUrls: string[],
): Promise<ScopeExtractionResult> {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: PROMPT }];
  for (const url of imageDataUrls) {
    content.push({ type: 'image_url', image_url: { url } });
  }
  const raw = parseModelJson(await callGroq(SCOPE_MODELS.vision, content));
  return finish(raw, SCOPE_MODELS.vision, 'vision');
}
