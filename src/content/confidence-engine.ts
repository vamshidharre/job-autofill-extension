import { DetectedField, FieldMatchResult, ProfileFieldPath } from '../types/engine';
import { FieldPattern, FORBIDDEN_CHECKBOX_KEYWORDS } from './synonyms';
import { UserProfile } from '../types/profile';

export class ConfidenceEngine {
  /**
   * Evaluates match confidence between a detected field and a synonym pattern.
   */
  public static evaluatePattern(
    field: DetectedField,
    pattern: FieldPattern
  ): { confidence: number; matchReason: string } {
    let score = 0.0;
    const reasons: string[] = [];

    const normalizedName = field.name.toLowerCase().replace(/[-_]/g, '');
    const normalizedId = field.htmlId.toLowerCase().replace(/[-_]/g, '');
    const normalizedLabel = field.labelText.toLowerCase();
    const normalizedPlaceholder = field.placeholder.toLowerCase();
    const normalizedContext = `${field.surroundingText} ${field.fieldsetLegend}`.toLowerCase();
    const normalizedAutocomplete = field.autocomplete.toLowerCase();

    // 1. Check for negative keywords (anti-patterns)
    if (pattern.negativeKeywords) {
      for (const neg of pattern.negativeKeywords) {
        if (
          neg.test(normalizedLabel) ||
          neg.test(field.name) ||
          neg.test(field.htmlId) ||
          neg.test(normalizedPlaceholder)
        ) {
          return { confidence: 0.0, matchReason: 'Negative keyword matched' };
        }
      }
    }

    // 2. Check forbidden checkboxes (consent, terms, declarations)
    if (field.type === 'checkbox') {
      for (const forbidden of FORBIDDEN_CHECKBOX_KEYWORDS) {
        if (
          forbidden.test(normalizedLabel) ||
          forbidden.test(normalizedContext) ||
          forbidden.test(field.name)
        ) {
          return { confidence: 0.0, matchReason: 'Legal/Consent declaration (Auto-check prohibited)' };
        }
      }
    }

    // 3. Autocomplete Attribute (+0.35)
    if (field.autocomplete) {
      for (const auto of pattern.exactAutocompletes) {
        if (normalizedAutocomplete.includes(auto.toLowerCase())) {
          score += 0.35;
          reasons.push(`Autocomplete '${auto}' matched`);
          break;
        }
      }
    }

    // 4. Label Keyword / Regex (+0.48)
    let labelMatched = false;
    for (const regex of pattern.labelKeywords) {
      if (regex.test(normalizedLabel)) {
        score += 0.48;
        reasons.push(`Label '${field.labelText}' matched`);
        labelMatched = true;
        break;
      }
    }

    // 5. Exact Name & ID (+0.25)
    for (const name of pattern.exactNames) {
      const cleanName = name.toLowerCase().replace(/[-_]/g, '');
      if (normalizedName === cleanName || normalizedName.endsWith(cleanName)) {
        score += 0.25;
        reasons.push(`Name '${field.name}' matched`);
        break;
      }
    }

    for (const id of pattern.exactIds) {
      const cleanId = id.toLowerCase().replace(/[-_]/g, '');
      if (normalizedId === cleanId || normalizedId.endsWith(cleanId)) {
        score += 0.20;
        reasons.push(`ID '${field.htmlId}' matched`);
        break;
      }
    }

    // 6. Placeholder (+0.20)
    if (!labelMatched && normalizedPlaceholder) {
      for (const regex of pattern.labelKeywords) {
        if (regex.test(normalizedPlaceholder)) {
          score += 0.25;
          reasons.push(`Placeholder '${field.placeholder}' matched`);
          break;
        }
      }
    }

    // 7. Surrounding context / Fieldset legend (+0.12)
    if (normalizedContext) {
      for (const regex of pattern.labelKeywords) {
        if (regex.test(normalizedContext)) {
          score += 0.15;
          reasons.push('Context matched');
          break;
        }
      }
    }

    // 8. Element Type Compatibility Check
    if (pattern.typeFilter && pattern.typeFilter.length > 0) {
      if (!pattern.typeFilter.includes(field.type)) {
        score -= 0.30;
      }
    }

    // Cap score at 0.99
    score = Math.min(Math.max(score, 0.0), 0.99);

    // If both label and attribute matched strongly, boost confidence
    if (score >= 0.55 && labelMatched) {
      score = Math.min(score + 0.20, 0.99);
    }

    return {
      confidence: Math.round(score * 100) / 100,
      matchReason: reasons.join('; ') || 'Heuristic similarity'
    };
  }

  /**
   * Determine suggested action based on confidence score and user mode.
   */
  public static determineAction(
    confidence: number,
    isSensitive: boolean,
    profile: UserProfile
  ): 'fill' | 'review' | 'skip' {
    const mode = profile.settings.mode;
    const threshold = profile.settings.confidenceThreshold;

    if (confidence < 0.40) return 'skip';

    // Sensitive fields always require review if configured or if confidence isn't near perfect
    if (isSensitive && profile.settings.askBeforeSensitiveFields) {
      if (confidence < 0.95) return 'review';
    }

    switch (mode) {
      case 'safe':
        if (confidence >= threshold) return 'fill';
        if (confidence >= 0.60) return 'review';
        return 'skip';

      case 'normal':
        if (confidence >= 0.65) return 'fill';
        if (confidence >= 0.45) return 'review';
        return 'skip';

      case 'aggressive':
        if (confidence >= 0.50) return 'fill';
        return 'review';

      default:
        return confidence >= 0.85 ? 'fill' : 'review';
    }
  }
}
