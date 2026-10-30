import { WebsiteAdapter } from './adapter-interface';
import { DetectedField, FieldMatchResult, ProfileFieldPath } from '../../types/engine';
import { CustomQA, UserProfile } from '../../types/profile';
import { SYNONYM_DICTIONARY, FORBIDDEN_CHECKBOX_KEYWORDS } from '../synonyms';
import { ConfidenceEngine } from '../confidence-engine';
import { containsPhrase, getOptionValue, isTruthyAnswer, radioOptionMatchesAnswer } from '../option-matching';
import { QuestionLearner, isLearnedQA, normalizeQuestion } from '../question-learner';
import { DEFAULT_USER_PROFILE } from '../../storage/default-profile';
import { questionOf, screeningConcept } from '../field-context';

export class GenericAdapter implements WebsiteAdapter {
  public readonly name = 'Generic';

  public isMatching(_url: string, _document: Document): boolean {
    return true; // Fallback for any website
  }

  /** User-entered answers have priority over profile synonyms and portal defaults. */
  public matchRememberedAnswer(field: DetectedField, profile: UserProfile): FieldMatchResult | null {
    const saved = (profile.customQA || []).filter((qa) => {
      const seed = DEFAULT_USER_PROFILE.customQA.find((item) => item.id === qa.id);
      return isLearnedQA(qa) || !seed || qa.question !== seed.question || qa.answer !== seed.answer;
    }).map((qa) => ({ ...qa, category: 'Learned saved answer' }));
    const literal = this.matchCustomQA(field, { ...profile, customQA: saved });
    if (literal?.confidence && literal.confidence >= 0.9) return literal;
    const concept = screeningConcept(questionOf(field));
    if (field.type !== 'radio' || !concept) return literal;
    const equivalent = saved.filter((qa) => screeningConcept(qa.question) === concept);
    if (!equivalent.length) return literal;
    // An ambiguous collection of older answers must not be resolved by array order.
    const latest = [...equivalent].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
    const canonical = (answer: string) => /^(ja|yes|true)$/i.test(answer) ? 'yes' : /^(nein|no|false)$/i.test(answer) ? 'no' : answer;
    if (equivalent.some((qa) => canonical(qa.answer) !== canonical(latest.answer)) && equivalent.some((qa) => !qa.updatedAt)) return literal;
    return this.matchCustomQA(field, { ...profile, customQA: [{ ...latest, question: questionOf(field) }] });
  }

  public customMatch(field: DetectedField, profile: UserProfile): FieldMatchResult | null {
    let bestMatch: FieldMatchResult | null = null;
    let highestConfidence = 0.0;

    // 1. For textareas (open-ended written responses), check Custom Q&A first
    if (field.type === 'textarea') {
      const qaMatch = this.matchCustomQA(field, profile);
      if (qaMatch && qaMatch.confidence >= 0.70) {
        return qaMatch;
      }
    }

    // 2. Evaluate standard profile dictionary
    for (const pattern of SYNONYM_DICTIONARY) {
      const evalResult = ConfidenceEngine.evaluatePattern(field, pattern);
      if (evalResult.confidence > highestConfidence) {
        highestConfidence = evalResult.confidence;
        const targetValue = this.extractProfileValue(pattern.path, profile, field);

        const action = ConfidenceEngine.determineAction(
          evalResult.confidence,
          pattern.isSensitive || false,
          profile
        );

        bestMatch = {
          detectedField: field,
          matchedProfilePath: pattern.path,
          targetValue,
          displayLabel: pattern.displayLabel,
          confidence: evalResult.confidence,
          confidenceLevel:
            evalResult.confidence >= 0.85
              ? 'high'
              : evalResult.confidence >= 0.60
              ? 'medium'
              : 'low',
          matchReason: evalResult.matchReason,
          suggestedAction: action,
          isSensitive: pattern.isSensitive || false
        };
      }
    }

    // 3. If standard dictionary didn't find a reliable match (>= 0.50), check custom saved / learned Q&A
    if (highestConfidence < 0.50) {
      const qaMatch = this.matchCustomQA(field, profile);
      if (qaMatch && qaMatch.confidence > highestConfidence) {
        return qaMatch;
      }
    }

    if (bestMatch && (field.type === 'radio' || field.type === 'checkbox')) {
      this.resolveChoiceTarget(bestMatch);
    }

    return bestMatch;
  }

  /**
   * Profile values are field-level ("authorized to work: true", "notice period:
   * Immediately"), but a radio or checkbox element is a single option. Translate
   * the value into "should this specific option be selected?" so that both the
   * Yes and the No radio of a pair are not checked, and a text value never ticks
   * a checkbox.
   */
  private resolveChoiceTarget(match: FieldMatchResult): void {
    const field = match.detectedField;
    const value = match.targetValue;

    if (field.type === 'checkbox') {
      if (typeof value !== 'boolean' && match.suggestedAction === 'fill') {
        match.suggestedAction = 'review';
      }
      return;
    }

    const answer = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value ?? '');
    const isThisOption = radioOptionMatchesAnswer(
      field.labelText || '',
      getOptionValue(field.element, field.currentValue || ''),
      answer
    );
    match.targetValue = isThisOption;
    if (!isThisOption) {
      match.suggestedAction = 'skip';
    }
  }

  private isForbiddenCheckbox(field: DetectedField): boolean {
    const text = `${field.labelText} ${field.fieldsetLegend} ${field.surroundingText} ${field.name}`;
    return FORBIDDEN_CHECKBOX_KEYWORDS.some((regex) => regex.test(text));
  }

  private matchCustomQA(field: DetectedField, profile: UserProfile): FieldMatchResult | null {
    if (!profile.customQA || profile.customQA.length === 0) return null;

    const searchTarget = `${field.labelText} ${field.fieldsetLegend} ${field.ariaLabel} ${field.placeholder} ${field.name} ${field.surroundingText}`.toLowerCase();

    // A checkbox answer must never tick a consent / terms checkbox.
    if (field.type === 'checkbox' && this.isForbiddenCheckbox(field)) return null;

    // Score every saved answer and keep the best, so a loose early entry cannot
    // shadow an exact match further down the list.
    let best: { qa: CustomQA; score: number; strong: boolean } | null = null;
    for (const qa of profile.customQA) {
      const scored = this.scoreCustomQA(field, searchTarget, qa);
      if (scored && (!best || scored.score > best.score)) {
        best = { qa, ...scored };
      }
    }
    if (!best) return null;

    const { qa, strong } = best;
    let matchScore = best.score;
    // Formulate target value based on field type
    let targetValue: any = qa.answer;
    let suggestedAction: 'fill' | 'review' | 'skip' = matchScore >= 0.80 ? 'fill' : 'review';

    // Radio group option handling
    if (field.type === 'radio') {
      const isThisOption = radioOptionMatchesAnswer(
        field.labelText || field.currentValue || '',
        getOptionValue(field.element, field.currentValue || ''),
        qa.answer
      );

      targetValue = isThisOption;
      suggestedAction = isThisOption ? (strong ? 'fill' : 'review') : 'skip';
      if (strong) matchScore = 0.98;
    } else if (field.type === 'checkbox') {
      targetValue = isTruthyAnswer(qa.answer);
      suggestedAction = strong ? 'fill' : 'review';
      if (strong) matchScore = 0.98;
    }

    return {
      detectedField: field,
      matchedProfilePath: 'customQA.answer',
      targetValue,
      displayLabel: `Learned Answer: ${qa.question.substring(0, 35)}...`,
      confidence: matchScore,
      confidenceLevel: matchScore >= 0.85 ? 'high' : 'medium',
      matchReason: `Custom Q&A match: "${qa.question.substring(0, 40)}"`,
      suggestedAction,
      isSensitive: false
    };
  }

  /**
   * How well a saved answer's question fits this field.
   *
   * Hand-written entries (built-in defaults, Settings) list alternative phrasings
   * as keywords, so any two of them are enough. Learned entries get their keywords
   * from the question text itself; for them nearly all distinctive words must be
   * present as whole words, otherwise "Wie viele Jahre Erfahrung haben Sie mit
   * FEM-Simulation?" would answer "Wie haben Sie von uns erfahren?". A partial
   * match on a learned entry is only offered for review, never filled.
   */
  private scoreCustomQA(
    field: DetectedField,
    searchTarget: string,
    qa: CustomQA
  ): { score: number; strong: boolean } | null {
    const qaQ = qa.question.toLowerCase().trim();
    const learned = isLearnedQA(qa);
    if (learned) {
      // Nearby fields often appear in surroundingText. An answer learned for
      // one question must not silently answer its neighbor, or a negated variant.
      const question = questionOf(field);
      const normalized = normalizeQuestion(question);
      if (!normalized) return null;
      if (normalized === normalizeQuestion(qa.question)) return { score: 0.98, strong: true };

      const negations = (text: string) => text.match(/\b(not|never|no|without|nicht|nie|kein\w*|ohne)\b/g)?.join(' ') || '';
      if (negations(normalized) !== negations(normalizeQuestion(qa.question))) return null;

      // Keyword extraction deliberately ignores short words and punctuation.
      // That must not make C++/C#/C, version numbers, or numeric limits equivalent.
      const technicalTokens = (text: string) => text.match(/[\p{L}\p{N}]+[+#]+|\p{N}+(?:[.,]\p{N}+)*(?:%|\+)?|\bc\b/gu)?.join('|') || '';
      const technicalConflict = technicalTokens(normalized) !== technicalTokens(normalizeQuestion(qa.question));

      const keywords = QuestionLearner.extractKeywords(qa.question);
      if (keywords.length < 2) return null;
      const ownKeywords = QuestionLearner.extractKeywords(question);
      const matched = keywords.filter((kw) => containsPhrase(question, kw)).length;
      const ratio = matched / keywords.length;
      // Extra distinctive words can change the subject ("future", "CFD", a
      // different location). Such near matches need review, not automatic reuse.
      if (!technicalConflict && ratio >= 0.95 && ownKeywords.length === keywords.length) return { score: 0.92, strong: true };
      if (ratio >= 0.75) return { score: 0.75, strong: false };
      return null;
    }
    const label = (field.labelText || '').toLowerCase().trim();
    const legend = (field.fieldsetLegend || '').toLowerCase().trim();
    // The field's own label must be a substantial part of the saved question, not one word of it.
    const coversQuestion = (text: string) => text.length >= 8 && qaQ.includes(text) && (!learned || text.length >= qaQ.length * 0.6);

    // 1. Direct substring matching
    if (qaQ.length >= 5 && searchTarget.includes(qaQ)) return { score: 0.98, strong: true };
    if (coversQuestion(label) || coversQuestion(legend)) return { score: 0.95, strong: true };

    // 2. Keyword overlap matching
    if (!qa.keywords || qa.keywords.length === 0) return null;
    let matchedKwCount = 0;
    for (const kw of qa.keywords) {
      if (kw.length >= 3 && searchTarget.includes(kw.toLowerCase())) {
        matchedKwCount++;
      }
    }
    const kwRatio = matchedKwCount / qa.keywords.length;
    if (matchedKwCount >= 2 || (qa.keywords.length === 1 && matchedKwCount === 1)) {
      return { score: Math.min(0.70 + kwRatio * 0.28, 0.98), strong: true };
    }
    return null;
  }

  private extractProfileValue(path: ProfileFieldPath, profile: UserProfile, field?: DetectedField): any {
    switch (path) {
      case 'basic.firstName':
        return profile.basic.firstName;
      case 'basic.middleName':
        return profile.basic.middleName;
      case 'basic.lastName':
        return profile.basic.lastName;
      case 'basic.fullName':
        return profile.basic.fullName;
      case 'basic.preferredName':
        return profile.basic.preferredName;
      case 'basic.dateOfBirth':
        return profile.basic.dateOfBirth;
      case 'basic.gender':
        return profile.basic.gender;
      case 'basic.nationality':
        return profile.basic.nationality;
      case 'basic.countryOfBirth':
        return profile.basic.countryOfBirth;

      case 'contact.email':
        return profile.contact.email;
      case 'contact.phone':
        return profile.contact.phone;
      case 'contact.altPhone':
        return profile.contact.altPhone;
      case 'contact.phoneDevice': {
        const isGerman = field && /kontakt|telefontyp|ger[aä]t|handy|mobil/i.test(
          `${field.labelText} ${field.surroundingText} ${field.name} ${field.placeholder} ${field.ariaLabel}`
        );
        return isGerman ? 'Mobil' : 'Mobile';
      }
      case 'contact.phoneCountryCode':
        return 'DE +49';
      case 'contact.linkedin':
        return profile.contact.linkedin;
      case 'contact.github':
        return profile.contact.github;
      case 'contact.portfolio':
        return profile.contact.portfolio;
      case 'contact.website':
        return profile.contact.website || profile.contact.linkedin;

      case 'basic.ageGroup':
        return '25-29';
      case 'jobPreferences.referralSource':
        return 'LinkedIn';
      case 'languages.german':
        return 'B1';
      case 'languages.english':
        return 'C2';

      case 'address.street':
        return profile.address.street;
      case 'address.houseNumber':
        return profile.address.houseNumber;
      case 'address.addressLine1':
        return profile.address.addressLine1;
      case 'address.postalCode':
        return profile.address.postalCode;
      case 'address.city':
        return profile.address.city;
      case 'address.state':
        return profile.address.state;
      case 'address.country': {
        const isGerman = field && /wohnsitz|land|region|deutsch|bundesrepublik/i.test(
          `${field.labelText} ${field.surroundingText} ${field.name} ${field.placeholder} ${field.ariaLabel}`
        );
        return isGerman ? 'Deutschland' : (profile.address.country || 'Germany');
      }

      case 'salary.expectedAnnual':
        return profile.salary.expectedAnnual;
      case 'salary.minAnnual':
        return profile.salary.minAnnual;
      case 'salary.currency':
        return profile.salary.currency;
      case 'salary.monthlyExpectation':
        return profile.salary.monthlyExpectation;
      case 'salary.negotiable':
        return profile.salary.negotiable;

      case 'jobPreferences.earliestStartDate': {
        if (field?.tag === 'select' || field?.type === 'select' || field?.tag === 'button') {
          const isTesla = field && /wie ist ihre verf[uü]gbarkeit|verf[uü]gbarkeit.*k[uü]ndigungsfrist/i.test(
            `${field.labelText} ${field.surroundingText} ${field.name} ${field.placeholder} ${field.ariaLabel}`
          );
          if (isTesla) return 'Unmittelbar';
          const isGerman = field && /verf[uü]gbar|k[uü]ndigung/i.test(
            `${field.labelText} ${field.surroundingText} ${field.name} ${field.placeholder} ${field.ariaLabel}`
          );
          return isGerman ? 'Sofort' : 'Immediately';
        }
        return profile.jobPreferences.earliestStartDate;
      }
      case 'jobPreferences.noticePeriod': {
        const isTesla = field && /wie ist ihre verf[uü]gbarkeit|verf[uü]gbarkeit.*k[uü]ndigungsfrist/i.test(
          `${field.labelText} ${field.surroundingText} ${field.name} ${field.placeholder} ${field.ariaLabel}`
        );
        if (isTesla) return 'Unmittelbar';
        const isGerman = field && /verf[uü]gbar|k[uü]ndigung|sofort|beginnen|arbeitsverh|ab[\s_-]?sofort/i.test(
          `${field.labelText} ${field.surroundingText} ${field.name} ${field.placeholder} ${field.ariaLabel}`
        );
        return isGerman ? 'Sofort' : (profile.jobPreferences.noticePeriod || 'Immediately');
      }
      case 'jobPreferences.willingToRelocate':
        return profile.jobPreferences.willingToRelocate;
      case 'jobPreferences.willingToTravel':
        return profile.jobPreferences.willingToTravel;
      case 'jobPreferences.remotePreference':
        return profile.jobPreferences.remotePreference;
      case 'jobPreferences.desiredTitle':
        return profile.jobPreferences.desiredTitle;

      case 'workAuthorization.legallyAuthorized': {
        const isGerman = field && /deutsch|arbeitserlaubnis|staatsb[uü]rgerschaft/i.test(
          `${field.labelText} ${field.surroundingText} ${field.name} ${field.placeholder} ${field.ariaLabel}`
        );
        if (field?.tag === 'select' || field?.type === 'select') {
          return isGerman ? 'Ja' : 'Yes';
        }
        return profile.workAuthorization.legallyAuthorized;
      }
      case 'workAuthorization.requireSponsorshipNow':
        return profile.workAuthorization.requireSponsorshipNow;
      case 'workAuthorization.requireSponsorshipFuture':
        return profile.workAuthorization.requireSponsorshipFuture;
      case 'workAuthorization.currentAuthType':
        return profile.workAuthorization.currentAuthType;

      case 'education.latest.degree':
        return profile.education[0]?.degree || '';
      case 'education.latest.university':
        return profile.education[0]?.university || '';
      case 'education.latest.fieldOfStudy':
        return profile.education[0]?.fieldOfStudy || '';
      case 'education.latest.gpa':
        return profile.education[0]?.gradeGpa || '';
      case 'education.latest.gradDate':
        return profile.education[0]?.graduationDate || '';

      case 'experience.latest.company':
        return profile.experience[0]?.company || '';
      case 'experience.latest.title':
        return profile.experience[0]?.jobTitle || '';
      case 'experience.latest.description':
        return profile.experience[0]?.description || '';

      case 'coverLetter.text':
        return profile.coverLetterTemplates[0]?.body || '';

      case 'document.resume':
        return profile.documents.find((d) => d.type === 'resume')?.name || 'Resume.pdf';

      default:
        return '';
    }
  }
}
