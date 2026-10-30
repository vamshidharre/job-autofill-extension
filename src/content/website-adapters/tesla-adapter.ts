import { WebsiteAdapter } from './adapter-interface';
import { DetectedField, FieldMatchResult } from '../../types/engine';
import { UserProfile } from '../../types/profile';
import { consentCheckboxMatch } from '../field-safety';

export class TeslaAdapter implements WebsiteAdapter {
  public readonly name = 'Tesla';

  public isMatching(url: string, _document: Document): boolean {
    return url.includes('tesla.com') && (url.includes('/careers/') || url.includes('/job/apply/'));
  }

  public customMatch(field: DetectedField, profile: UserProfile): FieldMatchResult | null {
    const consent = consentCheckboxMatch(field);
    if (consent) return consent;
    const label = (field.labelText || '').toLowerCase().trim();
    const name = (field.name || '').toLowerCase();
    const id = (field.htmlId || '').toLowerCase();
    const placeholder = (field.placeholder || '').toLowerCase();
    const legend = (field.fieldsetLegend || '').toLowerCase();
    const surrounding = (field.surroundingText || '').toLowerCase();
    const combined = `${label} ${name} ${id} ${placeholder} ${legend} ${surrounding}`;

    // ==========================================
    // SCHRITT 1: Persönliche Angaben
    // ==========================================

    // 1. Vorname / First Name
    if (
      (label.includes('vorname') && !label.includes('zweiter') && !label.includes('nachname')) ||
      (label.includes('first name') && !label.includes('middle') && !label.includes('last')) ||
      name === 'firstname' ||
      name === 'first_name' ||
      id === 'firstname' ||
      id === 'first_name' ||
      combined.includes('legal_firstname') ||
      combined.includes('legal-first-name')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.firstName',
        targetValue: profile.basic.firstName,
        displayLabel: 'Tesla Vorname / First Name',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Tesla Vorname field match',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 2. Legaler Nachname / Last Name
    if (
      (label.includes('nachname') && !label.includes('vorname')) ||
      (label.includes('last name') && !label.includes('first')) ||
      name === 'lastname' ||
      name === 'last_name' ||
      id === 'lastname' ||
      id === 'last_name' ||
      combined.includes('legal_lastname') ||
      combined.includes('legal-last-name')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.lastName',
        targetValue: profile.basic.lastName,
        displayLabel: 'Tesla Legaler Nachname / Last Name',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Tesla Legaler Nachname field match',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 3. Zweiter Vorname / Middle Name
    if (
      label.includes('zweiter vorname') ||
      label.includes('middle name') ||
      name === 'middlename' ||
      id === 'middlename' ||
      combined.includes('legal_middlename')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.middleName',
        targetValue: profile.basic.middleName || '',
        displayLabel: 'Tesla Zweiter Vorname (optional)',
        confidence: 0.95,
        confidenceLevel: 'high',
        matchReason: 'Tesla Zweiter Vorname match',
        suggestedAction: profile.basic.middleName ? 'fill' : 'skip',
        isSensitive: false
      };
    }

    // 4. Bevorzugter Name / Preferred Name
    if (
      label.includes('bevorzugter name') ||
      label.includes('preferred name') ||
      name === 'preferredname' ||
      id === 'preferredname' ||
      combined.includes('preferred_name')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.preferredName',
        targetValue: profile.basic.preferredName || profile.basic.firstName,
        displayLabel: 'Tesla Bevorzugter Name (optional)',
        confidence: 0.95,
        confidenceLevel: 'high',
        matchReason: 'Tesla Bevorzugter Name match',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 5. Phone Device / Telefontyp (Dropdown/Combobox: Mobile)
    const hasMobileOption = field.options?.some(
      (opt) => /^(mobile|mobil|cell|cellular)$/i.test(opt.text.trim()) || /^(mobile|mobil|cell|cellular)$/i.test(opt.value.trim())
    );

    const isPhoneDevice =
      hasMobileOption ||
      label.includes('telefontyp') ||
      label.includes('phone type') ||
      label.includes('phone device') ||
      label.includes('device type') ||
      label.includes('phone device type') ||
      label.includes('gerätetyp') ||
      label.includes('kontakt - telefon') ||
      name.includes('phone_type') ||
      name.includes('phone_device') ||
      name.includes('devicetype') ||
      name.includes('phonetype') ||
      id.includes('phone_type') ||
      id.includes('phone_device') ||
      id.includes('devicetype') ||
      id.includes('phonetype') ||
      combined.includes('phone device') ||
      combined.includes('device type') ||
      combined.includes('phone type') ||
      combined.includes('phone_type') ||
      combined.includes('phone_device') ||
      combined.includes('device_type') ||
      ((label.includes('device') || combined.includes('device')) && (label.includes('phone') || combined.includes('phone') || combined.includes('telefon')));

    if (isPhoneDevice) {
      const isGerman = /telefontyp|ger[aä]t|kontakt/i.test(combined);
      let mobileOptionVal = isGerman ? 'Mobil' : 'Mobile';
      if (field.options) {
        const found = field.options.find(
          (o) => /^(mobile|mobil|cell|cellular)$/i.test(o.text.trim()) || /^(mobile|mobil|cell|cellular)$/i.test(o.value.trim())
        );
        if (found && found.value) {
          mobileOptionVal = found.value;
        }
      }

      return {
        detectedField: field,
        matchedProfilePath: 'contact.phoneDevice',
        targetValue: isGerman ? 'Mobil' : 'Mobile',
        selectedOptionValue: mobileOptionVal,
        displayLabel: `Tesla Phone Device / Telefontyp (${isGerman ? 'Mobil' : 'Mobile'})`,
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: `Tesla Phone Device dropdown match -> ${isGerman ? 'Mobil' : 'Mobile'}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 6. Phone Country Code Selector (Combobox button: Germany +49 / +49 DE / DE +49)
    const hasComboboxAttr =
      typeof field.element?.getAttribute === 'function' &&
      (field.element.getAttribute('role') === 'combobox' ||
       field.element.getAttribute('aria-haspopup') === 'listbox' ||
       field.element.getAttribute('aria-haspopup') === 'dialog' ||
       field.element.getAttribute('aria-haspopup') === 'true' ||
       field.element.hasAttribute('aria-expanded'));

    const btnText = typeof field.element?.textContent === 'string' ? field.element.textContent.trim() : '';

    const isCountryCode =
      (field.tag === 'button' || field.type === 'select' || hasComboboxAttr) &&
      (
        label.includes('country code') ||
        label.includes('landesvorwahl') ||
        label.includes('vorwahl') ||
        label.includes('calling code') ||
        label.includes('dial code') ||
        name.includes('country_code') ||
        name.includes('dial_code') ||
        id.includes('country_code') ||
        id.includes('dial_code') ||
        combined.includes('country_code') ||
        combined.includes('dial_code') ||
        combined.includes('phone_country') ||
        /\+[0-9]{1,4}/.test(field.currentValue || '') ||
        /\+[0-9]{1,4}/.test(btnText) ||
        /\b(US|DE|UK|CA|IN)\s*\+\d+/i.test(btnText) ||
        ((label.includes('phone') || label.includes('telefon') || combined.includes('phone') || combined.includes('telefon')) &&
          !label.includes('type') && !label.includes('typ') && !label.includes('device'))
      );

    if (isCountryCode) {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.phoneCountryCode',
        targetValue: 'DE +49',
        selectedOptionValue: '+49',
        displayLabel: 'Tesla Phone Country Code (DE +49)',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Tesla Phone Country Code selector -> DE +49',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 7. Phone Number Input (National digits)
    const isPhoneInput =
      field.tag !== 'button' &&
      field.type !== 'radio' &&
      field.type !== 'checkbox' &&
      field.type !== 'select' &&
      (
        label.includes('telefon') ||
        label.includes('phone') ||
        field.type === 'tel' ||
        name.includes('phone') ||
        id.includes('phone') ||
        placeholder.includes('phone') ||
        placeholder.includes('(201)') ||
        placeholder.includes('telefon') ||
        combined.includes('phone_number') ||
        combined.includes('phonenumber')
      ) &&
      !label.includes('typ') &&
      !label.includes('type') &&
      !label.includes('device');

    if (isPhoneInput) {
      // Candidate phone: "+49 000 00000000"
      // Clean national digits without leading 0 or international +49 prefix
      const rawPhone = profile.contact.phone || '';
      const nationalDigits = rawPhone
        .replace(/^\+49\s*/, '')
        .replace(/^\+\d{1,3}\s*/, '')
        .replace(/^0/, '')
        .replace(/\D/g, '');

      return {
        detectedField: field,
        matchedProfilePath: 'contact.phone',
        targetValue: nationalDigits || rawPhone,
        displayLabel: 'Tesla Phone Number / Telefonnummer',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Tesla Phone Number input match',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 8. E-Mail
    if (label.includes('e-mail') || label.includes('email') || field.type === 'email' || name.includes('email') || id.includes('email')) {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.email',
        targetValue: profile.contact.email,
        displayLabel: 'Tesla E-Mail',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Tesla E-Mail match',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 9. Land/Region des Wohnsitzes / Country of Residence
    if (
      label.includes('wohnsitz') ||
      label.includes('land/region') ||
      label.includes('country of residence') ||
      (label.includes('country') && !label.includes('code')) ||
      combined.includes('country_of_residence') ||
      combined.includes('residence_country')
    ) {
      const isGerman = /wohnsitz|land[\s/_-]?region|des[\s_-]?wohnsitzes/i.test(combined);
      let selectedVal: string | undefined = undefined;
      if (field.options && field.options.length > 0) {
        const found = field.options.find(
          (o) =>
            o.value.toLowerCase() === 'de' ||
            o.value.toLowerCase() === 'deutschland' ||
            o.value.toLowerCase() === 'germany' ||
            o.text.toLowerCase().includes('deutschland') ||
            o.text.toLowerCase().includes('germany')
        );
        if (found) selectedVal = found.value;
      }
      if (!selectedVal) {
        selectedVal = isGerman ? 'Deutschland' : 'DE';
      }

      return {
        detectedField: field,
        matchedProfilePath: 'address.country',
        targetValue: isGerman ? 'Deutschland' : (profile.address.country || 'Germany'),
        selectedOptionValue: selectedVal,
        displayLabel: `Tesla Land/Region des Wohnsitzes (${isGerman ? 'Deutschland' : 'Germany'})`,
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: `Tesla Wohnsitz country dropdown match -> ${isGerman ? 'Deutschland' : 'Germany'}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 10. Lebenslauf / Resume
    if (label.includes('lebenslauf') || label.includes('resume') || label.includes('cv')) {
      return {
        detectedField: field,
        matchedProfilePath: 'document.resume',
        targetValue: profile.documents[0]?.name || 'Resume.pdf',
        displayLabel: 'Tesla Lebenslauf Upload',
        confidence: 0.95,
        confidenceLevel: 'high',
        matchReason: 'Tesla Lebenslauf file input match',
        suggestedAction: 'review',
        isSensitive: false
      };
    }

    // ==========================================
    // SCHRITT 2: Rechtliche Hinweise & Fragen
    // ==========================================

    // 11. Verfügbarkeit oder Kündigungsfrist / Availability / Notice Period -> Immediately / Unmittelbar
    if (
      label.includes('verfügbarkeit') ||
      label.includes('kündigungsfrist') ||
      legend.includes('verfügbarkeit') ||
      legend.includes('kündigungsfrist') ||
      combined.includes('availability') ||
      combined.includes('notice period')
    ) {
      const isGerman = /verf[uü]gbarkeit|k[uü]ndigungsfrist/i.test(combined);
      let availOptVal = isGerman ? 'Unmittelbar' : 'Immediately';
      if (field.options && field.options.length > 0) {
        const found = field.options.find((o) =>
          /unmittelbar|sofort|immediately|immediate|0\b/i.test(o.text) ||
          /unmittelbar|sofort|immediately|immediate|0\b/i.test(o.value)
        );
        if (found) availOptVal = found.value;
      }

      return {
        detectedField: field,
        matchedProfilePath: 'jobPreferences.earliestStartDate',
        targetValue: isGerman ? 'Unmittelbar' : 'Immediately',
        selectedOptionValue: availOptVal,
        displayLabel: `Tesla Verfügbarkeit / Availability (${isGerman ? 'Unmittelbar' : 'Immediately'})`,
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: `Tesla Verfügbarkeit / Availability dropdown match -> ${isGerman ? 'Unmittelbar' : 'Immediately'}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 12. Radio Fragen (Ja / Nein)
    if (field.type === 'radio' || label === 'ja' || label === 'nein' || label === 'yes' || label === 'no') {
      const elementVal = (typeof field.element?.getAttribute === 'function' ? field.element.getAttribute('value') : field.currentValue) || '';
      const isYesOption =
        label.startsWith('ja') ||
        label.includes('yes') ||
        elementVal === 'yes' ||
        elementVal === 'true' ||
        elementVal.toLowerCase() === 'ja';

      const isNoOption =
        label.startsWith('nein') ||
        label.includes('no') ||
        elementVal === 'no' ||
        elementVal === 'false' ||
        elementVal.toLowerCase() === 'nein';

      // Q1: Einwanderungspatenschaft / Immigration Sponsorship -> NEIN / NO
      if (
        combined.includes('einwanderungspatenschaft') ||
        combined.includes('sponsorship') ||
        combined.includes('immigration')
      ) {
        return {
          detectedField: field,
          matchedProfilePath: 'workAuthorization.requireSponsorshipNow',
          targetValue: isNoOption,
          displayLabel: `Tesla Immigration Sponsorship (${isNoOption ? 'No - Selected' : 'Yes'})`,
          confidence: 0.99,
          confidenceLevel: 'high',
          matchReason: 'Tesla Immigration Sponsorship -> No',
          suggestedAction: isNoOption ? 'fill' : 'skip',
          isSensitive: false
        };
      }

      // Q2: Ermächtigung andere Stellenangebote (Talent-Pool 12 Monate) / Other Opportunities -> JA / YES
      if (
        combined.includes('andere stellenangebote') ||
        combined.includes('ermächtige tesla') ||
        combined.includes('12 monate') ||
        combined.includes('12 months') ||
        combined.includes('other opportunities') ||
        combined.includes('future opportunities')
      ) {
        return {
          detectedField: field,
          matchedProfilePath: 'customQA.answer',
          targetValue: isYesOption,
          displayLabel: `Tesla Talent-Pool Berücksichtigung (${isYesOption ? 'Yes - Selected' : 'No'})`,
          confidence: 0.99,
          confidenceLevel: 'high',
          matchReason: 'Tesla Talent-Pool Berücksichtigung -> Yes',
          suggestedAction: isYesOption ? 'fill' : 'skip',
          isSensitive: false
        };
      }

      // Q3: Schon einmal bei Tesla beschäftigt / Previously Employed -> NEIN / NO
      if (
        combined.includes('schon einmal bei tesla beschäftigt') ||
        combined.includes('bei tesla beschäftigt') ||
        combined.includes('previously employed') ||
        combined.includes('worked for tesla')
      ) {
        return {
          detectedField: field,
          matchedProfilePath: 'customQA.answer',
          targetValue: isNoOption,
          displayLabel: `Tesla Vorherige Beschäftigung (${isNoOption ? 'No - Selected' : 'Yes'})`,
          confidence: 0.99,
          confidenceLevel: 'high',
          matchReason: 'Tesla Vorherige Beschäftigung -> No',
          suggestedAction: isNoOption ? 'fill' : 'skip',
          isSensitive: false
        };
      }

      // Q4: Ehemaliger Praktikant oder Auftragnehmer / Former Intern or Contractor -> NEIN / NO
      if (
        combined.includes('ehemaliger praktikant') ||
        combined.includes('auftragnehmer') ||
        combined.includes('former intern') ||
        combined.includes('contractor')
      ) {
        return {
          detectedField: field,
          matchedProfilePath: 'customQA.answer',
          targetValue: isNoOption,
          displayLabel: `Tesla Former Intern / Contractor (${isNoOption ? 'No - Selected' : 'Yes'})`,
          confidence: 0.99,
          confidenceLevel: 'high',
          matchReason: 'Tesla Former Intern / Contractor -> No',
          suggestedAction: isNoOption ? 'fill' : 'skip',
          isSensitive: false
        };
      }

      // Q5: Derzeit Universitätsstudent / Current Student -> NEIN / NO
      if (
        combined.includes('universitätsstudent') ||
        combined.includes('universitaetsstudent') ||
        combined.includes('current student') ||
        combined.includes('university student')
      ) {
        return {
          detectedField: field,
          matchedProfilePath: 'customQA.answer',
          targetValue: isNoOption,
          displayLabel: `Tesla University Student (${isNoOption ? 'No - Selected' : 'Yes'})`,
          confidence: 0.99,
          confidenceLevel: 'high',
          matchReason: 'Tesla University Student -> No',
          suggestedAction: isNoOption ? 'fill' : 'skip',
          isSensitive: false
        };
      }

      // Q6: Textnachrichten empfangen (SMS) / Text Messages -> JA / YES
      if (
        combined.includes('textnachrichten') ||
        combined.includes('sms') ||
        combined.includes('text message') ||
        combined.includes('text messages')
      ) {
        return {
          detectedField: field,
          matchedProfilePath: 'customQA.answer',
          targetValue: isYesOption,
          displayLabel: `Tesla Textnachrichten / SMS (${isYesOption ? 'Yes - Selected' : 'No'})`,
          confidence: 0.99,
          confidenceLevel: 'high',
          matchReason: 'Tesla Text Messages Agreement -> Yes',
          suggestedAction: isYesOption ? 'fill' : 'skip',
          isSensitive: false
        };
      }
    }

    // 14. Input: Legaler Name / Legal Name -> Alex Example
    if (
      label.includes('legaler name') ||
      label === 'legal name' ||
      label.includes('signature') ||
      (label.includes('name') && (combined.includes('rechtliche hinweise') || combined.includes('certify') || combined.includes('acknowledg')))
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'basic.fullName',
        targetValue: profile.basic.fullName,
        displayLabel: 'Tesla Legaler Name (Signatur)',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: 'Tesla legal name from configured profile',
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    return null;
  }
}
