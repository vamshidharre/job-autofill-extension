import { describe, it, expect } from 'vitest';
import { ConfidenceEngine } from '../src/content/confidence-engine';
import { SYNONYM_DICTIONARY, FORBIDDEN_CHECKBOX_KEYWORDS } from '../src/content/synonyms';
import { DEFAULT_USER_PROFILE } from '../src/storage/default-profile';
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

describe('Autofill Safety System', () => {
  it('strictly blocks legal and consent checkboxes from auto-selection', () => {
    const legalTexts = [
      'I agree to the Terms and Conditions',
      'Ich akzeptiere die Datenschutzbestimmungen und AGB',
      'I consent to background check and personal screening',
      'I certify that the information provided is true and legal'
    ];

    for (const text of legalTexts) {
      let matchedForbidden = false;
      for (const regex of FORBIDDEN_CHECKBOX_KEYWORDS) {
        if (regex.test(text)) {
          matchedForbidden = true;
          break;
        }
      }
      expect(matchedForbidden).toBe(true);

      const field = createMockField({
        type: 'checkbox',
        labelText: text,
        name: 'consent'
      });

      const anyPattern = SYNONYM_DICTIONARY[0];
      const evalResult = ConfidenceEngine.evaluatePattern(field, anyPattern);
      expect(evalResult.confidence).toBe(0.0);
      expect(evalResult.matchReason).toContain('Auto-check prohibited');
    }
  });

  it('marks sensitive fields as review in safe mode', () => {
    const profile = DEFAULT_USER_PROFILE;
    profile.settings.mode = 'safe';
    profile.settings.askBeforeSensitiveFields = true;

    const action = ConfidenceEngine.determineAction(0.90, true, profile);
    expect(action).toBe('review');
  });
});
