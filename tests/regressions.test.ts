import { describe, it, expect, beforeEach, vi } from 'vitest';
import { containsPhrase, radioOptionMatchesAnswer, isTruthyAnswer } from '../src/content/option-matching';
import { FieldMatcher } from '../src/content/field-matcher';
import { QuestionDetector } from '../src/content/question-learner';
import { ProfileStorage } from '../src/storage/profile-storage';
import { DEFAULT_USER_PROFILE } from '../src/storage/default-profile';
import { DetectedField } from '../src/types/engine';

function createMockField(overrides: Partial<DetectedField>): DetectedField {
  return {
    id: 'mock-' + Math.random().toString(36).substring(2, 7),
    element: {
      getAttribute: (attr: string) => (attr === 'value' ? overrides.currentValue ?? '' : null)
    } as any,
    tag: 'input',
    type: 'text',
    name: '',
    htmlId: '',
    placeholder: '',
    autocomplete: '',
    ariaLabel: '',
    ariaLabelledBy: '',
    ariaDescribedBy: '',
    labelText: '',
    surroundingText: '',
    fieldsetLegend: '',
    currentValue: '',
    isRequired: false,
    isDisabled: false,
    isReadOnly: false,
    isVisible: true,
    rect: { top: 0, left: 0, width: 100, height: 20 },
    ...overrides
  };
}

describe('Option matching', () => {
  it('matches whole words only', () => {
    expect(containsPhrase('Female', 'male')).toBe(false);
    expect(containsPhrase('Male (he/him)', 'male')).toBe(true);
    expect(containsPhrase('None of the above', 'no')).toBe(false);
    expect(containsPhrase('anything', '')).toBe(false);
    expect(containsPhrase('', 'anything')).toBe(false);
    expect(containsPhrase('Weiblich / Männlich', 'männlich')).toBe(true);
  });

  it('does not treat an unlabeled radio as matching every answer', () => {
    // Previously `answer.includes('')` was true, so every option in the group got checked.
    expect(radioOptionMatchesAnswer('', 'on', 'Stuttgart')).toBe(false);
    expect(radioOptionMatchesAnswer('Yes', 'on', 'ja')).toBe(true);
    expect(radioOptionMatchesAnswer('No', 'on', 'ja')).toBe(false);
    expect(radioOptionMatchesAnswer('Nein', 'false', 'no')).toBe(true);
  });

  it('parses stored checkbox values instead of using Boolean()', () => {
    expect(isTruthyAnswer('false')).toBe(false);
    expect(isTruthyAnswer('Immediately')).toBe(false);
    expect(isTruthyAnswer('true')).toBe(true);
    expect(isTruthyAnswer(true)).toBe(true);
  });

  it('does not select "Female" for a "Male" target', () => {
    const matcher = new FieldMatcher();
    const options = [
      { value: 'f', text: 'Female' },
      { value: 'm', text: 'Male (he/him)' }
    ];
    expect(matcher.findBestSelectOption(options, 'Male')).toBe('m');
  });

  it('selects only the matching radio of a Yes/No pair', () => {
    const matcher = new FieldMatcher();
    const legend = 'Are you legally authorized to work in Germany?';
    const yes = createMockField({ type: 'radio', name: 'work_authorization', labelText: 'Yes', currentValue: 'yes', fieldsetLegend: legend });
    const no = createMockField({ type: 'radio', name: 'work_authorization', labelText: 'No', currentValue: 'no', fieldsetLegend: legend });

    const matches = matcher.matchFields([yes, no], DEFAULT_USER_PROFILE, 'https://example.com/apply');
    const mYes = matches.find((m) => m.detectedField === yes);
    const mNo = matches.find((m) => m.detectedField === no);

    expect(mYes?.targetValue).toBe(true);
    expect(mNo?.targetValue).toBe(false);
    expect(mNo?.suggestedAction).toBe('skip');
  });
});

describe('Consent checkboxes', () => {
  it('are never offered as reusable questions', () => {
    const consent = createMockField({ type: 'checkbox', labelText: 'I agree to the privacy policy', isChecked: false });
    const questions = QuestionDetector.getUnansweredQuestions([consent], []);
    expect(questions).toHaveLength(0);
  });
});

describe('Profile storage', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key)
    });
  });

  it('never hands out the shared default profile object', async () => {
    const defaultQaCount = DEFAULT_USER_PROFILE.customQA.length;
    const profile = await ProfileStorage.getProfile();
    profile.customQA.push({ id: 'x', question: 'Q', answer: 'A', keywords: [] });
    expect(DEFAULT_USER_PROFILE.customQA).toHaveLength(defaultQaCount);
  });

  it('does not re-add a built-in answer the user deleted', async () => {
    await ProfileStorage.getProfile();
    await ProfileStorage.removeCustomQA('qa-1');
    const reloaded = await ProfileStorage.getProfile();
    expect(reloaded.customQA.some((qa) => qa.id === 'qa-1')).toBe(false);
  });

  it('keeps the "preview before filling" setting once enabled', async () => {
    await ProfileStorage.updateSettings({ previewBeforeFilling: true });
    const reloaded = await ProfileStorage.getProfile();
    expect(reloaded.settings.previewBeforeFilling).toBe(true);
  });

  it('does not lose answers learned at the same time', async () => {
    await Promise.all([
      ProfileStorage.addOrUpdateCustomQA('What is your favourite solver?', 'Nastran'),
      ProfileStorage.addOrUpdateCustomQA('Preferred meshing tool?', 'HyperMesh')
    ]);
    const profile = await ProfileStorage.getProfile();
    expect(profile.customQA.some((qa) => qa.answer === 'Nastran')).toBe(true);
    expect(profile.customQA.some((qa) => qa.answer === 'HyperMesh')).toBe(true);
  });

  it('records repeated autofill runs on one page as a single history entry', async () => {
    const base = {
      company: 'Acme',
      jobTitle: 'CAE Engineer',
      date: new Date().toISOString(),
      location: 'Berlin',
      status: 'Saved' as const,
      notes: ''
    };
    await ProfileStorage.recordApplication({ ...base, url: 'https://jobs.example.com/apply/123?step=1' });
    await ProfileStorage.recordApplication({ ...base, url: 'https://jobs.example.com/apply/123?step=2' });
    const profile = await ProfileStorage.getProfile();
    expect(profile.history).toHaveLength(1);
  });
});
