import { DetectedField, FieldMatchResult } from '../types/engine';
import { FieldOverride, UserProfile } from '../types/profile';
import { FORBIDDEN_CHECKBOX_KEYWORDS } from './synonyms';
import { getOptionValue, isTruthyAnswer, radioOptionMatchesAnswer } from './option-matching';
import type { FieldMatcher } from './field-matcher';
import { isChoiceField, isScreeningDate, questionOf } from './field-context';
import { normalizeQuestion } from './question-learner';

/**
 * Correction memory: when the candidate changes a value on an application form
 * (because autofill got it wrong or left it empty), remember that value for this
 * exact field on this site and use it ahead of every built-in rule next time.
 */

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Generated ids/names (UUIDs, long hex, pure numbers) change on every page load.
const GENERATED_IDENTIFIER = /[0-9a-f]{8}-[0-9a-f]{4}-|^[0-9a-f]{16,}$|^\d+$|^df-/i;

function normalize(text: string): string {
  return (text || '').toLowerCase().replace(/[*:]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * The <label> heading the field's form group, e.g. "Telefon" for Tesla's
 * country-code picker, which has no name, id or label of its own.
 */
function groupLabel(el: HTMLElement): string {
  let node: HTMLElement | null = el.parentElement;
  for (let depth = 0; node && depth < 5 && node.tagName !== 'FORM'; depth++) {
    const label = Array.from(node.children).find((child) => child.tagName === 'LABEL');
    if (label?.textContent?.trim()) return label.textContent;
    node = node.parentElement;
  }
  return '';
}

function safeGroupLabel(field: DetectedField): string {
  const el = field.element;
  return el && typeof el.closest === 'function' && el.parentElement !== undefined ? groupLabel(el) : '';
}

/**
 * Stable identity of a field within one site, independent of the generated ids
 * many portals use. Radios share one key per group.
 */
export function fieldKey(field: DetectedField): string {
  const el = field.element;
  const automationId = typeof el?.getAttribute === 'function' ? el.getAttribute('data-automation-id') || '' : '';

  if (field.name && !GENERATED_IDENTIFIER.test(field.name)) return `${field.type}|name:${field.name}`;
  if (automationId) return `${field.type}|aid:${automationId}`;
  if (field.type !== 'radio' && field.htmlId && !GENERATED_IDENTIFIER.test(field.htmlId)) return `${field.type}|id:${field.htmlId}`;

  const label =
    (field.type === 'radio' ? field.fieldsetLegend : '') ||
    safeGroupLabel(field) ||
    field.fieldsetLegend ||
    field.labelText ||
    field.ariaLabel ||
    field.placeholder;
  return label ? `${field.type}|label:${normalize(label)}` : '';
}

export function fieldDisplayLabel(field: DetectedField): string {
  const label =
    (field.type === 'radio' ? field.fieldsetLegend : '') ||
    safeGroupLabel(field) ||
    field.labelText ||
    field.ariaLabel ||
    field.placeholder ||
    field.name;
  return (label || 'Field').replace(/\s+/g, ' ').replace(/[*:]$/, '').trim().slice(0, 80);
}

export function findOverride(profile: UserProfile, host: string, field: DetectedField): FieldOverride | undefined {
  if (!host || !profile.fieldOverrides?.length) return undefined;
  const question = normalizeQuestion(questionOf(field));
  // New records use the full question. Old records remain usable by their keys.
  const sameQuestion = profile.fieldOverrides.find((o) => o.host === host && o.fieldType === field.type &&
    o.question && normalizeQuestion(o.question) === question);
  if (sameQuestion) return sameQuestion;
  const key = fieldKey(field);
  if (!key) return undefined;
  return profile.fieldOverrides.find((o) => o.host === host && o.key === key &&
    (!o.question || normalizeQuestion(o.question) === question));
}

/** Turns a learned correction into a match that fills exactly what the candidate chose. */
export function overrideMatch(field: DetectedField, override: FieldOverride): FieldMatchResult {
  const base = {
    detectedField: field,
    matchedProfilePath: 'learned.correction' as const,
    displayLabel: `Learned: ${override.label}`,
    confidence: 0.99,
    confidenceLevel: 'high' as const,
    matchReason: `Your correction on ${override.host}`,
    isSensitive: false,
    isRememberedChoice: override.manualChoice === true
  };

  if (field.type === 'radio') {
    const isThisOption = radioOptionMatchesAnswer(
      field.labelText || field.currentValue || '',
      getOptionValue(field.element, field.currentValue || ''),
      override.value
    );
    return { ...base, targetValue: isThisOption, suggestedAction: isThisOption ? 'fill' : 'skip' };
  }

  if (field.type === 'checkbox') {
    return { ...base, targetValue: isTruthyAnswer(override.value), suggestedAction: 'fill',
      matchReason: override.manualChoice ? `Remembered manual choice on ${override.host}` : base.matchReason };
  }

  return {
    ...base,
    targetValue: override.value,
    selectedOptionValue: override.optionValue,
    // An empty correction means "leave this field empty".
    suggestedAction: override.value ? 'fill' : 'skip'
  };
}

export interface UserFieldValue {
  value: string;
  optionValue?: string;
}

/**
 * What the candidate has in the field right now. Returns null for an unchecked
 * radio (only the chosen option of a group carries the answer).
 */
export function readUserValue(field: DetectedField, optionValue?: string): UserFieldValue | null {
  const el = field.element as any;
  if (!el) return null;

  if (field.type === 'checkbox') return { value: (el.checked || el.getAttribute?.('aria-checked') === 'true') ? 'true' : 'false' };
  if (field.type === 'radio') {
    if (!(el.checked || el.getAttribute?.('aria-checked') === 'true')) return null;
    const value = (field.labelText || getOptionValue(el, '') || '').trim();
    return value ? { value } : null;
  }
  if (field.tag === 'select') {
    const selected = el.selectedOptions?.[0] ?? el.options?.[el.selectedIndex];
    const value = String(el.value ?? '');
    return { value: value ? String(selected?.text ?? value).trim() : '', optionValue: value };
  }
  if (field.type === 'select') {
    // Custom dropdown trigger: its visible text is the current choice.
    return { value: String(el.textContent ?? '').replace(/\s+/g, ' ').trim(), optionValue };
  }
  return { value: String(el.value ?? '').trim() };
}

function digitsOf(text: string): string {
  return text.replace(/\D/g, '');
}

/** Does the candidate's value equal what autofill would have entered? */
export function sameAsTool(field: DetectedField, user: UserFieldValue, toolMatch: FieldMatchResult | null): boolean {
  const toolFills = !!toolMatch && toolMatch.suggestedAction !== 'skip';

  if (field.type === 'radio') {
    // The candidate chose this option; autofill agrees only if it targets this very option.
    return toolFills && isTruthyAnswer(toolMatch!.targetValue);
  }
  if (field.type === 'checkbox') {
    const toolChecked = toolFills && isTruthyAnswer(toolMatch!.targetValue);
    return toolChecked === isTruthyAnswer(user.value);
  }

  if (!toolFills) return !user.value;

  const target = normalize(String(toolMatch!.targetValue ?? ''));
  const selected = normalize(String(toolMatch!.selectedOptionValue ?? ''));
  const value = normalize(user.value);
  const option = normalize(user.optionValue || '');

  if (value === target) return true;
  if (option && (option === selected || option === target)) return true;
  if (selected && value === selected) return true;
  // Formatting equivalence applies only to phone fields. A numeric suffix is
  // not enough: salaries, identifiers, dates, and different phone numbers can
  // share it. International prefixes must remain part of the comparison.
  const isPhone = field.type === 'tel' || toolMatch?.matchedProfilePath === 'contact.phone' ||
    toolMatch?.matchedProfilePath === 'contact.altPhone';
  const a = digitsOf(value);
  const b = digitsOf(target);
  if (isPhone && a.length >= 6 && b.length >= 6 && a.replace(/^00/, '') === b.replace(/^00/, '')) return true;
  return false;
}

export function isLearnableField(field: DetectedField, rememberChoice = false): boolean {
  if (field.type === 'file' || field.isDisabled || field.isReadOnly) return false;
  if (field.type === 'checkbox' && !rememberChoice) {
    // Consent and legal declarations stay the candidate's decision on every form.
    const text = `${field.labelText} ${field.fieldsetLegend} ${field.surroundingText} ${field.name}`;
    if (FORBIDDEN_CHECKBOX_KEYWORDS.some((regex) => regex.test(text))) return false;
  }
  return true;
}

export type CorrectionDecision =
  | { type: 'save'; override: Omit<FieldOverride, 'id' | 'updatedAt'> }
  | { type: 'remove'; id: string }
  | { type: 'none' };

/**
 * Compares what the candidate entered with what autofill would enter (ignoring
 * earlier corrections) and decides whether to remember, forget or do nothing.
 */
export function decideCorrection(
  field: DetectedField,
  profile: UserProfile,
  url: string,
  doc: Document,
  matcher: Pick<FieldMatcher, 'matchFields'>,
  optionValue?: string,
  rememberChoice = false
): CorrectionDecision {
  const host = hostOf(url);
  const question = questionOf(field);
  const explicitChoice = rememberChoice && (isChoiceField(field) || isScreeningDate(field));
  const key = explicitChoice && question.length >= 3 ? `${field.type}|question:${normalizeQuestion(question)}` : fieldKey(field);
  if (!host || !key || !isLearnableField(field, explicitChoice)) return { type: 'none' };

  const user = readUserValue(field, optionValue);
  if (!user) return { type: 'none' };

  const [toolMatch] = matcher.matchFields([field], profile, url, doc, { ignoreOverrides: true });
  const existing = findOverride(profile, host, field);

  if (!explicitChoice && sameAsTool(field, user, toolMatch ?? null)) {
    // Back to what autofill would do anyway: the correction is no longer needed.
    return existing ? { type: 'remove', id: existing.id } : { type: 'none' };
  }

  if (existing && existing.value === user.value && (existing.optionValue || '') === (user.optionValue || '') &&
      (!explicitChoice || (existing.manualChoice && existing.question === question))) {
    return { type: 'none' };
  }

  return {
    type: 'save',
    override: {
      host,
      key,
      label: fieldDisplayLabel(field),
      fieldType: field.type,
      value: user.value,
      optionValue: user.optionValue || undefined,
      ...(explicitChoice ? { question, manualChoice: true } : {})
    }
  };
}

/**
 * The trigger button/combobox that owns a custom option list, so a click on an
 * option can be attributed to the right field.
 */
export function findTriggerForPopup(listbox: HTMLElement): HTMLElement | null {
  if (listbox.id && typeof CSS !== 'undefined') {
    const owner = document.querySelector<HTMLElement>(
      `[aria-controls="${CSS.escape(listbox.id)}"], [aria-owns="${CSS.escape(listbox.id)}"]`
    );
    if (owner) return owner;
  }
  let node: HTMLElement | null = listbox.parentElement;
  for (let depth = 0; node && depth < 4 && node.tagName !== 'FORM'; depth++) {
    const trigger = Array.from(node.querySelectorAll<HTMLElement>('button[aria-haspopup], [role="combobox"]')).find(
      (candidate) => !listbox.contains(candidate)
    );
    if (trigger) return trigger;
    node = node.parentElement;
  }
  return null;
}
