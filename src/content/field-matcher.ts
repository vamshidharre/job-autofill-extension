import { DetectedField, FieldMatchResult } from '../types/engine';
import { UserProfile } from '../types/profile';
import { WebsiteAdapter } from './website-adapters/adapter-interface';
import { WorkdayAdapter } from './website-adapters/workday-adapter';
import { GreenhouseAdapter } from './website-adapters/greenhouse-adapter';
import { LeverAdapter } from './website-adapters/lever-adapter';
import { PersonioAdapter } from './website-adapters/personio-adapter';
import { TeslaAdapter } from './website-adapters/tesla-adapter';
import { GenericAdapter } from './website-adapters/generic-adapter';
import { phrasesOverlap } from './option-matching';
import { findOverride, hostOf, overrideMatch } from './correction-memory';
import { consentCheckboxMatch } from './field-safety';

export class FieldMatcher {
  private adapters: WebsiteAdapter[];

  constructor() {
    this.adapters = [
      new TeslaAdapter(),
      new WorkdayAdapter(),
      new GreenhouseAdapter(),
      new LeverAdapter(),
      new PersonioAdapter(),
      new GenericAdapter()
    ];
  }

  /**
   * Match all detected fields against profile using active website adapter or generic engine.
   */
  public matchFields(
    fields: DetectedField[],
    profile: UserProfile,
    url: string = typeof window !== 'undefined' ? window.location.href : '',
    doc: Document = typeof document !== 'undefined' ? document : (null as any),
    options: { ignoreOverrides?: boolean; learnedOnly?: boolean } = {}
  ): FieldMatchResult[] {
    // Find active specialized adapter (if any)
    const activeDoc = doc || (typeof document !== 'undefined' ? document : ({} as any));
    const activeSpecialized = this.adapters.find(
      (a) => a.name !== 'Generic' && a.isMatching(url, activeDoc)
    );

    const genericAdapter = this.adapters.find((a) => a.name === 'Generic') as GenericAdapter;
    const host = options.ignoreOverrides ? '' : hostOf(url);

    const results: FieldMatchResult[] = [];

    for (const field of fields) {
      const override = host ? findOverride(profile, host, field) : undefined;
      const consent = consentCheckboxMatch(field);
      if (consent && !override?.manualChoice) {
        results.push(consent);
        continue;
      }
      // The candidate's own correction for this field on this site beats every built-in rule.
      if (override) {
        results.push(overrideMatch(field, override));
        continue;
      }

      const remembered = genericAdapter.matchRememberedAnswer(field, profile);
      if (remembered?.suggestedAction === 'fill' || remembered?.suggestedAction === 'skip') {
        if (field.tag === 'select' && field.options) {
          remembered.selectedOptionValue = this.findBestSelectOption(field.options, String(remembered.targetValue));
        }
        results.push(remembered);
        continue;
      }
      if (options.learnedOnly) continue;

      let match: FieldMatchResult | null = null;

      // Try website-specific adapter first
      if (activeSpecialized && activeSpecialized.customMatch) {
        match = activeSpecialized.customMatch(field, profile);
      }

      // If not matched or low confidence, fallback to generic engine
      if (!match || match.confidence < 0.60) {
        const genericMatch = genericAdapter.customMatch(field, profile);
        if (genericMatch && (!match || genericMatch.confidence > match.confidence)) {
          match = genericMatch;
        }
      }

      if (match) {
        // Option selection resolution for dropdowns/selects (if not already explicitly resolved by adapter)
        if (field.tag === 'select' && field.options && !match.selectedOptionValue) {
          match.selectedOptionValue = this.findBestSelectOption(field.options, String(match.targetValue));
        }

        results.push(match);
      }
    }

    return results;
  }

  /**
   * Intelligently maps stored value to best available <option>
   * Handles English/German translations, country variations, and abbreviations.
   */
  public findBestSelectOption(options: { value: string; text: string }[], targetValue: string): string | undefined {
    if (!targetValue || options.length === 0) return undefined;

    const normalizedTarget = targetValue.toLowerCase().trim();

    // 1. Exact value or text match
    for (const opt of options) {
      if (
        opt.value.toLowerCase().trim() === normalizedTarget ||
        opt.text.toLowerCase().trim() === normalizedTarget
      ) {
        return opt.value;
      }
    }

    // 2. Multilingual synonym mappings for dropdowns (e.g. Germany <-> Deutschland)
    const countryAliases: Record<string, string[]> = {
      germany: ['deutschland', 'federal republic of germany', 'bundesrepublik deutschland', 'de', 'deu'],
      deutschland: ['germany', 'federal republic of germany', 'bundesrepublik deutschland', 'de', 'deu'],
      'federal republic of germany': ['germany', 'deutschland', 'bundesrepublik deutschland', 'de', 'deu'],
      india: ['indien', 'in', 'ind'],
      'united states': ['usa', 'us', 'vereinigte staaten'],
      austria: ['österreich', 'oesterreich', 'at', 'aut'],
      switzerland: ['schweiz', 'suisse', 'ch', 'che']
    };

    const targetAliases = countryAliases[normalizedTarget] || [];
    for (const opt of options) {
      const optText = opt.text.toLowerCase().trim();
      const optVal = opt.value.toLowerCase().trim();
      for (const alias of targetAliases) {
        if (optText === alias || optVal === alias) {
          return opt.value;
        }
      }
    }

    // 3. Phone Calling Code matching (e.g. +49 DE, DE (+49), Germany (+49))
    const dialCodeMatch = normalizedTarget.match(/\+(\d{1,4})/);
    if (dialCodeMatch) {
      const dialCode = dialCodeMatch[1];
      for (const opt of options) {
        const optText = opt.text.toLowerCase().trim();
        const optVal = opt.value.toLowerCase().trim();
        if (
          optVal === `+${dialCode}` ||
          optVal === dialCode ||
          optText.includes(`+${dialCode}`) ||
          optText.includes(`(${dialCode})`) ||
          (dialCode === '49' && (optVal === 'de' || optVal === 'deu' || optText.includes('germany') || optText.includes('deutschland')))
        ) {
          return opt.value;
        }
      }
    }

    // 4. Whole-word token matching (plain substrings would pick "Female" for "male")
    for (const opt of options) {
      const optText = opt.text.toLowerCase().trim();
      if (optText.length > 2 && phrasesOverlap(optText, normalizedTarget)) {
        return opt.value;
      }
    }

    // 5. Degree level matching (e.g. Master of Science -> Master's Degree)
    if (normalizedTarget.includes('master') || normalizedTarget.includes('m.sc')) {
      const masterOpt = options.find((o) => /master|m\.sc|postgraduate/i.test(o.text) || /master|m\.sc/i.test(o.value));
      if (masterOpt) return masterOpt.value;
    }
    if (normalizedTarget.includes('bachelor') || normalizedTarget.includes('b.tech') || normalizedTarget.includes('b.e')) {
      const bachelorOpt = options.find((o) => /bachelor|b\.tech|b\.e|undergraduate/i.test(o.text) || /bachelor|b\.tech/i.test(o.value));
      if (bachelorOpt) return bachelorOpt.value;
    }

    // 6. Yes / No / Ja / Nein boolean matching
    if (normalizedTarget === 'true' || normalizedTarget === 'yes' || normalizedTarget === 'ja') {
      const yesOpt = options.find((o) => /^(yes|ja|true|1)$/i.test(o.text) || /^(yes|ja|true|1)$/i.test(o.value) || /\b(ja|yes|vorhanden|erlaubnis|berechtigt)\b/i.test(o.text));
      if (yesOpt) return yesOpt.value;
    }

    if (normalizedTarget === 'false' || normalizedTarget === 'no' || normalizedTarget === 'nein') {
      const noOpt = options.find((o) => /^(no|nein|false|0)$/i.test(o.text) || /^(no|nein|false|0)$/i.test(o.value));
      if (noOpt) return noOpt.value;
    }

    // 7. Gender / Geschlecht matching
    if (normalizedTarget === 'male' || normalizedTarget === 'männlich' || normalizedTarget === 'm') {
      const maleOpt = options.find(
        (o) => /\b(m[aä]nnlich|male|man\b|herr)\b/i.test(o.text) || /^(male|männlich|m)$/i.test(o.value)
      );
      if (maleOpt) return maleOpt.value;
    }

    // 8. Nationality / Nationalität matching
    if (normalizedTarget.includes('indian') || normalizedTarget.includes('indisch') || normalizedTarget.includes('indien')) {
      const natOpt = options.find(
        (o) => /\b(indisch|indien|indian|india)\b/i.test(o.text) || /^(in|ind|indian|indisch)$/i.test(o.value)
      );
      if (natOpt) return natOpt.value;
    }

    // 9. Age Group / Altersgruppe matching (Target: 25-29)
    if (normalizedTarget.includes('25') || normalizedTarget.includes('26') || normalizedTarget.includes('age')) {
      const ageOpt = options.find((o) =>
        /\b(25\s*[-–]\s*29|20\s*[-–]\s*29|25\s*[-–]\s*34|20\s*[-–]\s*30|unter\s*30|under\s*30)\b/i.test(o.text) ||
        /\b(25\s*[-–]\s*29|20\s*[-–]\s*29|25\s*[-–]\s*34)\b/i.test(o.value)
      );
      if (ageOpt) return ageOpt.value;
    }

    // 10. German Language Level (B1 / Mittelstufe / Intermediate / Gut)
    if (normalizedTarget === 'b1' || normalizedTarget.includes('b1') || normalizedTarget.includes('deutsch')) {
      const germanOpt = options.find((o) =>
        /\b(b1\b|mittelstufe|intermediate|konversationssicher|gut\b|gute\s*kenntnisse)/i.test(o.text) ||
        /\b(b1\b|mittelstufe|intermediate|gut\b)/i.test(o.value)
      );
      if (germanOpt) return germanOpt.value;
    }

    // 11. English Language Level (C2 / Verhandlungssicher / Fließend / Fluent)
    if (normalizedTarget === 'c2' || normalizedTarget.includes('c2') || normalizedTarget.includes('verhandlungssicher') || normalizedTarget.includes('fließend')) {
      const englishOpt = options.find((o) =>
        /\b(c2\b|c1\/c2|c1\s*[-–]\s*c2|verhandlungssicher|flie[sß]end|fluent|muttersprach|native|exzellent)/i.test(o.text) ||
        /\b(c2\b|c1\/c2|verhandlungssicher|fluent|native)/i.test(o.value)
      );
      if (englishOpt) return englishOpt.value;
    }

    // 12. Referral Source / Wie hast du von uns erfahren? (Target: LinkedIn)
    if (normalizedTarget.includes('linkedin')) {
      const linkedInOpt = options.find((o) => /linkedin/i.test(o.text) || /linkedin/i.test(o.value));
      if (linkedInOpt) return linkedInOpt.value;
      const jobBoardOpt = options.find((o) => /jobb[oö]rse|job[\s_-]?board|internet|online|social[\s_-]?media/i.test(o.text));
      if (jobBoardOpt) return jobBoardOpt.value;
    }

    // 13. Availability / Notice Period (Sofort / Immediately)
    if (normalizedTarget.includes('sofort') || normalizedTarget.includes('immediately') || normalizedTarget.includes('unmittelbar')) {
      const availOpt = options.find((o) =>
        /\b(sofort|ab[\s_-]?sofort|immediately|unmittelbar|0\b)/i.test(o.text) ||
        /\b(sofort|immediately)/i.test(o.value)
      );
      if (availOpt) return availOpt.value;
    }

    // 14. Phone Device Type / Telefontyp (Mobile / Mobil / Cell / Handy)
    if (
      normalizedTarget === 'mobile' ||
      normalizedTarget === 'mobil' ||
      normalizedTarget === 'cell' ||
      normalizedTarget.includes('mobil') ||
      normalizedTarget.includes('mobile') ||
      normalizedTarget.includes('telefontyp')
    ) {
      const mobileOpt = options.find((o) =>
        /^(mobile|mobil|cell|cellular|handy)$/i.test(o.text.trim()) ||
        /^(mobile|mobil|cell|cellular|handy)$/i.test(o.value.trim()) ||
        /\b(mobile|mobil|cell|handy)\b/i.test(o.text) ||
        /\b(mobile|mobil|cell|handy)\b/i.test(o.value)
      );
      if (mobileOpt) return mobileOpt.value;
    }

    return undefined;
  }
}
