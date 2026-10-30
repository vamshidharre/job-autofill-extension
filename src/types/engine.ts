/**
 * Engine Types for Detection, Matching, and Autofill Execution
 */

export type FieldElementType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'file'
  | 'button'
  | 'combobox'
  | 'custom';

export interface DetectedOption {
  value: string;
  text: string;
}

export interface DetectedField {
  id: string; // Internal temporary ID for the run
  element: HTMLElement;
  tag: string; // 'input', 'textarea', 'select', etc.
  type: FieldElementType;
  name: string;
  htmlId: string;
  placeholder: string;
  autocomplete: string;
  ariaLabel: string;
  ariaLabelledBy: string;
  ariaDescribedBy: string;
  labelText: string;
  surroundingText: string;
  fieldsetLegend: string;
  options?: DetectedOption[];
  currentValue: string;
  isChecked?: boolean;
  isRequired: boolean;
  isDisabled: boolean;
  isReadOnly: boolean;
  isVisible: boolean;
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

export type ProfileFieldPath =
  | 'basic.firstName'
  | 'basic.middleName'
  | 'basic.lastName'
  | 'basic.fullName'
  | 'basic.preferredName'
  | 'basic.dateOfBirth'
  | 'basic.gender'
  | 'basic.nationality'
  | 'basic.countryOfBirth'
  | 'contact.email'
  | 'contact.phone'
  | 'contact.altPhone'
  | 'contact.phoneDevice'
  | 'contact.phoneCountryCode'
  | 'contact.linkedin'
  | 'contact.github'
  | 'contact.portfolio'
  | 'contact.website'
  | 'address.street'
  | 'address.houseNumber'
  | 'address.addressLine1'
  | 'address.postalCode'
  | 'address.city'
  | 'address.state'
  | 'address.country'
  | 'salary.expectedAnnual'
  | 'salary.minAnnual'
  | 'salary.currency'
  | 'salary.monthlyExpectation'
  | 'salary.negotiable'
  | 'jobPreferences.earliestStartDate'
  | 'jobPreferences.noticePeriod'
  | 'jobPreferences.willingToRelocate'
  | 'jobPreferences.willingToTravel'
  | 'jobPreferences.remotePreference'
  | 'jobPreferences.desiredTitle'
  | 'workAuthorization.legallyAuthorized'
  | 'workAuthorization.requireSponsorshipNow'
  | 'workAuthorization.requireSponsorshipFuture'
  | 'workAuthorization.currentAuthType'
  | 'education.latest.degree'
  | 'education.latest.university'
  | 'education.latest.fieldOfStudy'
  | 'education.latest.gpa'
  | 'education.latest.gradDate'
  // Non-latest education blocks (Workday multi-entry forms)
  | 'education.degree'
  | 'education.university'
  | 'education.fieldOfStudy'
  | 'education.startDate'
  | 'education.endDate'
  | 'education.gradeGpa'
  | 'experience.latest.company'
  | 'experience.latest.title'
  | 'experience.latest.description'
  | 'basic.ageGroup'
  | 'jobPreferences.referralSource'
  | 'languages.german'
  | 'languages.english'
  | 'skills.summary'
  | 'languages.summary'
  | 'customQA.answer'
  | 'learned.correction'
  | 'coverLetter.text'
  | 'document.resume'
  | 'unknown';

export interface FieldMatchResult {
  isRememberedChoice?: boolean; // The candidate explicitly selected this choice before.
  detectedField: DetectedField;
  matchedProfilePath: ProfileFieldPath;
  targetValue: string | boolean | number;
  displayLabel: string;
  confidence: number; // 0.0 - 1.0 (e.g. 0.95 = 95%)
  confidenceLevel: 'high' | 'medium' | 'low';
  matchReason: string;
  suggestedAction: 'fill' | 'review' | 'skip';
  isSensitive: boolean;
  selectedOptionValue?: string; // For select/radio
}

export interface AutofillReport {
  timestamp: string;
  url: string;
  domain: string;
  totalDetected: number;
  filledCount: number;
  reviewCount: number;
  skippedCount: number;
  results: {
    fieldId: string;
    label: string;
    value: string;
    confidence: number;
    status: 'filled' | 'needs_review' | 'skipped' | 'failed';
    reason: string;
  }[];
}

export interface QuestionChoiceOption {
  value: string;
  label: string;
}

export interface UnansweredQuestion {
  id: string;
  questionText: string;
  type: 'text' | 'textarea' | 'choice' | 'boolean';
  options?: QuestionChoiceOption[];
  currentValue?: string | boolean;
  fieldIds: string[];
  fieldName?: string;
  isRequired?: boolean;
}
