import { WebsiteAdapter } from './adapter-interface';
import { DetectedField, FieldMatchResult } from '../../types/engine';
import { UserProfile } from '../../types/profile';

export class GreenhouseAdapter implements WebsiteAdapter {
  public readonly name = 'Greenhouse';

  public isMatching(url: string, document?: Document): boolean {
    return (
      url.includes('boards.greenhouse.io') ||
      url.includes('gh_src=') ||
      (!!document &&
        typeof document.querySelector === 'function' &&
        (!!document.getElementById('application_form') ||
          !!document.querySelector('.application--form, #main_fields')))
    );
  }

  public customMatch(field: DetectedField, profile: UserProfile): FieldMatchResult | null {
    const id = field.htmlId.toLowerCase();
    const name = field.name.toLowerCase();

    if (id === 'first_name' || name.includes('first_name')) {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.firstName',
        targetValue: profile.basic.firstName,
        displayLabel: 'Greenhouse First Name',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Greenhouse standard first_name selector',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    if (id === 'last_name' || name.includes('last_name')) {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.lastName',
        targetValue: profile.basic.lastName,
        displayLabel: 'Greenhouse Last Name',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Greenhouse standard last_name selector',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    if (id === 'email' || name.includes('email')) {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.email',
        targetValue: profile.contact.email,
        displayLabel: 'Greenhouse Email',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Greenhouse standard email selector',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    if (id === 'phone' || name.includes('phone')) {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.phone',
        targetValue: profile.contact.phone,
        displayLabel: 'Greenhouse Phone',
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: 'Greenhouse standard phone selector',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    return null;
  }
}
