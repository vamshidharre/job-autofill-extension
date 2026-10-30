import { DetectedField, FieldMatchResult } from '../types/engine';
import { FORBIDDEN_CHECKBOX_KEYWORDS } from './synonyms';

/** Built-in rules cannot decide consent; only an explicit remembered site choice may override this skip. */
export function consentCheckboxMatch(field: DetectedField): FieldMatchResult | null {
  if (field.type !== 'checkbox') return null;
  const context = `${field.labelText} ${field.ariaLabel} ${field.fieldsetLegend} ${field.surroundingText} ${field.name} ${field.htmlId}`;
  if (!FORBIDDEN_CHECKBOX_KEYWORDS.some((pattern) => pattern.test(context))) return null;
  return {
    detectedField: field,
    matchedProfilePath: 'customQA.answer',
    targetValue: field.isChecked ?? false,
    displayLabel: field.labelText || field.ariaLabel || 'Consent / legal declaration',
    confidence: 1,
    confidenceLevel: 'high',
    matchReason: 'Consent/legal declarations require your manual choice on this form',
    suggestedAction: 'skip',
    isSensitive: true
  };
}
