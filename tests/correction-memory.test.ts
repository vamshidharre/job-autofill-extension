import { describe, it, expect, beforeEach, vi } from 'vitest';
import { decideCorrection, fieldKey, hostOf, sameAsTool } from '../src/content/correction-memory';
import { FieldMatcher } from '../src/content/field-matcher';
import { ProfileStorage } from '../src/storage/profile-storage';
import { DEFAULT_USER_PROFILE } from '../src/storage/default-profile';
import { DetectedField } from '../src/types/engine';
import { UserProfile } from '../src/types/profile';

const TESLA_URL = 'https://www.tesla.com/de_DE/careers/search/job/apply/283228';

function createMockField(overrides: Partial<DetectedField>, elementProps: Record<string, unknown> = {}): DetectedField {
  const element = {
    getAttribute: (attr: string) => (attr === 'value' ? (elementProps.value as string) ?? overrides.currentValue ?? '' : null),
    hasAttribute: () => false,
    ...elementProps
  };
  return {
    id: 'mock-' + Math.random().toString(36).substring(2, 7),
    element: element as any,
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

function profileWith(overrides: UserProfile['fieldOverrides'] = []): UserProfile {
  const profile = JSON.parse(JSON.stringify(DEFAULT_USER_PROFILE)) as UserProfile;
  profile.fieldOverrides = overrides;
  return profile;
}

describe('Correction memory', () => {
  const matcher = new FieldMatcher();
  const doc = {} as Document;

  it('identifies fields by stable attributes, not generated ids', () => {
    expect(fieldKey(createMockField({ name: 'personal.lastName', htmlId: 'bedb8a8a-811e-4ef9-93c3-6de38ebbde6e' }))).toBe('text|name:personal.lastName');
    expect(fieldKey(createMockField({ htmlId: 'bedb8a8a-811e-4ef9-93c3-6de38ebbde6e', labelText: 'Legaler Nachname' }))).toBe('text|label:legaler nachname');
    expect(hostOf(TESLA_URL)).toBe('tesla.com');
  });

  it('learns when the candidate changes an autofilled value', () => {
    const field = createMockField({ name: 'personal.lastName', labelText: 'Legaler Nachname' }, { value: 'Alternate' });
    const decision = decideCorrection(field, profileWith(), TESLA_URL, doc, matcher);
    expect(decision.type).toBe('save');
    if (decision.type === 'save') {
      expect(decision.override).toMatchObject({ host: 'tesla.com', key: 'text|name:personal.lastName', value: 'Alternate' });
    }
  });

  it('learns nothing when the candidate keeps what autofill would enter', () => {
    const field = createMockField({ name: 'personal.lastName', labelText: 'Legaler Nachname' }, { value: DEFAULT_USER_PROFILE.basic.lastName });
    expect(decideCorrection(field, profileWith(), TESLA_URL, doc, matcher).type).toBe('none');
  });

  it('uses a learned correction ahead of the Tesla adapter', () => {
    const field = createMockField({ name: 'personal.lastName', labelText: 'Legaler Nachname' });
    const profile = profileWith([
      { id: 'fo-1', host: 'tesla.com', key: 'text|name:personal.lastName', label: 'Legaler Nachname', fieldType: 'text', value: 'Alternate', updatedAt: '' }
    ]);
    const [match] = matcher.matchFields([field], profile, TESLA_URL);
    expect(match.matchedProfilePath).toBe('learned.correction');
    expect(match.targetValue).toBe('Alternate');
    expect(match.suggestedAction).toBe('fill');

    // Other sites keep the profile value.
    const [elsewhere] = matcher.matchFields([field], profile, 'https://jobs.example.com/apply');
    expect(elsewhere.targetValue).not.toBe('Alternate');
  });

  it('forgets a correction once the candidate goes back to the autofill value', () => {
    const field = createMockField({ name: 'personal.lastName', labelText: 'Legaler Nachname' }, { value: DEFAULT_USER_PROFILE.basic.lastName });
    const profile = profileWith([
      { id: 'fo-1', host: 'tesla.com', key: 'text|name:personal.lastName', label: 'Legaler Nachname', fieldType: 'text', value: 'Alternate', updatedAt: '' }
    ]);
    expect(decideCorrection(field, profile, TESLA_URL, doc, matcher)).toEqual({ type: 'remove', id: 'fo-1' });
  });

  it('replays a learned radio choice on the matching option only', () => {
    const legend = 'Würden Sie gerne in unseren Talentpool aufgenommen werden?';
    const yes = createMockField({ type: 'radio', name: 'talentPool', labelText: 'Ja', currentValue: 'yes', fieldsetLegend: legend });
    const no = createMockField({ type: 'radio', name: 'talentPool', labelText: 'Nein', currentValue: 'no', fieldsetLegend: legend });
    const profile = profileWith([
      { id: 'fo-2', host: 'tesla.com', key: 'radio|name:talentPool', label: legend, fieldType: 'radio', value: 'Nein', updatedAt: '' }
    ]);
    const matches = matcher.matchFields([yes, no], profile, TESLA_URL);
    expect(matches.find((m) => m.detectedField === no)?.targetValue).toBe(true);
    expect(matches.find((m) => m.detectedField === yes)?.suggestedAction).toBe('skip');
  });

  it('learns a custom dropdown choice from the trigger text', () => {
    const trigger = createMockField({ tag: 'button', type: 'select', labelText: 'Telefon' }, { textContent: 'AT +43' });
    const decision = decideCorrection(trigger, profileWith(), TESLA_URL, doc, matcher, 'AT');
    expect(decision.type).toBe('save');
    if (decision.type === 'save') {
      expect(decision.override).toMatchObject({ value: 'AT +43', optionValue: 'AT' });
    }
  });

  it('never learns consent checkboxes', () => {
    const consent = createMockField({ type: 'checkbox', name: 'terms', labelText: 'I agree to the terms and conditions' }, { checked: true });
    expect(decideCorrection(consent, profileWith(), TESLA_URL, doc, matcher).type).toBe('none');
  });

  it('keeps numeric corrections instead of treating shared digit suffixes as equal', () => {
    const field = createMockField({ name: 'reference', labelText: 'Reference number' }, { value: '1123456' });
    const toolMatch = {
      detectedField: field, matchedProfilePath: 'customQA.answer' as const, targetValue: '123456',
      displayLabel: 'Reference', confidence: 0.99, confidenceLevel: 'high' as const,
      matchReason: 'Saved answer', suggestedAction: 'fill' as const, isSensitive: false
    };
    expect(sameAsTool(field, { value: '1123456' }, toolMatch)).toBe(false);
    expect(sameAsTool(field, { value: 'ref-123456' }, toolMatch)).toBe(false);
  });

  it('accepts phone formatting changes but keeps different international prefixes', () => {
    const field = createMockField({ type: 'tel', labelText: 'Phone' });
    const toolMatch = {
      detectedField: field, matchedProfilePath: 'contact.phone' as const, targetValue: '+49 123 456789',
      displayLabel: 'Phone', confidence: 0.99, confidenceLevel: 'high' as const,
      matchReason: 'Profile', suggestedAction: 'fill' as const, isSensitive: false
    };
    expect(sameAsTool(field, { value: '0049 123-456789' }, toolMatch)).toBe(true);
    expect(sameAsTool(field, { value: '+43 123-456789' }, toolMatch)).toBe(false);
    expect(sameAsTool(field, { value: '123456789' }, toolMatch)).toBe(false);
  });
});

describe('Learned answers for new fields', () => {
  const matcher = new FieldMatcher();
  const question = 'Wie viele Jahre Erfahrung haben Sie mit FEM-Simulation?';
  const profile = profileWith();
  profile.customQA = [
    { id: 'qa-learned', question, answer: '3', keywords: ['wie', 'viele', 'jahre', 'erfahrung', 'haben', 'sie', 'mit', 'fem-simulation'], category: 'Learned from manual application' }
  ];
  const valueFor = (labelText: string) => matcher.matchFields([createMockField({ labelText })], profile, 'https://jobs.example.com/apply')[0];

  it('fills the same question on another site', () => {
    const match = valueFor(question);
    expect(match.targetValue).toBe('3');
    expect(match.suggestedAction).toBe('fill');
  });

  it('does not reuse the answer for unrelated questions that share common words', () => {
    // Old behaviour: any two keywords (e.g. "wie" + "sie") were enough to fill "3".
    expect(valueFor('Wie haben Sie von uns erfahren?')?.targetValue).not.toBe('3');
    expect(valueFor('Erfahrung')?.targetValue).not.toBe('3');
  });

  it('does not fill a similar question about something else', () => {
    const match = valueFor('Wie viele Jahre Erfahrung haben Sie mit CFD-Simulation?');
    expect(match?.targetValue === '3' && match.suggestedAction === 'fill').toBe(false);
  });

  it('does not take the exact question from a neighboring field', () => {
    const [match] = matcher.matchFields([
      createMockField({ labelText: 'Which simulation tools have you used?', surroundingText: question })
    ], profile, 'https://jobs.example.com/apply');
    expect(match?.targetValue === '3' && match.suggestedAction === 'fill').toBe(false);
  });

  it('requires review when a similar question adds a different subject', () => {
    const match = valueFor('Wie viele Jahre Erfahrung haben Sie mit FEM-Simulation und CFD-Simulation?');
    expect(match?.targetValue === '3' && match.suggestedAction === 'fill').toBe(false);
  });

  it('reuses learned wording with punctuation changes, but not its opposite', () => {
    const specific = profileWith();
    specific.customQA = [
      { id: 'qa-weekends', question: 'Are you willing to work weekends?', answer: 'Yes', keywords: [], category: 'Learned Question' }
    ];
    const matchFor = (labelText: string) => matcher.matchFields([createMockField({ labelText })], specific)[0];
    expect(matchFor('Are you willing to work weekends *')?.targetValue).toBe('Yes');
    const opposite = matchFor('Are you NOT willing to work weekends?');
    expect(opposite?.targetValue === 'Yes' && opposite.suggestedAction === 'fill').toBe(false);
  });

  it('never automatically shares learned answers between C, C++ and C#', () => {
    for (const source of ['C', 'C++', 'C#']) {
      const specific = profileWith();
      specific.customQA = [
        { id: 'qa-language', question: `Years of experience with ${source}?`, answer: '7', keywords: [], category: 'Learned Question' }
      ];
      for (const target of ['C', 'C++', 'C#']) {
        const [match] = matcher.matchFields([createMockField({ labelText: `Years of experience with ${target}?` })], specific);
        if (source === target) {
          expect(match.targetValue).toBe('7');
          expect(match.suggestedAction).toBe('fill');
        } else {
          expect(match?.targetValue === '7' && match.suggestedAction === 'fill').toBe(false);
        }
      }
    }
  });

  it('requires review when numeric limits or versions differ', () => {
    for (const [source, target] of [
      ['Can you work 20 hours weekly?', 'Can you work 40 hours weekly?'],
      ['Can you travel up to 25%?', 'Can you travel up to 50%?'],
      ['Experience with solver version 1.2?', 'Experience with solver version 12?']
    ]) {
      const specific = profileWith();
      specific.customQA = [
        { id: 'qa-limit', question: source, answer: 'Yes', keywords: [], category: 'Learned Question' }
      ];
      const matchQuestion = (labelText: string) => matcher.matchFields([
        createMockField({ tag: 'textarea', type: 'textarea', labelText })
      ], specific)[0];
      expect(matchQuestion(source)).toMatchObject({ matchedProfilePath: 'customQA.answer', suggestedAction: 'fill' });
      const match = matchQuestion(target);
      expect(match?.matchedProfilePath === 'customQA.answer' && match.suggestedAction === 'fill').toBe(false);
    }
  });
});

describe('Correction storage', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key)
    });
  });

  it('keeps separately learned answers for distinct technical symbols and numeric meanings', async () => {
    const questions = [
      'Experience with C?', 'Experience with C++?', 'Experience with C#?',
      'Experience with version 1.2?', 'Experience with version 1,2?',
      'Travel up to 25%?', 'Travel up to 25?'
    ];
    for (const [index, question] of questions.entries()) {
      await ProfileStorage.addOrUpdateCustomQA(question, `Answer ${index}`);
    }
    const profile = await ProfileStorage.getProfile();
    for (const [index, question] of questions.entries()) {
      expect(profile.customQA.find((qa) => qa.question === question)?.answer).toBe(`Answer ${index}`);
    }
  });

  it('updates the existing correction for the same field instead of duplicating it', async () => {
    const base = { host: 'tesla.com', key: 'text|name:personal.lastName', label: 'Legaler Nachname', fieldType: 'text' };
    await ProfileStorage.saveFieldOverride({ ...base, value: 'Enugal' });
    await ProfileStorage.saveFieldOverride({ ...base, value: 'Alternate' });
    const profile = await ProfileStorage.getProfile();
    expect(profile.fieldOverrides).toHaveLength(1);
    expect(profile.fieldOverrides?.[0].value).toBe('Alternate');

    await ProfileStorage.removeFieldOverride(profile.fieldOverrides![0].id);
    expect((await ProfileStorage.getProfile()).fieldOverrides).toHaveLength(0);
  });
});
