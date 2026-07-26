'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { lineTotal, scheduledTotal } from '@/lib/contract-math';
import { formatCurrency } from '@/lib/format';
import type { ContractFull } from '@/server/queries/contracts';

// Inline styles (hex, not Tailwind utilities) so the exported PDF is a clean
// document and html2canvas-pro isn't parsing app theme tokens.
const SLATE_900 = '#0f172a';
const SLATE_600 = '#475569';
const SLATE_400 = '#94a3b8';
const SLATE_200 = '#e2e8f0';

export function ContractPreview({ contract }: { contract: ContractFull }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const number = `CON-${String(contract.contractNumber).padStart(4, '0')}`;
  const scheduled = scheduledTotal(contract.paymentSchedule);

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
          href={`/dashboard/contracts/${contract.id}`}
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
            <div style={{ color: SLATE_600 }}>Roofing Contract</div>
          </div>
          <div style={{ textAlign: 'right', color: SLATE_600 }}>
            <div style={{ fontWeight: 700, color: SLATE_900 }}>{number}</div>
            {contract.startDate && <div>Start {contract.startDate}</div>}
            {contract.completionDate && <div>Complete {contract.completionDate}</div>}
          </div>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '20px 0 4px' }}>{contract.title}</h1>
        {contract.projectDescription && (
          <p style={{ color: SLATE_600, whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>
            {contract.projectDescription}
          </p>
        )}

        {/* Parties */}
        <div style={{ display: 'flex', gap: 32, margin: '20px 0' }}>
          <div style={{ flex: 1 }}>
            <Heading>Prepared for</Heading>
            <div style={{ color: SLATE_900, fontWeight: 700 }}>{contract.customerName}</div>
            {contract.customerAddress && (
              <div style={{ color: SLATE_600 }}>
                {contract.customerAddress}
                {contract.customerCity ? `, ${contract.customerCity}` : ''} {contract.customerState}{' '}
                {contract.customerZip}
              </div>
            )}
            {contract.customerPhone && (
              <div style={{ color: SLATE_600 }}>{contract.customerPhone}</div>
            )}
            {contract.customerEmail && (
              <div style={{ color: SLATE_600 }}>{contract.customerEmail}</div>
            )}
          </div>
          {contract.workLocation && (
            <div style={{ flex: 1 }}>
              <Heading>Work location</Heading>
              <div style={{ color: SLATE_600 }}>{contract.workLocation}</div>
            </div>
          )}
        </div>

        {/* Line items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '16px 0' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${SLATE_200}` }}>
              <th style={{ textAlign: 'left', padding: '8px 0', color: SLATE_400, fontSize: 11 }}>
                DESCRIPTION
              </th>
              <th style={{ textAlign: 'right', padding: '8px 0', color: SLATE_400, fontSize: 11 }}>
                QTY
              </th>
              <th style={{ textAlign: 'right', padding: '8px 0', color: SLATE_400, fontSize: 11 }}>
                UNIT
              </th>
              <th style={{ textAlign: 'right', padding: '8px 0', color: SLATE_400, fontSize: 11 }}>
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {contract.lineItems.map((it) => (
              <tr key={it.id} style={{ borderBottom: `1px solid ${SLATE_200}` }}>
                <td style={{ padding: '8px 0' }}>{it.description}</td>
                <td style={{ padding: '8px 0', textAlign: 'right' }}>{it.quantity}</td>
                <td style={{ padding: '8px 0', textAlign: 'right' }}>
                  {formatCurrency(it.unitPrice)}
                </td>
                <td style={{ padding: '8px 0', textAlign: 'right' }}>
                  {formatCurrency(lineTotal(it))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            borderTop: `2px solid ${SLATE_900}`,
            paddingTop: 12,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            Total: {formatCurrency(contract.total)}
          </div>
        </div>

        {/* Payment schedule */}
        {(contract.paymentSchedule.depositAmount > 0 ||
          contract.paymentSchedule.finalPayment > 0 ||
          contract.paymentSchedule.progressPayments.length > 0) && (
          <div style={{ margin: '20px 0' }}>
            <Heading>Payment schedule</Heading>
            <ScheduleRow
              label="Deposit"
              value={formatCurrency(contract.paymentSchedule.depositAmount)}
            />
            {contract.paymentSchedule.progressPayments.map((p, i) => (
              <ScheduleRow
                key={i}
                label={p.description || 'Progress payment'}
                value={formatCurrency(p.amount)}
              />
            ))}
            <ScheduleRow
              label="Final payment"
              value={formatCurrency(contract.paymentSchedule.finalPayment)}
            />
            <ScheduleRow label="Scheduled total" value={formatCurrency(scheduled)} bold />
          </div>
        )}

        {contract.terms && (
          <div style={{ margin: '16px 0' }}>
            <Heading>Terms</Heading>
            <p style={{ whiteSpace: 'pre-wrap', color: SLATE_600 }}>{contract.terms}</p>
          </div>
        )}
        {contract.warrantyInfo && (
          <div style={{ margin: '16px 0' }}>
            <Heading>Warranty</Heading>
            <p style={{ whiteSpace: 'pre-wrap', color: SLATE_600 }}>{contract.warrantyInfo}</p>
          </div>
        )}

        {/* Signatures */}
        <div style={{ display: 'flex', gap: 32, marginTop: 32 }}>
          <SignatureBlock label="Company" sig={contract.signatures.company} />
          <SignatureBlock label="Customer" sig={contract.signatures.customer} />
        </div>
      </div>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: SLATE_400,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function ScheduleRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
        fontWeight: bold ? 700 : 400,
        color: bold ? SLATE_900 : SLATE_600,
        borderTop: bold ? `1px solid ${SLATE_200}` : undefined,
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function SignatureBlock({
  label,
  sig,
}: {
  label: string;
  sig?: { documentId: string; signerName: string; signedAt: string };
}) {
  return (
    <div style={{ flex: 1 }}>
      {sig ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/documents/${sig.documentId}`}
          alt={`${label} signature`}
          style={{ height: 56, objectFit: 'contain' }}
        />
      ) : (
        <div style={{ height: 56 }} />
      )}
      <div style={{ borderTop: `1px solid ${SLATE_900}`, paddingTop: 6, color: SLATE_600 }}>
        {label}
        {sig?.signerName ? ` — ${sig.signerName}` : ''}
      </div>
    </div>
  );
}
