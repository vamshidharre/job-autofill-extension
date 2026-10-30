import { afterEach, describe, expect, it, vi } from 'vitest';
import { FieldDetector } from '../src/content/field-detector';
import { AutofillEngine } from '../src/content/autofill-engine';
import { FieldMatcher } from '../src/content/field-matcher';
import { TeslaAdapter } from '../src/content/website-adapters/tesla-adapter';
import { DEFAULT_USER_PROFILE } from '../src/storage/default-profile';
import { FieldMatchResult } from '../src/types/engine';

// Small native-control doubles keep the tests independent of a browser while
// modelling the important select behaviour: an invalid value clears selection.
function element(tag: string, attributes: Record<string, string> = {}, extra: Record<string, unknown> = {}): HTMLElement {
  return {
    tagName: tag.toUpperCase(), value: '', textContent: '',
    getAttribute: (name: string) => attributes[name] ?? null,
    hasAttribute: (name: string) => name in attributes,
    classList: { contains: () => false, add: vi.fn(), remove: vi.fn() },
    closest: () => null, querySelector: () => null, parentElement: null,
    previousElementSibling: null, dispatchEvent: vi.fn(),
    ...extra
  } as unknown as HTMLElement;
}

function match(el: HTMLElement, extra: Partial<FieldMatchResult> = {}): FieldMatchResult {
  return {
    detectedField: FieldDetector.extractFieldMetadata(el),
    matchedProfilePath: 'learned.correction', targetValue: 'Saved answer',
    displayLabel: 'Learned answer', confidence: 0.99, confidenceLevel: 'high',
    matchReason: 'Your correction', suggestedAction: 'fill', isSensitive: false,
    ...extra
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Actual field values and accessible labels', () => {
  it('keeps an unselected native dropdown empty instead of learning all option labels', () => {
    const select = element('select', {}, {
      value: '', textContent: 'Select an answer Yes No',
      options: [{ value: '', text: 'Select an answer' }, { value: 'Y', text: 'Yes' }]
    });
    expect(FieldDetector.extractFieldMetadata(select).currentValue).toBe('');
  });

  it('does not resurrect textarea defaults after the user erased them', () => {
    const textarea = element('textarea', {}, { value: '', textContent: 'Default text from the page' });
    expect(FieldDetector.extractFieldMetadata(textarea).currentValue).toBe('');
  });

  it('combines accessible label references from the field own shadow tree', () => {
    const labels: Record<string, string> = { question: 'Years of experience', subject: 'with ANSYS *' };
    const root = { getElementById: (id: string) => ({ textContent: labels[id] || '' }) };
    vi.stubGlobal('document', { getElementById: () => ({ textContent: 'Unrelated parent label' }) });
    const input = element('input', {}, { getRootNode: () => root });
    expect(FieldDetector.findLabelText(input, '', '', 'question subject')).toBe('Years of experience with ANSYS');
  });

  it('resolves custom dropdown options inside the field own tree', () => {
    const option = element('div', { 'data-value': 'yes-code' }, { textContent: 'Yes' });
    const popup = { querySelectorAll: () => [option] };
    const root = { getElementById: (id: string) => id === 'answers' ? popup : null };
    const input = element('button', { role: 'combobox', 'aria-controls': 'answers' }, { getRootNode: () => root });
    expect(FieldDetector.extractFieldMetadata(input).options).toEqual([{ value: 'yes-code', text: 'Yes' }]);
  });
});

describe('Applying remembered answers', () => {
  it.each([
    'I agree to the terms and conditions',
    'Ich habe die vorstehenden Ausführungen gelesen und akzeptiere sie als Beschäftigungsbedingungen.',
    'I hereby certify the statements above',
    'Ich akzeptiere die Datenschutzhinweise'
  ])('keeps legal checkboxes manual even for Tesla: %s', async (label) => {
    const checkbox = element('input', { type: 'checkbox', 'aria-label': label }, { checked: false });
    const request = match(checkbox, { targetValue: true, matchReason: 'Tesla Terms & Conditions Checkbox -> Tick' });
    expect(await new AutofillEngine().fillSingleField(request)).toBe(false);
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    expect(checkbox.dispatchEvent).not.toHaveBeenCalled();
    expect(new TeslaAdapter().customMatch(request.detectedField, DEFAULT_USER_PROFILE)?.suggestedAction).toBe('skip');
  });

  it('does not uncheck consent that the candidate already chose', async () => {
    const checkbox = element('input', { type: 'checkbox', 'aria-label': 'I agree to the privacy policy' }, { checked: true });
    expect(await new AutofillEngine().fillSingleField(match(checkbox, { targetValue: false }))).toBe(false);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  it('skips old saved consent overrides without deleting or changing saved data', () => {
    const checkbox = element('input', { type: 'checkbox', name: 'terms', 'aria-label': 'I acknowledge the declaration' });
    const field = FieldDetector.extractFieldMetadata(checkbox);
    const profile = structuredClone(DEFAULT_USER_PROFILE);
    profile.fieldOverrides = [{
      id: 'old-consent', host: 'tesla.com', key: 'checkbox|name:terms',
      label: field.labelText, fieldType: 'checkbox', value: 'true', updatedAt: '2026-01-01'
    }];
    const before = structuredClone(profile);
    const [result] = new FieldMatcher().matchFields([field], profile, 'https://www.tesla.com/careers/job/apply/123');
    expect(result.suggestedAction).toBe('skip');
    expect(result.isSensitive).toBe(true);
    expect(profile).toEqual(before);
  });

  it('leaves the current native selection intact when a remembered choice is unavailable', async () => {
    class NativeSelect {
      private selected = 'existing';
      get value() { return this.selected; }
      set value(value: string) { this.selected = value === 'existing' ? value : ''; }
    }
    const select = Object.assign(new NativeSelect(), element('select', {}, {
      options: [{ value: 'existing', text: 'Current choice' }]
    }));
    select.value = 'existing';
    vi.stubGlobal('window', { HTMLSelectElement: NativeSelect });
    const result = await new AutofillEngine().fillSingleField(match(select as unknown as HTMLElement, {
      targetValue: 'Retired answer', selectedOptionValue: 'old-code'
    }));
    expect(result).toBe(false);
    expect(select.value).toBe('existing');
    expect(select.dispatchEvent).not.toHaveBeenCalled();
  });

  it('does not fill controls disabled after they were detected', async () => {
    const input = element('input', {}, { value: 'User value', disabled: false });
    const request = match(input);
    (input as HTMLInputElement).disabled = true;
    expect(await new AutofillEngine().fillSingleField(request)).toBe(false);
    expect((input as HTMLInputElement).value).toBe('User value');
  });

  it('preserves an exact learned Workday phone value and does not change its country code', async () => {
    vi.stubGlobal('window', {
      location: { href: 'https://company.myworkdayjobs.com/job/apply' },
      HTMLInputElement: class {}, HTMLTextAreaElement: class {}
    });
    vi.stubGlobal('document', { activeElement: null });
    vi.stubGlobal('KeyboardEvent', Event);
    vi.stubGlobal('InputEvent', Event);
    const input = element('input', { type: 'tel' });
    const engine = new AutofillEngine();
    const countryFallback = vi.spyOn(engine as any, 'ensureCountryCodeSelected');
    const deviceFallback = vi.spyOn(engine as any, 'ensurePhoneDeviceSelected');
    expect(await engine.fillSingleField(match(input, { targetValue: '+43 123456789' }))).toBe(true);
    expect((input as HTMLInputElement).value).toBe('+43 123456789');
    expect(countryFallback).not.toHaveBeenCalled();
    expect(deviceFallback).not.toHaveBeenCalled();
  });
});
