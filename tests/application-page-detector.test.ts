import { describe, expect, it } from 'vitest';
import { ApplicationPageDetector } from '../src/content/application-page-detector';
import { QuestionLearner } from '../src/content/question-learner';
import { DetectedField } from '../src/types/engine';

function field(overrides: Partial<DetectedField>): DetectedField {
  return {
    id: Math.random().toString(),
    element: { getAttribute: () => null } as any,
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
    rect: { top: 0, left: 0, width: 1, height: 1 },
    ...overrides
  };
}

describe('Application-page learning guard', () => {
  const internshipFields = () => [
    field({ type: 'date', labelText: 'Wann stehen Sie für ein Praktikum zur Verfügung?' }),
    field({ type: 'select', labelText: 'Wie viele Monate stehen Ihnen für ein Praktikum zur Verfügung?' }),
    field({ type: 'select', labelText: 'Sind Sie für ein Praktikum als Voll- oder Teilzeitkraft verfügbar?' }),
    ...['Ja', 'Nein'].map((labelText) => field({ type: 'radio', labelText,
      fieldsetLegend: 'Müssen Sie im Rahmen Ihres Praktikums eine Abschlussarbeit oder einen Bericht für Ihre Hochschule schreiben?' })),
    field({ type: 'select', labelText: 'Wie haben Sie von uns erfahren?' })
  ];

  it('recognizes the internship step with one radio pair, dates and dropdowns', () => {
    const result = ApplicationPageDetector.detect(
      'https://www.tesla.com/de_DE/careers/search/job/apply/123', 'Bewerbung', internshipFields(),
      'Bewerbung Machine Learning Intern Schritt 2 von 3 Berufserfahrung Zurück Weiter'
    );
    expect(result.isApplication).toBe(true);
    expect(result.reasons).toContain('application screening step');
  });

  it('recognizes short steps without requiring four radios or five fields', () => {
    expect(ApplicationPageDetector.detect('https://jobs.example.com/application/123', 'Job application',
      internshipFields().slice(1, 3), 'Application Step 2 of 3 Internship details Back Continue').isApplication).toBe(true);
  });

  it('keeps a generic multi-step survey inactive', () => {
    expect(ApplicationPageDetector.detect('https://example.com/survey', 'Step 2 of 3',
      internshipFields(), 'Step 2 of 3 Tell us about yourself').isApplication).toBe(false);
  });
  it('activates only when several job-application signals agree', () => {
    const fields = [
      field({ labelText: 'First name' }),
      field({ labelText: 'Last name' }),
      field({ labelText: 'Email address', type: 'email' }),
      field({ labelText: 'What is your experience with ANSYS?' }),
      field({ labelText: 'Resume / CV', type: 'file' })
    ];

    const result = ApplicationPageDetector.detect(
      'https://careers.example.com/application/123',
      'Application – Simulation Engineer',
      fields,
      'Complete your application and submit your application.'
    );

    expect(result.isApplication).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.56);
  });

  it('does not activate on a careers listing or generic form', () => {
    const result = ApplicationPageDetector.detect(
      'https://careers.example.com/jobs',
      'Open jobs',
      [field({ labelText: 'Search jobs', name: 'search' })],
      'Search jobs and subscribe to our newsletter.'
    );

    expect(result.isApplication).toBe(false);
  });

  it('learns custom answers but refuses profile fields and legal checkboxes', () => {
    expect(QuestionLearner.getLearnableAnswer(field({
      labelText: 'What simulation tool do you use most?',
      currentValue: 'ANSYS Mechanical'
    }))).toEqual({ question: 'What simulation tool do you use most?', answer: 'ANSYS Mechanical' });

    expect(QuestionLearner.getLearnableAnswer(field({
      labelText: 'Email address',
      type: 'email',
      currentValue: 'person@example.com'
    }))).toBeNull();

    expect(QuestionLearner.getLearnableAnswer(field({
      labelText: 'I agree to the Privacy Policy',
      type: 'checkbox',
      isChecked: true
    }))).toBeNull();
  });
});
