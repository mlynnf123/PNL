import { describe, expect, it } from 'vitest';
import { type TokenContext, hasTokens, resolveTokens } from './estimate-tokens';

const ctx: TokenContext = {
  customer: {
    name: 'Joseph Barton',
    address: '12704 Beltex Rd',
    cityStateZip: 'Manor, TX',
    phone: null,
    email: null,
  },
  property: { address: '12704 Beltex Rd', cityStateZip: 'Manor, TX 78653' },
  rep: {
    name: 'Meranda Freiner',
    title: 'Co-Owner',
    email: 'meranda@jjroofingpros.com',
    phone: '636-633-2400',
  },
  company: { name: 'J&J Roofing Pros', address: null, phone: null, email: null },
  estimate: {
    number: 'EST-0001',
    name: 'Repair Estimate',
    date: 'Jun 18, 2026',
    total: '$10,000.00',
  },
  date: { today: 'Jul 27, 2026' },
};

describe('estimate-tokens', () => {
  it('TOK-001: resolves known tokens, tolerating whitespace inside braces', () => {
    expect(resolveTokens('Hello {{customer.name}},', ctx)).toBe('Hello Joseph Barton,');
    expect(resolveTokens('Prepared by {{ rep.name }} ({{rep.title}})', ctx)).toBe(
      'Prepared by Meranda Freiner (Co-Owner)',
    );
    expect(resolveTokens('Total: {{estimate.total}}', ctx)).toBe('Total: $10,000.00');
  });

  it('TOK-002: missing/empty values use the fallback, never print a raw token', () => {
    expect(resolveTokens('Call {{customer.phone}} today', ctx)).toBe('Call  today'); // empty default
    expect(resolveTokens('Call {{customer.phone}}', ctx, { fallback: 'us' })).toBe('Call us');
    expect(resolveTokens('{{customer.unknown}}', ctx, { fallback: 'N/A' })).toBe('N/A');
    expect(resolveTokens('{{bogus.field}}', ctx, { fallback: '—' })).toBe('—');
  });

  it('TOK-003: non-token text and empty input pass through', () => {
    expect(resolveTokens('No tokens here.', ctx)).toBe('No tokens here.');
    expect(resolveTokens('', ctx)).toBe('');
    expect(resolveTokens(null, ctx)).toBe('');
  });

  it('TOK-004: hasTokens detects tokens', () => {
    expect(hasTokens('Hi {{customer.name}}')).toBe(true);
    expect(hasTokens('Hi there')).toBe(false);
    expect(hasTokens(null)).toBe(false);
  });
});
