import { DetectedField } from '../types/engine';
import { questionOf } from './field-context';

export interface ApplicationPageStatus {
  isApplication: boolean;
  confidence: number;
  score: number;
  reasons: string[];
}

/**
 * Deliberately conservative classifier for deciding when the extension may
 * inspect or learn from a page. A careers listing is not enough: the page
 * needs multiple application-specific signals before it is activated.
 */
export class ApplicationPageDetector {
  public static detect(url: string, documentTitle: string, fields: DetectedField[], pageText = ''): ApplicationPageStatus {
    const haystack = `${url} ${documentTitle} ${pageText}`.toLowerCase();
    let score = 0;
    const reasons: string[] = [];

    const add = (points: number, reason: string) => {
      score += points;
      reasons.push(reason);
    };

    const applicationUrl = /\/(apply|application|bewerbung|candidate|candidates)(\/|\?|$)/i.test(url);
    const knownPortal = /(myworkdayjobs|greenhouse\.io|lever\.co|smartrecruiters|personio\.|successfactors|icims|taleo|jobvite|ashbyhq|recruitee)/i.test(url);
    if (applicationUrl) {
      add(3, 'application URL');
    } else if (/\/(career|careers|jobs|job|stellen|vacancies)(\/|\?|$)/i.test(url)) {
      add(1, 'careers URL');
    }

    if (knownPortal) {
      add(2, 'known applicant-tracking system');
    }

    if (/\b(submit\s+(your\s+)?application|complete\s+(your\s+)?application|apply\s+(now|for\s+this)|jetzt\s+bewerben|bewerbung\s+(absenden|einreichen|abschicken)|bewerbungsformular)\b/i.test(haystack)) {
      add(3, 'application action text');
    }
    if (/\b(application\s+questions?|personal\s+(information|details)|candidate\s+(profile|information)|bewerberdaten|persönliche\s+daten)\b/i.test(haystack)) {
      add(2, 'application form section');
    }

    const viable = fields.filter((field) => field.isVisible && !field.isDisabled && !field.isReadOnly);
    const fileUpload = viable.some((field) => field.type === 'file');
    const contactFields = viable.filter((field) => /\b(first\s*name|last\s*name|vorname|nachname|e-?mail|phone|telefon)\b/i.test(this.fieldText(field))).length;
    const screeningFields = viable.filter((field) => /\b(why\s+(do|are)|sponsorship|einwanderungspatenschaft|work\s+(permit|authori[sz]ation)|salary|gehalt|availability|verfügbarkeit|kündigungsfrist|verfügbar|relocat|travel|question|frage)\b/i.test(this.fieldText(field))).length;

    if (fileUpload) add(2, 'document upload field');
    if (contactFields >= 2) add(2, 'candidate contact fields');
    else if (contactFields === 1) add(1, 'candidate contact field');
    if (screeningFields >= 1) add(1, 'screening question');
    if (viable.length >= 5) add(1, 'multi-field form');
    const questions = new Set(viable.map(questionOf).filter((text) => text.length >= 8));
    const screeningStep = (applicationUrl || knownPortal) && questions.size > 0 &&
      /\b(application|bewerbung)\b/i.test(haystack) &&
      /\b(?:step|schritt)\s*\d+\s*(?:of|von|\/)\s*\d+\b/i.test(haystack);
    if (screeningStep) {
      add(2, 'application screening step');
    }

    // Login, search, and newsletter forms are common false positives.
    if (/\b(sign\s*in|log\s*in|password|newsletter|subscribe|search\s+jobs)\b/i.test(haystack) && !fileUpload && screeningFields === 0 && !screeningStep) {
      score -= 3;
      reasons.push('login/search-only page');
    }

    const confidence = Math.min(1, Math.max(0, score / 9));
    return {
      // Five points is the threshold; 5/9 is slightly less than the rounded 0.56.
      isApplication: score >= 5,
      confidence,
      score,
      reasons
    };
  }

  private static fieldText(field: DetectedField): string {
    return `${field.labelText} ${field.fieldsetLegend} ${field.ariaLabel} ${field.placeholder} ${field.name} ${field.htmlId}`;
  }
}
