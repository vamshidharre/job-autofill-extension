import { DetectedField, FieldMatchResult, UnansweredQuestion, QuestionChoiceOption } from '../types/engine';
import { CustomQA } from '../types/profile';
import { FORBIDDEN_CHECKBOX_KEYWORDS } from './synonyms';
import { isChoiceField, isScreeningDate, questionOf } from './field-context';

// Common German & English stop words to filter when generating matching keywords
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  'und', 'oder', 'in', 'im', 'an', 'am', 'auf', 'aus', 'bei', 'beim', 'mit', 'nach', 'von', 'vom',
  'zu', 'zum', 'zur', 'über', 'unter', 'vor', 'für', 'fuer', 'ist', 'sind', 'war', 'waren', 'wird', 'werden',
  'haben', 'hat', 'hatte', 'sie', 'ihr', 'ihre', 'ihren', 'ihrem', 'ihres', 'ihrer', 'you',
  'your', 'yours', 'we', 'our', 'please', 'select', 'bitte', 'auswählen', 'geben', 'enter',
  // Question words and fillers: shared by unrelated questions, so they say nothing about which one it is.
  'wie', 'was', 'wann', 'warum', 'welche', 'welcher', 'welches', 'wer', 'wo', 'viele', 'viel', 'uns', 'ich', 'wir',
  'mich', 'mir', 'kann', 'können', 'koennen', 'möchten', 'moechten', 'würden', 'wuerden', 'sich', 'auch', 'noch',
  'how', 'what', 'when', 'why', 'which', 'who', 'where', 'many', 'much', 'can', 'could', 'would', 'will', 'any',
  'this', 'that', 'these', 'those', 'there', 'about', 'from', 'optional', 'yes', 'no', 'ja', 'nein'
]);

/** Q&A entries created automatically from the candidate's answers (as opposed to hand-written ones). */
export function isLearnedQA(qa: CustomQA): boolean {
  return /^(learned|saved)/i.test(qa.category || '');
}

/** Compare layout/punctuation while preserving technical symbols and numeric separators. */
export function normalizeQuestion(text: string): string {
  return text.normalize('NFKC').toLowerCase()
    // C, C++, and C# (and 25 versus 25%) must remain distinct memory keys.
    .replace(/[^\p{L}\p{N}+#%.,]+/gu, ' ')
    // A period/comma between digits carries meaning: 1.2 is not 12 or 1,2.
    // Elsewhere it is ordinary sentence punctuation, like a trailing question mark.
    .replace(/(?<!\p{N})[.,]|[.,](?!\p{N})/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

export class QuestionDetector {
  /**
   * Identifies all unanswered or unfulfilled questions on the page,
   * grouping related radio options and option dropdowns.
   */
  public static getUnansweredQuestions(
    fields: DetectedField[],
    matches: FieldMatchResult[]
  ): UnansweredQuestion[] {
    const matchedElements = new Set(
      matches
        .filter((m) => m.confidence >= 0.70)
        .map((m) => m.detectedField.element)
    );
    const matchedFieldIds = new Set(
      matches
        .filter((m) => m.confidence >= 0.70)
        .map((m) => m.detectedField.id)
    );

    const questions: UnansweredQuestion[] = [];
    const processedRadioGroups = new Set<string>();

    for (const field of fields) {
      // If already matched by matcher or element exists in matches, skip
      if (matchedFieldIds.has(field.id) || (field.element && matchedElements.has(field.element))) {
        continue;
      }

      // Never treat standard profile/resume fields as unknown questions
      if (this.isStandardProfileField(field)) {
        continue;
      }

      // If field already has a non-empty value on the page, skip
      if (field.currentValue && field.currentValue.trim().length > 0 && field.type !== 'radio' && field.type !== 'checkbox') {
        continue;
      }
      if (field.type === 'checkbox' && field.isChecked) {
        continue;
      }
      // Consent / terms / declaration checkboxes are the candidate's own decision on
      // every application; never offer them as a reusable "question".
      if (field.type === 'checkbox' && this.isForbiddenCheckbox(field)) {
        continue;
      }

      // Group radio buttons by question / legend / name
      if (field.type === 'radio') {
        const groupKey = this.getRadioGroupKey(field);
        if (processedRadioGroups.has(groupKey)) {
          // Already created question for this group; add option if needed
          const existingQ = questions.find((q) => q.id === `q-radio-${groupKey}`);
          if (existingQ && existingQ.options) {
            existingQ.fieldIds.push(field.id);
            const option = this.radioOption(field);
            if (!existingQ.options.some((o) => o.value === option.value)) {
              existingQ.options.push(option);
            }
          }
          continue;
        }

        processedRadioGroups.add(groupKey);

        // Find all radio fields belonging to this group
        const groupFields = fields.filter((f) => f.type === 'radio' && this.getRadioGroupKey(f) === groupKey);
        const options: QuestionChoiceOption[] = groupFields.map((f) => this.radioOption(f));

        // Determine question text
        const questionText = this.determineQuestionText(field, true);
        if (!questionText) continue;

        questions.push({
          id: `q-radio-${groupKey}`,
          questionText,
          type: 'choice',
          options,
          fieldIds: groupFields.map((f) => f.id),
          fieldName: field.name,
          isRequired: field.isRequired
        });
        continue;
      }

      // Select / Dropdown
      if (field.type === 'select' || field.type === 'combobox') {
        const questionText = this.determineQuestionText(field);
        if (!questionText) continue;

        const options: QuestionChoiceOption[] = (field.options || [])
          .filter((o) => o.value && o.value !== '' && o.text !== '- Bitte auswählen -')
          .map((o) => ({
            value: o.value,
            label: this.cleanText(o.text || o.value)
          }));

        questions.push({
          id: `q-select-${field.id}`,
          questionText,
          type: options.length > 0 ? 'choice' : 'text',
          options: options.length > 0 ? options : undefined,
          currentValue: field.currentValue,
          fieldIds: [field.id],
          fieldName: field.name,
          isRequired: field.isRequired
        });
        continue;
      }

      // Standalone Checkbox
      if (field.type === 'checkbox') {
        const questionText = this.determineQuestionText(field);
        if (!questionText) continue;

        questions.push({
          id: `q-check-${field.id}`,
          questionText,
          type: 'boolean',
          currentValue: field.isChecked || false,
          fieldIds: [field.id],
          fieldName: field.name,
          isRequired: field.isRequired
        });
        continue;
      }

      // Textarea
      if (field.type === 'textarea') {
        const questionText = this.determineQuestionText(field);
        if (!questionText) continue;

        questions.push({
          id: `q-text-${field.id}`,
          questionText,
          type: 'textarea',
          currentValue: field.currentValue,
          fieldIds: [field.id],
          fieldName: field.name,
          isRequired: field.isRequired
        });
        continue;
      }

      // Normal Text Input
      const questionText = this.determineQuestionText(field);
      if (!questionText) continue;

      questions.push({
        id: `q-text-${field.id}`,
        questionText,
        type: 'text',
        currentValue: field.currentValue,
        fieldIds: [field.id],
        fieldName: field.name,
        isRequired: field.isRequired
      });
    }

    return questions;
  }

  /**
   * Radios without a value attribute report the browser default "on", which is
   * identical for every option; use the visible label as the answer instead.
   */
  private static radioOption(field: DetectedField): QuestionChoiceOption {
    const label = this.cleanText(field.labelText || field.currentValue || 'Option');
    const rawValue = (field.currentValue || '').trim();
    const value = rawValue && rawValue.toLowerCase() !== 'on' ? rawValue : label;
    return { value, label };
  }

  private static isForbiddenCheckbox(field: DetectedField): boolean {
    const text = `${field.labelText} ${field.fieldsetLegend} ${field.surroundingText} ${field.name}`;
    return FORBIDDEN_CHECKBOX_KEYWORDS.some((pattern) => pattern.test(text));
  }

  private static getRadioGroupKey(field: DetectedField): string {
    if (field.fieldsetLegend && field.fieldsetLegend.trim().length > 3) {
      return field.fieldsetLegend.trim().toLowerCase();
    }
    if (field.name && field.name.trim().length > 0) {
      return field.name.trim().toLowerCase();
    }
    if (field.surroundingText && field.surroundingText.trim().length > 5) {
      return field.surroundingText.trim().toLowerCase().substring(0, 40);
    }
    return field.id;
  }

  private static determineQuestionText(field: DetectedField, isRadioGroup: boolean = false): string {
    if (isRadioGroup) {
      if (field.fieldsetLegend && field.fieldsetLegend.trim().length > 3) {
        return this.cleanText(field.fieldsetLegend);
      }
      if (field.surroundingText && field.surroundingText.trim().length > 5) {
        return this.cleanText(field.surroundingText);
      }
    }

    const candidates = [
      field.labelText,
      field.fieldsetLegend,
      field.ariaLabel,
      field.placeholder,
      field.name
    ];

    for (const c of candidates) {
      if (c && c.trim().length > 1) {
        const cleaned = this.cleanText(c);
        if (cleaned.length > 1) return cleaned;
      }
    }

    return '';
  }

  private static cleanText(text: string): string {
    return text
      .replace(/[\n\r\t]+/g, ' ')
      .replace(/[*:]+$/g, '') // remove trailing asterisks/colons
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Identifies whether a detected field corresponds to a standard resume or profile attribute
   * (e.g., Personal info, Experience, Education, Contact info), which should never be treated
   * as custom screening questions.
   */
  public static isStandardProfileField(field: DetectedField): boolean {
    const rawLabel = (field.labelText || '').toLowerCase().trim();
    const rawName = (field.name || '').toLowerCase().trim();
    const rawId = (field.htmlId || '').toLowerCase().trim();
    const rawPlaceholder = (field.placeholder || '').toLowerCase().trim();
    const rawAria = (field.ariaLabel || '').toLowerCase().trim();
    const autoId = (
      (field.element && typeof field.element.getAttribute === 'function' ? field.element.getAttribute('data-automation-id') : '') || ''
    ).toLowerCase();

    const combined = `${rawLabel} ${rawName} ${rawId} ${rawPlaceholder} ${rawAria} ${autoId}`;

    const standardPatterns: RegExp[] = [
      // Name & Contact
      /\b(first\s*name|given\s*name|vorname|forename)\b/i,
      /\b(last\s*name|surname|family\s*name|nachname|familienname)\b/i,
      /\b(full\s*name|legal\s*name|candidate\s*name)\b/i,
      /\b(email|e-mail|mail)\b/i,
      /\b(phone|telephone|telefon|handy|mobile|device\s*type|country\s*code|calling\s*code|dial\s*code)\b/i,
      /\b(street|address|adresse|straße|strasse|hausnummer)\b/i,
      /\b(city|stadt|ort|postal|zip|plz|postleitzahl)\b/i,
      /\b(country|land|staat)\b/i,
      // Work Experience fields
      /\b(job\s*title|jobtitel|position|arbeitsplatz|berufsbezeichnung)\b/i,
      /\b(company|employer|unternehmen|arbeitgeber|firmenname)\b/i,
      /\b(location|standort|arbeitsort)\b/i,
      /\b(currently\s*work|current\s*job|aktuell\s*hier|gegenwärtig)\b/i,
      /\b(role\s*description|description|aufgaben|responsibilities|tätigkeitsbeschreibung)\b/i,
      // Education fields
      /\b(school|university|hochschule|universität|schule|bildungsstätte|ausbildungsstätte)\b/i,
      /\b(degree|abschluss|degree\s*type|akademischer\s*grad)\b/i,
      /\b(field\s*of\s*study|studienfach|studienrichtung|major|fachrichtung)\b/i,
      /\b(gpa|overall\s*result|note|grade|abschlussnote)\b/i,
      // Dates
      /^(from|von|to|bis|start\s*date|end\s*date|start\s*year|end\s*year)$/i,
      /\b(start\s*date|end\s*date|from\s*date|to\s*date|start\s*year|end\s*year)\b/i,
      /\b(yyyy|mm\/yyyy)\b/i,
      // Profiles & Web Links
      /\b(linkedin|website|webpage|portfolio|homepage)\b/i,
      // Compensation & Availability
      /\b(salary|gehalt|gehaltsvorstellung|gehaltswunsch|compensation|remuneration)\b/i,
      /\b(availability|verf[uü]gbarkeit|notice\s*period|k[uü]ndigungsfrist|eintrittstermin|fr[uü]hestm[oö]glich|sofort)\b/i,
      // Referral & Application Source
      /\b(wie\s*hast\s*du\s*von\s*uns\s*erfahren|how\s*did\s*you\s*hear|referral\s*source|aufmerksam|wie\s*erfahren)\b/i,
      // Work Authorization & EU Citizenship
      /\b(arbeitserlaubnis|work\s*permit|eu[\s_-]?staatsb[uü]rgerschaft|citizenship|visa\s*sponsorship|authorized\s*to\s*work)\b/i,
      // Languages
      /\b(deutsch[\s_-]?sprachkenntnisse|englisch[\s_-]?sprachkenntnisse|deutschkenntnisse|englischkenntnisse|german\s*skills|english\s*skills|sprachkenntnisse)\b/i,
      // Demographics
      /\b(geschlecht|gender|nationalit[aä]t|nationality|altersgruppe|age\s*group)\b/i
    ];

    return standardPatterns.some((regex) => regex.test(combined));
  }
}

export class QuestionLearner {
  /**
   * Extracts salient keywords from a question string for resilient matching.
   */
  public static extractKeywords(question: string): string[] {
    const tokens = question
      .toLowerCase()
      .replace(/[^a-z0-9äöüß\s-]/gi, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));

    // Return unique keywords
    return Array.from(new Set(tokens));
  }

  /**
   * Generates a persistent CustomQA record from a question and answer.
   */
  public static createCustomQA(
    question: string,
    answer: string,
    category: string = 'Learned Question'
  ): CustomQA {
    const cleanQ = question.trim();
    const keywords = this.extractKeywords(cleanQ);

    return {
      id: `qa-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      question: cleanQ,
      keywords: keywords.length > 0 ? keywords : [cleanQ.toLowerCase().substring(0, 15)],
      answer: answer.trim(),
      category
    };
  }

  /**
   * Scans document fields for user-filled inputs that were not covered by the profile,
   * enabling 1-click "Learn from Current Page".
   */
  public static extractFilledQuestionsFromPage(
    fields: DetectedField[]
  ): { question: string; answer: string; keywords: string[] }[] {
    const learned: { question: string; answer: string; keywords: string[] }[] = [];
    const processedGroups = new Set<string>();

    for (const field of fields) {
      // Use the same safeguards and visible option labels as automatic learning.
      const learnedAnswer = this.getLearnableAnswer(field);
      if (!learnedAnswer) continue;
      const key = normalizeQuestion(learnedAnswer.question);
      if (processedGroups.has(key)) continue;
      processedGroups.add(key);
      learned.push({ ...learnedAnswer, keywords: this.extractKeywords(learnedAnswer.question) });
    }

    return learned;
  }

  /**
   * Returns a safe, reusable answer from a manually completed field. Standard
   * profile fields and legal-consent controls are intentionally excluded: they
   * are not screening-question memory and should never be silently reused.
   */
  public static getLearnableAnswer(field: DetectedField, manualChoice = false): { question: string; answer: string } | null {
    if (!field.isVisible || field.isDisabled || field.isReadOnly || field.type === 'file' || field.type === 'checkbox') {
      return null;
    }

    // A fieldset may contain several distinct text/select questions. Its shared
    // heading is the question only for a radio group, not for every child input.
    const question = questionOf(field);
    if (question.length < 3 || (!isChoiceField(field) && !isScreeningDate(field) && QuestionDetector.isStandardProfileField(field))) return null;

    const combined = `${question} ${field.surroundingText} ${field.name}`;
    if ((!isChoiceField(field) || !manualChoice) && FORBIDDEN_CHECKBOX_KEYWORDS.some((pattern) => pattern.test(combined))) return null;

    if (field.type === 'radio') {
      if (!field.isChecked) return null;
      const answer = (field.labelText || field.currentValue).trim();
      return answer ? { question, answer } : null;
    }

    const currentValue = (field.currentValue || '').trim();
    // Portal-specific option IDs (e.g. "answer-378") cannot be reused elsewhere.
    // Keep the visible answer in shared Q&A; site-specific memory keeps the ID.
    const selectedOption = field.options?.find((option) => option.value === field.currentValue);
    const answer = currentValue && (selectedOption?.text || currentValue).trim();
    return answer ? { question, answer } : null;
  }
}
