'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { optionSubtotal, optionTotal, estimateTotal } from '@/lib/estimate-math';
import { formatCurrency } from '@/lib/format';
import type { EstimateFull } from '@/server/queries/estimates';

// Inline styles (hex, not Tailwind utilities) so the exported PDF is a clean
// document and html2canvas-pro isn't parsing app theme tokens.
const SLATE_900 = '#0f172a';
const SLATE_600 = '#475569';
const SLATE_400 = '#94a3b8';
const SLATE_200 = '#e2e8f0';
const TEAL = '#0d9488';

export function EstimatePreview({ estimate }: { estimate: EstimateFull }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const number = `EST-${String(estimate.estimateNumber).padStart(4, '0')}`;

  async function downloadPdf() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas-pro'),
      ]);
      const canvas = await html2canvas(ref.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const img = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF('p', 'pt', 'letter');
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const ih = (canvas.height * pw) / canvas.width;
      let left = ih;
      let pos = 0;
      pdf.addImage(img, 'JPEG', 0, pos, pw, ih);
      left -= ph;
      while (left > 0) {
        pos -= ph;
        pdf.addPage();
        pdf.addImage(img, 'JPEG', 0, pos, pw, ih);
        left -= ph;
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
          href={`/dashboard/estimates/${estimate.id}`}
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

      {/* The printable document */}
      <div
        ref={ref}
        style={{
          background: '#ffffff',
          color: SLATE_900,
          maxWidth: 816,
          margin: '0 auto',
          padding: 48,
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: 14,
          lineHeight: 1.5,
          border: `1px solid ${SLATE_200}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: `2px solid ${SLATE_900}`,
            paddingBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>J&amp;J Roofing Pros</div>
            <div style={{ color: SLATE_600 }}>Roofing Estimate</div>
          </div>
          <div style={{ textAlign: 'right', color: SLATE_600 }}>
            <div style={{ fontWeight: 700, color: SLATE_900 }}>{number}</div>
            <div>{estimate.estimateDate}</div>
          </div>
        </div>

        {estimate.coverPhotoKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/documents/${estimate.coverPhotoKey}`}
            alt="Cover"
            style={{
              width: '100%',
              maxHeight: 260,
              objectFit: 'cover',
              borderRadius: 8,
              margin: '20px 0',
            }}
          />
        )}

        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '20px 0 4px' }}>
          {estimate.estimateName}
        </h1>
        {estimate.helpWith && <div style={{ color: SLATE_600 }}>{estimate.helpWith}</div>}

        {/* Customer */}
        <div style={{ margin: '20px 0', color: SLATE_600 }}>
          <div
            style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: SLATE_400 }}
          >
            Prepared for
          </div>
          <div style={{ color: SLATE_900, fontWeight: 700 }}>{estimate.customerName}</div>
          {estimate.customerAddress && (
            <div>
              {estimate.customerAddress}
              {estimate.customerCity ? `, ${estimate.customerCity}` : ''} {estimate.customerState}{' '}
              {estimate.customerZip}
            </div>
          )}
          {estimate.customerPhone && <div>{estimate.customerPhone}</div>}
          {estimate.customerEmail && <div>{estimate.customerEmail}</div>}
        </div>

        {estimate.introLetter && (
          <p style={{ whiteSpace: 'pre-wrap', margin: '16px 0' }}>{estimate.introLetter}</p>
        )}

        {/* Options */}
        {estimate.options.map((o) => (
          <div
            key={o.id}
            style={{
              border: `1px solid ${SLATE_200}`,
              borderRadius: 8,
              padding: 16,
              margin: '16px 0',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <div style={{ fontSize: 16, fontWeight: 700 }}>{o.title}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEAL }}>
                {formatCurrency(optionTotal(o))}
              </div>
            </div>
            {o.summary && <div style={{ color: SLATE_600, marginTop: 4 }}>{o.summary}</div>}

            {o.perLinePricing && o.items.length > 0 && (
              <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
                <tbody>
                  {o.items.map((it) => (
                    <tr key={it.id} style={{ borderTop: `1px solid ${SLATE_200}` }}>
                      <td style={{ padding: '6px 0' }}>
                        <div>{it.label}</div>
                        {it.description && (
                          <div style={{ color: SLATE_400, fontSize: 12 }}>{it.description}</div>
                        )}
                      </td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>
                        {formatCurrency(it.lineTotal ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ marginTop: 12, color: SLATE_600 }}>
              <Row label="Subtotal" value={formatCurrency(optionSubtotal(o))} />
              {o.discountAmount > 0 && (
                <Row
                  label={o.discountLabel || 'Discount'}
                  value={`- ${formatCurrency(o.discountAmount)}`}
                />
              )}
              {o.taxRate > 0 && <Row label={`Tax (${o.taxRate}%)`} value="" />}
              <Row label="Option total" value={formatCurrency(optionTotal(o))} bold />
            </div>
          </div>
        ))}

        {/* Grand total */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            borderTop: `2px solid ${SLATE_900}`,
            paddingTop: 12,
            marginTop: 8,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            Total: {formatCurrency(estimateTotal(estimate.options))}
          </div>
        </div>

        {estimate.repName && (
          <div style={{ marginTop: 32, color: SLATE_600 }}>
            Prepared by <span style={{ color: SLATE_900 }}>{estimate.repName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontWeight: bold ? 700 : 400,
        color: bold ? SLATE_900 : undefined,
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
