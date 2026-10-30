import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decideCorrection, findOverride, overrideMatch } from '../src/content/correction-memory';
import { FieldMatcher } from '../src/content/field-matcher';
import { QuestionLearner } from '../src/content/question-learner';
import { ApplicationPageDetector } from '../src/content/application-page-detector';
import { ProfileStorage } from '../src/storage/profile-storage';
import { DEFAULT_USER_PROFILE } from '../src/storage/default-profile';
import { DetectedField } from '../src/types/engine';

const url = 'https://www.tesla.com/de_DE/careers/search/job/apply/279132';
const student = 'Sind Sie derzeit Universitätsstudent?';
function field(overrides: Partial<DetectedField> = {}): DetectedField {
  return { id: 'f', tag: 'input', type: 'radio', name: 'generated-job-one', htmlId: '', placeholder: '',
    autocomplete: '', ariaLabel: '', ariaLabelledBy: '', ariaDescribedBy: '', labelText: 'Nein',
    fieldsetLegend: student, surroundingText: '', currentValue: 'no', isChecked: true,
    isVisible: true, isDisabled: false, isReadOnly: false, isRequired: true,
    rect: { top: 0, left: 0, width: 10, height: 10 },
    element: { checked: true, getAttribute: () => null, hasAttribute: () => false } as any, ...overrides };
}
const matcher = new FieldMatcher();
const doc = {} as Document;

describe('Remembering explicit choices across application forms', () => {
  it('remembers even a choice that agrees with a Tesla default', () => {
    const profile = structuredClone(DEFAULT_USER_PROFILE);
    expect(decideCorrection(field(), profile, url, doc, matcher, undefined, true).type).toBe('save');
  });

  it('finds the same question after generated field names change', () => {
    const profile = structuredClone(DEFAULT_USER_PROFILE);
    const choice = decideCorrection(field(), profile, url, doc, matcher, undefined, true);
    expect(choice.type).toBe('save');
    if (choice.type !== 'save') return;
    const record = { ...choice.override, id: 'saved', updatedAt: '' };
    profile.fieldOverrides = [record];
    expect(findOverride(profile, 'tesla.com', field({ name: 'a-completely-different-id' }))).toEqual(record);
    expect(findOverride(profile, 'tesla.com', field({ fieldsetLegend: 'Different question?', name: 'generated-job-one' }))).toBeUndefined();
  });

  it('reuses saved screening answers ahead of Tesla hardcoded choices', () => {
    const profile = structuredClone(DEFAULT_USER_PROFILE);
    profile.customQA.push({ id: 'student-yes', question: student, answer: 'Ja', keywords: ['universitätsstudent'], category: 'Learned from manual application' });
    const yes = field({ labelText: 'Ja', currentValue: 'yes' });
    expect(matcher.matchFields([yes], profile, url, doc)[0]).toMatchObject({ targetValue: true, suggestedAction: 'fill', matchedProfilePath: 'customQA.answer' });
    expect(matcher.matchFields([field()], profile, url, doc)[0].suggestedAction).toBe('skip');
  });

  it('continues to use older personalized answers without changing their categories', () => {
    const profile = structuredClone(DEFAULT_USER_PROFILE);
    const previous = profile.customQA.find((qa) => qa.question.includes('Verfügbarkeit oder Kündigungsfrist'))!;
    previous.answer = 'In 3 - 4 Wochen';
    const availability = field({ type: 'select', tag: 'select', labelText: previous.question, options: [{ value: 'later', text: previous.answer }] });
    expect(matcher.matchFields([availability], profile, url, doc, { learnedOnly: true })[0])
      .toMatchObject({ targetValue: 'In 3 - 4 Wochen', selectedOptionValue: 'later', suggestedAction: 'fill' });
  });

  it('does not guess built-in answers during automatic memory replay', () => {
    expect(matcher.matchFields([field()], structuredClone(DEFAULT_USER_PROFILE), url, doc, { learnedOnly: true })).toEqual([]);
  });

  it('reuses a German student choice on an English question and English options', () => {
    const profile = structuredClone(DEFAULT_USER_PROFILE);
    profile.customQA.push({ id: 'student', question: student, answer: 'Ja', keywords: [], category: 'Learned Question' });
    const english = field({ labelText: 'Yes', currentValue: 'yes', fieldsetLegend: 'Are you currently a university student?' });
    expect(matcher.matchFields([english], profile, 'https://other.example/application', doc, { learnedOnly: true })[0])
      .toMatchObject({ targetValue: true, suggestedAction: 'fill' });
    expect(matcher.matchFields([{ ...english, fieldsetLegend: 'Were you previously a university student?' }], profile, url, doc, { learnedOnly: true }))
      .toEqual([]);
  });

  it('does not choose between contradictory old personal answers by array order', () => {
    const profile = structuredClone(DEFAULT_USER_PROFILE);
    profile.customQA = [
      { id: 'old-yes', question: student, answer: 'Ja', keywords: [], category: 'Learned Question' },
      { id: 'old-no', question: 'Are you currently a university student?', answer: 'No', keywords: [], category: 'Learned Question' }
    ];
    const alternate = field({ labelText: 'Yes', fieldsetLegend: 'Are you currently enrolled as a student at university?' });
    expect(matcher.matchFields([alternate], profile, url, doc, { learnedOnly: true })).toEqual([]);
  });

  it('learns long SMS preferences from a direct manual choice', () => {
    const question = 'Sind Sie damit einverstanden, während des gesamten Bewerbungsverfahrens Textnachrichten zu empfangen, einschließlich, aber nicht beschränkt auf Einzelheiten zu Vorstellungsgesprächen, Überprüfungen vor der Einstellung und Erinnerungen?';
    expect(QuestionLearner.getLearnableAnswer(field({ fieldsetLegend: question }), true))
      .toEqual({ question, answer: 'Nein' });
  });

  it('learns an internship availability date even when the generated name contains start_date', () => {
    const date = field({ type: 'date', name: 'generated-start_date', labelText: 'Wann stehen Sie für ein Praktikum zur Verfügung?',
      fieldsetLegend: '', currentValue: '2026-12-01', element: { value: '2026-12-01', getAttribute: () => null, hasAttribute: () => false } as any });
    expect(QuestionLearner.getLearnableAnswer(date, true)).toEqual({ question: date.labelText, answer: '2026-12-01' });
    const decision = decideCorrection(date, structuredClone(DEFAULT_USER_PROFILE), url, doc, matcher, undefined, true);
    expect(decision.type).toBe('save');
    if (decision.type === 'save') expect(decision.override).toMatchObject({ question: date.labelText, manualChoice: true, value: '2026-12-01' });
  });

  it('recognizes screening-only second steps with no name, email or upload', () => {
    const fields = Array.from({ length: 12 }, (_, i) => field({ id: String(i) }));
    expect(ApplicationPageDetector.detect(url, 'Bewerbung', fields, 'Schritt 2 von 2 Rechtliche Hinweise').isApplication).toBe(true);
  });

  it('replays consent only after an explicit choice for that question and site', () => {
    const profile = structuredClone(DEFAULT_USER_PROFILE);
    const consent = field({ type: 'checkbox', fieldsetLegend: '', labelText: 'I agree to the terms and conditions', name: 'terms' });
    const decision = decideCorrection(consent, profile, url, doc, matcher, undefined, true);
    expect(decision.type).toBe('save');
    if (decision.type !== 'save') return;
    profile.fieldOverrides = [{ ...decision.override, id: 'choice', updatedAt: '' }];
    const [match] = matcher.matchFields([consent], profile, url, doc);
    expect(match).toMatchObject({ isRememberedChoice: true, suggestedAction: 'fill' });
    expect(matcher.matchFields([consent], profile, 'https://another.example/application', doc)[0].suggestedAction).toBe('skip');
  });

  it('remembers an explicitly unchecked checkbox rather than treating false as empty', () => {
    const profile = structuredClone(DEFAULT_USER_PROFILE);
    const choice = decideCorrection(field({ type: 'checkbox', labelText: 'Contact me by SMS', element: { checked: false } as any }), profile, url, doc, matcher, undefined, true);
    expect(choice.type).toBe('save');
    if (choice.type === 'save') expect(overrideMatch(field({ type: 'checkbox' }), { ...choice.override, id: 'no', updatedAt: '' }).targetValue).toBe(false);
  });
});

describe('Personalizing built-in saved answers', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('chrome', undefined);
    vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('marks a manually updated built-in Q&A as learned, keeping other memory', async () => {
    const before = await ProfileStorage.getProfile();
    const existing = before.customQA[0];
    const after = await ProfileStorage.addOrUpdateCustomQA(existing.question, 'My chosen answer', 'Learned from manual application');
    expect(after.customQA).toHaveLength(before.customQA.length);
    expect(after.customQA.find((qa) => qa.id === existing.id)).toMatchObject({ answer: 'My chosen answer', category: 'Learned from manual application' });
  });

  it('persists the reusable answer and site choice together without losing existing learning', async () => {
    await ProfileStorage.addOrUpdateCustomQA('Existing saved question', 'Keep this answer');
    const override = { host: 'tesla.com', key: 'select|question:internship months', question: 'Internship months?',
      label: 'Internship months', fieldType: 'select', value: '6 Monate', optionValue: 'six', manualChoice: true };
    const result = await ProfileStorage.rememberChoice(override, { question: override.question, answer: override.value });
    const latest = await ProfileStorage.getProfile();
    expect(result.changed).toBe(true);
    expect(latest.customQA.some((qa) => qa.answer === 'Keep this answer')).toBe(true);
    expect(latest.customQA.some((qa) => qa.question === override.question && qa.answer === '6 Monate')).toBe(true);
    expect(latest.fieldOverrides).toEqual([expect.objectContaining(override)]);
    expect((await ProfileStorage.rememberChoice(override, { question: override.question, answer: override.value })).changed).toBe(false);
  });

  it('checks the latest learning switch before saving a dispatched choice', async () => {
    await ProfileStorage.updateSettings({ learningModeEnabled: false });
    const result = await ProfileStorage.rememberChoice({ host: 'tesla.com', key: 'date|question:internship',
      question: 'Internship start?', label: 'Internship start', fieldType: 'date', value: '2026-12-01', manualChoice: true },
      { question: 'Internship start?', answer: '2026-12-01' });
    expect(result.changed).toBe(false);
    expect(result.profile.fieldOverrides || []).toEqual([]);
    expect(result.profile.customQA.some((qa) => qa.question === 'Internship start?')).toBe(false);
  });
});
