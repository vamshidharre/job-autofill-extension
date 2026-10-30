import { WebsiteAdapter } from './adapter-interface';
import { DetectedField, FieldMatchResult } from '../../types/engine';
import { UserProfile } from '../../types/profile';

export class PersonioAdapter implements WebsiteAdapter {
  public readonly name = 'Personio';

  public isMatching(url: string, document?: Document): boolean {
    return (
      url.includes('personio.de') ||
      url.includes('personio.com') ||
      (!!document &&
        typeof document.querySelector === 'function' &&
        !!document.querySelector('[data-qa="job-application-form"], .personio-widget'))
    );
  }

  public customMatch(field: DetectedField, profile: UserProfile): FieldMatchResult | null {
    const name = field.name.toLowerCase();
    const id = field.htmlId.toLowerCase();

    if (name === 'first_name' || id.includes('first_name')) {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.firstName',
        targetValue: profile.basic.firstName,
        displayLabel: 'Personio First Name / Vorname',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Personio first_name attribute',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    if (name === 'last_name' || id.includes('last_name')) {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.lastName',
        targetValue: profile.basic.lastName,
        displayLabel: 'Personio Last Name / Nachname',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Personio last_name attribute',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    if (name === 'email' || id.includes('email')) {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.email',
        targetValue: profile.contact.email,
        displayLabel: 'Personio Email',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Personio email attribute',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    if (name === 'phone' || id.includes('phone')) {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.phone',
        targetValue: profile.contact.phone,
        displayLabel: 'Personio Phone / Telefon',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Personio phone attribute',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // LinkedIn
    if (name.includes('linkedin') || id.includes('linkedin') || field.labelText.toLowerCase().includes('linkedin')) {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.linkedin',
        targetValue: profile.contact.linkedin,
        displayLabel: 'Personio LinkedIn Profile',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Personio LinkedIn field',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // Webpage / Website / Portfolio
    if (
      name.includes('website') ||
      name.includes('webpage') ||
      id.includes('website') ||
      id.includes('webpage') ||
      field.labelText.toLowerCase().includes('webpage') ||
      field.labelText.toLowerCase().includes('website')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.website',
        targetValue: profile.contact.website || profile.contact.linkedin,
        displayLabel: 'Personio Webpage / Website URL',
        confidence: 0.95,
        confidenceLevel: 'high',
        matchReason: 'Personio webpage / website field',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // Salary / Gehaltsvorstellung
    if (
      name.includes('salary') ||
      name.includes('gehalt') ||
      id.includes('salary') ||
      field.labelText.toLowerCase().includes('gehalt') ||
      field.labelText.toLowerCase().includes('salary')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'salary.expectedAnnual',
        targetValue: profile.salary.expectedAnnual || 60000,
        displayLabel: 'Personio Salary / Gehaltsvorstellung',
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: 'Personio salary field',
        suggestedAction: 'fill',
        isSensitive: true
      };
    }

    // Available From / Verfügbarkeit / Kündigungsfrist -> Sofort
    if (
      name.includes('available') ||
      name.includes('verfuegbar') ||
      name.includes('notice') ||
      name.includes('kuendigung') ||
      field.labelText.toLowerCase().includes('verf') ||
      field.labelText.toLowerCase().includes('k[uü]ndigung') ||
      field.labelText.toLowerCase().includes('availability')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'jobPreferences.noticePeriod',
        targetValue: 'Sofort',
        displayLabel: 'Personio Verfügbarkeit / Kündigungsfrist (Sofort)',
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: 'Personio availability / notice period field -> Sofort',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // How did you hear about us? / Wie hast du von uns erfahren? -> LinkedIn
    if (
      name.includes('source') ||
      name.includes('referral') ||
      name.includes('hear') ||
      name.includes('erfahren') ||
      name.includes('aufmerksam') ||
      field.labelText.toLowerCase().includes('erfahren') ||
      field.labelText.toLowerCase().includes('aufmerksam') ||
      field.labelText.toLowerCase().includes('hear about')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'jobPreferences.referralSource',
        targetValue: 'LinkedIn',
        displayLabel: 'Personio Referral Source (LinkedIn)',
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: 'Personio referral source field -> LinkedIn',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // Valid EU citizenship / Work Permit -> Ja
    if (
      name.includes('work_permit') ||
      name.includes('arbeitserlaubnis') ||
      name.includes('citizenship') ||
      name.includes('staatsbuergerschaft') ||
      field.labelText.toLowerCase().includes('arbeitserlaubnis') ||
      field.labelText.toLowerCase().includes('staatsb') ||
      field.labelText.toLowerCase().includes('work permit')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'workAuthorization.legallyAuthorized',
        targetValue: 'Ja',
        displayLabel: 'Personio EU-Staatsbürgerschaft / Arbeitserlaubnis (Ja)',
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: 'Personio work permit / EU citizenship field -> Ja',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // German Language Skills -> B1
    if (
      (name.includes('german') || name.includes('deutsch')) &&
      (name.includes('skill') || name.includes('level') || name.includes('kenntnis') || field.labelText.toLowerCase().includes('deutsch') || field.labelText.toLowerCase().includes('german'))
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'languages.german',
        targetValue: 'B1',
        displayLabel: 'Personio Deutsch-Sprachkenntnisse (B1)',
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: 'Personio German language proficiency -> B1',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // English Language Skills -> C2
    if (
      (name.includes('english') || name.includes('englisch')) &&
      (name.includes('skill') || name.includes('level') || name.includes('kenntnis') || field.labelText.toLowerCase().includes('englisch') || field.labelText.toLowerCase().includes('english'))
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'languages.english',
        targetValue: 'C2',
        displayLabel: 'Personio Englisch-Sprachkenntnisse (C2)',
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: 'Personio English language proficiency -> C2',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // Gender -> Männlich
    if (
      name.includes('gender') ||
      name.includes('geschlecht') ||
      field.labelText.toLowerCase().includes('geschlecht') ||
      field.labelText.toLowerCase().includes('gender')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.gender',
        targetValue: 'Männlich',
        displayLabel: 'Personio Gender / Geschlecht (Männlich)',
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: 'Personio demographic gender field -> Männlich',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // Nationality -> Indisch
    if (
      name.includes('nationality') ||
      name.includes('nationalitaet') ||
      field.labelText.toLowerCase().includes('nationalit') ||
      field.labelText.toLowerCase().includes('nationality')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.nationality',
        targetValue: 'Indisch',
        displayLabel: 'Personio Nationality / Nationalität (Indisch)',
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: 'Personio demographic nationality field -> Indisch',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // Age Group -> 25-29
    if (
      name.includes('age') ||
      name.includes('alter') ||
      field.labelText.toLowerCase().includes('altersgruppe') ||
      field.labelText.toLowerCase().includes('age group')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.ageGroup',
        targetValue: '25-29',
        displayLabel: 'Personio Age Group / Altersgruppe (25-29)',
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: 'Personio demographic age group field -> 25-29',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    return null;
  }
}
