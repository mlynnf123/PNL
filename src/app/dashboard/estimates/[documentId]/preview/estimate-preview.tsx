'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  type QuoteContent,
  type QuoteOption,
  lineItemTotal,
  optionTotal,
  sectionSubtotal,
} from '@/lib/estimate-doc-math';
import type {
  AuthorizationContent,
  CoverContent,
  CustomContent,
  DisclosuresContent,
  InsuranceWorksheetContent,
  IntroContent,
  LegalBodyContent,
  PaymentScheduleContent,
  TermsContent,
  ThirdPartyAuthContent,
  WarrantyContent,
} from '@/lib/estimate-pages';
import { type TokenContext, resolveTokens } from '@/lib/estimate-tokens';
import { formatCurrency } from '@/lib/format';
import type { EstimateDocFull, EstimatePageRow } from '@/server/queries/estimate-documents';

// Customer-facing brand palette (JJ blue), independent of the app's slate/teal
// chrome. Inline hex so html2canvas-pro never parses Tailwind theme tokens.
const INK = '#33373b';
const BODY = '#3f3f46';
const MUTED = '#71717a';
const BLUE = '#6f8fca';
const NAVY = '#1f2b45';
const LIGHT = '#eef1f7';
const ALT = '#f6f8fc';
const BORDER = '#e2e8f0';
const PAGE_W = 816; // 8.5in @ 96dpi

const COMPANY = {
  name: 'JJ Roofing Pros', // brand name — titles/headers
  legalName: 'J&J Roofing Pros, LLC', // legal entity — contract/legal copy only
  address: '14205 N Mopac Expressway Suite 570, Austin, TX 78728',
  phone: '(512) 729-5813',
  email: 'info@jjroofingpros.com',
};

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function buildContext(doc: EstimateDocFull): TokenContext {
  const cityStateZip = [doc.customerCity, doc.customerState].filter(Boolean).join(', ');
  const czz = `${cityStateZip}${doc.customerZip ? ` ${doc.customerZip}` : ''}`.trim();
  return {
    customer: {
      name: doc.customerName,
      address: doc.customerAddress,
      cityStateZip: czz,
      phone: doc.customerPhone,
      email: doc.customerEmail,
    },
    property: { address: doc.customerAddress, cityStateZip: czz },
    rep: { name: doc.repName, title: null, email: null, phone: null },
    company: COMPANY,
    estimate: {
      number: `EST-${String(doc.docNumber).padStart(4, '0')}`,
      name: doc.name,
      date: fmtDate(doc.docDate),
      total: formatCurrency(doc.total),
    },
    date: { today: fmtDate(new Date().toISOString().slice(0, 10)) },
  };
}

// Minimal rich text: preserve line breaks and **bold**.
function RichText({ text }: { text: string }) {
  const lines = (text ?? '').split('\n');
  return (
    <div style={{ color: BODY, fontSize: 14, lineHeight: 1.55 }}>
      {lines.map((line, i) =>
        line.trim() === '' ? (
          <div key={i} style={{ height: 8 }} />
        ) : (
          <div key={i}>{boldParts(line)}</div>
        ),
      )}
    </div>
  );
}
function boldParts(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} style={{ color: INK }}>
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: 0.5,
          color: INK,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </div>
      <div
        style={{
          height: 3,
          marginTop: 6,
          background: `linear-gradient(to right, ${NAVY}, ${BLUE} 55%, ${LIGHT} 80%, transparent)`,
        }}
      />
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  background: '#ffffff',
  color: INK,
  width: PAGE_W,
  minHeight: 1056,
  margin: '0 auto',
  padding: 56,
  fontFamily: 'Arial, Helvetica, sans-serif',
  boxSizing: 'border-box',
  border: `1px solid ${BORDER}`,
};

export function EstimatePreview({ doc }: { doc: EstimateDocFull }) {
  const ctx = buildContext(doc);
  const number = `EST-${String(doc.docNumber).padStart(4, '0')}`;
  const pages = doc.pages.filter((p) => p.included);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [busy, setBusy] = useState(false);

  async function downloadPdf() {
    setBusy(true);
    try {
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas-pro'),
      ]);
      const pdf = new jsPDF('p', 'pt', 'letter');
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      let first = true;
      for (const el of blockRefs.current) {
        if (!el) continue;
        const canvas = await html2canvas(el, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
        });
        const img = canvas.toDataURL('image/jpeg', 0.92);
        const ih = (canvas.height * pw) / canvas.width;
        let left = ih;
        let pos = 0;
        if (!first) pdf.addPage();
        first = false;
        pdf.addImage(img, 'JPEG', 0, pos, pw, ih);
        left -= ph;
        while (left > 0) {
          pos -= ph;
          pdf.addPage();
          pdf.addImage(img, 'JPEG', 0, pos, pw, ih);
          left -= ph;
        }
      }
      pdf.save(`${number}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/estimates/${doc.id}`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to editor
        </Link>
        <button
          type="button"
          onClick={downloadPdf}
          disabled={busy}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {busy ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>

      <div className="space-y-6">
        {pages.map((page, i) => (
          <div
            key={page.id}
            ref={(el) => {
              blockRefs.current[i] = el;
            }}
            style={pageStyle}
          >
            <PageBlock page={page} doc={doc} ctx={ctx} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PageBlock({
  page,
  doc,
  ctx,
}: {
  page: EstimatePageRow;
  doc: EstimateDocFull;
  ctx: TokenContext;
}) {
  const title = (page.title || '').toUpperCase();
  switch (page.pageType) {
    case 'cover':
      return <Cover content={page.contentJson as CoverContent} doc={doc} ctx={ctx} />;
    case 'introduction':
      return (
        <>
          <Heading>Introduction</Heading>
          <RichText text={resolveTokens((page.contentJson as IntroContent).body, ctx)} />
        </>
      );
    case 'quote':
      return (
        <Quote content={page.contentJson as QuoteContent} title={title || 'ESTIMATE DETAILS'} />
      );
    case 'authorization':
      return (
        <Authorization content={page.contentJson as AuthorizationContent} doc={doc} ctx={ctx} />
      );
    case 'terms':
      return (
        <>
          <Heading>{title || 'Terms and Conditions'}</Heading>
          <RichText text={resolveTokens((page.contentJson as TermsContent).body ?? '', ctx)} />
        </>
      );
    case 'warranty':
      return <Warranty content={page.contentJson as WarrantyContent} doc={doc} ctx={ctx} />;
    case 'custom':
      return (
        <>
          <Heading>{title || 'Additional Information'}</Heading>
          <RichText text={resolveTokens((page.contentJson as CustomContent).body ?? '', ctx)} />
        </>
      );
    case 'legal_body':
      return <LegalBody content={page.contentJson as LegalBodyContent} ctx={ctx} />;
    case 'payment_schedule':
      return (
        <PaymentSchedule
          content={page.contentJson as PaymentScheduleContent}
          title={title || 'Payment Schedule'}
          ctx={ctx}
        />
      );
    case 'insurance_worksheet':
      return (
        <InsuranceWorksheet
          content={page.contentJson as InsuranceWorksheetContent}
          title={title || 'Contract Worksheet'}
          ctx={ctx}
        />
      );
    case 'disclosures':
      return (
        <Disclosures
          content={page.contentJson as DisclosuresContent}
          title={title || 'Disclosures & Acknowledgements'}
          ctx={ctx}
        />
      );
    case 'third_party_auth':
      return (
        <ThirdPartyAuth
          content={page.contentJson as ThirdPartyAuthContent}
          title={title || 'Third-Party Authorization'}
          ctx={ctx}
        />
      );
    case 'inspection':
      return <Heading>{title || 'Inspection'}</Heading>;
  }
}

function LabeledRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        padding: '9px 0',
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <div style={{ color: MUTED, fontSize: 13, fontWeight: 700 }}>{label}</div>
      <div style={{ color: INK, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {value || '—'}
      </div>
    </div>
  );
}

function PaymentSchedule({
  content,
  title,
  ctx,
}: {
  content: PaymentScheduleContent;
  title: string;
  ctx: TokenContext;
}) {
  const items = content.items ?? [];
  return (
    <div>
      <Heading>{title}</Heading>
      {content.intro && (
        <div style={{ marginBottom: 8 }}>
          <RichText text={resolveTokens(content.intro, ctx)} />
        </div>
      )}
      <div>
        {items.map((it) => (
          <div
            key={it.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              padding: '10px 0',
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <div style={{ color: BODY, fontSize: 14 }}>{it.description}</div>
            <div style={{ color: INK, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {it.amount || ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsuranceWorksheet({
  content,
  title,
  ctx,
}: {
  content: InsuranceWorksheetContent;
  title: string;
  ctx: TokenContext;
}) {
  return (
    <div>
      <Heading>{title}</Heading>
      <div>
        <LabeledRow label="Deductible" value={content.deductible} />
        <LabeledRow
          label="Non-Recoverable Depreciation"
          value={content.nonRecoverableDepreciation}
        />
        <LabeledRow label="Upgrades" value={content.upgrades} />
        <LabeledRow label="Discounts" value={content.discounts} />
        <LabeledRow label="Work Not Doing" value={content.workNotDoing} />
        <LabeledRow
          label="Remaining Balance (Deductible & Upgrades)"
          value={content.remainingBalance}
        />
      </div>
      {content.depreciationNote && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: INK, marginBottom: 6 }}>
            Recovering Withheld Depreciation &amp; Supplements
          </div>
          <RichText text={resolveTokens(content.depreciationNote, ctx)} />
        </div>
      )}
    </div>
  );
}

function Disclosures({
  content,
  title,
  ctx,
}: {
  content: DisclosuresContent;
  title: string;
  ctx: TokenContext;
}) {
  const clauses = content.clauses ?? [];
  return (
    <div>
      <Heading>{title}</Heading>
      {content.intro && (
        <div style={{ marginBottom: 12 }}>
          <RichText text={resolveTokens(content.intro, ctx)} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {clauses.map((cl) => (
          <div key={cl.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {cl.requiresInitial && (
              <div
                style={{
                  flex: '0 0 auto',
                  width: 56,
                  height: 34,
                  border: `1px solid ${INK}`,
                  borderRadius: 3,
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>Initial</span>
              </div>
            )}
            <div style={{ color: BODY, fontSize: 13, lineHeight: 1.5 }}>
              {resolveTokens(cl.text, ctx)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThirdPartyAuth({
  content,
  title,
  ctx,
}: {
  content: ThirdPartyAuthContent;
  title: string;
  ctx: TokenContext;
}) {
  const auths = content.authorizations ?? [];
  return (
    <div>
      <Heading>{title}</Heading>
      <div style={{ marginBottom: 16 }}>
        <LabeledRow label="Insurance Company" value={content.insuranceCompany} />
        <LabeledRow label="Claim Number" value={content.claimNumber} />
      </div>
      <div style={{ fontSize: 14, color: BODY, marginBottom: 8 }}>
        I/We authorize {resolveTokens('{{company.legalName}}', ctx)} the following regarding my
        claim:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {auths.map((a) => (
          <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div
              style={{
                width: 14,
                height: 14,
                border: `1px solid ${INK}`,
                borderRadius: 2,
                flex: '0 0 auto',
              }}
            />
            <div style={{ color: BODY, fontSize: 13 }}>{a.label}</div>
          </div>
        ))}
      </div>
      {content.overheadProfit && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: INK, marginBottom: 6 }}>
            Overhead &amp; Profit
          </div>
          <RichText text={resolveTokens(content.overheadProfit, ctx)} />
        </div>
      )}
    </div>
  );
}

function Cover({
  content,
  doc,
  ctx,
}: {
  content: CoverContent;
  doc: EstimateDocFull;
  ctx: TokenContext;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 944 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: INK }}>{doc.name}</div>
          <div
            style={{
              height: 3,
              marginTop: 6,
              background: `linear-gradient(to right, ${NAVY}, ${BLUE} 70%, transparent)`,
            }}
          />
          <div
            style={{
              marginTop: 10,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
              color: MUTED,
              textTransform: 'uppercase',
            }}
          >
            {fmtDate(doc.docDate)}
          </div>
        </div>
        <div style={{ textAlign: 'right', color: NAVY, fontSize: 20, fontWeight: 800 }}>
          {COMPANY.name}
        </div>
      </div>

      {/* Large centered company logo (replaces the old hero photo). */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '56px 0',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/jjrp-logo.png"
          alt={COMPANY.name}
          crossOrigin="anonymous"
          style={{ width: 400, height: 400, objectFit: 'contain' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ maxWidth: 300 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>We can help you with</div>
          <div style={{ height: 2, width: 40, marginTop: 4, background: BLUE }} />
          {content.helpWith && (
            <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: INK }}>
              {content.helpWith}
            </div>
          )}
          {(content.repEmail || content.repPhone) && (
            <div style={{ marginTop: 16, fontSize: 14, fontWeight: 700, color: INK }}>
              {content.repEmail && <div>{content.repEmail}</div>}
              {content.repPhone && <div>{content.repPhone}</div>}
            </div>
          )}
        </div>
        {/* Customer identity — always sourced from the lead (name, email, address). */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: INK, textTransform: 'uppercase' }}>
            {doc.customerName}
          </div>
          {doc.customerEmail && (
            <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: INK }}>
              {doc.customerEmail}
            </div>
          )}
          {doc.customerAddress && (
            <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: INK }}>
              <div>{doc.customerAddress}</div>
              <div>{ctx.customer.cityStateZip}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Quote({ content, title }: { content: QuoteContent; title: string }) {
  const options = content.options ?? [];
  const d = content.display ?? { showLineTotal: true, showSectionTotal: true };
  const multi = options.length > 1;
  const subtotal = options.reduce((n, o) => n + optionTotal(o), 0);

  return (
    <div>
      <Heading>{title}</Heading>
      {options.map((o) => (
        <div key={o.id} style={{ marginBottom: 20 }}>
          {multi && (
            <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginBottom: 8 }}>
              {o.name} — {formatCurrency(optionTotal(o))}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: LIGHT }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 13, color: INK }}>
                  Description
                </th>
                {d.showQty && (
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 13, color: INK }}>
                    Qty
                  </th>
                )}
                {d.showUnitPrice && (
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 13, color: INK }}>
                    Unit price
                  </th>
                )}
                {d.showLineTotal && (
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 13, color: INK }}>
                    Line total
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {o.sections
                .filter((s) => s.visible)
                .map((s) => (
                  <QuoteSectionRows key={s.id} section={s} display={d} multiOption={multi} />
                ))}
            </tbody>
          </table>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <table>
          <tbody>
            <tr>
              <td
                style={{ padding: '4px 24px', textAlign: 'right', fontWeight: 700, color: MUTED }}
              >
                Estimate subtotal
              </td>
              <td style={{ padding: '4px 0', textAlign: 'right', color: BODY, minWidth: 100 }}>
                {formatCurrency(subtotal)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '4px 24px', textAlign: 'right', fontWeight: 800, color: INK }}>
                Total
              </td>
              <td
                style={{
                  padding: '4px 0',
                  textAlign: 'right',
                  fontWeight: 800,
                  color: INK,
                  minWidth: 100,
                }}
              >
                {formatCurrency(subtotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuoteSectionRows({
  section,
  display,
  multiOption,
}: {
  section: QuoteContent['options'][number]['sections'][number];
  display: QuoteContent['display'];
  multiOption: boolean;
}) {
  const cols =
    1 +
    (display.showQty ? 1 : 0) +
    (display.showUnitPrice ? 1 : 0) +
    (display.showLineTotal ? 1 : 0);
  return (
    <>
      {section.title && (
        <tr>
          <td
            colSpan={cols}
            style={{ padding: '8px 12px', fontWeight: 800, color: INK, background: ALT }}
          >
            {section.title}
          </td>
        </tr>
      )}
      {section.items.map((it, i) => (
        <tr key={it.id} style={{ background: i % 2 === 0 ? '#ffffff' : ALT }}>
          <td style={{ padding: '8px 12px', color: BODY, fontSize: 14 }}>
            <div
              style={{ fontWeight: it.description ? 700 : 400, color: it.description ? INK : BODY }}
            >
              {it.name}
            </div>
            {it.description && <div style={{ color: MUTED, fontSize: 13 }}>{it.description}</div>}
          </td>
          {display.showQty && (
            <td style={{ padding: '8px 12px', textAlign: 'right', color: BODY }}>{it.quantity}</td>
          )}
          {display.showUnitPrice && (
            <td style={{ padding: '8px 12px', textAlign: 'right', color: BODY }}>
              {formatCurrency(it.unitPrice)}
            </td>
          )}
          {display.showLineTotal && (
            <td style={{ padding: '8px 12px', textAlign: 'right', color: BODY }}>
              {formatCurrency(lineItemTotal(it))}
            </td>
          )}
        </tr>
      ))}
      {display.showSectionTotal && !multiOption && (
        <tr>
          <td
            colSpan={cols - 1}
            style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: INK }}
          >
            Section Total
          </td>
          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: INK }}>
            {formatCurrency(sectionSubtotal(section))}
          </td>
        </tr>
      )}
    </>
  );
}

function Authorization({
  content,
  doc,
  ctx,
}: {
  content: AuthorizationContent;
  doc: EstimateDocFull;
  ctx: TokenContext;
}) {
  const quotePage = doc.pages.find((p) => p.pageType === 'quote');
  const quote = (quotePage?.contentJson ?? { options: [] }) as QuoteContent;
  const selected: QuoteOption | undefined =
    quote.options?.find((o) => o.id === content.selectedOptionId) ?? quote.options?.[0];
  const upgrades = content.optionalUpgrades ?? [];
  return (
    <div>
      <Heading>Authorization</Heading>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
        <div>
          {selected && (
            <div style={{ fontSize: 14 }}>
              <span style={{ fontWeight: 700, color: INK }}>{selected.name}</span>{' '}
              <span style={{ marginLeft: 24, color: INK }}>
                {formatCurrency(optionTotal(selected))}
              </span>
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, color: BODY }}>
          <div>
            <b style={{ color: INK }}>Name:</b> {doc.customerName}
          </div>
          <div>
            <b style={{ color: INK }}>Address:</b> {doc.customerAddress}
            {doc.customerCity ? `, ${doc.customerCity}` : ''} {doc.customerState}
          </div>
        </div>
      </div>

      {content.validityNote && (
        <div
          style={{
            borderTop: `1px solid ${BORDER}`,
            borderBottom: `1px solid ${BORDER}`,
            padding: '10px 0',
            margin: '18px 0',
            fontSize: 12,
            fontWeight: 700,
            color: BODY,
          }}
        >
          {content.validityNote}
        </div>
      )}

      {upgrades.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginBottom: 8 }}>
            Optional Upgrades
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: LIGHT }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 13, color: INK }}>
                  Description
                </th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 13, color: INK }}>
                  Line total
                </th>
              </tr>
            </thead>
            <tbody>
              {upgrades.map((u, i) => (
                <tr key={u.id} style={{ background: i % 2 === 0 ? '#ffffff' : ALT }}>
                  <td style={{ padding: '8px 12px', color: BODY }}>☐&nbsp;&nbsp;{u.description}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: BODY }}>
                    {formatCurrency(u.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginBottom: 6 }}>
        Customer Comments / Notes
      </div>
      <div style={{ border: `1px solid ${INK}`, minHeight: 90, width: 320, marginBottom: 40 }}>
        {content.comments && (
          <div style={{ padding: 8, fontSize: 13, color: BODY }}>{content.comments}</div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginTop: 60,
        }}
      >
        <div style={{ width: 340 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>{doc.customerName}:</div>
          {content.signature ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/documents/${content.signature.documentId}`}
              alt="Signature"
              crossOrigin="anonymous"
              style={{ height: 48 }}
            />
          ) : (
            <div style={{ height: 48 }} />
          )}
          <div style={{ borderTop: `1px solid ${INK}` }} />
        </div>
        <div style={{ width: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>Date:</div>
          <div style={{ height: 48, fontSize: 13, color: BODY }}>
            {content.signature ? fmtDate(content.signature.signedAt.slice(0, 10)) : ''}
          </div>
          <div style={{ borderTop: `1px solid ${INK}` }} />
        </div>
      </div>

      {content.certification && (
        <div style={{ marginTop: 24, fontSize: 11, fontWeight: 700, color: BODY }}>
          {resolveTokens(content.certification, ctx)}
        </div>
      )}
    </div>
  );
}

function Warranty({
  content,
  doc,
  ctx,
}: {
  content: WarrantyContent;
  doc: EstimateDocFull;
  ctx: TokenContext;
}) {
  return (
    <div>
      <Heading>Warranty</Heading>
      <RichText text={resolveTokens(content.body ?? '', ctx)} />
      <div style={{ marginTop: 40, fontSize: 13, color: BODY }}>
        <div style={{ fontWeight: 700, color: INK }}>Customer</div>
        <div>{doc.customerName}</div>
        <div style={{ fontWeight: 700, color: INK, marginTop: 10 }}>Project address</div>
        <div>
          {doc.customerAddress}
          {doc.customerCity ? `, ${doc.customerCity}` : ''} {doc.customerState}
        </div>
      </div>
      {content.thankYou && (
        <div style={{ marginTop: 24, fontSize: 14, color: BODY }}>{content.thankYou}</div>
      )}
      {(content.signeeName || content.signeeTitle) && (
        <div style={{ marginTop: 24, fontSize: 13, color: BODY }}>
          <div style={{ fontWeight: 700, color: INK }}>{content.signeeName}</div>
          <div>{content.signeeTitle}</div>
        </div>
      )}
    </div>
  );
}

function LegalBody({ content, ctx }: { content: LegalBodyContent; ctx: TokenContext }) {
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>
          {content.headerName || COMPANY.name}
        </div>
        <div style={{ fontSize: 12, color: MUTED }}>{content.headerAddress || COMPANY.address}</div>
        <div style={{ fontSize: 12, color: MUTED }}>{content.headerPhone || COMPANY.phone}</div>
      </div>
      {content.title && (
        <div
          style={{
            textAlign: 'center',
            fontSize: 20,
            fontWeight: 800,
            color: INK,
            margin: '16px 0 8px',
          }}
        >
          {content.title}
        </div>
      )}
      <div style={{ height: 3, background: NAVY, margin: '8px 0 20px' }} />
      <RichText text={resolveTokens(content.body ?? '', ctx)} />
    </div>
  );
}
