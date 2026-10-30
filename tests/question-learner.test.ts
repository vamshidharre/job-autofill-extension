import { describe, it, expect } from 'vitest';
import { QuestionDetector, QuestionLearner, normalizeQuestion } from '../src/content/question-learner';
import { FieldMatcher } from '../src/content/field-matcher';
import { DEFAULT_USER_PROFILE } from '../src/storage/default-profile';
import { DetectedField, FieldMatchResult } from '../src/types/engine';
import { UserProfile } from '../src/types/profile';

function createMockField(overrides: Partial<DetectedField>): DetectedField {
  return {
    id: 'mock-' + Math.random().toString(36).substring(2, 7),
    element: {
      getAttribute: (attr: string) => (attr === 'value' ? overrides.currentValue || '' : null)
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

describe('Question Learning & Detection Engine', () => {
  it('normalizes presentation without removing meaningful wording', () => {
    expect(normalizeQuestion('  Preferred WORK schedule? * ')).toBe('preferred work schedule');
    expect(normalizeQuestion('Do you not agree?')).not.toBe(normalizeQuestion('Do you agree?'));
  });

  it('keeps technical symbols distinct so answers cannot overwrite each other', () => {
    const languages = ['C', 'C++', 'C#'].map((language) => normalizeQuestion(`Experience with ${language}? *`));
    expect(new Set(languages).size).toBe(3);
    expect(normalizeQuestion('Experience with C++? *')).toBe(normalizeQuestion('Experience with C++.'));
    expect(normalizeQuestion('Travel up to 25%?')).not.toBe(normalizeQuestion('Travel up to 25?'));
    expect(normalizeQuestion('Experience with Ｃ＋＋?')).toBe(normalizeQuestion('Experience with C++?'));
  });

  it('preserves decimals and version numbers without preserving sentence punctuation', () => {
    const versions = ['1.2', '12', '1,2', '1.20', '1.2.0'].map((version) => normalizeQuestion(`Experience with version ${version}?`));
    expect(new Set(versions).size).toBe(5);
    expect(normalizeQuestion('Available for 0.5 years?')).not.toBe(normalizeQuestion('Available for 0,5 years?'));
    expect(normalizeQuestion('Available for 0.5 years?')).not.toBe(normalizeQuestion('Available for 05 years?'));
    expect(normalizeQuestion('Experience with version 1.2, please.')).toBe('experience with version 1.2 please');
  });

  it('learns the visible dropdown answer so it can be reused on another portal', () => {
    const field = createMockField({
      tag: 'select', type: 'select', labelText: 'Preferred working pattern?',
      fieldsetLegend: 'Screening questions', currentValue: 'answer-378',
      options: [{ value: '', text: 'Choose one' }, { value: 'answer-378', text: 'Hybrid' }]
    });
    const learned = QuestionLearner.getLearnableAnswer(field);
    expect(learned).toEqual({ question: 'Preferred working pattern?', answer: 'Hybrid' });
    expect(QuestionLearner.extractFilledQuestionsFromPage([field])[0]).toMatchObject(learned!);
    expect(QuestionLearner.getLearnableAnswer({ ...field, currentValue: '' })).toBeNull();

    const profile = { ...DEFAULT_USER_PROFILE, customQA: [QuestionLearner.createCustomQA(learned!.question, learned!.answer)] };
    const [match] = new FieldMatcher().matchFields([
      { ...field, currentValue: '', options: [{ value: 'other-portal-72', text: 'Hybrid' }] }
    ], profile);
    expect(match.targetValue).toBe('Hybrid');
    expect(match.selectedOptionValue).toBe('other-portal-72');
    expect(match.suggestedAction).toBe('fill');
  });

  it('bulk learning uses the same exclusions as automatic learning', () => {
    const fields = [
      createMockField({ labelText: 'Hidden response?', currentValue: 'hidden', isVisible: false }),
      createMockField({ labelText: 'Locked response?', currentValue: 'locked', isReadOnly: true }),
      createMockField({ labelText: 'Disabled response?', currentValue: 'disabled', isDisabled: true }),
      createMockField({ labelText: 'Supporting evidence?', currentValue: 'C:\\fakepath\\cv.pdf', type: 'file' }),
      createMockField({ labelText: 'I agree to the terms and conditions', currentValue: 'Yes', type: 'select' })
    ];
    expect(QuestionLearner.extractFilledQuestionsFromPage(fields)).toEqual([]);
  });

  it('extracts salient keywords while filtering stop words', () => {
    const question = 'Werden Sie in Zukunft eine Einwanderungspatenschaft für eine Beschäftigung bei uns benötigen?';
    const keywords = QuestionLearner.extractKeywords(question);

    expect(keywords).toContain('zukunft');
    expect(keywords).toContain('einwanderungspatenschaft');
    expect(keywords).toContain('beschäftigung');
    expect(keywords).toContain('benötigen');

    // German stop words like 'sie', 'in', 'eine', 'für', 'bei' should be excluded
    expect(keywords).not.toContain('sie');
    expect(keywords).not.toContain('eine');
    expect(keywords).not.toContain('für');
  });

  it('groups multiple radio buttons with the same question/legend into a single choice question', () => {
    const legend = 'Are you willing to work in a hybrid schedule in Stuttgart?';

    const fRadioYes = createMockField({
      type: 'radio',
      labelText: 'Yes',
      currentValue: 'yes',
      fieldsetLegend: legend
    });

    const fRadioNo = createMockField({
      type: 'radio',
      labelText: 'No',
      currentValue: 'no',
      fieldsetLegend: legend
    });

    const unanswered = QuestionDetector.getUnansweredQuestions([fRadioYes, fRadioNo], []);

    expect(unanswered.length).toBe(1);
    expect(unanswered[0].type).toBe('choice');
    expect(unanswered[0].questionText).toContain(legend);
    expect(unanswered[0].options?.length).toBe(2);
    expect(unanswered[0].fieldIds).toContain(fRadioYes.id);
    expect(unanswered[0].fieldIds).toContain(fRadioNo.id);
  });

  it('filters out already matched high-confidence fields', () => {
    const fMatched = createMockField({
      id: 'field-1',
      labelText: 'Vorname'
    });

    const fUnmatched = createMockField({
      id: 'field-2',
      labelText: 'What is your favorite CAD software?'
    });

    const mockMatch: FieldMatchResult = {
      detectedField: fMatched,
      matchedProfilePath: 'basic.firstName',
      targetValue: 'Alex',
      displayLabel: 'First Name',
      confidence: 0.99,
      confidenceLevel: 'high',
      matchReason: 'Direct match',
      suggestedAction: 'fill',
      isSensitive: false
    };

    const unanswered = QuestionDetector.getUnansweredQuestions([fMatched, fUnmatched], [mockMatch]);

    expect(unanswered.length).toBe(1);
    expect(unanswered[0].fieldIds).toContain(fUnmatched.id);
    expect(unanswered[0].questionText).toContain('What is your favorite CAD software');
  });

  it('extracts manually filled fields from the page for 1-click learning', () => {
    const f1 = createMockField({
      labelText: 'How many years of ANSYS FEA experience do you have?',
      currentValue: '4 years'
    });

    const f2 = createMockField({
      type: 'radio',
      fieldsetLegend: 'Willingness to travel (up to 25%)',
      labelText: 'Ja',
      isChecked: true
    });

    const learned = QuestionLearner.extractFilledQuestionsFromPage([f1, f2]);

    expect(learned.length).toBe(2);
    expect(learned[0].question).toContain('ANSYS FEA experience');
    expect(learned[0].answer).toBe('4 years');
    expect(learned[1].question).toContain('Willingness to travel');
    expect(learned[1].answer).toBe('Ja');
  });

  it('matches newly learned CustomQA questions across text and radio fields with high confidence', () => {
    const matcher = new FieldMatcher();

    const customProfile: UserProfile = {
      ...DEFAULT_USER_PROFILE,
      customQA: [
        {
          id: 'qa-1',
          question: 'Are you available to start immediately in Stuttgart?',
          keywords: ['available', 'start', 'immediately', 'stuttgart'],
          answer: 'Yes, available immediately',
          category: 'Availability'
        },
        {
          id: 'qa-2',
          question: 'Do you require visa sponsorship?',
          keywords: ['visa', 'sponsorship', 'require'],
          answer: 'Nein',
          category: 'Legal'
        }
      ]
    };

    // 1. Text field matching
    const fText = createMockField({
      labelText: 'Are you available to start immediately in Stuttgart?'
    });

    const [matchText] = matcher.matchFields([fText], customProfile);
    expect(matchText).toBeDefined();
    expect(matchText.targetValue).toBe('Yes, available immediately');
    expect(matchText.confidence).toBeGreaterThanOrEqual(0.90);
    expect(matchText.suggestedAction).toBe('fill');

    // 2. Radio group matching (Nein radio should be filled, Ja radio should be skipped)
    const fRadioNein = createMockField({
      type: 'radio',
      labelText: 'Nein',
      currentValue: 'no',
      fieldsetLegend: 'Do you require visa sponsorship for Germany?'
    });

    const fRadioJa = createMockField({
      type: 'radio',
      labelText: 'Ja',
      currentValue: 'yes',
      fieldsetLegend: 'Do you require visa sponsorship for Germany?'
    });

    const radioMatches = matcher.matchFields([fRadioNein, fRadioJa], customProfile);
    const mNein = radioMatches.find((m) => m.detectedField.id === fRadioNein.id);
    const mJa = radioMatches.find((m) => m.detectedField.id === fRadioJa.id);

    expect(mNein).toBeDefined();
    expect(mNein?.targetValue).toBe(true);
    expect(mNein?.suggestedAction).toBe('fill');

    expect(mJa).toBeDefined();
    expect(mJa?.targetValue).toBe(false);
    expect(mJa?.suggestedAction).toBe('skip');
  });

  it('accurately resolves What is your availability or notice period? to Immediately', () => {
    const matcher = new FieldMatcher();
    const fNotice = createMockField({
      labelText: 'What is your availability or notice period?'
    });

    const [match] = matcher.matchFields([fNotice], DEFAULT_USER_PROFILE);
    expect(match).toBeDefined();
    expect(match.targetValue).toBe('Immediately');
    expect(match.confidence).toBeGreaterThanOrEqual(0.85);
    expect(match.suggestedAction).toBe('fill');
  });
});
