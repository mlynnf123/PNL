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
      return { mode: 'richtext', body: '', requireAck: false } satisfies TermsContent;
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
