import { WebsiteAdapter } from './adapter-interface';
import { DetectedField, FieldMatchResult } from '../../types/engine';
import { UserProfile } from '../../types/profile';

export class WorkdayAdapter implements WebsiteAdapter {
  public readonly name = 'Workday';

  public isMatching(url: string, document?: Document): boolean {
    return WorkdayAdapter.isWorkdayPage(url, document);
  }

  /**
   * Workday portals are recognised by URL, or by Workday's own form-field
   * wrappers. A bare `data-automation-id` attribute is not enough: many
   * unrelated sites use it for test automation.
   */
  public static isWorkdayPage(url: string, document?: Document): boolean {
    return (
      url.includes('myworkdayjobs.com') ||
      url.includes('workday.com') ||
      url.includes('myworkday.com') ||
      url.includes('/wday/') ||
      (!!document &&
        typeof document.querySelector === 'function' &&
        !!document.querySelector('[data-automation-id^="formField-"], [data-automation-id="applyFlowPage"]'))
    );
  }

  public customMatch(field: DetectedField, profile: UserProfile): FieldMatchResult | null {
    const autoId = (
      field.element.getAttribute('data-automation-id') ||
      field.element.parentElement?.getAttribute('data-automation-id') ||
      field.element.closest?.('[data-automation-id]')?.getAttribute('data-automation-id') ||
      ''
    ).toLowerCase();

    const label = (field.labelText || '').toLowerCase().trim();
    const name = (field.name || '').toLowerCase();
    const id = (field.htmlId || '').toLowerCase();
    const placeholder = (field.placeholder || '').toLowerCase();
    const surrounding = (field.surroundingText || '').toLowerCase();
    const combined = `${label} ${name} ${id} ${placeholder} ${surrounding}`;

    // Clean national digits without international extensions, prefixes, or gaps: "0000000000"
    const rawPhone = profile.contact.phone || '';
    const nationalPhone = rawPhone
      .replace(/^\+49\s*/, '')
      .replace(/^\+\d{1,3}\s*/, '')
      .replace(/^0/, '')
      .replace(/\D/g, '');

    // 1. Workday Phone Device Type (Mobile / Mobil)
    if (
      autoId.includes('device') ||
      label.includes('phone device') ||
      label.includes('device type') ||
      label.includes('telefontyp') ||
      label.includes('kontakt - telefon') ||
      label.includes('kontakt - telefontyp') ||
      combined.includes('phone device') ||
      combined.includes('device type') ||
      combined.includes('telefontyp')
    ) {
      const isGerman = /telefontyp|ger[aä]t|kontakt/i.test(combined);
      let mobileVal = isGerman ? 'Mobil' : 'Mobile';
      if (field.options) {
        const found = field.options.find(
          (o) => /^(mobile|mobil|cell|cellular)$/i.test(o.text.trim()) || /^(mobile|mobil|cell|cellular)$/i.test(o.value.trim())
        );
        if (found && found.value) {
          mobileVal = found.value;
        }
      }
      return {
        detectedField: field,
        matchedProfilePath: 'contact.phoneDevice',
        targetValue: isGerman ? 'Mobil' : 'Mobile',
        selectedOptionValue: mobileVal,
        displayLabel: `Workday Phone Device Type (${isGerman ? 'Mobil' : 'Mobile'})`,
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: `Workday Phone Device Type matched -> ${isGerman ? 'Mobil' : 'Mobile'}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 2. Workday Phone Country Code (DE +49)
    if (
      (autoId.includes('country') || autoId.includes('calling') || label.includes('country code') || label.includes('calling code') || label.includes('landesvorwahl') || label.includes('vorwahl')) &&
      (field.tag === 'select' || field.tag === 'button' || field.type === 'select')
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'contact.phoneCountryCode',
        targetValue: 'DE +49',
        selectedOptionValue: '+49',
        displayLabel: 'Workday Phone Country Code (DE +49)',
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: `Workday Phone Country Code matched -> DE +49`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 3. Workday Phone Number Input -> national digits without extensions and gaps ("0000000000")
    if (
      autoId.includes('phone') ||
      label.includes('phone number') ||
      label.includes('phone') ||
      label.includes('telefon') ||
      field.type === 'tel' ||
      name.includes('phone') ||
      id.includes('phone') ||
      placeholder.includes('phone') ||
      combined.includes('phone')
    ) {
      if (field.tag !== 'select' && field.tag !== 'button' && field.type !== 'select') {
        return {
          detectedField: field,
          matchedProfilePath: 'contact.phone',
          targetValue: nationalPhone,
          displayLabel: 'Workday Phone Number (National Digits)',
          confidence: 0.99,
          confidenceLevel: 'high',
          matchReason: `Workday Phone Number input matched -> clean digits without extensions or gaps: ${nationalPhone}`,
          suggestedAction: 'fill',
          isSensitive: false
        };
      }
    }

    // 3b. Workday Country of Residence / Land des Wohnsitzes
    if (
      (autoId.includes('country') || label.includes('country') || label.includes('land') || label.includes('wohnsitz')) &&
      !label.includes('code') && !label.includes('vorwahl') && !autoId.includes('phone') && !autoId.includes('calling') &&
      (field.tag === 'select' || field.tag === 'button' || field.type === 'select')
    ) {
      const isGerman = /wohnsitz|land[\s/_-]?region|des[\s_-]?wohnsitzes|land/i.test(combined);
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
        displayLabel: `Workday Country (${isGerman ? 'Deutschland' : 'Germany'})`,
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: `Workday Country matched -> ${isGerman ? 'Deutschland' : 'Germany'}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 4. Workday Work Experience Section Fields (Job Title, Company, Location, Dates, Checkbox, Description)
    let expIndex = 0;
    const expTextMatch = combined.match(/work\s*experience\s*(\d+)/i) || combined.match(/berufserfahrung\s*(\d+)/i);
    if (expTextMatch) {
      expIndex = Math.max(0, parseInt(expTextMatch[1], 10) - 1);
    } else if (field.element && typeof field.element.closest === 'function') {
      const aidBlock = field.element.closest?.('[data-automation-id*="workExperience-"], [data-automation-id*="workExperience_"]')
        ?.getAttribute('data-automation-id');
      const aidMatch = aidBlock?.match(/workExperience[-_](\d+)/i);
      if (aidMatch) {
        expIndex = Math.max(0, parseInt(aidMatch[1], 10) - 1);
      } else if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
        const allJobTitles = Array.from(document.querySelectorAll<HTMLElement>(
          'input[data-automation-id="jobTitle"], input[data-automation-id*="jobTitle"], input[aria-label*="Job Title"]'
        ));
        if (allJobTitles.length > 0) {
          if (allJobTitles.includes(field.element)) {
            expIndex = allJobTitles.indexOf(field.element);
          } else if (typeof field.element.compareDocumentPosition === 'function') {
            for (let k = allJobTitles.length - 1; k >= 0; k--) {
              const jt = allJobTitles[k];
              if (jt.compareDocumentPosition(field.element) & Node.DOCUMENT_POSITION_FOLLOWING) {
                expIndex = k;
                break;
              }
            }
          }
        }
      }
    }

    const exp = profile.experience[expIndex] || profile.experience[0];

    // 4a. Job Title
    if (
      exp &&
      (autoId.includes('jobtitle') ||
       autoId.includes('job-title') ||
       label === 'job title' ||
       label.startsWith('job title') ||
       label.includes('jobtitel') ||
       label.includes('position') ||
       name.includes('jobtitle') ||
       id.includes('jobtitle'))
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'experience.latest.title',
        targetValue: exp.jobTitle,
        displayLabel: `Workday Job Title (${exp.company})`,
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: `Workday Job Title for Experience ${expIndex + 1}: ${exp.jobTitle}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 4b. Company
    if (
      exp &&
      (autoId.includes('company') ||
       autoId.includes('employer') ||
       label === 'company' ||
       label.startsWith('company') ||
       label.includes('unternehmen') ||
       label.includes('arbeitgeber') ||
       name.includes('company') ||
       id.includes('company'))
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'experience.latest.company',
        targetValue: exp.company,
        displayLabel: `Workday Company (${exp.company})`,
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: `Workday Company for Experience ${expIndex + 1}: ${exp.company}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 4c. Location
    if (
      exp &&
      (autoId.includes('location') ||
       label === 'location' ||
       label.startsWith('location') ||
       label.includes('standort') ||
       name.includes('location') ||
       id.includes('location'))
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'address.city',
        targetValue: exp.location,
        displayLabel: `Workday Experience Location (${exp.location})`,
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: `Workday Experience Location for Experience ${expIndex + 1}: ${exp.location}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 4d. Currently work here (checkbox)
    if (
      exp &&
      field.type === 'checkbox' &&
      (autoId.includes('currentlywork') ||
       autoId.includes('currentjob') ||
       label.includes('currently work') ||
       label.includes('aktuell hier') ||
       combined.includes('currently work here'))
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'experience.latest.company',
        targetValue: exp.currentlyWorkingHere,
        displayLabel: `Workday Currently Work Here (${exp.currentlyWorkingHere ? 'Yes' : 'No'})`,
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: `Workday Currently Work Here for Experience ${expIndex + 1}: ${exp.currentlyWorkingHere}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    const isEduContext =
      combined.includes('education') ||
      combined.includes('ausbildung') ||
      (typeof field.element.closest === 'function' && !!field.element.closest?.('[data-automation-id*="education"]'));

    // 4e. From Date (startDate)
    if (
      exp &&
      !isEduContext &&
      field.tag !== 'button' &&
      field.tag !== 'select' &&
      (autoId.includes('startdate') ||
       autoId.includes('from') ||
       label === 'from' ||
       label.startsWith('from') ||
       label.includes('von') ||
       label.includes('start date') ||
       (placeholder.includes('mm/yyyy') && !label.includes('to')))
    ) {
      const fromFormatted = WorkdayAdapter.formatToMMYYYY(exp.startDate);
      return {
        detectedField: field,
        matchedProfilePath: 'experience.latest.company',
        targetValue: fromFormatted,
        displayLabel: `Workday From Date (${fromFormatted})`,
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: `Workday Start Date for Experience ${expIndex + 1}: ${fromFormatted}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 4f. To Date (endDate)
    if (
      exp &&
      !isEduContext &&
      field.tag !== 'button' &&
      field.tag !== 'select' &&
      (autoId.includes('enddate') ||
       autoId.includes('to') ||
       label === 'to' ||
       label.startsWith('to') ||
       label.includes('bis') ||
       label.includes('end date'))
    ) {
      const toFormatted = exp.currentlyWorkingHere ? '' : WorkdayAdapter.formatToMMYYYY(exp.endDate);
      return {
        detectedField: field,
        matchedProfilePath: 'experience.latest.company',
        targetValue: toFormatted,
        displayLabel: `Workday To Date (${toFormatted || 'Current'})`,
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: `Workday End Date for Experience ${expIndex + 1}: ${toFormatted}`,
        suggestedAction: exp.currentlyWorkingHere ? 'skip' : 'fill',
        isSensitive: false
      };
    }

    // 4g. Role Description (textarea)
    if (
      exp &&
      (field.tag === 'textarea' ||
       autoId.includes('roledescription') ||
       autoId.includes('description') ||
       label.includes('role description') ||
       label.includes('description') ||
       label.includes('aufgaben'))
    ) {
      const formattedRoleDesc = WorkdayAdapter.formatRoleDescription(exp) || exp.description;
      return {
        detectedField: field,
        matchedProfilePath: 'experience.latest.description',
        targetValue: formattedRoleDesc,
        displayLabel: `Workday Role Description (${exp.company})`,
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: `Workday Role Description for Experience ${expIndex + 1}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 5. Workday Education Section Fields (School, Degree, Field of Study, Dates, GPA)
    let eduIndex = 0;
    const eduTextMatch = combined.match(/education\s*(\d+)/i) || combined.match(/ausbildung\s*(\d+)/i);
    if (eduTextMatch) {
      eduIndex = Math.max(0, parseInt(eduTextMatch[1], 10) - 1);
    } else if (field.element && typeof field.element.closest === 'function') {
      const aidBlock = field.element.closest?.('[data-automation-id*="education-"], [data-automation-id*="education_"]')
        ?.getAttribute('data-automation-id');
      const aidMatch = aidBlock?.match(/education[-_](\d+)/i);
      if (aidMatch) {
        eduIndex = Math.max(0, parseInt(aidMatch[1], 10) - 1);
      } else if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
        const allSchoolInputs = Array.from(document.querySelectorAll<HTMLElement>(
          'input[data-automation-id="school"], input[data-automation-id*="school"], input[aria-label*="School"], input[aria-label*="University"]'
        ));
        if (allSchoolInputs.length > 0) {
          if (allSchoolInputs.includes(field.element)) {
            eduIndex = allSchoolInputs.indexOf(field.element);
          } else if (typeof field.element.compareDocumentPosition === 'function') {
            for (let k = allSchoolInputs.length - 1; k >= 0; k--) {
              const si = allSchoolInputs[k];
              if (si.compareDocumentPosition(field.element) & Node.DOCUMENT_POSITION_FOLLOWING) {
                eduIndex = k;
                break;
              }
            }
          }
        }
      }
    }

    const edu = profile.education[eduIndex] || profile.education[0];

    // 5a. School or University
    if (
      edu &&
      (autoId.includes('school') ||
       autoId.includes('university') ||
       label === 'school or university' ||
       label.startsWith('school') ||
       label.includes('school or university') ||
       label.includes('schule oder universität') ||
       name.includes('school') ||
       id.includes('school'))
    ) {
      return {
        detectedField: field,
        matchedProfilePath: eduIndex === 0 ? 'education.latest.university' : 'education.university',
        targetValue: edu.university,
        displayLabel: `Workday School / University (${edu.university})`,
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: `Workday School for Education ${eduIndex + 1}: ${edu.university}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 5b. Degree
    if (
      edu &&
      (autoId.includes('degree') ||
       label === 'degree' ||
       label.startsWith('degree') ||
       label.includes('abschluss') ||
       name.includes('degree') ||
       id.includes('degree'))
    ) {
      let degreeOpt = edu.degree;
      if (field.options && field.options.length > 0) {
        const isMaster = edu.degree.toLowerCase().includes('master') || edu.degree.toLowerCase().includes('m.sc');
        const found = field.options.find((o) => {
          const t = o.text.toLowerCase().trim();
          const v = o.value.toLowerCase().trim();
          if (isMaster) {
            return t.includes('master') || v.includes('master') || t.includes('m.sc') || t.includes('postgraduate');
          } else {
            return t.includes('bachelor') || v.includes('bachelor') || t.includes('b.tech') || t.includes('b.e') || t.includes('undergraduate');
          }
        });
        if (found && found.value) {
          degreeOpt = found.value;
        }
      }
      return {
        detectedField: field,
        matchedProfilePath: eduIndex === 0 ? 'education.latest.degree' : 'education.degree',
        targetValue: edu.degree,
        selectedOptionValue: degreeOpt,
        displayLabel: `Workday Degree (${edu.degree})`,
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: `Workday Degree for Education ${eduIndex + 1}: ${edu.degree}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 5c. Field of Study
    if (
      edu &&
      (autoId.includes('fieldofstudy') ||
       autoId.includes('field-of-study') ||
       label === 'field of study' ||
       label.startsWith('field of study') ||
       label.includes('studienfach') ||
       label.includes('studienrichtung') ||
       name.includes('fieldofstudy') ||
       id.includes('fieldofstudy'))
    ) {
      return {
        detectedField: field,
        matchedProfilePath: eduIndex === 0 ? 'education.latest.fieldOfStudy' : 'education.fieldOfStudy',
        targetValue: edu.fieldOfStudy,
        displayLabel: `Workday Field of Study (${edu.fieldOfStudy})`,
        confidence: 0.99,
        confidenceLevel: 'high',
        matchReason: `Workday Field of Study for Education ${eduIndex + 1}: ${edu.fieldOfStudy}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 5d. Education Start Date / Year (From)
    if (
      edu &&
      field.tag !== 'button' &&
      field.tag !== 'select' &&
      (combined.includes('education') || combined.includes('ausbildung') || field.element.closest?.('[data-automation-id*="education"]')) &&
      (autoId.includes('startdate') ||
       autoId.includes('from') ||
       label === 'from' ||
       label.startsWith('from') ||
       label.includes('von') ||
       (placeholder.includes('yyyy') && !label.includes('to')))
    ) {
      const formattedFrom = WorkdayAdapter.formatEducationYear(edu.startDate, placeholder);
      return {
        detectedField: field,
        matchedProfilePath: 'education.startDate',
        targetValue: formattedFrom,
        displayLabel: `Workday Education From (${formattedFrom})`,
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: `Workday Education Start for Education ${eduIndex + 1}: ${formattedFrom}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 5e. Education End Date / Year (To)
    if (
      edu &&
      field.tag !== 'button' &&
      field.tag !== 'select' &&
      (combined.includes('education') || combined.includes('ausbildung') || field.element.closest?.('[data-automation-id*="education"]')) &&
      (autoId.includes('enddate') ||
       autoId.includes('to') ||
       label === 'to' ||
       label.startsWith('to') ||
       label.includes('bis'))
    ) {
      const formattedTo = WorkdayAdapter.formatEducationYear(edu.endDate, placeholder);
      return {
        detectedField: field,
        matchedProfilePath: 'education.endDate',
        targetValue: formattedTo,
        displayLabel: `Workday Education To (${formattedTo})`,
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: `Workday Education End for Education ${eduIndex + 1}: ${formattedTo}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    // 5f. Overall Result / GPA
    if (
      edu &&
      (autoId.includes('gpa') ||
       autoId.includes('grade') ||
       label.includes('gpa') ||
       label.includes('overall result') ||
       label.includes('note') ||
       label.includes('abschlussnote'))
    ) {
      return {
        detectedField: field,
        matchedProfilePath: 'education.gradeGpa',
        targetValue: edu.gradeGpa,
        displayLabel: `Workday Education GPA (${edu.gradeGpa})`,
        confidence: 0.98,
        confidenceLevel: 'high',
        matchReason: `Workday Education GPA for Education ${eduIndex + 1}: ${edu.gradeGpa}`,
        suggestedAction: 'fill',
        isSensitive: false
      };
    }

    const workdayMap: Record<string, { path: any; value: any; label: string }> = {
      legalnamesection_firstname: {
        path: 'basic.firstName',
        value: profile.basic.firstName,
        label: 'Workday First Name'
      },
      legalnamesection_lastname: {
        path: 'basic.lastName',
        value: profile.basic.lastName,
        label: 'Workday Last Name'
      },
      email: {
        path: 'contact.email',
        value: profile.contact.email,
        label: 'Workday Email'
      },
      addresssection_addressline1: {
        path: 'address.street',
        value: profile.address.street,
        label: 'Workday Address Line 1'
      },
      addresssection_city: {
        path: 'address.city',
        value: profile.address.city,
        label: 'Workday City'
      },
      addresssection_postalcode: {
        path: 'address.postalCode',
        value: profile.address.postalCode,
        label: 'Workday Postal Code'
      }
    };

    for (const [key, mapItem] of Object.entries(workdayMap)) {
      if (autoId.includes(key)) {
        return {
          detectedField: field,
          matchedProfilePath: mapItem.path,
          targetValue: mapItem.value,
          displayLabel: mapItem.label,
          confidence: 0.98,
          confidenceLevel: 'high',
          matchReason: `Workday automation ID '${autoId}' matched directly`,
          suggestedAction: 'fill',
          isSensitive: false
        };
      }
    }

    return null;
  }

  public static formatToMMYYYY(dateStr: string): string {
    if (!dateStr || dateStr.toLowerCase() === 'present' || dateStr.toLowerCase() === 'current') return '';
    if (/^\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
    const matchYM = dateStr.match(/^(\d{4})-(\d{2})/);
    if (matchYM) {
      return `${matchYM[2]}/${matchYM[1]}`;
    }
    const matchMY = dateStr.match(/^(\d{1,2})\/(\d{4})/);
    if (matchMY) {
      const m = matchMY[1].padStart(2, '0');
      return `${m}/${matchMY[2]}`;
    }
    if (/^\d{4}$/.test(dateStr)) {
      return `01/${dateStr}`;
    }
    return dateStr;
  }

  public static formatEducationYear(dateStr: string, placeholder?: string): string {
    if (!dateStr) return '';
    const matchYear = dateStr.match(/\b(19\d{2}|20\d{2})\b/);
    const year = matchYear ? matchYear[1] : '';
    if (placeholder && (placeholder.toLowerCase().includes('mm/yyyy') || placeholder.toLowerCase().includes('mm / yyyy'))) {
      return WorkdayAdapter.formatToMMYYYY(dateStr);
    }
    return year || dateStr;
  }

  public static formatRoleDescription(exp: { responsibilities?: string[]; description?: string }): string {
    if (!exp) return '';
    if (exp.responsibilities && exp.responsibilities.length > 0) {
      return exp.responsibilities
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => (r.startsWith('•') || r.startsWith('-') ? r : `• ${r}`))
        .join('\n');
    }
    if (exp.description) {
      if (exp.description.includes('\n')) {
        return exp.description
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => (l.startsWith('•') || l.startsWith('-') ? l : `• ${l}`))
          .join('\n');
      }
      const sentences = exp.description
        .split(/(?<=\.)\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (sentences.length > 1) {
        return sentences.map((s) => (s.startsWith('•') || s.startsWith('-') ? s : `• ${s}`)).join('\n');
      }
      return exp.description.startsWith('•') ? exp.description : `• ${exp.description}`;
    }
    return '';
  }
}
