/**
 * Shared helpers for comparing stored answers with option labels.
 *
 * Plain substring checks pick the wrong option surprisingly often
 * ("female".includes("male"), "none".includes("no"), "".includes anything),
 * so option matching goes through whole-word comparisons instead.
 */

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordChar(ch: string | undefined): boolean {
  return !!ch && WORD_CHAR.test(ch);
}

/**
 * True when `phrase` occurs in `haystack` as whole word(s), case-insensitively.
 * Empty inputs never match.
 */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const h = (haystack || '').toLowerCase().trim();
  const p = (phrase || '').toLowerCase().trim();
  if (!h || !p) return false;

  let idx = h.indexOf(p);
  while (idx !== -1) {
    if (!isWordChar(h[idx - 1]) && !isWordChar(h[idx + p.length])) return true;
    idx = h.indexOf(p, idx + 1);
  }
  return false;
}

/** True when either string contains the other as whole word(s). */
export function phrasesOverlap(a: string, b: string): boolean {
  return containsPhrase(a, b) || containsPhrase(b, a);
}

const YES_ANSWER = /^(yes|ja|true|1|y)$/i;
const NO_ANSWER = /^(no|nein|false|0|n)$/i;
const YES_LABEL = /^(yes|ja)\b/i;
const NO_LABEL = /^(no|nein)\b/i;
const YES_VALUE = /^(yes|ja|true)$/i;
const NO_VALUE = /^(no|nein|false)$/i;

/**
 * Decides whether a single radio option (its visible label and its value
 * attribute) is the one that represents `answer`.
 */
export function radioOptionMatchesAnswer(optionLabel: string, optionValue: string, answer: string): boolean {
  const label = (optionLabel || '').toLowerCase().trim();
  const value = (optionValue || '').toLowerCase().trim();
  const ans = (answer || '').toLowerCase().trim();
  if (!ans) return false;

  if (YES_ANSWER.test(ans)) return YES_LABEL.test(label) || YES_VALUE.test(value);
  if (NO_ANSWER.test(ans)) return NO_LABEL.test(label) || NO_VALUE.test(value);

  if (label && (label === ans || phrasesOverlap(label, ans))) return true;
  // "on" is the browser default value for radios without one; it says nothing.
  return !!value && value !== 'on' && value === ans;
}

/** Reads the value attribute of a radio/checkbox element, tolerating mock elements. */
export function getOptionValue(element: HTMLElement | null | undefined, fallback = ''): string {
  if (element && typeof element.getAttribute === 'function') {
    return element.getAttribute('value') ?? fallback;
  }
  return fallback;
}

/** Interprets a stored target value as a checked/unchecked state. */
export function isTruthyAnswer(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return typeof value === 'string' && /^(true|yes|ja|1|checked)$/i.test(value.trim());
}
