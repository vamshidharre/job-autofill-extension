import { describe, it, expect } from 'vitest';
import { ConfidenceEngine } from '../src/content/confidence-engine';
import { SYNONYM_DICTIONARY } from '../src/content/synonyms';
import { DetectedField } from '../src/types/engine';

function createMockField(overrides: Partial<DetectedField>): DetectedField {
  return {
    id: 'mock-1',
    element: {} as HTMLElement,
    tag: 'input',
    type: 'text',
    name: '',
    htmlId: '',
    placeholder: '',
    autocomplete: '',
    ariaLabel: '',
    ariaLabelledBy: '',
    ariaDescribedBy: '',
    labelText: '',
    surroundingText: '',
    fieldsetLegend: '',
    currentValue: '',
    isRequired: false,
    isDisabled: false,
    isReadOnly: false,
    isVisible: true,
    rect: { top: 0, left: 0, width: 100, height: 20 },
    ...overrides
  };
}

describe('Confidence Engine', () => {
  const firstNamePattern = SYNONYM_DICTIONARY.find((p) => p.path === 'basic.firstName')!;

  it('awards high confidence when autocomplete and label match', () => {
    const field = createMockField({
      autocomplete: 'given-name',
      labelText: 'First Name',
      name: 'first_name'
    });

    const result = ConfidenceEngine.evaluatePattern(field, firstNamePattern);
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.matchReason).toContain('matched');
  });

  it('rejects match when negative keyword matches (e.g. last name label on first name field)', () => {
    const field = createMockField({
      labelText: 'Last Name',
      name: 'lastname'
    });

    const result = ConfidenceEngine.evaluatePattern(field, firstNamePattern);
    expect(result.confidence).toBe(0.0);
    expect(result.matchReason).toContain('Negative keyword');
  });

  it('correctly handles placeholder fallback when label is absent', () => {
    const field = createMockField({
      placeholder: 'Enter your given name or Vorname',
      name: 'q123'
    });

    const result = ConfidenceEngine.evaluatePattern(field, firstNamePattern);
    expect(result.confidence).toBeGreaterThanOrEqual(0.20);
  });
});
