import { describe, it, expect } from 'vitest';
import { FieldDetector } from '../src/content/field-detector';
import { FieldMatcher } from '../src/content/field-matcher';
import { QuestionDetector } from '../src/content/question-learner';
import { DEFAULT_USER_PROFILE } from '../src/storage/default-profile';
import { DetectedField } from '../src/types/engine';

function createMockField(overrides: Partial<DetectedField>): DetectedField {
  return {
    id: 'mock-1',
    element: {} as HTMLElement,
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

describe('Field Matcher & Synonyms Engine', () => {
  const matcher = new FieldMatcher();
  const profile = DEFAULT_USER_PROFILE;

  it('matches English and German first name variations', () => {
    const variations = ['First Name', 'Firstname', 'Given Name', 'Vorname', 'Forename'];
    for (const label of variations) {
      const field = createMockField({ labelText: label, name: 'fname' });
      const [match] = matcher.matchFields([field], profile);
      expect(match).toBeDefined();
      expect(match.matchedProfilePath).toBe('basic.firstName');
      expect(match.targetValue).toBe(profile.basic.firstName);
      expect(match.confidence).toBeGreaterThanOrEqual(0.70);
    }
  });

  it('matches English and German last name variations', () => {
    const variations = ['Last Name', 'Surname', 'Family Name', 'Nachname', 'Familienname'];
    for (const label of variations) {
      const field = createMockField({ labelText: label, name: 'lname' });
      const [match] = matcher.matchFields([field], profile);
      expect(match).toBeDefined();
      expect(match.matchedProfilePath).toBe('basic.lastName');
      expect(match.targetValue).toBe(profile.basic.lastName);
      expect(match.confidence).toBeGreaterThanOrEqual(0.70);
    }
  });

  it('matches Email and E-Mail-Adresse variations', () => {
    const variations = ['Email', 'E-Mail', 'Email Address', 'E-Mail-Adresse', 'Mail'];
    for (const label of variations) {
      const field = createMockField({ labelText: label, type: 'email', name: 'email' });
      const [match] = matcher.matchFields([field], profile);
      expect(match).toBeDefined();
      expect(match.matchedProfilePath).toBe('contact.email');
      expect(match.targetValue).toBe(profile.contact.email);
    }
  });

  it('matches Phone and Telefonnummer variations', () => {
    const variations = ['Phone', 'Telephone', 'Telefonnummer', 'Handynummer', 'Contact Number'];
    for (const label of variations) {
      const field = createMockField({ labelText: label, type: 'tel', name: 'phone' });
      const [match] = matcher.matchFields([field], profile);
      expect(match).toBeDefined();
      expect(match.matchedProfilePath).toBe('contact.phone');
      expect(match.targetValue).toBe(profile.contact.phone);
    }
  });

  it('matches Salary expectations and Gehaltsvorstellung', () => {
    const variations = ['Salary Expectation', 'Gehaltsvorstellung', 'Desired Salary', 'Gehaltswunsch'];
    for (const label of variations) {
      const field = createMockField({ labelText: label, name: 'salary' });
      const [match] = matcher.matchFields([field], profile);
      expect(match).toBeDefined();
      expect(match.matchedProfilePath).toBe('salary.expectedAnnual');
      expect(match.targetValue).toBe(profile.salary.expectedAnnual);
    }
  });

  it('matches earliest start date and availability in German and English', () => {
    const variations = ['Earliest Start Date', 'Available From', 'Verfügbar ab', 'Frühestmöglicher Eintrittstermin'];
    for (const label of variations) {
      const field = createMockField({ labelText: label, name: 'available' });
      const [match] = matcher.matchFields([field], profile);
      expect(match).toBeDefined();
      expect(match.matchedProfilePath).toBe('jobPreferences.earliestStartDate');
    }
  });

  it('accurately matches Tesla Careers German application fields', () => {
    const teslaUrl = 'https://www.tesla.com/de_DE/careers/search/job/apply/278164';

    const f1 = createMockField({ labelText: 'Vorname' });
    const f2 = createMockField({ labelText: 'Legaler Nachname' });
    const f3 = createMockField({ labelText: 'Zweiter Vorname (optional)' });
    const f4 = createMockField({ labelText: 'Bevorzugter Name (optional)' });
    const f5Country = createMockField({ labelText: 'Telefon', tag: 'button', currentValue: 'US +1' });
    const f5Input = createMockField({ labelText: 'Telefon', tag: 'input', type: 'tel' });
    const f6 = createMockField({ labelText: 'Kontakt - Telefontyp', tag: 'button' });
    const f7 = createMockField({ labelText: 'E-Mail', type: 'email' });
    const f8 = createMockField({ labelText: 'Land/Region des Wohnsitzes', tag: 'select' });

    const matches = matcher.matchFields([f1, f2, f3, f4, f5Country, f5Input, f6, f7, f8], profile, teslaUrl);

    expect(matches[0].matchedProfilePath).toBe('basic.firstName');
    expect(matches[0].targetValue).toBe('Alex');

    expect(matches[1].matchedProfilePath).toBe('basic.lastName');
    expect(matches[1].targetValue).toBe('Example');

    expect(matches[2].matchedProfilePath).toBe('basic.middleName');

    expect(matches[3].matchedProfilePath).toBe('basic.preferredName');
    expect(matches[3].targetValue).toBe('Alex');

    // Phone Country Code button -> DE +49
    expect(matches[4].matchedProfilePath).toBe('contact.phoneCountryCode');
    expect(matches[4].targetValue).toBe('DE +49');
    expect(matches[4].selectedOptionValue).toBe('+49');

    // Phone Number input -> 0000000000 (national digits without +49)
    expect(matches[5].matchedProfilePath).toBe('contact.phone');
    expect(matches[5].targetValue).toBe('0000000000');

    // Phone Type dropdown -> Mobil
    expect(matches[6].matchedProfilePath).toBe('contact.phoneDevice');
    expect(matches[6].targetValue).toBe('Mobil');
    expect(matches[6].selectedOptionValue).toBe('Mobil');

    expect(matches[7].matchedProfilePath).toBe('contact.email');
    expect(matches[7].targetValue).toBe(profile.contact.email);

    expect(matches[8].matchedProfilePath).toBe('address.country');
    expect(matches[8].targetValue).toBe('Deutschland');
    expect(matches[8].selectedOptionValue).toBe('Deutschland');
  });

  it('accurately matches Tesla Careers English application fields (Berlin CAE position)', () => {
    const teslaUrl = 'https://www.tesla.com/careers/search/job/apply/266635?source=LinkedIn&source=LinkedIn';

    const fFirst = createMockField({ labelText: 'First Name' });
    const fLast = createMockField({ labelText: 'Legal Last Name' });
    const fDevice = createMockField({ labelText: 'Phone Device', tag: 'button' });
    const fCountry = createMockField({ labelText: 'Phone Number', tag: 'button', currentValue: 'US +1' });
    const fPhone = createMockField({ labelText: 'Phone Number', tag: 'input', type: 'tel', placeholder: '(201) 555-0123' });
    const fEmail = createMockField({ labelText: 'Email', type: 'email' });
    const fCountryRes = createMockField({ labelText: 'Country of Residence', tag: 'button' });

    const matches = matcher.matchFields([fFirst, fLast, fDevice, fCountry, fPhone, fEmail, fCountryRes], profile, teslaUrl);

    expect(matches[0].matchedProfilePath).toBe('basic.firstName');
    expect(matches[0].targetValue).toBe('Alex');

    expect(matches[1].matchedProfilePath).toBe('basic.lastName');
    expect(matches[1].targetValue).toBe('Example');

    // Phone Device -> Mobile
    expect(matches[2].matchedProfilePath).toBe('contact.phoneDevice');
    expect(matches[2].targetValue).toBe('Mobile');
    expect(matches[2].selectedOptionValue).toBe('Mobile');
    expect(matches[2].displayLabel).toContain('Phone Device');

    // Phone Country Code button -> DE +49
    expect(matches[3].matchedProfilePath).toBe('contact.phoneCountryCode');
    expect(matches[3].targetValue).toBe('DE +49');
    expect(matches[3].selectedOptionValue).toBe('+49');

    // Phone Number input -> 0000000000 (clean national digits without +49)
    expect(matches[4].matchedProfilePath).toBe('contact.phone');
    expect(matches[4].targetValue).toBe('0000000000');

    expect(matches[5].matchedProfilePath).toBe('contact.email');
    expect(matches[5].targetValue).toBe(profile.contact.email);

    expect(matches[6].matchedProfilePath).toBe('address.country');
    expect(matches[6].selectedOptionValue).toBe('DE');
  });

  it('accurately matches Tesla Phone Device Type dropdown with options (Fax, Mobile, Pager, Telephone, VoIP)', () => {
    const teslaUrl = 'https://www.tesla.com/careers/search/job/apply/266635';

    const fDevice = createMockField({
      labelText: 'Phone Device Type',
      tag: 'select',
      options: [
        { value: '', text: 'Select One' },
        { value: 'fax', text: 'Fax' },
        { value: 'mobile', text: 'Mobile' },
        { value: 'pager', text: 'Pager' },
        { value: 'telephone', text: 'Telephone' },
        { value: 'voip', text: 'VoIP' }
      ]
    });

    const [match] = matcher.matchFields([fDevice], profile, teslaUrl);
    expect(match).toBeDefined();
    expect(match.matchedProfilePath).toBe('contact.phoneDevice');
    expect(match.targetValue).toBe('Mobile');
    expect(match.selectedOptionValue).toBe('mobile');
    expect(match.displayLabel).toContain('Phone Device');
  });

  it('accurately matches Workday phone number as clean national digits without extensions or gaps', () => {
    const workdayUrl = 'https://mycompany.myworkdayjobs.com/en-US/careers/job/12345/apply';

    const fPhone = createMockField({
      labelText: 'Phone Number',
      tag: 'input',
      type: 'tel',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'phone-number' : null),
        parentElement: null
      } as any
    });

    const [match] = matcher.matchFields([fPhone], profile, workdayUrl);
    expect(match).toBeDefined();
    expect(match.matchedProfilePath).toBe('contact.phone');
    expect(match.targetValue).toBe('0000000000');
    expect(match.displayLabel).toContain('Workday Phone');
  });

  it('accurately matches Tesla Careers Step 2 (Rechtliche Hinweise & Fragen)', () => {
    const teslaUrl = 'https://www.tesla.com/de_DE/careers/search/job/apply/278164';

    // 1. Availability dropdown
    const fAvailability = createMockField({
      labelText: 'Wie ist Ihre Verfügbarkeit oder Kündigungsfrist?',
      tag: 'select'
    });

    // 2. Sponsorship radio buttons (Ja vs Nein)
    const fSponNo = createMockField({
      type: 'radio',
      labelText: 'Nein',
      fieldsetLegend: 'Werden Sie jetzt oder in Zukunft eine Einwanderungspatenschaft für eine Beschäftigung bei Tesla benötigen?'
    });
    const fSponYes = createMockField({
      type: 'radio',
      labelText: 'Ja',
      fieldsetLegend: 'Werden Sie jetzt oder in Zukunft eine Einwanderungspatenschaft für eine Beschäftigung bei Tesla benötigen?'
    });

    // 3. Talent Pool (Ja)
    const fPoolYes = createMockField({
      type: 'radio',
      labelText: 'Ja',
      fieldsetLegend: 'Ich ermächtige Tesla, mich zusätzlich zu der konkreten Stelle für andere Stellenangebote innerhalb der nächsten 12 Monate zu berücksichtigen.'
    });

    // 4. Prior employment (Nein)
    const fPriorNo = createMockField({
      type: 'radio',
      labelText: 'Nein',
      fieldsetLegend: 'Waren Sie schon einmal bei Tesla beschäftigt?'
    });

    // 5. Former intern (Nein)
    const fInternNo = createMockField({
      type: 'radio',
      labelText: 'Nein',
      fieldsetLegend: 'Sind Sie ein ehemaliger Praktikant oder Auftragnehmer?'
    });

    // 6. University student (Nein)
    const fStudentNo = createMockField({
      type: 'radio',
      labelText: 'Nein',
      fieldsetLegend: 'Sind Sie derzeit Universitätsstudent?'
    });

    // 7. SMS Consent (Ja)
    const fSmsYes = createMockField({
      type: 'radio',
      labelText: 'Ja',
      fieldsetLegend: 'Sind Sie damit einverstanden, während des gesamten Bewerbungsverfahrens Textnachrichten zu empfangen?'
    });

    // 8. Declaration Checkbox (manual decision)
    const fDeclaration = createMockField({
      type: 'checkbox',
      labelText: 'Ich habe die vorstehenden Ausführungen gelesen und verstanden und akzeptiere sie als Beschäftigungsbedingungen.'
    });

    // 9. Legal Name Input
    const fLegalName = createMockField({
      type: 'text',
      labelText: 'Legaler Name'
    });

    const matches = matcher.matchFields(
      [
        fAvailability,
        fSponNo,
        fSponYes,
        fPoolYes,
        fPriorNo,
        fInternNo,
        fStudentNo,
        fSmsYes,
        fDeclaration,
        fLegalName
      ],
      profile,
      teslaUrl
    );

    // Availability -> Unmittelbar
    const mAvail = matches.find((m) => m.detectedField === fAvailability);
    expect(mAvail?.targetValue).toBe('Unmittelbar');
    expect(mAvail?.suggestedAction).toBe('fill');

    // Sponsorship -> Nein is filled, Ja is skipped
    const mSponNo = matches.find((m) => m.detectedField === fSponNo);
    expect(mSponNo?.suggestedAction).toBe('fill');
    expect(mSponNo?.targetValue).toBe(true);

    const mSponYes = matches.find((m) => m.detectedField === fSponYes);
    expect(mSponYes?.suggestedAction).toBe('skip');

    // Talent Pool -> Ja is filled
    const mPoolYes = matches.find((m) => m.detectedField === fPoolYes);
    expect(mPoolYes?.suggestedAction).toBe('fill');
    expect(mPoolYes?.targetValue).toBe(true);

    // Prior employment -> Nein is filled
    const mPriorNo = matches.find((m) => m.detectedField === fPriorNo);
    expect(mPriorNo?.suggestedAction).toBe('fill');
    expect(mPriorNo?.targetValue).toBe(true);

    // Former intern -> Nein is filled
    const mInternNo = matches.find((m) => m.detectedField === fInternNo);
    expect(mInternNo?.suggestedAction).toBe('fill');
    expect(mInternNo?.targetValue).toBe(true);

    // Student -> Nein is filled
    const mStudentNo = matches.find((m) => m.detectedField === fStudentNo);
    expect(mStudentNo?.suggestedAction).toBe('fill');
    expect(mStudentNo?.targetValue).toBe(true);

    // SMS -> Ja is filled
    const mSmsYes = matches.find((m) => m.detectedField === fSmsYes);
    expect(mSmsYes?.suggestedAction).toBe('fill');
    expect(mSmsYes?.targetValue).toBe(true);

    // Declaration Checkbox stays a manual decision, including on Tesla.
    const mDecl = matches.find((m) => m.detectedField === fDeclaration);
    expect(mDecl?.suggestedAction).toBe('skip');
    expect(mDecl?.isSensitive).toBe(true);

    // Legal Name -> Alex Example
    const mName = matches.find((m) => m.detectedField === fLegalName);
    expect(mName?.suggestedAction).toBe('fill');
    expect(mName?.targetValue).toBe('Alex Example');
  });

  it('accurately matches all Workday Work Experience fields across multiple experience blocks', () => {
    const workdayUrl = 'https://mycompany.myworkdayjobs.com/en-US/careers/job/12345/apply';

    // Work Experience 1 (Example Mobility AG, current role)
    const fJob1 = createMockField({
      labelText: 'Job Title *',
      tag: 'input',
      type: 'text',
      surroundingText: 'Work Experience 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'jobTitle' : null),
        parentElement: null
      } as any
    });

    const fComp1 = createMockField({
      labelText: 'Company *',
      tag: 'input',
      type: 'text',
      surroundingText: 'Work Experience 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'company' : null),
        parentElement: null
      } as any
    });

    const fLoc1 = createMockField({
      labelText: 'Location',
      tag: 'input',
      type: 'text',
      surroundingText: 'Work Experience 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'location' : null),
        parentElement: null
      } as any
    });

    const fCurrent1 = createMockField({
      labelText: 'I currently work here',
      tag: 'input',
      type: 'checkbox',
      surroundingText: 'Work Experience 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'currentlyWorkHere' : null),
        parentElement: null
      } as any
    });

    const fFrom1 = createMockField({
      labelText: 'From *',
      placeholder: 'MM/YYYY',
      tag: 'input',
      type: 'text',
      surroundingText: 'Work Experience 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'startDate' : null),
        parentElement: null
      } as any
    });

    const fTo1 = createMockField({
      labelText: 'To *',
      placeholder: 'MM/YYYY',
      tag: 'input',
      type: 'text',
      surroundingText: 'Work Experience 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'endDate' : null),
        parentElement: null
      } as any
    });

    const fDesc1 = createMockField({
      labelText: 'Role Description',
      tag: 'textarea',
      type: 'textarea',
      surroundingText: 'Work Experience 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'roleDescription' : null),
        parentElement: null
      } as any
    });

    // Work Experience 2 (Example Sensors GmbH, past role)
    const fJob2 = createMockField({
      labelText: 'Job Title *',
      tag: 'input',
      type: 'text',
      surroundingText: 'Work Experience 2',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'jobTitle' : null),
        parentElement: null
      } as any
    });

    const fComp2 = createMockField({
      labelText: 'Company *',
      tag: 'input',
      type: 'text',
      surroundingText: 'Work Experience 2',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'company' : null),
        parentElement: null
      } as any
    });

    const fCurrent2 = createMockField({
      labelText: 'I currently work here',
      tag: 'input',
      type: 'checkbox',
      surroundingText: 'Work Experience 2',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'currentlyWorkHere' : null),
        parentElement: null
      } as any
    });

    const fFrom2 = createMockField({
      labelText: 'From *',
      placeholder: 'MM/YYYY',
      tag: 'input',
      type: 'text',
      surroundingText: 'Work Experience 2',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'startDate' : null),
        parentElement: null
      } as any
    });

    const fTo2 = createMockField({
      labelText: 'To *',
      placeholder: 'MM/YYYY',
      tag: 'input',
      type: 'text',
      surroundingText: 'Work Experience 2',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'endDate' : null),
        parentElement: null
      } as any
    });

    // Work Experience 3 & 4
    const fJob3 = createMockField({
      labelText: 'Job Title *',
      tag: 'input',
      type: 'text',
      surroundingText: 'Work Experience 3',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'jobTitle' : null),
        parentElement: null
      } as any
    });

    const fJob4 = createMockField({
      labelText: 'Job Title *',
      tag: 'input',
      type: 'text',
      surroundingText: 'Work Experience 4',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'jobTitle' : null),
        parentElement: null
      } as any
    });

    const matches = matcher.matchFields(
      [fJob1, fComp1, fLoc1, fCurrent1, fFrom1, fTo1, fDesc1, fJob2, fComp2, fCurrent2, fFrom2, fTo2, fJob3, fJob4],
      profile,
      workdayUrl
    );

    // Block 1 (Example Mobility AG)
    const mJob1 = matches.find((m) => m.detectedField === fJob1);
    expect(mJob1?.targetValue).toBe('Intern - CAE & AI Surrogate Modeling');
    expect(mJob1?.suggestedAction).toBe('fill');

    const mComp1 = matches.find((m) => m.detectedField === fComp1);
    expect(mComp1?.targetValue).toBe('Example Mobility AG');

    const mLoc1 = matches.find((m) => m.detectedField === fLoc1);
    expect(mLoc1?.targetValue).toBe('Example City, Germany');

    const mCurr1 = matches.find((m) => m.detectedField === fCurrent1);
    expect(mCurr1?.targetValue).toBe(true);

    const mFrom1 = matches.find((m) => m.detectedField === fFrom1);
    expect(mFrom1?.targetValue).toBe('04/2026');

    const mTo1 = matches.find((m) => m.detectedField === fTo1);
    expect(mTo1?.suggestedAction).toBe('skip');

    const mDesc1 = matches.find((m) => m.detectedField === fDesc1);
    expect(mDesc1?.targetValue).toContain('Example simulation engineering responsibilities');
    expect(mDesc1?.targetValue).toContain('• ');

    // Block 2 (Example Sensors GmbH)
    const mJob2 = matches.find((m) => m.detectedField === fJob2);
    expect(mJob2?.targetValue).toBe('Intern - Vibroacoustic Simulation & Automation');

    const mComp2 = matches.find((m) => m.detectedField === fComp2);
    expect(mComp2?.targetValue).toBe('Example Sensors GmbH');

    const mCurr2 = matches.find((m) => m.detectedField === fCurrent2);
    expect(mCurr2?.targetValue).toBe(false);

    const mFrom2 = matches.find((m) => m.detectedField === fFrom2);
    expect(mFrom2?.targetValue).toBe('09/2025');

    const mTo2 = matches.find((m) => m.detectedField === fTo2);
    expect(mTo2?.targetValue).toBe('03/2026');
    expect(mTo2?.suggestedAction).toBe('fill');

    // Block 3 & 4
    const mJob3 = matches.find((m) => m.detectedField === fJob3);
    expect(mJob3?.targetValue).toBe('Master Thesis Student - Electric Powertrain NVH');

    const mJob4 = matches.find((m) => m.detectedField === fJob4);
    expect(mJob4?.targetValue).toBe('Working Student - Simulation & Thermo-Mechanics');
  });

  it('accurately matches all Workday Education fields across multiple education blocks', () => {
    const workdayUrl = 'https://mycompany.myworkdayjobs.com/en-US/careers/job/12345/apply';

    // Education 1 (example Master's)
    const fSchool1 = createMockField({
      labelText: 'School or University *',
      tag: 'input',
      type: 'text',
      surroundingText: 'Education 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'school' : null),
        parentElement: null
      } as any
    });

    const fDegree1 = createMockField({
      labelText: 'Degree *',
      tag: 'select',
      type: 'select',
      surroundingText: 'Education 1',
      options: [
        { value: 'select_one', text: 'Select One' },
        { value: 'bachelor', text: "Bachelor's Degree" },
        { value: 'master', text: "Master's Degree" },
        { value: 'phd', text: 'Doctorate' }
      ],
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'degree' : null),
        parentElement: null
      } as any
    });

    const fField1 = createMockField({
      labelText: 'Field of Study',
      tag: 'input',
      type: 'text',
      surroundingText: 'Education 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'field-of-study' : null),
        parentElement: null
      } as any
    });

    const fFrom1 = createMockField({
      labelText: 'From',
      placeholder: 'YYYY',
      tag: 'input',
      type: 'text',
      surroundingText: 'Education 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'startDate' : null),
        parentElement: null
      } as any
    });

    const fTo1 = createMockField({
      labelText: 'To',
      placeholder: 'YYYY',
      tag: 'input',
      type: 'text',
      surroundingText: 'Education 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'endDate' : null),
        parentElement: null
      } as any
    });

    const fGpa1 = createMockField({
      labelText: 'Overall Result (GPA)',
      tag: 'input',
      type: 'text',
      surroundingText: 'Education 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'gpa' : null),
        parentElement: null
      } as any
    });

    // Education 2 (KITS Bachelor's)
    const fSchool2 = createMockField({
      labelText: 'School or University *',
      tag: 'input',
      type: 'text',
      surroundingText: 'Education 2',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'school' : null),
        parentElement: null
      } as any
    });

    const fDegree2 = createMockField({
      labelText: 'Degree *',
      tag: 'select',
      type: 'select',
      surroundingText: 'Education 2',
      options: [
        { value: 'select_one', text: 'Select One' },
        { value: 'bachelor', text: "Bachelor's Degree" },
        { value: 'master', text: "Master's Degree" }
      ],
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'degree' : null),
        parentElement: null
      } as any
    });

    const fField2 = createMockField({
      labelText: 'Field of Study',
      tag: 'input',
      type: 'text',
      surroundingText: 'Education 2',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'field-of-study' : null),
        parentElement: null
      } as any
    });

    const fFrom2 = createMockField({
      labelText: 'From',
      placeholder: 'YYYY',
      tag: 'input',
      type: 'text',
      surroundingText: 'Education 2',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'startDate' : null),
        parentElement: null
      } as any
    });

    const fTo2 = createMockField({
      labelText: 'To',
      placeholder: 'YYYY',
      tag: 'input',
      type: 'text',
      surroundingText: 'Education 2',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'endDate' : null),
        parentElement: null
      } as any
    });

    const matches = matcher.matchFields(
      [fSchool1, fDegree1, fField1, fFrom1, fTo1, fGpa1, fSchool2, fDegree2, fField2, fFrom2, fTo2],
      profile,
      workdayUrl
    );

    // Education 1 assertions
    const mSchool1 = matches.find((m) => m.detectedField === fSchool1);
    expect(mSchool1?.targetValue).toBe('Example Technical University');
    expect(mSchool1?.suggestedAction).toBe('fill');

    const mDegree1 = matches.find((m) => m.detectedField === fDegree1);
    expect(mDegree1?.targetValue).toBe('Master of Science (M.Sc.)');
    expect(mDegree1?.selectedOptionValue).toBe('master');

    const mField1 = matches.find((m) => m.detectedField === fField1);
    expect(mField1?.targetValue).toBe('Computational Engineering');

    const mFrom1 = matches.find((m) => m.detectedField === fFrom1);
    expect(mFrom1?.targetValue).toBe('2022');

    const mTo1 = matches.find((m) => m.detectedField === fTo1);
    expect(mTo1?.targetValue).toBe('2026');

    const mGpa1 = matches.find((m) => m.detectedField === fGpa1);
    expect(mGpa1?.targetValue).toBe('2.0');

    // Education 2 assertions
    const mSchool2 = matches.find((m) => m.detectedField === fSchool2);
    expect(mSchool2?.targetValue).toBe('Example Engineering College');

    const mDegree2 = matches.find((m) => m.detectedField === fDegree2);
    expect(mDegree2?.targetValue).toBe('Bachelor of Technology (B.Tech.)');
    expect(mDegree2?.selectedOptionValue).toBe('bachelor');

    const mField2 = matches.find((m) => m.detectedField === fField2);
    expect(mField2?.targetValue).toBe('Mechanical Engineering');

    const mFrom2 = matches.find((m) => m.detectedField === fFrom2);
    expect(mFrom2?.targetValue).toBe('2018');

    const mTo2 = matches.find((m) => m.detectedField === fTo2);
    expect(mTo2?.targetValue).toBe('2022');
  });

  it('formats Workday Role Description with clean generic bullet points', () => {
    const workdayUrl = 'https://mercedesbenz.wd3.myworkdayjobs.com/Example Mobility_Careers/job/Stuttgart/CAE-Engineer_JR123/apply';

    const fDesc1 = createMockField({
      labelText: 'Role Description',
      tag: 'textarea',
      type: 'textarea',
      surroundingText: 'Work Experience 1',
      element: {
        getAttribute: (attr: string) => (attr === 'data-automation-id' ? 'roleDescription' : null),
        parentElement: null
      } as any
    });

    const matches = matcher.matchFields([fDesc1], profile, workdayUrl);
    expect(matches.length).toBe(1);
    expect(matches[0].targetValue).toContain('• ');
    expect(matches[0].targetValue).toContain('Example simulation engineering responsibilities');
    expect(matches[0].targetValue).toContain('Example automation and validation project');
  });

  it('accurately matches DigitalService and German portal demographic, language, availability, and screening questions', () => {
    const portalUrl = 'https://digitalservice.jobs.personio.de/job/12345/apply';

    // 1. LinkedIn
    const fLinkedIn = createMockField({
      labelText: 'LinkedIn',
      name: 'linkedin'
    });

    // 2. Webpage
    const fWebpage = createMockField({
      labelText: 'Webpage',
      name: 'webpage'
    });

    // 3. Gehaltsvorstellung
    const fSalary = createMockField({
      labelText: 'Gehaltsvorstellung',
      name: 'salary'
    });

    // 4. Verfügbarkeit*
    const fAvailability = createMockField({
      labelText: 'Verfügbarkeit*',
      surroundingText: 'Wenn du dich gerade in einem Arbeitsverhältnis befindest, gib hier deine Kündigungsfrist an, wenn du direkt im Anschluss mit deinem neuen Job beginnen möchtest.',
      name: 'notice_period'
    });

    // 5. Wie hast du von uns erfahren?
    const fReferral = createMockField({
      labelText: 'Wie hast du von uns erfahren?',
      tag: 'select',
      type: 'select',
      name: 'referral_source',
      options: [
        { value: '', text: 'Auswählen ...' },
        { value: 'linkedin', text: 'LinkedIn' },
        { value: 'jobboard', text: 'Jobbörse' },
        { value: 'other', text: 'Sonstiges' }
      ]
    });

    // 6. Hast du eine gültige EU-Staatsbürgerschaft oder Arbeitserlaubnis?*
    const fWorkPermit = createMockField({
      labelText: 'Hast du eine gültige EU-Staatsbürgerschaft oder Arbeitserlaubnis?*',
      tag: 'select',
      type: 'select',
      name: 'work_permit',
      options: [
        { value: '', text: 'Auswählen ...' },
        { value: 'ja', text: 'Ja' },
        { value: 'nein', text: 'Nein' }
      ]
    });

    // 7. Wie würdest du deine Deutsch-Sprachkenntnisse bewerten?*
    const fGerman = createMockField({
      labelText: 'Wie würdest du deine Deutsch-Sprachkenntnisse bewerten?*',
      tag: 'select',
      type: 'select',
      name: 'german_skills',
      options: [
        { value: '', text: 'Auswählen ...' },
        { value: 'a1', text: 'A1 - Einstieg' },
        { value: 'a2', text: 'A2 - Grundlagen' },
        { value: 'b1', text: 'B1 - Mittelstufe' },
        { value: 'b2', text: 'B2 - Gute Mittelstufe' },
        { value: 'c1', text: 'C1 - Fortgeschritten' },
        { value: 'c2', text: 'C2 - Verhandlungssicher / Muttersprachlich' }
      ]
    });

    // 8. Wie würdest du deine Englisch-Sprachkenntnisse bewerten?*
    const fEnglish = createMockField({
      labelText: 'Wie würdest du deine Englisch-Sprachkenntnisse bewerten?*',
      tag: 'select',
      type: 'select',
      name: 'english_skills',
      options: [
        { value: '', text: 'Auswählen ...' },
        { value: 'b1', text: 'B1 - Intermediate' },
        { value: 'b2', text: 'B2 - Upper Intermediate' },
        { value: 'c1', text: 'C1 - Advanced' },
        { value: 'c2', text: 'C2 - Fluent / Full Professional' }
      ]
    });

    // 9. Wie würdest du dein Geschlecht beschreiben? / How would you describe your gender?
    const fGender = createMockField({
      labelText: 'Wie würdest du dein Geschlecht beschreiben? / How would you describe your gender?',
      tag: 'select',
      type: 'select',
      name: 'gender',
      options: [
        { value: '', text: 'Auswählen ...' },
        { value: 'weiblich', text: 'Weiblich / Female' },
        { value: 'maennlich', text: 'Männlich / Male' },
        { value: 'nicht_binaer', text: 'Nicht-binär / Non-binary' },
        { value: 'keine_angabe', text: 'Keine Angabe / Prefer not to say' }
      ]
    });

    // 10. Welche Nationalität (oder Nationalitäten) besitzt du? / Which nationality (or nationalities) do you have?
    const fNationality = createMockField({
      labelText: 'Welche Nationalität (oder Nationalitäten) besitzt du? / Which nationality (or nationalities) do you have?',
      tag: 'select',
      type: 'select',
      name: 'nationality',
      options: [
        { value: '', text: 'Auswählen ...' },
        { value: 'deutsch', text: 'Deutsch / German' },
        { value: 'indisch', text: 'Indisch / Indian' },
        { value: 'andere', text: 'Andere / Other' }
      ]
    });

    // 11. Welche ist deine Altersgruppe? / What is your age group?
    const fAgeGroup = createMockField({
      labelText: 'Welche ist deine Altersgruppe? / What is your age group?',
      tag: 'select',
      type: 'select',
      name: 'age_group',
      options: [
        { value: '', text: 'Auswählen ...' },
        { value: 'unter_20', text: 'Unter 20' },
        { value: '20_29', text: '20-29' },
        { value: '30_39', text: '30-39' },
        { value: '40_49', text: '40-49' },
        { value: '50_plus', text: '50+' }
      ]
    });

    const allFields = [
      fLinkedIn,
      fWebpage,
      fSalary,
      fAvailability,
      fReferral,
      fWorkPermit,
      fGerman,
      fEnglish,
      fGender,
      fNationality,
      fAgeGroup
    ];

    const matches = matcher.matchFields(allFields, profile, portalUrl);

    // 1. LinkedIn URL
    const mLinkedIn = matches.find((m) => m.detectedField === fLinkedIn);
    expect(mLinkedIn).toBeDefined();
    expect(mLinkedIn?.targetValue).toBe(profile.contact.linkedin);
    expect(mLinkedIn?.suggestedAction).toBe('fill');

    // 2. Webpage URL
    const mWebpage = matches.find((m) => m.detectedField === fWebpage);
    expect(mWebpage).toBeDefined();
    expect(mWebpage?.targetValue).toContain('linkedin.com/in/alex-example');
    expect(mWebpage?.suggestedAction).toBe('fill');

    // 3. Gehaltsvorstellung -> 60000
    const mSalary = matches.find((m) => m.detectedField === fSalary);
    expect(mSalary).toBeDefined();
    expect(mSalary?.targetValue).toBe(60000);

    // 4. Verfügbarkeit* -> Sofort
    const mAvail = matches.find((m) => m.detectedField === fAvailability);
    expect(mAvail).toBeDefined();
    expect(mAvail?.targetValue).toBe('Sofort');
    expect(mAvail?.suggestedAction).toBe('fill');

    // 5. Wie hast du von uns erfahren? -> LinkedIn
    const mRef = matches.find((m) => m.detectedField === fReferral);
    expect(mRef).toBeDefined();
    expect(mRef?.targetValue).toBe('LinkedIn');
    expect(mRef?.selectedOptionValue).toBe('linkedin');

    // 6. EU-Staatsbürgerschaft oder Arbeitserlaubnis?* -> Ja
    const mPermit = matches.find((m) => m.detectedField === fWorkPermit);
    expect(mPermit).toBeDefined();
    expect(mPermit?.selectedOptionValue).toBe('ja');

    // 7. Deutsch-Sprachkenntnisse -> B1
    const mGerman = matches.find((m) => m.detectedField === fGerman);
    expect(mGerman).toBeDefined();
    expect(mGerman?.targetValue).toBe('B1');
    expect(mGerman?.selectedOptionValue).toBe('b1');

    // 8. Englisch-Sprachkenntnisse -> C2
    const mEnglish = matches.find((m) => m.detectedField === fEnglish);
    expect(mEnglish).toBeDefined();
    expect(mEnglish?.targetValue).toBe('C2');
    expect(mEnglish?.selectedOptionValue).toBe('c2');

    // 9. Geschlecht -> Männlich
    const mGender = matches.find((m) => m.detectedField === fGender);
    expect(mGender).toBeDefined();
    expect(mGender?.selectedOptionValue).toBe('maennlich');

    // 10. Nationalität -> Indisch
    const mNat = matches.find((m) => m.detectedField === fNationality);
    expect(mNat).toBeDefined();
    expect(mNat?.selectedOptionValue).toBe('indisch');

    // 11. Altersgruppe -> 20-29
    const mAge = matches.find((m) => m.detectedField === fAgeGroup);
    expect(mAge).toBeDefined();
    expect(mAge?.selectedOptionValue).toBe('20_29');

    // Verify none of these standard/demographic fields trigger the unanswered questions modal
    const unanswered = QuestionDetector.getUnansweredQuestions(allFields, matches);
    expect(unanswered.length).toBe(0);
  });

  it('accurately matches German portal Kontakt - Telefontyp : Mobil, Telefon : DE +49, and Land/Region des Wohnsitzes : Deutschland', () => {
    // Test 1: Tesla German Careers Portal
    const teslaGermanUrl = 'https://www.tesla.com/de_DE/careers/search/job/apply/278164';
    const fTeslaPhoneType = createMockField({
      labelText: 'Kontakt - Telefontyp',
      tag: 'select',
      options: [
        { value: '', text: 'Auswählen...' },
        { value: 'mobil', text: 'Mobil' },
        { value: 'festnetz', text: 'Festnetz' }
      ]
    });
    const fTeslaPhoneCountry = createMockField({
      labelText: 'Telefon',
      tag: 'button',
      currentValue: 'US +1'
    });
    const fTeslaWohnsitz = createMockField({
      labelText: 'Land/Region des Wohnsitzes',
      tag: 'select',
      options: [
        { value: '', text: 'Auswählen...' },
        { value: 'DE', text: 'Deutschland' },
        { value: 'AT', text: 'Österreich' }
      ]
    });

    const teslaMatches = matcher.matchFields(
      [fTeslaPhoneType, fTeslaPhoneCountry, fTeslaWohnsitz],
      profile,
      teslaGermanUrl
    );

    expect(teslaMatches[0].matchedProfilePath).toBe('contact.phoneDevice');
    expect(teslaMatches[0].targetValue).toBe('Mobil');
    expect(teslaMatches[0].selectedOptionValue).toBe('mobil');

    expect(teslaMatches[1].matchedProfilePath).toBe('contact.phoneCountryCode');
    expect(teslaMatches[1].targetValue).toBe('DE +49');

    expect(teslaMatches[2].matchedProfilePath).toBe('address.country');
    expect(teslaMatches[2].targetValue).toBe('Deutschland');
    expect(teslaMatches[2].selectedOptionValue).toBe('DE');

    // Test 2: Generic German Portal
    const genericGermanUrl = 'https://jobs.example.de/apply/engineer';
    const fGenericPhoneType = createMockField({
      labelText: 'Kontakt - Telefontyp',
      tag: 'select',
      options: [
        { value: '1', text: 'Mobil' },
        { value: '2', text: 'Festnetz' }
      ]
    });
    const fGenericCountryCode = createMockField({
      labelText: 'Telefon (Vorwahl)',
      name: 'phone_country_code',
      tag: 'select',
      options: [
        { value: 'US', text: 'USA (+1)' },
        { value: 'DE', text: 'DE (+49)' }
      ]
    });
    const fGenericWohnsitz = createMockField({
      labelText: 'Land/Region des Wohnsitzes',
      tag: 'select',
      options: [
        { value: 'DE', text: 'Deutschland' },
        { value: 'CH', text: 'Schweiz' }
      ]
    });

    const genericMatches = matcher.matchFields(
      [fGenericPhoneType, fGenericCountryCode, fGenericWohnsitz],
      profile,
      genericGermanUrl
    );

    expect(genericMatches[0].targetValue).toBe('Mobil');
    expect(genericMatches[0].selectedOptionValue).toBe('1');

    expect(genericMatches[1].targetValue).toBe('DE +49');
    expect(genericMatches[1].selectedOptionValue).toBe('DE');

    expect(genericMatches[2].targetValue).toBe('Deutschland');
    expect(genericMatches[2].selectedOptionValue).toBe('DE');
  });
});
