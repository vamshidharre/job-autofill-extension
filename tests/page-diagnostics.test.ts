import { describe, expect, it } from 'vitest';
import { pageDiagnostics } from '../src/content/page-diagnostics';
import { DEFAULT_USER_PROFILE } from '../src/storage/default-profile';
import { FieldDetector } from '../src/content/field-detector';

describe('Local page troubleshooting report', () => {
  it('reports recognition and memory without exporting entered values or profile data', () => {
    const profile = structuredClone(DEFAULT_USER_PROFILE);
    const value = 'PRIVATE-ANSWER-DO-NOT-EXPORT';
    profile.contact.email = 'PRIVATE-EMAIL-DO-NOT-EXPORT';
    const field = FieldDetector.extractFieldMetadata({
      tagName: 'INPUT', value, checked: false, parentElement: null, previousElementSibling: null,
      getAttribute: (name: string) => name === 'aria-label' ? 'Internship start date' : null,
      hasAttribute: () => false, closest: () => null,
      classList: { contains: () => false }
    } as any);
    const status = { isApplication: false, confidence: 0.44, score: 4, reasons: ['application URL'] };
    const report = pageDiagnostics('1.1.1', 'https://jobs.example.com/application/123?token=SECRET-TOKEN', status, [field], profile, []);
    const json = JSON.stringify(report);
    expect(report.recognition).toEqual(status);
    expect(report.fields[0]).toMatchObject({ hasCurrentValue: true, suggestedAction: 'no saved match' });
    expect(json).not.toContain(value);
    expect(json).not.toContain(profile.contact.email);
    expect(json).not.toContain('SECRET-TOKEN');
  });
});
