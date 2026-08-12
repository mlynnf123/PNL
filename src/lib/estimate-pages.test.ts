import { describe, expect, it } from 'vitest';
import { defaultContentFor, inspectionSummary, type InspectionContent } from './estimate-pages';

describe('inspectionSummary', () => {
  it('returns zeros for an empty or missing page', () => {
    expect(inspectionSummary(undefined)).toEqual({ sections: 0, photos: 0, texts: 0 });
    expect(inspectionSummary(null)).toEqual({ sections: 0, photos: 0, texts: 0 });
    expect(inspectionSummary(defaultContentFor('inspection') as InspectionContent)).toEqual({
      sections: 0,
      photos: 0,
      texts: 0,
    });
  });

  it('counts sections, attached photos, and text blocks', () => {
    const content: InspectionContent = {
      sections: [
        {
          id: 's1',
          title: 'Roof',
          items: [
            { id: 'i1', type: 'photo', documentId: 'doc-1', caption: 'North slope' },
            { id: 'i2', type: 'text', body: 'Missing shingles observed.' },
          ],
        },
        {
          id: 's2',
          title: 'Gutters',
          items: [{ id: 'i3', type: 'photo', documentId: 'doc-2' }],
        },
      ],
    };
    expect(inspectionSummary(content)).toEqual({ sections: 2, photos: 2, texts: 1 });
  });

  it('does not count a photo slot with no uploaded document', () => {
    const content: InspectionContent = {
      sections: [
        {
          id: 's1',
          title: 'Roof',
          items: [
            { id: 'i1', type: 'photo' }, // slot added but no upload yet
            { id: 'i2', type: 'photo', documentId: 'doc-1' },
          ],
        },
      ],
    };
    expect(inspectionSummary(content)).toEqual({ sections: 1, photos: 1, texts: 0 });
  });
});
