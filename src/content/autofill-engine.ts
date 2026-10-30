import { FieldDetector } from './field-detector';
import { FieldMatcher } from './field-matcher';
import { UIOverlay } from './ui-overlay';
import { UserProfile } from '../types/profile';
import { AutofillReport, DetectedField, FieldMatchResult } from '../types/engine';
import { consentCheckboxMatch } from './field-safety';
import { ProfileStorage } from '../storage/profile-storage';
import { WorkdayAdapter } from './website-adapters/workday-adapter';
import { containsPhrase, getOptionValue, isTruthyAnswer, phrasesOverlap, radioOptionMatchesAnswer } from './option-matching';
import { isScreeningDate } from './field-context';

interface FilledFieldRecord {
  element: HTMLElement;
  originalValue: string;
  originalChecked?: boolean;
}

const TEXT_LIKE_TYPES = new Set(['text', 'textarea', 'email', 'tel', 'number', 'date']);

export class AutofillEngine {
  private matcher: FieldMatcher;
  private filledHistory: FilledFieldRecord[] = [];
  private observer: MutationObserver | null = null;
  private isObserving = false;
  private isFilling = false;
  private observerTimer: ReturnType<typeof setTimeout> | undefined;
  private isActivePage: () => boolean;
  /** Elements filled from the candidate's learned corrections; the phone fallbacks must not "fix" them. */
  private learnedElements = new Set<HTMLElement>();
  /** Every element the engine filled or the candidate edited on this page; re-scans never touch these again. */
  private touched = new WeakSet<HTMLElement>();
  private rememberedReplayStopped = false;

  /** Replay memory independently of general profile autofill, without a modal. */
  public async replayRememberedAnswers(profile: UserProfile): Promise<number> {
    if (this.isFilling || this.rememberedReplayStopped || profile.settings.reuseLearnedAnswers === false || !this.isActivePage()) return 0;
    const fields = FieldDetector.detectFields(document);
    const matches = this.matcher.matchFields(fields, profile, window.location.href, document, { learnedOnly: true });
    this.isFilling = true;
    this.learnedElements = new Set(matches.map((m) => m.detectedField.element));
    let count = 0;
    try {
      for (const match of matches) {
        const field = match.detectedField;
        if (match.suggestedAction !== 'fill' || this.touched.has(field.element)) continue;
        if (field.type === 'checkbox') {
          if ((field.element as HTMLInputElement).checked || field.isChecked) continue;
        } else if (field.type === 'select' && field.tag !== 'select') {
          // A custom trigger often displays a page default rather than an empty value.
        } else if (isScreeningDate(field)) {
          // Untouched calendars often start at today's date. Memory outranks that default.
        } else if (!this.isUntouchedAndEmpty(field)) continue;
        if (await this.fillSingleField(match)) {
          this.touched.add(field.element);
          if (profile.settings.highlightFilledFields) field.element.classList.add('job-autofill-filled');
          count++;
        } else {
          // Dropdown options may arrive asynchronously after the control itself.
          this.touched.delete(field.element);
        }
      }
    } finally {
      this.isFilling = false;
    }
    return count;
  }

  /**
   * @param isActivePage Re-checked before observer-driven fills, so dynamic
   *   filling stops once the page is no longer a verified application form.
   */
  constructor(isActivePage: () => boolean = () => true) {
    this.matcher = new FieldMatcher();
    this.isActivePage = isActivePage;
  }

  /**
   * Run complete scan and autofill on the active document.
   * @param onlyNewFields Re-scan mode for fields that appeared after the first run:
   *   only fields that are still empty and that neither the engine nor the
   *   candidate has touched are filled, and only with confident values.
   */
  public async runAutofill(
    profile: UserProfile,
    previewFirst: boolean = false,
    onlyNewFields: boolean = false
  ): Promise<AutofillReport> {
    const fields = FieldDetector.detectFields(document);

    if (fields.length === 0) {
      return {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        domain: window.location.hostname,
        totalDetected: 0,
        filledCount: 0,
        reviewCount: 0,
        skippedCount: 0,
        results: []
      };
    }

    let matches = this.matcher.matchFields(fields, profile, window.location.href, document);
    if (onlyNewFields) {
      matches = matches.filter((m) => m.suggestedAction === 'fill' && this.isUntouchedAndEmpty(m.detectedField));
      if (matches.length === 0) {
        return {
          timestamp: new Date().toISOString(),
          url: window.location.href,
          domain: window.location.hostname,
          totalDetected: fields.length,
          filledCount: 0,
          reviewCount: 0,
          skippedCount: 0,
          results: []
        };
      }
    }

    // Only show preview modal if preview is explicitly requested via the Preview button
    if (previewFirst) {
      return new Promise((resolve) => {
        UIOverlay.showPreviewModal(matches, async (approvedMatches) => {
          const report = await this.executeFill(approvedMatches, profile, fields.length);
          resolve(report);
        });
      });
    }

    return await this.executeFill(matches, profile, fields.length, onlyNewFields);
  }

  /**
   * Fields a re-scan may fill: empty, never filled by the engine, never edited by
   * the candidate. Checkboxes and custom dropdown triggers are left alone (a
   * trigger always shows some default, e.g. "US +1", so it is never "empty").
   */
  private isUntouchedAndEmpty(field: DetectedField): boolean {
    const el = field.element as HTMLInputElement;
    if (this.touched.has(el)) return false;
    if (TEXT_LIKE_TYPES.has(field.type)) return !(el.value || '').trim();
    if (field.tag === 'select') {
      const selected = (el as unknown as HTMLSelectElement).selectedOptions?.[0];
      return !el.value || /^(?:[-–\s]*)(?:please\s+select|select|choose|bitte\s+auswählen|auswählen)/i.test(selected?.text || '');
    }
    if (field.type === 'radio') {
      const scope = el.closest('[role="radiogroup"], fieldset') || el.ownerDocument || document;
      const group = el.name ? Array.from(scope.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(el.name)}"]`)) :
        Array.from(scope.querySelectorAll<HTMLInputElement>('[role="radio"]')).filter((radio) => radio.closest('[role="radiogroup"]') === el.closest('[role="radiogroup"]'));
      return ![...group, el].some((radio) => radio.checked || radio.getAttribute?.('aria-checked') === 'true' || this.touched.has(radio));
    }
    return false;
  }

  /** Called for the candidate's own edits, so re-scans never overwrite them. */
  public noteUserEdit(el: HTMLElement): void {
    this.touched.add(el);
  }

  /**
   * Execute actual filling for a set of approved/matched fields.
   */
  public async executeFill(
    matches: FieldMatchResult[],
    profile: UserProfile,
    totalDetected: number,
    isRescan: boolean = false
  ): Promise<AutofillReport> {
    // Our own DOM changes (opened dropdowns, added Workday blocks) must not
    // re-trigger the dynamic observer while a fill is in progress.
    this.isFilling = true;
    this.learnedElements = new Set(
      matches.filter((m) => m.matchedProfilePath === 'learned.correction').map((m) => m.detectedField.element)
    );
    try {
      return await this.fillMatches(matches, profile, totalDetected, isRescan);
    } finally {
      this.isFilling = false;
    }
  }

  /**
   * True while the engine itself is changing the page. Its focus()/blur() and
   * execCommand calls produce trusted events, which must not be learned as the
   * candidate's own edits.
   */
  public get isBusy(): boolean {
    return this.isFilling;
  }

  private async fillMatches(
    matches: FieldMatchResult[],
    profile: UserProfile,
    totalDetected: number,
    isRescan: boolean
  ): Promise<AutofillReport> {
    const reportResults: AutofillReport['results'] = [];
    let filledCount = 0;
    let reviewCount = 0;
    let skippedCount = 0;

    for (const match of matches) {
      const el = match.detectedField.element;

      if (match.suggestedAction === 'fill') {
        const success = await this.fillSingleField(match);
        if (success) {
          filledCount++;
          if (profile.settings.highlightFilledFields) {
            el.classList.remove('job-autofill-review');
            el.classList.add('job-autofill-filled');
          }
          reportResults.push({
            fieldId: match.detectedField.id,
            label: match.displayLabel,
            value: String(match.targetValue),
            confidence: match.confidence,
            status: 'filled',
            reason: match.matchReason
          });

          // Brief delay after combobox/country selection to allow React mask updates
          if (
            match.detectedField.tag === 'button' ||
            match.detectedField.type === 'select' ||
            match.displayLabel.toLowerCase().includes('country') ||
            match.displayLabel.toLowerCase().includes('device')
          ) {
            await new Promise((r) => setTimeout(r, 120));
          }
        } else {
          skippedCount++;
          reportResults.push({
            fieldId: match.detectedField.id,
            label: match.displayLabel,
            value: String(match.targetValue),
            confidence: match.confidence,
            status: 'failed',
            reason: 'Element fill rejected or unsupported'
          });
        }
      } else if (match.suggestedAction === 'review') {
        reviewCount++;
        if (profile.settings.highlightFilledFields) {
          el.classList.add('job-autofill-review');
        }
        reportResults.push({
          fieldId: match.detectedField.id,
          label: match.displayLabel,
          value: String(match.targetValue),
          confidence: match.confidence,
          status: 'needs_review',
          reason: match.matchReason
        });
      } else {
        skippedCount++;
        reportResults.push({
          fieldId: match.detectedField.id,
          label: match.displayLabel,
          value: '',
          confidence: match.confidence,
          status: 'skipped',
          reason: match.matchReason
        });
      }
    }

    // Workday multi-entry blocks are filled on explicit runs only: a re-scan would
    // overwrite entries the candidate has edited since.
    if (!isRescan) {
      // Workday: automatically populate all work experience entries if section is present
      try {
        const expFilled = await this.fillWorkdayWorkExperience(profile);
        filledCount += expFilled;
      } catch (e) {
        console.warn('Job Autofill: Error filling Workday Work Experience', e);
      }

      // Workday: automatically populate all education entries if section is present
      try {
        const eduFilled = await this.fillWorkdayEducation(profile);
        filledCount += eduFilled;
      } catch (e) {
        console.warn('Job Autofill: Error filling Workday Education', e);
      }
    }

    // Show floating toast with summary (re-scans only report when they filled something)
    if (!isRescan || filledCount > 0) UIOverlay.showToast(
      filledCount,
      reviewCount,
      0,
      () => {
        // Review clicked: open modal for remaining / review items
        UIOverlay.showPreviewModal(matches, (approved) => {
          this.executeFill(approved, profile, totalDetected);
        });
      },
      () => {
        this.clearFilledFields();
      }
    );

    // Setup dynamic form observer if not already active
    this.startDynamicObserver(profile);

    return {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      domain: window.location.hostname,
      totalDetected,
      filledCount,
      reviewCount,
      skippedCount,
      results: reportResults
    };
  }

  /**
   * Intelligently fills a single DOM element handling React/Vue synthetic events.
   */
  public async fillSingleField(match: FieldMatchResult): Promise<boolean> {
    const el = match.detectedField.element;
    const tag = el.tagName.toLowerCase();
    const type = match.detectedField.type;

    // A previous dropdown may have disabled this control since the scan.
    if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return false;

    // Safety check: Never submit form
    if ((el as HTMLInputElement).type === 'submit') {
      return false;
    }
    if (tag === 'button' && !['radio', 'checkbox'].includes(type)) {
      const isComboboxButton =
        el.getAttribute('role') === 'combobox' ||
        el.hasAttribute('aria-haspopup') ||
        el.hasAttribute('aria-expanded') ||
        match.detectedField.type === 'select' ||
        /\b(select|dropdown|combobox|country|dial|phone)\b/i.test(el.className || '') ||
        /\+[0-9]{1,4}/.test(el.textContent || '');

      if (!isComboboxButton) {
        return false;
      }
    }

    // Consent replays only a direct remembered choice for this question/site.
    if (consentCheckboxMatch(match.detectedField) && !match.isRememberedChoice) return false;

    // If element is a container wrapper, resolve the inner real input
    let targetEl = el;
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && tag !== 'button') {
      const innerInput = el.querySelector('input, textarea, select') as HTMLElement;
      if (innerInput) {
        targetEl = innerInput;
      } else if (el.shadowRoot) {
        const shadowInput = el.shadowRoot.querySelector('input, textarea, select') as HTMLElement;
        if (shadowInput) targetEl = shadowInput;
      }
    }

    const inputEl = targetEl as HTMLInputElement;

    if (el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox') {
      const desired = isTruthyAnswer(match.targetValue);
      if ((el.getAttribute('aria-checked') === 'true') !== desired) el.click();
      return (el.getAttribute('aria-checked') === 'true') === desired;
    }
    this.touched.add(el);
    this.touched.add(targetEl);

    // Record original state for Undo
    this.filledHistory.push({
      element: targetEl,
      originalValue: inputEl.value || '',
      originalChecked: inputEl.checked
    });

    // Custom combobox button handling (Tesla TDS & modern design systems)
    const isCombobox =
      tag === 'button' ||
      type === 'select' ||
      el.getAttribute('role') === 'combobox' ||
      el.hasAttribute('aria-haspopup') ||
      el.getAttribute('aria-expanded') !== null;

    // Native <select> elements are handled by the dedicated branch below. Sending them through
    // the custom-dropdown path (e.g. because their class is "tds-form-input-select") left them unset.
    if (isCombobox && tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
      const parent = el.parentElement?.closest('[class*="field"], [class*="item"], [class*="form"], [class*="select"], [class*="control"]') || el.parentElement;
      const associatedSelect = parent?.querySelector('select') as HTMLSelectElement;
      if (associatedSelect && match.selectedOptionValue !== undefined) {
        const selectOptions = Array.from(associatedSelect.options);
        const optVal = String(match.selectedOptionValue || '').toLowerCase().trim();
        const targetStr = String(match.targetValue || '').toLowerCase().trim();
        const matchedOpt = selectOptions.find((o) => {
          const v = o.value.toLowerCase().trim();
          const t = o.text.toLowerCase().trim();
          if (optVal && (v === optVal || t === optVal)) return true;
          if (targetStr && (v === targetStr || t === targetStr)) return true;
          if ((targetStr.includes('mobile') || optVal.includes('mobile') || targetStr.includes('mobil') || optVal.includes('mobil')) &&
              (t.includes('mobile') || t.includes('mobil') || t.includes('cell') || v === 'mobile' || v === 'mobil' || v === 'cell')) return true;
          if ((optVal === '+49' || targetStr.includes('49') || targetStr.includes('de +49') || targetStr.includes('+49 de')) &&
              (v === 'de' || v === '49' || v === '+49' || t.includes('+49') || t.includes('deutschland') || t.includes('germany'))) return true;
          if ((targetStr === 'deutschland' || optVal === 'deutschland' || targetStr === 'germany' || optVal === 'de') &&
              (v === 'de' || v === 'deutschland' || v === 'germany' || t === 'deutschland' || t === 'germany')) return true;
          if ((targetStr.includes('unmittelbar') || targetStr.includes('immediate') || targetStr.includes('sofort') || optVal.includes('unmittelbar') || optVal.includes('immediate') || optVal.includes('sofort')) &&
              (/unmittelbar|sofort|immediately|immediate|0\b/i.test(t) || /unmittelbar|sofort|immediately|immediate|0\b/i.test(v))) return true;
          return false;
        });
        if (matchedOpt) {
          this.setNativeSelectValue(associatedSelect, matchedOpt.value);
          associatedSelect.dispatchEvent(new Event('change', { bubbles: true }));
          associatedSelect.dispatchEvent(new Event('input', { bubbles: true }));
          if (tag === 'select') return true;
        }
      }

      try {
        // Dispatch pointer and mouse event suite to trigger React TDS dropdowns
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        if (typeof el.focus === 'function') el.focus();
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.click();
        await new Promise((r) => setTimeout(r, 200));

        const listbox = this.findPopupForTrigger(el);

        // If there is an internal filter/search input inside the newly opened dropdown, only filter for phone code if appropriate.
        // Looked up inside this dropdown's popup only, so "+49" is never typed into some other field on the page.
        const searchInput = listbox?.parentElement?.querySelector<HTMLInputElement>('input[type="text"], input[type="search"], input:not([type])') || null;
        if (searchInput && searchInput !== el) {
          const isPhoneCode =
            match.matchedProfilePath === 'contact.phoneCountryCode' ||
            match.displayLabel.toLowerCase().includes('country code') ||
            match.displayLabel.toLowerCase().includes('vorwahl');

          if (isPhoneCode) {
            this.setNativeValue(searchInput, '+49');
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((r) => setTimeout(r, 120));
          }
        }

        const options = listbox
          ? Array.from(listbox.querySelectorAll('[role="option"], li, div[class*="option"], button[class*="option"], div[data-value], div[class*="item"], [data-option-value], tr[data-value]'))
          : Array.from(document.querySelectorAll('[role="option"], [data-option-value], [class*="tds-select-option"], [class*="country-option"]'));

        const targetStr = String(match.targetValue ?? '').toLowerCase().trim();
        const optVal = String(match.selectedOptionValue ?? '').toLowerCase().trim();

        let targetOpt = options.find((opt) => {
          const txt = (opt.textContent || '').toLowerCase().trim();
          const val = (opt.getAttribute('data-value') || opt.getAttribute('data-tds-value') || opt.getAttribute('value') || opt.getAttribute('data-code') || '').toLowerCase().trim();

          // 1. Direct or whole-word match (empty option text must never match)
          if (!txt && !val) return false;
          if ((txt && txt === targetStr) || (val && val === targetStr) || (optVal && (txt === optVal || val === optVal))) {
            return true;
          }
          if (targetStr && txt.length > 1 && phrasesOverlap(txt, targetStr)) {
            return true;
          }

          // 2. Phone Country Code matching (+49 DE / DE +49 / Germany / Deutschland / +49)
          const isPhoneCodeField =
            match.matchedProfilePath === 'contact.phoneCountryCode' ||
            match.displayLabel.toLowerCase().includes('country code') ||
            match.displayLabel.toLowerCase().includes('vorwahl') ||
            match.displayLabel.toLowerCase().includes('calling code') ||
            match.displayLabel.toLowerCase().includes('dial code') ||
            (targetStr.includes('49') && !match.displayLabel.toLowerCase().includes('wohnsitz') && !match.displayLabel.toLowerCase().includes('residence'));

          if (isPhoneCodeField) {
            if (
              /\+49\s*de\b/i.test(txt) ||
              /\bde\s*\+49\b/i.test(txt) ||
              txt.includes('+49') ||
              txt.includes('(49)') ||
              (txt.includes('49') && (txt.includes('de') || txt.includes('germany') || txt.includes('deutschland'))) ||
              val === '+49' ||
              val === '49' ||
              val === 'de'
            ) {
              return true;
            }
          }

          // 3. Country of Residence matching (Germany / Deutschland / DE)
          const isResidenceField =
            match.matchedProfilePath === 'address.country' ||
            match.displayLabel.toLowerCase().includes('wohnsitz') ||
            match.displayLabel.toLowerCase().includes('residence') ||
            targetStr === 'germany' ||
            targetStr === 'deutschland';

          if (isResidenceField) {
            if (
              txt === 'germany' ||
              txt === 'deutschland' ||
              txt.includes('deutschland') ||
              txt.includes('germany') ||
              val === 'de' ||
              val === 'deutschland' ||
              val === 'germany'
            ) {
              return true;
            }
          }

          // 4. Phone Type / Device matching (Mobile / Mobil / Cellular)
          const isPhoneDeviceField =
            match.matchedProfilePath === 'contact.phoneDevice' ||
            match.displayLabel.toLowerCase().includes('device') ||
            match.displayLabel.toLowerCase().includes('telefontyp') ||
            targetStr === 'mobile' ||
            targetStr === 'mobil' ||
            targetStr.includes('mobil') ||
            optVal === 'mobile' ||
            optVal === 'mobil';

          if (isPhoneDeviceField) {
            if (
              txt === 'mobile' ||
              txt === 'mobil' ||
              txt.includes('mobile') ||
              txt.includes('mobil') ||
              txt.includes('cell') ||
              val === 'mobile' ||
              val === 'mobil' ||
              val === 'cell'
            ) {
              return true;
            }
          }

          // 5. Availability matching (Immediately / Unmittelbar / Sofort)
          const isAvailField =
            match.matchedProfilePath === 'jobPreferences.noticePeriod' ||
            match.matchedProfilePath === 'jobPreferences.earliestStartDate' ||
            match.displayLabel.toLowerCase().includes('verfügbarkeit') ||
            match.displayLabel.toLowerCase().includes('kündigungsfrist') ||
            match.displayLabel.toLowerCase().includes('availability') ||
            targetStr.includes('unmittelbar') ||
            targetStr.includes('immediate') ||
            targetStr.includes('sofort');

          if (isAvailField) {
            if (
              txt.includes('unmittelbar') ||
              txt.includes('immediate') ||
              txt.includes('sofort') ||
              val.includes('unmittelbar') ||
              val.includes('immediate') ||
              val.includes('sofort') ||
              /^(unmittelbar|sofort|immediately|immediate|0)$/i.test(txt) ||
              /^(unmittelbar|sofort|immediately|immediate|0)$/i.test(val)
            ) {
              return true;
            }
          }

          // 6. Degree matching (Master's Degree / Bachelor's Degree)
          if (targetStr.includes('master') || optVal.includes('master')) {
            if (txt.includes('master') || val.includes('master') || txt.includes('m.sc') || txt.includes('postgraduate')) {
              return true;
            }
          }
          if (targetStr.includes('bachelor') || optVal.includes('bachelor')) {
            if (txt.includes('bachelor') || val.includes('bachelor') || txt.includes('b.tech') || txt.includes('b.e') || txt.includes('undergraduate')) {
              return true;
            }
          }

          // 7. Yes / Ja / EU Citizenship / Work Permit
          if (targetStr === 'ja' || targetStr === 'yes' || targetStr === 'true') {
            if (txt === 'ja' || txt === 'yes' || val === 'ja' || val === 'yes' || txt.includes('erlaubnis') || txt.includes('vorhanden')) {
              return true;
            }
          }

          // 8. Gender (Männlich / Male)
          if (targetStr === 'male' || targetStr === 'männlich' || targetStr === 'm') {
            // Whole words only: "female" contains "male".
            if (containsPhrase(txt, 'männlich') || containsPhrase(txt, 'male') || txt === 'herr' || txt === 'm' || val === 'male' || val === 'm') {
              return true;
            }
          }

          // 9. Nationality (Indian / Indisch / Indien)
          if (targetStr.includes('indian') || targetStr.includes('indisch') || targetStr.includes('indien')) {
            if (txt.includes('indisch') || txt.includes('indien') || txt.includes('indian') || txt.includes('india') || val === 'in' || val === 'ind') {
              return true;
            }
          }

          // 10. Age Group (25-29)
          if (targetStr.includes('25') || targetStr.includes('26')) {
            if (/\b(25\s*[-–]\s*29|20\s*[-–]\s*29|25\s*[-–]\s*34|20\s*[-–]\s*30|unter\s*30|under\s*30)\b/i.test(txt)) {
              return true;
            }
          }

          // 11. German Language Level (B1 / Mittelstufe)
          if (targetStr === 'b1' || targetStr.includes('b1')) {
            if (/\b(b1\b|mittelstufe|intermediate|gut\b|konversationssicher)/i.test(txt)) {
              return true;
            }
          }

          // 12. English Language Level (C2 / Verhandlungssicher / Fließend)
          if (targetStr === 'c2' || targetStr.includes('c2')) {
            if (/\b(c2\b|c1\/c2|verhandlungssicher|flie[sß]end|fluent|muttersprach)/i.test(txt)) {
              return true;
            }
          }

          // 13. Referral Source (LinkedIn)
          if (targetStr.includes('linkedin')) {
            if (txt.includes('linkedin') || val.includes('linkedin') || txt.includes('jobbörse') || txt.includes('job board') || txt.includes('internet')) {
              return true;
            }
          }

          return false;
        });

        // Fallback for Mobile: if not matched inside listbox, look for a "Mobile" entry inside any open
        // option list. Restricted to option-like containers so a "Mobile" nav link is never clicked.
        if (!targetOpt && (targetStr === 'mobile' || optVal === 'mobile' || targetStr.includes('mobil') || targetStr.includes('device'))) {
          const allVisibleEls = Array.from(document.querySelectorAll<HTMLElement>('*'));
          targetOpt = allVisibleEls.find((e) => {
            if (e.children.length > 0) return false;
            const t = (e.textContent || '').trim().toLowerCase();
            if (t !== 'mobile' && t !== 'mobil') return false;
            if (e.closest('a, label, legend, h1, h2, h3, h4, h5, h6')) return false;
            return !!e.closest('[role="listbox"], [role="option"], [role="menu"], [role="menuitem"], [class*="option"], [class*="dropdown"], [class*="popover"], [class*="listbox"]');
          });
        }

        if (targetOpt) {
          const optEl = targetOpt as HTMLElement;
          optEl.scrollIntoView?.({ block: 'nearest' });
          optEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          optEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          optEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          optEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          optEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          optEl.click();
          await new Promise((r) => setTimeout(r, 150));
          return true;
        }

        // Close dropdown if no option matched. Only re-click when a popup is actually open:
        // a second click on a button that opened nothing is just a second, unintended action.
        if (el.getAttribute('aria-expanded') === 'true' || (listbox && this.isShown(listbox))) {
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          el.click();
        }
      } catch {
        // ignore
      }
      return false;
    }

    if (tag === 'select' || targetEl.tagName.toLowerCase() === 'select') {
      const selectEl = targetEl as HTMLSelectElement;
      const targetStr = String(match.targetValue ?? '').toLowerCase().trim();
      const optVal = String(match.selectedOptionValue ?? '').toLowerCase().trim();
      const selectOptions = Array.from(selectEl.options);

      let matchedOpt = selectOptions.find((o) => {
        const val = o.value.toLowerCase().trim();
        const txt = o.text.toLowerCase().trim();
        if (optVal && (val === optVal || txt === optVal)) return true;
        if (targetStr && (val === targetStr || txt === targetStr)) return true;
        return false;
      });

      // Special handling for Mobile / Device Type
      if (!matchedOpt && (targetStr.includes('mobile') || optVal.includes('mobile') || targetStr.includes('mobil') || targetStr.includes('device'))) {
        matchedOpt = selectOptions.find((o) => {
          const val = o.value.toLowerCase().trim();
          const txt = o.text.toLowerCase().trim();
          return (
            txt === 'mobile' ||
            txt === 'mobil' ||
            txt.includes('mobile') ||
            txt.includes('mobil') ||
            txt.includes('cell') ||
            val === 'mobile' ||
            val === 'cell'
          );
        });
      }

      // Special handling for Country / +49 DE (a bare "49" inside e.g. "49000" is not a dial code)
      const mentionsDialCode49 = (s: string) => /(^|[^\d])\+?49([^\d]|$)/.test(s);
      if (!matchedOpt && (mentionsDialCode49(targetStr) || mentionsDialCode49(optVal) || targetStr.includes('germany') || targetStr.includes('deutschland'))) {
        matchedOpt = selectOptions.find((o) => {
          const val = o.value.toLowerCase().trim();
          const txt = o.text.toLowerCase().trim();
          return (
            txt.includes('+49') ||
            txt.includes('(49)') ||
            val === '+49' ||
            val === 'de' ||
            val === '49' ||
            txt.includes('germany') ||
            txt.includes('deutschland')
          );
        });
      }

      // Special handling for Degree / Master / Bachelor
      if (!matchedOpt && (targetStr.includes('master') || optVal.includes('master'))) {
        matchedOpt = selectOptions.find((o) => {
          const val = o.value.toLowerCase().trim();
          const txt = o.text.toLowerCase().trim();
          return txt.includes('master') || val.includes('master') || txt.includes('m.sc') || txt.includes('postgraduate');
        });
      }
      if (!matchedOpt && (targetStr.includes('bachelor') || optVal.includes('bachelor'))) {
        matchedOpt = selectOptions.find((o) => {
          const val = o.value.toLowerCase().trim();
          const txt = o.text.toLowerCase().trim();
          return txt.includes('bachelor') || val.includes('bachelor') || txt.includes('b.tech') || txt.includes('b.e') || txt.includes('undergraduate');
        });
      }

      // Fallback: whole-word match
      if (!matchedOpt && targetStr.length > 2) {
        matchedOpt = selectOptions.find((o) => {
          const val = o.value.toLowerCase().trim();
          const txt = o.text.toLowerCase().trim();
          return containsPhrase(txt, targetStr) || (!!val && containsPhrase(val, targetStr));
        });
      }

      if (matchedOpt) {
        this.setNativeSelectValue(selectEl, matchedOpt.value);
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        selectEl.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      // A remembered option code may no longer exist on this form. Assigning
      // it would clear the user's selection while falsely reporting success.
      return false;
    }

    if (type === 'checkbox') {
      // Boolean("false") is true, so parse the stored value explicitly.
      const shouldCheck = isTruthyAnswer(match.targetValue);
      if (inputEl.checked !== shouldCheck) {
        if (typeof inputEl.click === 'function') {
          inputEl.click();
          return inputEl.checked === shouldCheck;
        }
        inputEl.checked = shouldCheck;
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('click', { bubbles: true }));
      }
      return true;
    }

    if (type === 'radio') {
      const shouldCheck = isTruthyAnswer(match.targetValue);
      if (shouldCheck) {
        if (!inputEl.checked && typeof inputEl.click === 'function') {
          inputEl.click();
          return inputEl.checked;
        }
        inputEl.checked = true;
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('click', { bubbles: true }));
      }
      return shouldCheck;
    }

    if (type === 'file') {
      targetEl.classList.add('job-autofill-review');
      targetEl.setAttribute(
        'title',
        `Job Autofill: Please select your saved document: ${match.targetValue}`
      );
      return false;
    }

    // Text / Textarea / Email / Tel / Number / Date
    let stringValue = String(match.targetValue ?? '');

    // On Workday, format phone number as clean national digits without extensions or gaps ("0000000000")
    const isWorkday = this.isWorkdayPage();

    if (
      isWorkday &&
      match.matchedProfilePath !== 'learned.correction' &&
      (type === 'tel' || match.matchedProfilePath === 'contact.phone') &&
      tag !== 'select' &&
      tag !== 'button' &&
      !match.displayLabel.includes('Country') &&
      !match.displayLabel.includes('Device')
    ) {
      stringValue = stringValue
        .replace(/^\+49\s*/, '')
        .replace(/^\+\d{1,3}\s*/, '')
        .replace(/^0/, '')
        .replace(/\D/g, ''); // "0000000000"
    }

    // 1. Focus element first so React / mask onFocus handler doesn't wipe our value
    if (typeof targetEl.focus === 'function') {
      targetEl.focus();
    }
    targetEl.dispatchEvent(new Event('focus', { bubbles: true }));

    // 2. Select any current content to emulate user typing replacement
    if (typeof (targetEl as HTMLInputElement).select === 'function') {
      try {
        (targetEl as HTMLInputElement).select();
      } catch {
        // ignore
      }
    }

    // 3. Set native value using prototype descriptor
    this.setNativeValue(targetEl, stringValue);

    // 4. Dispatch input insertion via execCommand if supported
    this.insertTextIntoFocused(targetEl, stringValue);

    // 5. Ensure native value is synchronized
    if ((targetEl as HTMLInputElement).value !== stringValue) {
      this.setNativeValue(targetEl, stringValue);
    }

    // 6. Dispatch full suite of React/Vue/Angular synthetic keyboard and input events
    const lastKey = stringValue.slice(-1) || 'a';
    targetEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: lastKey }));
    targetEl.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: lastKey }));
    targetEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: stringValue }));
    targetEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: lastKey }));
    targetEl.dispatchEvent(new Event('change', { bubbles: true }));

    // 7. Blur
    targetEl.dispatchEvent(new Event('blur', { bubbles: true }));
    if (typeof targetEl.blur === 'function') {
      targetEl.blur();
    }

    // 8. If filling a phone number input, verify and auto-correct adjacent country calling code selector to +49 DE and device type to Mobile
    if (match.matchedProfilePath !== 'learned.correction' && (type === 'tel' || match.matchedProfilePath === 'contact.phone')) {
      await this.ensureCountryCodeSelected(targetEl);
      await this.ensurePhoneDeviceSelected(targetEl);
    }

    return true;
  }

  /**
   * Fail-safe: Guarantees that any adjacent country calling code selector is switched to +49 DE
   * when filling the phone number input.
   */
  private async ensureCountryCodeSelected(phoneInputEl: HTMLElement): Promise<void> {
    try {
      const container =
        phoneInputEl.closest('[class*="item"], [class*="field"], [class*="group"], [class*="control"], [class*="row"], div') ||
        phoneInputEl.parentElement;
      if (!container) return;

      // Find any button or select in this container acting as country code
      const candidateButtons = this.dropdownTriggersIn(container, 'button, [role="combobox"], [aria-haspopup], [class*="select"], [class*="country"]');

      for (const btn of candidateButtons) {
        if (btn === phoneInputEl || this.learnedElements.has(btn)) continue;
        const text = (btn.textContent || '').trim();
        // Check if button is showing a country code (like "US +1" or "+1") and not already "+49"
        const hasDialCode = /\+[0-9]{1,4}/.test(text) || /\b(US|DE|UK|CA|IN)\s*\+\d+/i.test(text);
        const isAlreadyGermany = text.includes('+49');

        if (hasDialCode && !isAlreadyGermany) {
          // Trigger the combobox fill for +49 DE
          await this.fillSingleField({
            detectedField: {
              id: 'country-code-fallback',
              element: btn,
              tag: 'button',
              type: 'select',
              name: 'country_code',
              htmlId: btn.id || '',
              placeholder: '',
              autocomplete: '',
              ariaLabel: btn.getAttribute('aria-label') || 'Country Code',
              ariaLabelledBy: '',
              ariaDescribedBy: '',
              labelText: 'Country Code',
              surroundingText: '',
              fieldsetLegend: '',
              options: [],
              currentValue: text,
              isRequired: false,
              isDisabled: false,
              isReadOnly: false,
              isVisible: true,
              rect: btn.getBoundingClientRect ? btn.getBoundingClientRect() : { top: 0, left: 0, width: 0, height: 0 }
            },
            matchedProfilePath: 'contact.phone',
            targetValue: '+49 DE',
            selectedOptionValue: '+49',
            displayLabel: 'Country Calling Code (+49 DE)',
            confidence: 1.0,
            confidenceLevel: 'high',
            matchReason: 'Phone adjacent country code auto-correction to +49 DE',
            suggestedAction: 'fill',
            isSensitive: false
          });
          break;
        }
      }
    } catch (err) {
      console.warn('Job Autofill: Error ensuring country code selection', err);
    }
  }

  /**
   * Fail-safe: Guarantees that Phone Device Type is selected as "Mobile"
   * when filling the phone number section.
   */
  private async ensurePhoneDeviceSelected(phoneInputEl: HTMLElement): Promise<void> {
    try {
      const section =
        phoneInputEl.closest('fieldset, [class*="section"], [class*="card"], [class*="form-item"], [class*="group"], form') ||
        phoneInputEl.parentElement?.parentElement;
      if (!section) return;

      // 1. Check if there is an unselected <select> in this section for Phone Device Type
      const selects = Array.from(section.querySelectorAll<HTMLSelectElement>('select'));
      for (const sel of selects) {
        if (this.learnedElements.has(sel)) continue;
        const hasMobileOpt = Array.from(sel.options).some((o) =>
          /^(mobile|mobil|cell|cellular)$/i.test(o.text.trim()) || /^(mobile|mobil|cell|cellular)$/i.test(o.value.trim())
        );
        const selVal = (sel.value || '').toLowerCase().trim();
        const isNotSelected = !selVal || selVal.includes('select') || selVal === '0';

        if (hasMobileOpt && isNotSelected) {
          const mobileOpt = Array.from(sel.options).find((o) =>
            /^(mobile|mobil|cell|cellular)$/i.test(o.text.trim()) || /^(mobile|mobil|cell|cellular)$/i.test(o.value.trim())
          );
          if (mobileOpt) {
            this.setNativeSelectValue(sel, mobileOpt.value);
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }
        }
      }

      // 2. Check if there is an unselected custom button/dropdown trigger for Phone Device Type
      const candidateButtons = this.dropdownTriggersIn(section, 'button, [role="combobox"], [aria-haspopup], [class*="select"]');
      for (const btn of candidateButtons) {
        if (btn === phoneInputEl || this.learnedElements.has(btn)) continue;
        const text = (btn.textContent || '').trim();
        const isSelectPlaceholder = /select\s*one|bitte\s*ausw|choose/i.test(text);
        const btnLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const parentText = (btn.parentElement?.textContent || '').toLowerCase();
        const isPhoneDeviceBtn =
          btnLabel.includes('device') ||
          btnLabel.includes('type') ||
          parentText.includes('device type') ||
          parentText.includes('phone device') ||
          parentText.includes('telefontyp');

        if (isSelectPlaceholder || isPhoneDeviceBtn) {
          await this.fillSingleField({
            detectedField: {
              id: 'phone-device-fallback',
              element: btn,
              tag: btn.tagName.toLowerCase(),
              type: 'select',
              name: 'phone_device',
              htmlId: btn.id || '',
              placeholder: '',
              autocomplete: '',
              ariaLabel: btn.getAttribute('aria-label') || 'Phone Device Type',
              ariaLabelledBy: '',
              ariaDescribedBy: '',
              labelText: 'Phone Device Type',
              surroundingText: '',
              fieldsetLegend: '',
              options: [],
              currentValue: text,
              isRequired: false,
              isDisabled: false,
              isReadOnly: false,
              isVisible: true,
              rect: btn.getBoundingClientRect ? btn.getBoundingClientRect() : { top: 0, left: 0, width: 0, height: 0 }
            },
            matchedProfilePath: 'contact.phone',
            targetValue: 'Mobile',
            selectedOptionValue: 'Mobile',
            displayLabel: 'Phone Device Type (Mobile)',
            confidence: 1.0,
            confidenceLevel: 'high',
            matchReason: 'Phone adjacent device type auto-selection -> Mobile',
            suggestedAction: 'fill',
            isSensitive: false
          });
          break;
        }
      }
    } catch (err) {
      console.warn('Job Autofill: Error ensuring phone device selection', err);
    }
  }

  /**
   * Dropdown triggers within `root`. Elements inside an option list are excluded:
   * Tesla renders its country-code options ("Andorra +376", ...) next to the
   * phone input, and treating those as triggers clicked a random country.
   * Native <select>s are excluded too; they are set directly, never clicked.
   */
  private dropdownTriggersIn(root: Element, selector: string): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      (el) =>
        el.tagName !== 'SELECT' &&
        !el.closest('[role="listbox"], [role="option"], [role="menu"], [role="tooltip"]') &&
        (el.tagName === 'BUTTON' || el.getAttribute('role') === 'combobox' || el.hasAttribute('aria-haspopup'))
    );
  }

  /**
   * Finds the option list that belongs to a dropdown trigger: the one it names via
   * aria-controls/aria-owns, else the nearest one around the trigger, else any
   * list that is currently visible (popups portalled to <body>). Taking the first
   * listbox-like element in the document picked unrelated menus, e.g. Tesla's
   * site-header modal instead of the phone country-code list.
   */
  private findPopupForTrigger(trigger: HTMLElement): HTMLElement | null {
    const popupSelector =
      '[role="listbox"], [role="menu"], [class*="listbox"], [class*="dropdown-menu"], [class*="dropdown_menu"], [class*="select-options"], [class*="options-container"], .dropdown-menu';

    const ownedId = trigger.getAttribute('aria-controls') || trigger.getAttribute('aria-owns');
    const owned = ownedId ? document.getElementById(ownedId) : null;
    if (owned) return owned;

    let node: HTMLElement | null = trigger.parentElement;
    for (let depth = 0; node && depth < 4 && node !== document.body && node.tagName !== 'FORM'; depth++) {
      const near = node.querySelector<HTMLElement>(popupSelector);
      if (near && !near.contains(trigger)) return near;
      node = node.parentElement;
    }

    const visible = Array.from(
      document.querySelectorAll<HTMLElement>(`${popupSelector}, [role="dialog"], [class*="popover"], [class*="flyout"]`)
    ).find((candidate) => !candidate.contains(trigger) && this.isShown(candidate) && !candidate.closest('header, nav'));
    return visible || null;
  }

  private isShown(el: HTMLElement): boolean {
    if (typeof window === 'undefined' || !el.getClientRects || el.getClientRects().length === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  /**
   * Emulates typing via execCommand('insertText') for frameworks that only
   * listen to real edits. execCommand writes into the document's current text
   * selection, not into a given element: on inputs without a text selection
   * (number, date, ...) or when focus did not move, the text lands in the
   * previously edited field instead (e.g. a start date appended to the salary).
   */
  private insertTextIntoFocused(el: HTMLElement, value: string): void {
    const tag = el.tagName.toLowerCase();
    const type = ((el as HTMLInputElement).type || '').toLowerCase();
    const supportsSelection = tag === 'textarea' || (tag === 'input' && ['text', 'search', 'url', 'tel', 'email', 'password', ''].includes(type));
    if (!supportsSelection || typeof document === 'undefined' || document.activeElement !== el || !document.execCommand) {
      return;
    }
    try {
      document.execCommand('insertText', false, value);
    } catch {
      // ignore
    }
  }

  /**
   * Sets the value of a <select> element using prototype descriptor and selected option to satisfy React 16+
   */
  private setNativeSelectValue(selectEl: HTMLSelectElement, value: string): void {
    const prototype = window.HTMLSelectElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

    if (descriptor && descriptor.set) {
      descriptor.set.call(selectEl, value);
    } else {
      selectEl.value = value;
    }

    const options = Array.from(selectEl.options);
    for (const opt of options) {
      if (opt.value === value) {
        opt.selected = true;
        selectEl.selectedIndex = opt.index;
        break;
      }
    }
  }

  /**
   * Sets the value of an input element using prototype descriptor to satisfy React/Vue 16+
   */
  private setNativeValue(element: HTMLElement, value: string): void {
    const tag = element.tagName.toLowerCase();
    const prototype =
      tag === 'textarea'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      (element as any).value = value;
    }
  }

  /**
   * Clears all fields that were filled during the current session.
   */
  public clearFilledFields(): void {
    this.rememberedReplayStopped = true;
    // Restore newest-first so a field filled twice ends at its value from before the first fill.
    for (const record of [...this.filledHistory].reverse()) {
      const el = record.element as HTMLInputElement;
      try {
        const tag = el.tagName.toLowerCase();
        if (tag === 'select') {
          this.setNativeSelectValue(el as unknown as HTMLSelectElement, record.originalValue);
        } else if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) {
          if (record.originalChecked !== undefined) el.checked = record.originalChecked;
        } else if (tag === 'input' || tag === 'textarea') {
          this.setNativeValue(el, record.originalValue);
        } else {
          // Custom comboboxes (buttons/divs) have no value to restore.
          continue;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {
        console.warn('Job Autofill: Could not restore field', err);
      } finally {
        el.classList.remove('job-autofill-filled');
        el.classList.remove('job-autofill-review');
        el.classList.remove('job-autofill-pulse');
      }
    }

    this.filledHistory = [];
    this.stopDynamicObserver();
    UIOverlay.removeToast();
  }

  /**
   * Monitors dynamic DOM mutations (single page apps, multi-step forms, modal popups)
   */
  private startDynamicObserver(_profile: UserProfile): void {
    if (this.isObserving || typeof MutationObserver === 'undefined') return;

    this.observer = new MutationObserver((mutations) => {
      if (this.isFilling) return;
      let hasNewInputs = false;
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (
              el.tagName === 'INPUT' ||
              el.tagName === 'SELECT' ||
              el.tagName === 'TEXTAREA' ||
              el.querySelector('input, select, textarea')
            ) {
              hasNewInputs = true;
              break;
            }
          }
        }
        if (hasNewInputs) break;
      }

      if (hasNewInputs) {
        // Debounce: multi-step forms add many nodes in one go.
        clearTimeout(this.observerTimer);
        this.observerTimer = setTimeout(() => void this.autofillNewFields(), 600);
      }
    });

    this.observer.observe(document.body, { childList: true, subtree: true });
    this.isObserving = true;
  }

  /**
   * Fill fields that appeared after autofill was started on this page (a
   * "+ add" button, the next step of a multi-step form). Settings are re-read on
   * every run so turning autofill off takes effect without a reload; only empty,
   * untouched fields with confident values are filled (see isUntouchedAndEmpty).
   */
  private async autofillNewFields(): Promise<void> {
    if (!this.isObserving) return;
    if (this.isFilling) {
      // Fields that appear while a fill is running are picked up right after it.
      clearTimeout(this.observerTimer);
      this.observerTimer = setTimeout(() => void this.autofillNewFields(), 600);
      return;
    }
    const profile = await ProfileStorage.getProfile();
    if (!profile.settings.autofillEnabled || !this.isActivePage()) return;
    await this.runAutofill(profile, false, true);
  }

  /** Stop filling newly appearing fields (after Clear, the candidate wants the page left alone). */
  private stopDynamicObserver(): void {
    clearTimeout(this.observerTimer);
    this.observer?.disconnect();
    this.observer = null;
    this.isObserving = false;
  }

  /**
   * Directly fills one or more fields corresponding to a learned question answer.
   */
  public async fillAnswerForFields(
    fieldIds: string[],
    answer: string,
    _profile: UserProfile
  ): Promise<boolean> {
    this.isFilling = true;
    try {
      return await this.fillAnswer(fieldIds, answer);
    } finally {
      this.isFilling = false;
    }
  }

  private async fillAnswer(fieldIds: string[], answer: string): Promise<boolean> {
    const fields = FieldDetector.detectFields(document);
    const targetFields = fields.filter((f) => fieldIds.includes(f.id));

    if (targetFields.length === 0) return false;

    let anySuccess = false;

    for (const field of targetFields) {
      if (field.type === 'radio') {
        const isTarget = radioOptionMatchesAnswer(
          field.labelText || field.currentValue || '',
          getOptionValue(field.element, field.currentValue || ''),
          answer
        );

        if (isTarget) {
          const match: FieldMatchResult = {
            detectedField: field,
            matchedProfilePath: 'customQA.answer',
            targetValue: true,
            displayLabel: field.labelText || 'Learned Radio Option',
            confidence: 0.99,
            confidenceLevel: 'high',
            matchReason: 'Direct user learned answer',
            suggestedAction: 'fill',
            isSensitive: false
          };
          const ok = await this.fillSingleField(match);
          if (ok) {
            field.element.classList.add('job-autofill-filled');
            UIOverlay.scrollToAndPulseField(field.element);
            anySuccess = true;
          }
        }
      } else if (field.type === 'checkbox') {
        const isTrue = /^(true|yes|ja|1|checked)$/i.test(answer.trim());
        const match: FieldMatchResult = {
          detectedField: field,
          matchedProfilePath: 'customQA.answer',
          targetValue: isTrue,
          displayLabel: field.labelText || 'Learned Checkbox',
          confidence: 0.99,
          confidenceLevel: 'high',
          matchReason: 'Direct user learned answer',
          suggestedAction: 'fill',
          isSensitive: false
        };
        const ok = await this.fillSingleField(match);
        if (ok) {
          field.element.classList.add('job-autofill-filled');
          UIOverlay.scrollToAndPulseField(field.element);
          anySuccess = true;
        }
      } else if (field.type === 'select' || field.type === 'combobox') {
        const bestOpt = this.matcher.findBestSelectOption(field.options || [], answer);
        const match: FieldMatchResult = {
          detectedField: field,
          matchedProfilePath: 'customQA.answer',
          targetValue: answer,
          selectedOptionValue: bestOpt || answer,
          displayLabel: field.labelText || 'Learned Select Option',
          confidence: 0.99,
          confidenceLevel: 'high',
          matchReason: 'Direct user learned answer',
          suggestedAction: 'fill',
          isSensitive: false
        };
        const ok = await this.fillSingleField(match);
        if (ok) {
          field.element.classList.add('job-autofill-filled');
          UIOverlay.scrollToAndPulseField(field.element);
          anySuccess = true;
        }
      } else {
        // Text / Textarea
        const match: FieldMatchResult = {
          detectedField: field,
          matchedProfilePath: 'customQA.answer',
          targetValue: answer,
          displayLabel: field.labelText || 'Learned Input',
          confidence: 0.99,
          confidenceLevel: 'high',
          matchReason: 'Direct user learned answer',
          suggestedAction: 'fill',
          isSensitive: false
        };
        const ok = await this.fillSingleField(match);
        if (ok) {
          field.element.classList.add('job-autofill-filled');
          UIOverlay.scrollToAndPulseField(field.element);
          anySuccess = true;
        }
      }
    }

    return anySuccess;
  }

  /**
   * Automatically populates all work experience entries into Workday application forms,
   * clicking 'Add Another' as needed for multiple experiences.
   */
  public async fillWorkdayWorkExperience(profile: UserProfile): Promise<number> {
    const experiences = profile.experience || [];
    if (experiences.length === 0) return 0;

    // Only on Workday: this routine clicks "Add" buttons and fills whole blocks,
    // which is unsafe on arbitrary forms that merely have a "Work experience" heading.
    if (!this.isWorkdayPage()) {
      return 0;
    }

    let filledCount = 0;

    for (let i = 0; i < experiences.length; i++) {
      const exp = experiences[i];
      let jobInputs = this.findWorkdayJobTitleInputs();

      // If this block doesn't exist yet, click "Add Another"
      if (i >= jobInputs.length) {
        const addBtn = this.findWorkdayAddAnotherButton();
        if (addBtn) {
          addBtn.scrollIntoView?.({ block: 'center' });
          addBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          addBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          addBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          addBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          addBtn.click();

          // Wait for the new block to mount
          await this.waitForWorkdayBlock(jobInputs.length, 1500);
          jobInputs = this.findWorkdayJobTitleInputs();
        }
      }

      // If the block exists now, fill it
      if (i < jobInputs.length) {
        const jobInput = jobInputs[i];
        const blockContainer = this.findBlockContainer(jobInput, jobInputs, /^workexperience-\d+$/, this.findWorkdaySchoolInputs());
        const count = await this.fillSingleExperienceBlock(blockContainer, exp, i);
        filledCount += count;
      }
    }

    return filledCount;
  }

  private findWorkdayJobTitleInputs(): HTMLInputElement[] {
    if (typeof document === 'undefined') return [];
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[data-automation-id="jobTitle"], input[data-automation-id*="jobTitle"], input[id*="jobTitle"], input[name*="jobTitle"], input[aria-label*="Job Title"], input[aria-label*="Position"]'
      )
    );

    // Also check inputs whose associated label is "Job Title" or "Position"
    if (inputs.length === 0) {
      const allTextInputs = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])')
      );
      for (const inp of allTextInputs) {
        const label = (inp.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (inp.placeholder || '').toLowerCase();
        const parentText = (inp.parentElement?.textContent || '').toLowerCase();
        if (
          label.includes('job title') ||
          label.includes('jobtitel') ||
          placeholder.includes('job title') ||
          parentText.includes('job title') ||
          parentText.includes('jobtitel')
        ) {
          if (!inputs.includes(inp)) {
            inputs.push(inp);
          }
        }
      }
    }

    return inputs;
  }

  private findCompanyInputs(): HTMLInputElement[] {
    if (typeof document === 'undefined') return [];
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[data-automation-id="company"], input[data-automation-id*="company"], input[id*="company"], input[name*="company"], input[aria-label*="Company"], input[aria-label*="Employer"]'
      )
    );
  }

  private findLocationInputs(): HTMLInputElement[] {
    if (typeof document === 'undefined') return [];
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[data-automation-id="location"], input[data-automation-id*="location"], input[id*="location"], input[name*="location"], input[aria-label*="Location"], input[aria-label*="City"]'
      )
    );
  }

  private findCurrentlyWorkCheckboxes(): HTMLInputElement[] {
    if (typeof document === 'undefined') return [];
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][data-automation-id*="current"], input[type="checkbox"][data-automation-id*="currentlyWork"], input[type="checkbox"][aria-label*="current"]'
      )
    );
  }

  private findDescriptionTextareas(): HTMLTextAreaElement[] {
    if (typeof document === 'undefined') return [];
    return Array.from(
      document.querySelectorAll<HTMLTextAreaElement>(
        'textarea[data-automation-id="roleDescription"], textarea[data-automation-id*="description"], textarea'
      )
    );
  }

  /**
   * Finds the container of one repeated block (one job / one degree) around `anchor`.
   *
   * Climbs while the ancestor still holds only this block. It stops at the
   * block's own Workday wrapper (e.g. "workExperience-2"), at the form/main
   * boundary, and before swallowing another section (`foreignAnchors`). Without
   * these stops a single block grew to the whole page, so block-scoped lookups
   * like "first checkbox" or "first textarea" hit unrelated fields.
   */
  private findBlockContainer(
    anchor: HTMLElement,
    siblingAnchors: HTMLElement[],
    blockIdPattern: RegExp,
    foreignAnchors: HTMLElement[]
  ): HTMLElement {
    let curr: HTMLElement | null = anchor.parentElement;
    let bestContainer: HTMLElement = anchor.parentElement || anchor;

    while (curr && curr !== document.body) {
      if (curr.matches('form, main, [role="main"]')) break;
      if (siblingAnchors.filter((a) => curr!.contains(a)).length > 1) break;
      if (foreignAnchors.some((a) => curr!.contains(a))) break;

      bestContainer = curr;
      const aid = (curr.getAttribute('data-automation-id') || '').toLowerCase();
      if (blockIdPattern.test(aid)) break;
      curr = curr.parentElement;
    }

    return bestContainer;
  }

  private findWorkdayAddAnotherButton(): HTMLButtonElement | null {
    if (typeof document === 'undefined') return null;

    // First look inside the work experience section if available
    const weSection =
      document.querySelector('[data-automation-id*="workExperienceSection"]') ||
      document.querySelector('[data-automation-id*="workExperience"]')?.closest('fieldset, [class*="section"], div');

    const searchRoot = weSection || document;
    const buttons = Array.from(searchRoot.querySelectorAll<HTMLButtonElement>('button'));

    // 1. Exact data-automation-id
    const byAutoId = buttons.find((b) => {
      const aid = (b.getAttribute('data-automation-id') || '').toLowerCase();
      return (
        aid === 'add another' ||
        aid.includes('add-button') ||
        aid.includes('addanother') ||
        aid.includes('add-work-experience')
      );
    });
    if (byAutoId) return byAutoId;

    // 2. Exact or partial button text
    const byText = buttons.find((b) => {
      const t = (b.textContent || '').trim().toLowerCase();
      return (
        t === 'add another' ||
        t === 'add' ||
        t === 'add experience' ||
        t.includes('add another') ||
        t.includes('weitere erfahrung')
      );
    });
    if (byText) return byText;

    // 3. Aria-label
    const byAria = buttons.find((b) => {
      const a = (b.getAttribute('aria-label') || '').trim().toLowerCase();
      return a.includes('add another') || a.includes('add experience');
    });
    return byAria || null;
  }

  private async waitForWorkdayBlock(previousCount: number, timeoutMs: number = 1500): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const current = this.findWorkdayJobTitleInputs().length;
      if (current > previousCount) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    return false;
  }

  private async fillSingleExperienceBlock(
    container: HTMLElement,
    exp: any,
    index: number
  ): Promise<number> {
    let filled = 0;

    // 1. Job Title
    const jobInput =
      container.querySelector<HTMLInputElement>(
        'input[data-automation-id="jobTitle"], input[data-automation-id*="jobTitle"], input[id*="jobTitle"], input[name*="jobTitle"], input[aria-label*="Job Title"]'
      ) || this.findWorkdayJobTitleInputs()[index];

    if (jobInput && exp.jobTitle) {
      this.fillValueDirectly(jobInput, exp.jobTitle);
      filled++;
    }

    // 2. Company
    const companyInput =
      container.querySelector<HTMLInputElement>(
        'input[data-automation-id="company"], input[data-automation-id*="company"], input[id*="company"], input[name*="company"], input[aria-label*="Company"]'
      ) || this.findCompanyInputs()[index];

    if (companyInput && exp.company) {
      this.fillValueDirectly(companyInput, exp.company);
      filled++;
    }

    // 3. Location
    const locationInput =
      container.querySelector<HTMLInputElement>(
        'input[data-automation-id="location"], input[data-automation-id*="location"], input[id*="location"], input[name*="location"], input[aria-label*="Location"]'
      ) || this.findLocationInputs()[index];

    if (locationInput && exp.location) {
      this.fillValueDirectly(locationInput, exp.location);
      filled++;
    }

    // 4. Currently work here (checkbox). Only explicitly labelled checkboxes: a generic
    // "first checkbox" fallback could tick an unrelated declaration.
    const currentCheckbox =
      container.querySelector<HTMLInputElement>(
        'input[type="checkbox"][data-automation-id*="current"], input[type="checkbox"][aria-label*="current"]'
      ) ||
      this.findCurrentlyWorkCheckboxes()[index];

    if (currentCheckbox) {
      const shouldCheck = Boolean(exp.currentlyWorkingHere);
      this.fillCheckboxDirectly(currentCheckbox, shouldCheck);
      filled++;
    }

    // 5. From Date (startDate)
    const fromFormatted = WorkdayAdapter.formatToMMYYYY(exp.startDate);
    const dateInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>(
        'input[data-automation-id*="date"], input[placeholder*="YYYY"], input[placeholder*="yyyy"], input[placeholder*="MM"]'
      )
    );

    let fromInput = container.querySelector<HTMLInputElement>(
      'input[data-automation-id="startDate"], input[data-automation-id*="startDate"], input[data-automation-id*="from"], input[aria-label*="From"], input[aria-label*="Start Date"]'
    );
    if (!fromInput && dateInputs.length > 0) {
      fromInput = dateInputs[0];
    }
    if (fromInput && fromFormatted) {
      this.fillValueDirectly(fromInput, fromFormatted);
      filled++;
    }

    // 6. To Date (endDate)
    if (!exp.currentlyWorkingHere) {
      const toFormatted = WorkdayAdapter.formatToMMYYYY(exp.endDate);
      let toInput = container.querySelector<HTMLInputElement>(
        'input[data-automation-id="endDate"], input[data-automation-id*="endDate"], input[data-automation-id*="to"], input[aria-label*="To"], input[aria-label*="End Date"]'
      );
      if (!toInput && dateInputs.length > 1) {
        toInput = dateInputs[1];
      }
      if (toInput && toFormatted) {
        this.fillValueDirectly(toInput, toFormatted);
        filled++;
      }
    }

    // 7. Role Description (textarea)
    const descTextarea =
      container.querySelector<HTMLTextAreaElement>(
        'textarea[data-automation-id="roleDescription"], textarea[data-automation-id*="description"], textarea'
      ) || this.findDescriptionTextareas()[index];

    const formattedRoleDesc = WorkdayAdapter.formatRoleDescription(exp) || exp.description;
    if (descTextarea && formattedRoleDesc) {
      this.fillValueDirectly(descTextarea, formattedRoleDesc);
      filled++;
    }

    return filled;
  }

  private fillCheckboxDirectly(checkbox: HTMLInputElement, shouldCheck: boolean): void {
    if (!checkbox) return;
    this.touched.add(checkbox);
    // Record the state before changing it, otherwise Clear has nothing to restore.
    this.filledHistory.push({
      element: checkbox,
      originalValue: '',
      originalChecked: checkbox.checked
    });
    if (checkbox.checked !== shouldCheck) {
      checkbox.checked = shouldCheck;
      checkbox.dispatchEvent(new Event('input', { bubbles: true }));
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    checkbox.classList.remove('job-autofill-review');
    checkbox.classList.add('job-autofill-filled');
  }

  private fillValueDirectly(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    if (!el) return;
    this.touched.add(el);
    this.filledHistory.push({
      element: el,
      originalValue: el.value || ''
    });
    if (typeof el.focus === 'function') el.focus();
    el.dispatchEvent(new Event('focus', { bubbles: true }));

    if (typeof el.select === 'function') {
      try {
        el.select();
      } catch {
        // ignore
      }
    }

    this.setNativeValue(el, value);
    this.insertTextIntoFocused(el, value);

    if (el.value !== value) {
      this.setNativeValue(el, value);
    }

    const lastKey = value.slice(-1) || 'a';
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: lastKey }));
    el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: lastKey }));
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: lastKey }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    el.dispatchEvent(new Event('blur', { bubbles: true }));
    if (typeof el.blur === 'function') el.blur();

    el.classList.remove('job-autofill-review');
    el.classList.add('job-autofill-filled');
  }

  private isWorkdayPage(): boolean {
    if (typeof window === 'undefined') return false;
    return WorkdayAdapter.isWorkdayPage(window.location.href, typeof document !== 'undefined' ? document : undefined);
  }

  /**
   * Automatically populates all education entries into Workday application forms,
   * clicking 'Add Another' as needed for multiple education degrees.
   */
  public async fillWorkdayEducation(profile: UserProfile): Promise<number> {
    const educations = profile.education || [];
    if (educations.length === 0) return 0;

    // Only on Workday (see fillWorkdayWorkExperience).
    if (!this.isWorkdayPage()) {
      return 0;
    }

    let filledCount = 0;

    for (let i = 0; i < educations.length; i++) {
      const edu = educations[i];
      let schoolInputs = this.findWorkdaySchoolInputs();

      // If this block doesn't exist yet, click "Add Another" in Education section
      if (i >= schoolInputs.length) {
        const addBtn = this.findWorkdayEducationAddAnotherButton();
        if (addBtn) {
          addBtn.scrollIntoView?.({ block: 'center' });
          addBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          addBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          addBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          addBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          addBtn.click();

          // Wait for new education block to mount
          await this.waitForWorkdayEducationBlock(schoolInputs.length, 1500);
          schoolInputs = this.findWorkdaySchoolInputs();
        }
      }

      // If block exists now, fill it
      if (i < schoolInputs.length) {
        const schoolInput = schoolInputs[i];
        const blockContainer = this.findBlockContainer(schoolInput, schoolInputs, /^education-\d+$/, this.findWorkdayJobTitleInputs());
        const count = await this.fillSingleEducationBlock(blockContainer, edu, i);
        filledCount += count;
      }
    }

    return filledCount;
  }

  private findWorkdaySchoolInputs(): HTMLInputElement[] {
    if (typeof document === 'undefined') return [];
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[data-automation-id="school"], input[data-automation-id*="school"], input[id*="school"], input[name*="school"], input[aria-label*="School"], input[aria-label*="University"], input[aria-label*="Universität"]'
      )
    );

    if (inputs.length === 0) {
      const allTextInputs = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])')
      );
      for (const inp of allTextInputs) {
        const label = (inp.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (inp.placeholder || '').toLowerCase();
        const parentText = (inp.parentElement?.textContent || '').toLowerCase();
        if (
          label.includes('school') ||
          label.includes('university') ||
          label.includes('universität') ||
          placeholder.includes('school') ||
          parentText.includes('school or university') ||
          parentText.includes('schule oder universität')
        ) {
          if (!inputs.includes(inp)) {
            inputs.push(inp);
          }
        }
      }
    }

    return inputs;
  }

  private findWorkdayFieldOfStudyInputs(): HTMLInputElement[] {
    if (typeof document === 'undefined') return [];
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[data-automation-id="field-of-study"], input[data-automation-id="fieldofstudy"], input[data-automation-id*="fieldOfStudy"], input[id*="fieldOfStudy"], input[name*="fieldOfStudy"], input[aria-label*="Field of Study"], input[aria-label*="Studienfach"]'
      )
    );
  }

  private findWorkdayEducationSection(): HTMLElement | null {
    if (typeof document === 'undefined') return null;

    const byAutoId = document.querySelector<HTMLElement>(
      '[data-automation-id*="educationSection"], [data-automation-id="education"]'
    );
    if (byAutoId) return byAutoId;

    const headings = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, legend, [class*="title"], [class*="header"]'));
    for (const h of headings) {
      const text = (h.textContent || '').trim().toLowerCase();
      if (text === 'education' || text === 'ausbildung' || text.startsWith('education') || text.startsWith('ausbildung')) {
        const section = h.closest('fieldset, [class*="section"], [class*="card"], [class*="panel"], [data-automation-id*="section"], form') || h.parentElement;
        if (section) return section as HTMLElement;
      }
    }

    const schoolInputs = this.findWorkdaySchoolInputs();
    if (schoolInputs.length > 0) {
      let curr: HTMLElement | null = schoolInputs[0].parentElement;
      while (curr && curr !== document.body) {
        if (
          curr.getAttribute('data-automation-id')?.toLowerCase().includes('education') ||
          /education\s*\d+/i.test(curr.textContent || '')
        ) {
          return curr;
        }
        curr = curr.parentElement;
      }
      return schoolInputs[0].closest('fieldset, [class*="section"], [class*="card"], div') || null;
    }

    return null;
  }

  private findWorkdayEducationAddAnotherButton(): HTMLButtonElement | null {
    const eduSection = this.findWorkdayEducationSection();
    const searchRoot = eduSection || document;
    const buttons = Array.from(searchRoot.querySelectorAll<HTMLButtonElement>('button'));

    const byAutoId = buttons.find((b) => {
      const aid = (b.getAttribute('data-automation-id') || '').toLowerCase();
      return aid === 'add another' || aid.includes('add-button') || aid.includes('addanother') || aid.includes('add-education');
    });
    if (byAutoId) return byAutoId;

    const byText = buttons.find((b) => {
      const t = (b.textContent || '').trim().toLowerCase();
      return t === 'add another' || t === 'add' || t === 'add education' || t.includes('add another');
    });
    if (byText) return byText;

    const byAria = buttons.find((b) => {
      const a = (b.getAttribute('aria-label') || '').trim().toLowerCase();
      return a.includes('add another') || a.includes('add education');
    });
    return byAria || null;
  }

  private async waitForWorkdayEducationBlock(previousCount: number, timeoutMs: number = 1500): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const current = this.findWorkdaySchoolInputs().length;
      if (current > previousCount) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    return false;
  }

  private async fillSingleEducationBlock(
    container: HTMLElement,
    edu: any,
    index: number
  ): Promise<number> {
    let filled = 0;

    // 1. School or University
    const schoolInput =
      container.querySelector<HTMLInputElement>(
        'input[data-automation-id="school"], input[data-automation-id*="school"], input[id*="school"], input[name*="school"], input[aria-label*="School"], input[aria-label*="University"]'
      ) || this.findWorkdaySchoolInputs()[index];

    if (schoolInput && edu.university) {
      this.fillValueDirectly(schoolInput, edu.university);
      filled++;
    }

    // 2. Degree (Select or custom combobox)
    const degreeEl =
      container.querySelector<HTMLElement>(
        'select[data-automation-id*="degree"], button[data-automation-id*="degree"], [data-automation-id="degree"], select, [aria-label*="Degree"], [aria-label*="Abschluss"]'
      );

    if (degreeEl && edu.degree) {
      const isMaster = edu.degree.toLowerCase().includes('master') || edu.degree.toLowerCase().includes('m.sc');
      const degreeText = isMaster ? "Master's Degree" : "Bachelor's Degree";

      if (degreeEl.tagName.toLowerCase() === 'select') {
        const selectEl = degreeEl as HTMLSelectElement;
        const options = Array.from(selectEl.options);
        const matched = options.find((o) => {
          const t = o.text.toLowerCase().trim();
          const v = o.value.toLowerCase().trim();
          if (isMaster) {
            return t.includes('master') || v.includes('master') || t.includes('m.sc') || t.includes('postgraduate');
          } else {
            return t.includes('bachelor') || v.includes('bachelor') || t.includes('b.tech') || t.includes('b.e') || t.includes('undergraduate');
          }
        });
        if (matched) {
          this.setNativeSelectValue(selectEl, matched.value);
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          selectEl.dispatchEvent(new Event('input', { bubbles: true }));
          filled++;
        }
      } else {
        // Combobox / Button
        await this.fillSingleField({
          detectedField: {
            id: `edu-degree-${index}`,
            element: degreeEl,
            tag: degreeEl.tagName.toLowerCase(),
            type: 'select',
            name: 'degree',
            htmlId: degreeEl.id || '',
            placeholder: '',
            autocomplete: '',
            ariaLabel: degreeEl.getAttribute('aria-label') || 'Degree',
            ariaLabelledBy: '',
            ariaDescribedBy: '',
            labelText: 'Degree',
            surroundingText: 'Education',
            fieldsetLegend: '',
            options: [],
            currentValue: '',
            isRequired: true,
            isDisabled: false,
            isReadOnly: false,
            isVisible: true,
            rect: degreeEl.getBoundingClientRect ? degreeEl.getBoundingClientRect() : { top: 0, left: 0, width: 0, height: 0 }
          },
          matchedProfilePath: index === 0 ? 'education.latest.degree' : 'education.degree',
          targetValue: degreeText,
          selectedOptionValue: degreeText,
          displayLabel: `Workday Degree (${edu.degree})`,
          confidence: 0.99,
          confidenceLevel: 'high',
          matchReason: `Workday Degree: ${edu.degree}`,
          suggestedAction: 'fill',
          isSensitive: false
        });
        filled++;
      }
    }

    // 3. Field of Study
    const fosInput =
      container.querySelector<HTMLInputElement>(
        'input[data-automation-id="field-of-study"], input[data-automation-id="fieldofstudy"], input[data-automation-id*="fieldOfStudy"], input[id*="fieldOfStudy"], input[name*="fieldOfStudy"], input[aria-label*="Field of Study"]'
      ) || this.findWorkdayFieldOfStudyInputs()[index];

    if (fosInput && edu.fieldOfStudy) {
      this.fillValueDirectly(fosInput, edu.fieldOfStudy);
      filled++;
    }

    // 4. From Date / Year
    const dateInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>(
        'input[data-automation-id*="date"], input[placeholder*="YYYY"], input[placeholder*="yyyy"], input[placeholder*="MM"]'
      )
    );

    let fromInput = container.querySelector<HTMLInputElement>(
      'input[data-automation-id="startDate"], input[data-automation-id*="startDate"], input[data-automation-id*="from"], input[aria-label*="From"], input[aria-label*="Start Year"]'
    );
    if (!fromInput && dateInputs.length > 0) {
      fromInput = dateInputs[0];
    }
    if (fromInput && edu.startDate) {
      const fromFormatted = WorkdayAdapter.formatEducationYear(edu.startDate, fromInput.placeholder);
      this.fillValueDirectly(fromInput, fromFormatted);
      filled++;
    }

    // 5. To Date / Year
    let toInput = container.querySelector<HTMLInputElement>(
      'input[data-automation-id="endDate"], input[data-automation-id*="endDate"], input[data-automation-id*="to"], input[aria-label*="To"], input[aria-label*="End Year"]'
    );
    if (!toInput && dateInputs.length > 1) {
      toInput = dateInputs[1];
    }
    if (toInput && edu.endDate) {
      const toFormatted = WorkdayAdapter.formatEducationYear(edu.endDate, toInput.placeholder);
      this.fillValueDirectly(toInput, toFormatted);
      filled++;
    }

    // 6. Overall Result / GPA
    const gpaInput = container.querySelector<HTMLInputElement>(
      'input[data-automation-id="gpa"], input[data-automation-id*="gpa"], input[data-automation-id*="grade"], input[aria-label*="GPA"], input[aria-label*="Grade"], input[aria-label*="Overall Result"]'
    );
    if (gpaInput && edu.gradeGpa) {
      this.fillValueDirectly(gpaInput, edu.gradeGpa);
      filled++;
    }

    return filled;
  }
}
