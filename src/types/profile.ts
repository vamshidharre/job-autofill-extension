/**
 * User Profile & Data Model Types
 * For Job Application Autofill Extension
 */

export interface BasicInfo {
  firstName: string;
  middleName: string;
  lastName: string;
  fullName: string;
  preferredName: string;
  dateOfBirth: string; // YYYY-MM-DD
  gender: 'male' | 'female' | 'non-binary' | 'prefer-not-to-say' | string;
  nationality: string;
  countryOfBirth: string;
}

export interface ContactInfo {
  email: string;
  phone: string;
  altPhone: string;
  linkedin: string;
  github: string;
  portfolio: string;
  website: string;
}

export interface AddressInfo {
  street: string;
  houseNumber: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  state: string; // State / Region / Bundesland
  country: string;
}

export interface JobPreferences {
  desiredTitle: string;
  alternativeTitles: string[];
  preferredDepartments: string[];
  preferredIndustries: string[];
  preferredLocations: string[];
  willingToRelocate: boolean;
  willingToTravel: boolean;
  remotePreference: 'remote' | 'hybrid' | 'onsite' | 'flexible';
  employmentTypes: {
    fullTime: boolean;
    partTime: boolean;
    workingStudent: boolean;
    internship: boolean;
    contract: boolean;
    permanent: boolean;
  };
  earliestStartDate: string; // YYYY-MM-DD or immediate
  availableFrom: string;
  noticePeriod: string; // e.g. "Immediately", "1 month", "3 months"
  currentEmploymentStatus: string;
  preferredWorkingHours: string; // e.g. "Full-time (40h/week)"
  weeklyWorkingHours: number;
}

export interface SalaryPreferences {
  expectedAnnual: number;
  minAnnual: number;
  maxAnnual: number;
  currency: string; // EUR, USD, GBP, etc.
  monthlyExpectation: number;
  hourlyExpectation: number;
  negotiable: boolean;
}

export interface WorkAuthorization {
  legallyAuthorized: boolean;
  requireSponsorshipNow: boolean;
  requireSponsorshipFuture: boolean;
  currentAuthType: string; // e.g. "EU Blue Card", "Student Visa §16b", "Citizen", "Permanent Residency"
  authExpiryDate: string;
  willingToObtainAuthorization: boolean;
  additionalNotes: string;
}

export interface EducationEntry {
  id: string;
  degree: string; // Master of Science, Bachelor of Technology, etc.
  fieldOfStudy: string; // Computational Engineering, Mechanical Engineering
  university: string;
  location: string;
  startDate: string; // YYYY-MM
  endDate: string; // YYYY-MM
  graduationDate: string;
  gradeGpa: string;
  gpaScale: string; // e.g. "1.0 - 5.0 (German Scale)" or "4.0"
  thesisTitle: string;
  description: string;
  relevantCoursework: string[];
}

export interface WorkExperienceEntry {
  id: string;
  jobTitle: string;
  company: string;
  location: string;
  employmentType: string; // Internship, Working Student, Full-time, etc.
  startDate: string; // YYYY-MM
  endDate: string; // YYYY-MM or "Present"
  currentlyWorkingHere: boolean;
  description: string;
  responsibilities: string[];
  achievements: string[];
  technologies: string[];
  skills: string[];
}

export type SkillCategory =
  | 'Technical'
  | 'Simulation / FEA / FEM'
  | 'CAD & Design'
  | 'Programming & Scripting'
  | 'Machine Learning / AI'
  | 'Engineering Tools'
  | 'Languages'
  | 'Soft Skills'
  | 'Certifications'
  | 'Other';

export interface SkillItem {
  id: string;
  name: string;
  category: SkillCategory;
  yearsOfExperience: number;
  proficiency: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  activeForApplications: boolean;
}

export interface LanguageItem {
  id: string;
  language: string;
  overallLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Native';
  speakingLevel: string;
  writingLevel: string;
  readingLevel: string;
  certificate: string;
  certificateDate: string;
}

export interface SavedDocument {
  id: string;
  name: string;
  type: 'resume' | 'cover_letter' | 'certificate' | 'degree' | 'transcript' | 'other';
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  dataBase64?: string; // Optional local cached copy
}

export interface CustomQA {
  updatedAt?: string; // Last explicit answer; helps resolve bilingual variants.
  id: string;
  keywords: string[]; // e.g. ["why join", "why work", "warum"]
  question: string;
  answer: string;
  category?: string;
}

/**
 * A value the candidate entered on a specific site where autofill would have
 * entered something else (or nothing). Used ahead of all built-in rules the
 * next time that field appears on that site.
 */
export interface FieldOverride {
  id: string;
  host: string; // e.g. "tesla.com"
  key: string; // stable identity of the field on that site (see correction-memory.ts)
  label: string; // human-readable field label shown in Settings
  fieldType: string;
  value: string; // what the candidate entered / chose ('' = leave empty)
  optionValue?: string; // option value for dropdowns
  question?: string; // Full question; survives generated names and IDs changing between jobs.
  manualChoice?: boolean; // Explicit user choice, including an unchecked checkbox.
  updatedAt: string;
}

export interface CoverLetterTemplate {
  id: string;
  name: string;
  category: 'General' | 'Engineering' | 'Automotive' | 'AI/ML' | 'Robotics' | 'Simulation' | 'Internship' | 'Working Student';
  subject: string;
  body: string;
}

export interface ApplicationHistoryItem {
  id: string;
  company: string;
  jobTitle: string;
  url: string;
  date: string; // ISO string
  location: string;
  status: 'Applied' | 'Interview' | 'Rejected' | 'Offer' | 'Follow-up' | 'Saved';
  notes: string;
  fieldsFilledCount?: number;
}

export type AutofillMode = 'safe' | 'normal' | 'aggressive';

export interface AutofillSettings {
  mode: AutofillMode;
  confidenceThreshold: number; // e.g. 0.85 for safe, 0.60 for normal
  highlightFilledFields: boolean;
  previewBeforeFilling: boolean;
  askBeforeSensitiveFields: boolean;
  autoSubmitEnabled: boolean; // MUST be false by default
  enableKeyboardShortcut: boolean; // Ctrl+Shift+F
  enableContextMenu: boolean;
  localOnlyMode: boolean;
  externalAiEnabled: boolean; // MUST be false by default
  learningModeEnabled: boolean; // Learn manual answers only on verified application pages
  reuseLearnedAnswers?: boolean; // Automatically replay saved answers on application forms (default on).
  autofillEnabled: boolean; // Opt-in only after the learning phase
  autoStartOnApplicationPages?: boolean; // Run autofill without a click when a verified application form opens (opt-in)
}

export interface UserProfile {
  basic: BasicInfo;
  contact: ContactInfo;
  address: AddressInfo;
  jobPreferences: JobPreferences;
  salary: SalaryPreferences;
  workAuthorization: WorkAuthorization;
  education: EducationEntry[];
  experience: WorkExperienceEntry[];
  skills: SkillItem[];
  languages: LanguageItem[];
  documents: SavedDocument[];
  customQA: CustomQA[];
  coverLetterTemplates: CoverLetterTemplate[];
  history: ApplicationHistoryItem[];
  settings: AutofillSettings;
  isComplete: boolean;
  lastUpdated: string;
  /** IDs of built-in Q&A entries already offered once, so deleted ones are not re-added. */
  seededDefaultQaIds?: string[];
  /** Corrections learned from the candidate's own edits on application forms. */
  fieldOverrides?: FieldOverride[];
}
