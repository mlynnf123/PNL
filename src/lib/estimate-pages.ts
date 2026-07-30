// Shared shapes for estimate/layout page content (stored as contentJson). The
// commands seed defaults from here, the per-page editors read/write these, and
// the renderer draws them — one definition, single-source. Money lives only in
// the quote page (see estimate-doc-math.ts); rich-text fields may carry
// {{merge tokens}} resolved at render time (see estimate-tokens.ts).

import { DEFAULT_QUOTE_DISPLAY, type QuoteContent } from './estimate-doc-math';

export const PAGE_TYPES = [
  'cover',
  'introduction',
  'inspection',
  'quote',
  'authorization',
  'terms',
  'warranty',
  'custom',
  'legal_body',
] as const;

export type PageType = (typeof PAGE_TYPES)[number];
export type DocKind = 'estimate_packet' | 'legal_document';

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  cover: 'Cover',
  introduction: 'Introduction',
  inspection: 'Inspection',
  quote: 'Quote details',
  authorization: 'Authorization',
  terms: 'Terms & conditions',
  warranty: 'Warranty',
  custom: 'Custom page',
  legal_body: 'Legal document',
};

// --- Per-page content shapes -------------------------------------------------

export interface CoverContent {
  // "We can help you with" band + rep contact. Hero photo is the document's
  // coverPhotoKey; company logo is a static brand asset.
  helpWith?: string;
  services?: string;
  repEmail?: string;
  repPhone?: string;
  badgeDocumentId?: string; // optional certification / manufacturer badge
}

export interface IntroContent {
  body: string; // rich text / plain, may contain tokens
}

export interface OptionalUpgrade {
  id: string;
  description: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal: number;
}

export interface AuthorizationContent {
  disclaimer?: string;
  validityNote?: string;
  optionalUpgrades: OptionalUpgrade[];
  comments?: string;
  footerNote?: string;
  certification?: string;
  // Captured at signing:
  selectedOptionId?: string | null;
  signature?: { documentId: string; signerName: string; signedAt: string } | null;
}

export interface TermsContent {
  mode: 'richtext' | 'pdf';
  body?: string;
  attachedDocumentId?: string;
  requireAck?: boolean;
}

export interface WarrantyContent {
  startDate?: string;
  body?: string;
  thankYou?: string;
  signeeName?: string;
  signeeTitle?: string;
  badgeDocumentId?: string;
}

export interface CustomContent {
  body?: string;
  imageDocumentId?: string; // full-page uploaded collateral (EP-2 editor)
}

export interface InspectionSectionItem {
  id: string;
  type: 'photo' | 'text';
  documentId?: string;
  caption?: string;
  body?: string;
}

export interface InspectionContent {
  sections: { id: string; title: string; style?: string; items: InspectionSectionItem[] }[];
}

export interface LegalBodyContent {
  headerName?: string;
  headerAddress?: string;
  headerPhone?: string;
  title?: string;
  body: string; // numbered legal sections, may contain tokens
}

// --- Defaults ----------------------------------------------------------------

// Standard JJ Roofing Pros terms & conditions. Seeded as the default terms-page
// body so every estimate ships with real language; fully editable per estimate.
// Company/customer/property values resolve from {{merge tokens}} at render time.
// Renderer supports line breaks and **bold** only (see estimate-preview.tsx).
export const STANDARD_TERMS_BODY = `**Agreement.** This document sets forth the agreement between {{company.legalName}} ("Company") and {{customer.name}} ("Customer") for the work to be completed at {{property.address}}, {{property.cityStateZip}}, and establishes the agreed scope, price, and payment schedule between the parties.

**Payment Terms.** The first payment is due when materials are delivered and the crew has started work. Failure to make the first payment may result in a work stoppage, and Company is not liable for any damage that may occur as a result of a work stoppage caused by Customer's failure to make the initial payment, including but not limited to water damage, flooding, or theft of materials. Final payment is due upon completion of the roof; any additional trade payments are due upon completion of that trade. Payments not received within 30 days of completion are considered a failure to pay and are subject to the penalties below.

**Right of Rescission.** Under Texas law, Customer may cancel this agreement within three (3) business days of the contract date. To cancel, Customer must sign and date the cancellation notice and deliver or postmark one copy to Company no later than midnight on the third business day after this agreement was executed. Agreements cancelled outside of this period may be subject to a restocking fee not to exceed 25% of the total contracted amount.

**Workmanship Warranty.** Company provides a Lifetime Workmanship Warranty on all Company roofing systems, protecting against defects in workmanship. Company is not responsible for normal wear and tear. The warranty begins upon payment in full of the total contract amount and any approved supplements, and is voided by an unpaid balance or by damage caused by a named storm or act of God affecting the area.

**Decking.** In the event of rotten decking, Company will replace up to three (3) sheets of decking at no additional cost to Customer. Widespread decking replacement will be completed at Customer's expense. Failure to replace rotten decking may void the manufacturer warranty as well as Company's Workmanship Warranty.

**Existing Conditions.** A new roofing system does not remedy existing issues to framing, decking, fascia, or soffit. Any such repairs must be agreed to in writing and are performed at Customer's request and expense prior to installation. No work will be performed on the property without a written agreement; verbal agreements are not binding.

**Failure to Pay.** Balances not paid when due are subject to a 10% penalty assessed against the remaining balance, revocation of any discounts at Company's sole discretion, and referral to a third-party collections agency. Failure to pay may also result in Theft of Service charges filed under Texas Penal Code § 31.04, in addition to any civil remedies.

**Payment Methods.** Company accepts personal checks, money orders, cashier's checks, and credit cards, made payable to {{company.legalName}}. A 1% processing fee applies to credit card transactions. Returned checks are subject to a $50 returned-check fee and any applicable charges.

**Safety.** A Company representative is available upon request to inspect furnace vent connections that may become loose during the roofing process. It is Customer's responsibility to ensure these connections are secure to prevent carbon monoxide from entering the dwelling. Customer agrees to hold Company harmless from any liability associated with carbon monoxide or furnace vent connections.

**Venue.** All suits arising out of or related to this agreement shall be filed in the courts of the county in which the property is located.

**Entire Agreement.** Company sales representatives do not enter into verbal contracts. Any term not disclosed in writing on this agreement is considered null and void.

Questions about your project or invoice? Contact us at {{company.phone}} or {{company.email}}.`;

export function defaultContentFor(pageType: PageType): unknown {
  switch (pageType) {
    case 'cover':
      return {
        helpWith: 'Roofing, Gutters, Siding, TPO, Residential, Commercial',
      } satisfies CoverContent;
    case 'introduction':
      return { body: 'Hi {{customer.name}},\n\n' } satisfies IntroContent;
    case 'inspection':
      return { sections: [] } satisfies InspectionContent;
    case 'quote':
      return { options: [], display: DEFAULT_QUOTE_DISPLAY } satisfies QuoteContent;
    case 'authorization':
      return {
        validityNote:
          'Estimates valid for 30 days from date of estimate / A 50% deposit is required before any project begins',
        optionalUpgrades: [],
        selectedOptionId: null,
        signature: null,
      } satisfies AuthorizationContent;
    case 'terms':
      return { mode: 'richtext', body: STANDARD_TERMS_BODY, requireAck: false } satisfies TermsContent;
    case 'warranty':
      return {
        body: '',
        thankYou: 'Thank you for choosing JJ Roofing Pros.',
      } satisfies WarrantyContent;
    case 'custom':
      return { body: '' } satisfies CustomContent;
    case 'legal_body':
      return { body: '' } satisfies LegalBodyContent;
  }
}

export interface StackEntry {
  pageType: PageType;
  title: string;
}

// The starter page stack for a new layout of each kind.
export function defaultPageStack(docKind: DocKind): StackEntry[] {
  if (docKind === 'legal_document') {
    return [{ pageType: 'legal_body', title: 'Agreement' }];
  }
  return [
    { pageType: 'cover', title: 'Cover' },
    { pageType: 'introduction', title: 'Introduction' },
    { pageType: 'quote', title: 'Quote details' },
    { pageType: 'authorization', title: 'Authorization' },
    { pageType: 'terms', title: 'Terms & conditions' },
    { pageType: 'warranty', title: 'Warranty' },
  ];
}
