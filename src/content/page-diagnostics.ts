import { DetectedField, FieldMatchResult } from '../types/engine';
import { UserProfile } from '../types/profile';
import { ApplicationPageStatus } from './application-page-detector';
import { questionOf } from './field-context';

/** A local troubleshooting report: answers, profile values, and option IDs are omitted. */
export function pageDiagnostics(
  version: string, url: string, status: ApplicationPageStatus, fields: DetectedField[],
  profile: UserProfile, remembered: FieldMatchResult[]
) {
  const page = new URL(url);
  return {
    version, page: { host: page.hostname, path: page.pathname }, recognition: status,
    settings: { learning: profile.settings.learningModeEnabled,
      reuseSavedAnswers: profile.settings.reuseLearnedAnswers !== false,
      profileAutofill: profile.settings.autofillEnabled },
    memory: { savedAnswers: profile.customQA.length,
      siteChoices: (profile.fieldOverrides || []).filter((o) => o.host === page.hostname.replace(/^www\./, '')).length },
    fields: fields.map((field) => {
      const match = remembered.find((item) => item.detectedField === field);
      return { question: questionOf(field).slice(0, 300), type: field.type, tag: field.tag,
        hasCurrentValue: field.type === 'radio' || field.type === 'checkbox' ? !!field.isChecked : !!field.currentValue,
        rememberedSource: match?.matchedProfilePath || null, suggestedAction: match?.suggestedAction || 'no saved match' };
    })
  };
}
