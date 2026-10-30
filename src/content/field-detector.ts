import { DetectedField, FieldElementType, DetectedOption } from '../types/engine';

export class FieldDetector {
  /**
   * Scans document, Shadow DOMs, and accessible frames for all viable job application input fields.
   */
  public static detectFields(root: Document | HTMLElement | ShadowRoot = document): DetectedField[] {
    const rawElements = this.collectElementsRecursively(root);
    const detected: DetectedField[] = [];

    for (const el of rawElements) {
      if (!this.isValidField(el)) continue;

      const field = this.extractFieldMetadata(el);
      if (field) {
        detected.push(field);
      }
    }

    return detected;
  }

  /**
   * Recursively traverses light DOM, open Shadow DOMs, and same-origin iframes.
   */
  private static collectElementsRecursively(root: Document | HTMLElement | ShadowRoot): HTMLElement[] {
    const elements: HTMLElement[] = [];
    const selector =
      'input, textarea, select, [role="combobox"], [role="radio"], [role="checkbox"], [role="textbox"], button[aria-haspopup], button[role="combobox"], button[aria-expanded], button[class*="select"], button[class*="dropdown"], button[class*="country"], button[class*="phone"]';

    try {
      const found = Array.from(root.querySelectorAll<HTMLElement>(selector));
      elements.push(...found);

      // Also collect any buttons containing phone calling codes (e.g. US +1, +49)
      const allButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
      for (const btn of allButtons) {
        const text = btn.textContent || '';
        if (/\+[0-9]{1,4}/.test(text) || /\b(US|DE|UK|CA|IN)\s*\+\d+/i.test(text)) {
          if (!elements.includes(btn)) {
            elements.push(btn);
          }
        }
      }

      // Search inside Shadow Roots of all elements
      const allNodes = Array.from(root.querySelectorAll<HTMLElement>('*'));
      for (const node of allNodes) {
        if (node.shadowRoot) {
          elements.push(...this.collectElementsRecursively(node.shadowRoot));
        }
      }

      // Check same-origin iframes
      const iframes = Array.from(root.querySelectorAll<HTMLIFrameElement>('iframe'));
      for (const iframe of iframes) {
        try {
          if (iframe.contentDocument) {
            elements.push(...this.collectElementsRecursively(iframe.contentDocument));
          }
        } catch {
          // Cross-origin iframe, handled by manifest all_frames
        }
      }
    } catch (err) {
      console.warn('Job Autofill: Error during DOM collection', err);
    }

    return elements;
  }

  /**
   * Determines whether an element should be evaluated for autofill.
   */
  private static isValidField(el: HTMLElement): boolean {
    const tagName = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    const role = el.getAttribute('role') || '';
    const hasPopup = el.getAttribute('aria-haspopup') || '';

    // Skip hidden or security-sensitive inputs
    if (type === 'password' || type === 'hidden') return false;
    if (type === 'submit' || type === 'reset') return false;

    // Allow button only if it acts as a combobox, select dropdown, or country calling code selector.
    // A design-system prefix alone (Tesla's "tds-") is not enough: "tds-icon-trigger" is Tesla's
    // "Add profile link" button, and treating it as a dropdown clicked it repeatedly.
    if (tagName === 'button') {
      if (role === 'radio' || role === 'checkbox') return el.getAttribute('aria-disabled') !== 'true';
      // Buttons inside an option list are the options themselves, not separate fields.
      if (el.closest('[role="listbox"], [role="option"], [role="menu"]')) return false;

      const isComboboxOrDropdown =
        role === 'combobox' ||
        hasPopup === 'listbox' ||
        hasPopup === 'dialog' ||
        hasPopup === 'menu' ||
        hasPopup === 'true' ||
        el.hasAttribute('aria-expanded') ||
        /\b(select|dropdown|combobox|country|dial|phone)\b/i.test(el.className || '') ||
        /\+[0-9]{1,4}/.test(el.textContent || '') ||
        /\b(US|DE|UK|CA|IN)\s*\+\d+/i.test(el.textContent || '');

      if (!isComboboxOrDropdown) {
        return false;
      }
    }

    // Check disabled / readonly
    if ((el as HTMLInputElement).disabled) return false;
    if ((el as HTMLInputElement).readOnly) return false;

    // Skip search inputs
    const name = (el.getAttribute('name') || '').toLowerCase();
    const id = (el.getAttribute('id') || '').toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    if (
      type === 'search' ||
      /\b(search|suche|query|filter|captcha|recaptcha|hcaptcha|honeypot|bot_check)\b/i.test(
        `${name} ${id} ${placeholder}`
      )
    ) {
      return false;
    }

    // Skip honeypots
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.tabIndex === -1 && (name.includes('hp') || id.includes('hp'))) return false;

    // Check computed visibility (except for file inputs and custom comboboxes)
    if (type !== 'file' && typeof window !== 'undefined' && window.getComputedStyle) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        const label = (el as HTMLInputElement).labels?.[0];
        if (!['radio', 'checkbox'].includes(type) || !label || !label.getClientRects().length) return false;
      }
      if (typeof el.getClientRects === 'function' && !el.getClientRects().length) {
        const label = (el as HTMLInputElement).labels?.[0];
        if (!['radio', 'checkbox'].includes(type) || !label?.getClientRects().length) return false;
      }
    }

    return true;
  }

  /**
   * Extracts comprehensive context and metadata from a form element.
   */
  public static extractFieldMetadata(el: HTMLElement): DetectedField {
    const tag = el.tagName.toLowerCase();
    const rawType = (el.getAttribute('type') || 'text').toLowerCase();
    const type = this.normalizeElementType(tag, rawType, el.getAttribute('role'));

    const name = el.getAttribute('name') || '';
    const htmlId = el.getAttribute('id') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const autocomplete = el.getAttribute('autocomplete') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const ariaLabelledBy = el.getAttribute('aria-labelledby') || '';
    const ariaDescribedBy = el.getAttribute('aria-describedby') || '';
    const isRequired =
      el.hasAttribute('required') ||
      el.getAttribute('aria-required') === 'true' ||
      el.classList.contains('required');

    const labelText = this.findLabelText(el, htmlId, ariaLabel, ariaLabelledBy);
    const surroundingText = this.extractSurroundingContext(el);
    const fieldsetLegend = this.findFieldsetLegend(el);
    const options = this.extractOptions(el);

    const inputEl = el as HTMLInputElement;
    // Empty native controls are still empty: select.textContent contains every
    // option, and textarea.textContent may contain a default the user erased.
    const currentValue = typeof inputEl.value === 'string' ? inputEl.value : el.textContent || '';
    const isChecked = typeof inputEl.checked === 'boolean' ? inputEl.checked : el.getAttribute('aria-checked') === 'true';

    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { top: 0, left: 0, width: 0, height: 0 };

    let fieldId = (el as any).__jobAutofillId;
    if (!fieldId) {
      fieldId = 'df-' + Math.random().toString(36).substring(2, 9);
      try {
        (el as any).__jobAutofillId = fieldId;
      } catch {
        // ignore
      }
    }

    return {
      id: fieldId,
      element: el,
      tag,
      type,
      name,
      htmlId,
      placeholder,
      autocomplete,
      ariaLabel,
      ariaLabelledBy,
      ariaDescribedBy,
      labelText,
      surroundingText,
      fieldsetLegend,
      options,
      currentValue,
      isChecked,
      isRequired,
      isDisabled: inputEl.disabled || false,
      isReadOnly: inputEl.readOnly || false,
      isVisible: true,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }
    };
  }

  private static normalizeElementType(tag: string, type: string, role: string | null): FieldElementType {
    if (role === 'radio' || type === 'radio') return 'radio';
    if (role === 'checkbox' || type === 'checkbox') return 'checkbox';
    if (role === 'combobox' || tag === 'select' || tag === 'button') return 'select';
    if (tag === 'textarea') return 'textarea';
    if (type === 'email') return 'email';
    if (type === 'tel') return 'tel';
    if (type === 'number') return 'number';
    if (type === 'date') return 'date';
    if (type === 'file') return 'file';
    if (type === 'checkbox') return 'checkbox';
    return 'text';
  }

  /**
   * Find label text through all standard, framework, and design-system patterns.
   */
  public static findLabelText(
    el: HTMLElement,
    htmlId: string,
    ariaLabel: string,
    ariaLabelledBy: string
  ): string {
    if (['radio', 'checkbox'].includes(el.getAttribute('role') || '') && el.tagName !== 'INPUT') {
      return this.cleanText(ariaLabel || el.textContent || '');
    }
    // 1. Direct aria-label
    if (ariaLabel) return ariaLabel.trim();

    // 2. aria-labelledby target
    const root = this.fieldRoot(el);
    if (ariaLabelledBy && root) {
      const label = ariaLabelledBy.trim().split(/\s+/)
        .map((id) => root.getElementById(id)?.textContent || '')
        .filter(Boolean).join(' ');
      if (label) return this.cleanText(label);
    }

    // 3. Explicit <label for="id">
    if (htmlId && root) {
      const label = root.querySelector(`label[for="${CSS.escape(htmlId)}"]`);
      if (label && label.textContent) {
        return this.cleanText(label.textContent);
      }
    }

    // 4. Wrapping <label>
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent) {
      return this.cleanText(parentLabel.textContent);
    }

    // 5. Preceding sibling label or span
    let prev = el.previousElementSibling;
    while (prev) {
      if (
        prev.tagName === 'LABEL' ||
        prev.classList.contains('label') ||
        prev.classList.contains('field-label') ||
        prev.getAttribute('role') === 'label'
      ) {
        return this.cleanText(prev.textContent || '');
      }
      prev = prev.previousElementSibling;
    }

    // 6. Parent container label / header search (common in React/Vue/TDS/Design Systems)
    const container = el.closest(
      '[class*="field"], [class*="form-item"], [class*="form-group"], [class*="input"], [class*="control"], [class*="row"], [class*="item"], [class*="wrapper"]'
    ) as HTMLElement;

    if (container) {
      const labelInContainer = container.querySelector(
        'label, [class*="label"], [class*="title"], [class*="header"], span.text, p'
      );
      if (labelInContainer && labelInContainer !== el && !labelInContainer.contains(el)) {
        const text = labelInContainer.textContent?.trim();
        if (text && text.length < 80) {
          return this.cleanText(text);
        }
      }

      // Check previous sibling of container
      const prevContainer = container.previousElementSibling;
      if (prevContainer) {
        const text = prevContainer.textContent?.trim();
        if (text && text.length < 80 && (prevContainer.tagName === 'LABEL' || prevContainer.classList.contains('label'))) {
          return this.cleanText(text);
        }
      }
    }

    // 7. Parent's previous sibling
    if (el.parentElement && el.parentElement.previousElementSibling) {
      const text = el.parentElement.previousElementSibling.textContent?.trim();
      if (text && text.length < 60) {
        return this.cleanText(text);
      }
    }

    // 8. Custom data attributes or placeholder
    const dataLabel = el.getAttribute('data-label') || el.getAttribute('data-title');
    if (dataLabel) return this.cleanText(dataLabel);

    if (el.getAttribute('placeholder')) {
      return this.cleanText(el.getAttribute('placeholder') || '');
    }

    return '';
  }

  /**
   * Extract surrounding context (e.g. form group text, helper notes, data attributes)
   */
  private static extractSurroundingContext(el: HTMLElement): string {
    const parent = el.parentElement;
    if (!parent) return '';

    const testId =
      el.getAttribute('data-automation-id') ||
      el.getAttribute('data-testid') ||
      parent.getAttribute('data-automation-id') ||
      parent.getAttribute('data-testid') ||
      '';

    const grandParent = parent.parentElement;
    const header = grandParent?.querySelector('h1, h2, h3, h4, h5, .section-title, .field-title');
    const headerText = header?.textContent || '';

    return `${testId} ${headerText}`.trim();
  }

  private static findFieldsetLegend(el: HTMLElement): string {
    if (el.getAttribute('type') === 'radio' || el.getAttribute('role') === 'radio') {
      return this.radioQuestion(el);
    }
    const fieldset = el.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend && legend.textContent) {
        return legend.textContent.trim();
      }
    }

    // For radio buttons or modern form groups without <fieldset>
    const group = el.closest(
      '[role="radiogroup"], [class*="radio-group"], [class*="question"], [class*="field"], [class*="item"], [class*="form-group"]'
    ) as HTMLElement;

    if (group) {
      const titleEl = group.querySelector(
        'legend, [class*="title"], [class*="question"], [class*="label"]:not(label label), h1, h2, h3, h4, h5, p, span.title'
      );
      if (titleEl && !titleEl.contains(el) && titleEl !== el) {
        const txt = titleEl.textContent?.trim();
        if (txt && txt.length > 5 && txt.length < 200) {
          return this.cleanText(txt);
        }
      }

      const prev = group.previousElementSibling;
      if (prev) {
        const txt = prev.textContent?.trim();
        if (txt && txt.length > 5 && txt.length < 200) {
          return this.cleanText(txt);
        }
      }
    }

    return '';
  }

  /** Walk past the individual Ja/Nein wrapper to the actual question container. */
  private static radioQuestion(el: HTMLElement): string {
    const root = this.fieldRoot(el);
    const name = el.getAttribute('name');
    let node = el.parentElement;
    for (let depth = 0; node && depth < 9 && !['FORM', 'BODY', 'HTML'].includes(node.tagName); depth++, node = node.parentElement) {
      const group = node.getAttribute('role') === 'radiogroup';
      if (group) {
        const labelledBy = node.getAttribute('aria-labelledby');
        const label = node.getAttribute('aria-label') || labelledBy?.split(/\s+/).map((id) => root?.getElementById(id)?.textContent || '').join(' ');
        if (label?.trim()) return this.cleanText(label);
      }
      const radios = Array.from(node.querySelectorAll<HTMLElement>('input[type="radio"], [role="radio"]'));
      if (radios.length < 2 && node.tagName !== 'FIELDSET' && !group) continue;
      // A broad section containing several unrelated groups is not a question.
      if (name && radios.some((radio) => radio.getAttribute('name') && radio.getAttribute('name') !== name)) break;
      const candidates = Array.from(node.querySelectorAll<HTMLElement>('legend, label, [data-question], [class*="label"], [class*="question"], h2, h3, h4, p'));
      candidates.push(...Array.from(node.children) as HTMLElement[]);
      for (const candidate of candidates) {
        if (candidate === el || candidate.contains(el) || candidate.querySelector('input, [role="radio"], select, button')) continue;
        const text = this.cleanText(candidate.textContent || '');
        if (text.length > 6 && text.length < 3000 && !/^(yes|no|ja|nein|true|false)[\s*:.]*$/i.test(text)) return text;
      }
    }
    return '';
  }

  private static extractOptions(el: HTMLElement): DetectedOption[] | undefined {
    if (el.tagName.toLowerCase() === 'select') {
      const select = el as HTMLSelectElement;
      return Array.from(select.options).map((opt) => ({
        value: opt.value,
        text: opt.text.trim()
      }));
    }

    // Custom combobox with option list
    const role = el.getAttribute('role');
    if (role === 'combobox') {
      const listboxId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
      if (listboxId) {
        const root = this.fieldRoot(el);
        const listbox = listboxId.trim().split(/\s+/)
          .map((id) => root?.getElementById(id)).find(Boolean);
        if (listbox) {
          const options = Array.from(listbox.querySelectorAll('[role="option"]'));
          return options.map((opt) => ({
            value: opt.getAttribute('data-value') || opt.textContent?.trim() || '',
            text: opt.textContent?.trim() || ''
          }));
        }
      }
    }

    return undefined;
  }

  private static cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').replace(/[*:]/g, '').trim();
  }

  /** Labels and option lists belong to this document or shadow tree. */
  private static fieldRoot(el: HTMLElement): Document | ShadowRoot | undefined {
    const root = el.getRootNode?.() as Document | ShadowRoot | undefined;
    if (root && typeof root.getElementById === 'function') return root;
    return el.ownerDocument || (typeof document !== 'undefined' ? document : undefined);
  }
}
