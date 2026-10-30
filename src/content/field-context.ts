import { DetectedField } from '../types/engine';

export function isChoiceField(field: DetectedField): boolean {
  return ['radio', 'checkbox', 'select', 'combobox'].includes(field.type);
}

/** The question and the selected option are separate pieces of information. */
export function questionOf(field: DetectedField): string {
  const text = field.type === 'radio'
    ? field.fieldsetLegend || field.surroundingText || field.ariaLabel || field.name
    : field.labelText || field.ariaLabel || field.placeholder || field.fieldsetLegend || field.name;
  return (text || '').replace(/\s+/g, ' ').replace(/\s*[*:]\s*$/, '').trim();
}

/** Availability dates are screening answers, distinct from employment-history dates. */
export function isScreeningDate(field: DetectedField): boolean {
  if (!['date', 'text'].includes(field.type)) return false;
  const question = questionOf(field);
  return /\b(wann|when|available|availability|verfügbar\w*|verfügung|verfuegung)\b/i.test(question) &&
    /\b(praktikum\w*|internship|start|begin|beginn\w*|available|availability|verfügbar\w*|verfügung|verfuegung)\b/i.test(question);
}

/** Narrow bilingual equivalences for personal preferences; employer history stays literal. */
export function screeningConcept(question: string): string | undefined {
  const text = question.toLowerCase();
  if (/\b(not|never|nicht|kein\w*|previously|formerly|ehemalig\w*|früher)\b/i.test(text)) return undefined;
  if (/\b(currently|currently\s+enrolled|derzeit|aktuell|momentan)\b/i.test(text) &&
      /\b(student|universitätsstudent|studierende\w*|immatrikuliert)\b/i.test(text)) return 'current-university-student';
  return undefined;
}
