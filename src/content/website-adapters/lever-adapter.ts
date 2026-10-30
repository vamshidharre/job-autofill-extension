import { WebsiteAdapter } from './adapter-interface';
import { DetectedField, FieldMatchResult } from '../../types/engine';
import { UserProfile } from '../../types/profile';

export class LeverAdapter implements WebsiteAdapter {
  public readonly name = 'Lever';

  public isMatching(url: string, document?: Document): boolean {
    return (
      url.includes('jobs.lever.co') ||
      (!!document &&
        typeof document.querySelector === 'function' &&
        !!document.querySelector('.application-form, [data-qa="btn-apply"]'))
    );
  }

  public customMatch(field: DetectedField, profile: UserProfile): FieldMatchResult | null {
    const name = field.name.toLowerCase();

    if (name === 'name') {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.fullName',
        targetValue: profile.basic.fullName,
        displayLabel: 'Lever Full Name',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Lever single name input',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    if (name === 'email') {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.email',
        targetValue: profile.contact.email,
        displayLabel: 'Lever Email',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Lever email input',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    if (name === 'phone') {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.phone',
        targetValue: profile.contact.phone,
        displayLabel: 'Lever Phone',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Lever phone input',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    if (name === 'org') {
      return {
        detectedField: field,
        matchedProfilePath: 'experience.latest.company',
        targetValue: profile.experience[0]?.company || '',
        displayLabel: 'Lever Current Organization',
        confidence: 0.95,
        confidenceLevel: 'high',
        matchReason: 'Lever current organization input',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    if (name.includes('urls[linkedin]')) {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.linkedin',
        targetValue: profile.contact.linkedin,
        displayLabel: 'Lever LinkedIn URL',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Lever LinkedIn input',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    if (name.includes('urls[github]')) {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.github',
        targetValue: profile.contact.github,
        displayLabel: 'Lever GitHub URL',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Lever GitHub input',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    if (name === 'comments') {
      return {
        detectedField: field,
        matchedProfilePath: 'coverLetter.text',
        targetValue: profile.coverLetterTemplates[0]?.body || '',
        displayLabel: 'Lever Additional Information / Cover Letter',
        confidence: 0.85,
        confidenceLevel: 'high',
        matchReason: 'Lever comments / cover letter textarea',
        suggestedAction: 'review',
        isSensitive: false
      };
    }

    return null;
  }
}
