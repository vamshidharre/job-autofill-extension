import { ProfileFieldPath } from '../types/engine';

export interface FieldPattern {
  path: ProfileFieldPath;
  displayLabel: string;
  exactNames: string[];
  exactIds: string[];
  exactAutocompletes: string[];
  labelKeywords: RegExp[];
  negativeKeywords?: RegExp[];
  isSensitive?: boolean;
  typeFilter?: string[]; // e.g. ['email'], ['tel'], ['select']
}

export const SYNONYM_DICTIONARY: FieldPattern[] = [
  // First Name
  {
    path: 'basic.firstName',
    displayLabel: 'First Name / Vorname',
    exactNames: ['firstname', 'first_name', 'fname', 'first-name', 'vorname', 'givenname', 'given_name', 'forename'],
    exactIds: ['firstname', 'first_name', 'fname', 'first-name', 'vorname', 'givenname', 'given_name', 'forename'],
    exactAutocompletes: ['given-name'],
    labelKeywords: [
      /\b(first[\s_-]?name|given[\s_-]?name|vorname|forename|prénom|primer[\s_-]?nombre)\b/i
    ],
    negativeKeywords: [/\b(last|nachname|middle|zweiter|bevorzugt|preferred|sur|family|emergency|manager|reference)\b/i]
  },

  // Middle Name
  {
    path: 'basic.middleName',
    displayLabel: 'Middle Name / Zweiter Vorname',
    exactNames: ['middlename', 'middle_name', 'mname', 'zweiter_vorname', 'weitere_vornamen'],
    exactIds: ['middlename', 'middle_name', 'mname', 'zweiter_vorname'],
    exactAutocompletes: ['additional-name'],
    labelKeywords: [
      /\b(middle[\s_-]?name|zweiter[\s_-]?vorname|weitere(r)?[\s_-]?vorname|second[\s_-]?name)\b/i
    ],
    negativeKeywords: [/\b(last|nachname|family|emergency)\b/i]
  },

  // Preferred Name
  {
    path: 'basic.preferredName',
    displayLabel: 'Preferred Name / Bevorzugter Name',
    exactNames: ['preferredname', 'preferred_name', 'nickname', 'rufname', 'bevorzugter_name'],
    exactIds: ['preferredname', 'preferred_name', 'nickname', 'rufname'],
    exactAutocompletes: ['nickname'],
    labelKeywords: [
      /\b(preferred[\s_-]?name|bevorzugter[\s_-]?name|rufname|nickname|chosen[\s_-]?name)\b/i
    ],
    negativeKeywords: [/\b(legal|legaler|last|nachname)\b/i]
  },

  // Last Name
  {
    path: 'basic.lastName',
    displayLabel: 'Last Name / Nachname',
    exactNames: ['lastname', 'last_name', 'lname', 'last-name', 'nachname', 'legal_lastname', 'legaler_nachname', 'surname', 'familyname', 'family_name'],
    exactIds: ['lastname', 'last_name', 'lname', 'last-name', 'nachname', 'legal_lastname', 'legaler_nachname', 'surname', 'familyname', 'family_name'],
    exactAutocompletes: ['family-name'],
    labelKeywords: [
      /\b(last[\s_-]?name|legal(er)?[\s_-]?nachname|legal[\s_-]?last[\s_-]?name|nachname|surname|family[\s_-]?name|nom|apellidos?|familienname)\b/i
    ],
    negativeKeywords: [/\b(first|vorname|middle|zweiter|emergency|manager|reference)\b/i]
  },

  // Full Name
  {
    path: 'basic.fullName',
    displayLabel: 'Full Name / Name',
    exactNames: ['fullname', 'full_name', 'name', 'candidatename', 'applicantname', 'vollstaendiger_name'],
    exactIds: ['fullname', 'full_name', 'name', 'candidatename', 'applicantname'],
    exactAutocompletes: ['name'],
    labelKeywords: [
      /\b(full[\s_-]?name|complete[\s_-]?name|ganzer[\s_-]?name|vollst[aä]ndiger[\s_-]?name|ihr[\s_-]?name|your[\s_-]?name)\b/i,
      /^(\s*name\s*|\s*name\s*\*?\s*)$/i
    ],
    negativeKeywords: [
      /\b(first|last|vorname|nachname|company|employer|school|university|emergency|reference|file|user|login)\b/i
    ]
  },

  // Email
  {
    path: 'contact.email',
    displayLabel: 'Email Address / E-Mail',
    exactNames: ['email', 'e-mail', 'mail', 'emailaddress', 'email_address', 'e_mail', 'e_mail_address'],
    exactIds: ['email', 'e-mail', 'mail', 'emailaddress', 'email_address', 'e_mail'],
    exactAutocompletes: ['email'],
    labelKeywords: [
      /\b(e[\s_-]?mail|e-mail[\s_-]?adresse|email[\s_-]?address|mailadresse|elektronische[\s_-]?post)\b/i
    ],
    negativeKeywords: [/\b(company|employer|manager|reference|confirm|repeat|bestaetigen)\b/i],
    typeFilter: ['text', 'email']
  },

  // Phone Number
  {
    path: 'contact.phone',
    displayLabel: 'Phone / Telefon',
    exactNames: ['phone', 'telephone', 'mobile', 'cell', 'cellphone', 'phonenumber', 'phone_number', 'telefon', 'handy', 'mobilnummer', 'rufnummer'],
    exactIds: ['phone', 'telephone', 'mobile', 'cell', 'cellphone', 'phonenumber', 'phone_number', 'telefon', 'handy', 'mobilnummer'],
    exactAutocompletes: ['tel', 'tel-national', 'tel-local'],
    labelKeywords: [
      /\b(phone|telephone|mobile|handynummer|telefonnummer|rufnummer|mobiltelefon|phone[\s_-]?number|contact[\s_-]?number)\b/i
    ],
    negativeKeywords: [/\b(emergency|alt|fax|company|employer|office|type|device|country|code|vorwahl|telefontyp)\b/i],
    typeFilter: ['text', 'tel']
  },

  // Phone Device Type / Telefontyp (Mobil / Mobile)
  {
    path: 'contact.phoneDevice',
    displayLabel: 'Phone Device Type / Telefontyp (Mobil)',
    exactNames: ['phone_device', 'phone_type', 'devicetype', 'phonetype', 'telefontyp', 'phone_device_type', 'contact_phone_device'],
    exactIds: ['phone_device', 'phone_type', 'devicetype', 'phonetype', 'telefontyp', 'phone_device_type'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(kontakt[\s_-]?telefontyp|telefontyp|phone[\s_-]?device|phone[\s_-]?type|device[\s_-]?type|ger[aä]tetyp|kontakt.*telefon.*typ)\b/i
    ],
    negativeKeywords: []
  },

  // Phone Country Calling Code / Telefon - Vorwahl (DE +49)
  {
    path: 'contact.phoneCountryCode',
    displayLabel: 'Phone Country Code / Vorwahl (DE +49)',
    exactNames: ['country_code', 'dial_code', 'calling_code', 'phone_country', 'landesvorwahl', 'vorwahl', 'phone_country_code'],
    exactIds: ['country_code', 'dial_code', 'calling_code', 'phone_country', 'landesvorwahl', 'vorwahl', 'phone_country_code'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(country[\s_-]?code|calling[\s_-]?code|dial[\s_-]?code|landesvorwahl|vorwahl|telefon[\s_-]?land|telefon.*vorwahl)\b/i,
      /^telefon\s*[-–]?\s*(land|vorwahl)?$/i
    ],
    negativeKeywords: [/\b(number|nummer)\b/i]
  },

  // Street / Address Line 1
  {
    path: 'address.street',
    displayLabel: 'Street / Straße',
    exactNames: ['street', 'address', 'address1', 'address_line_1', 'street_address', 'strasse', 'straße', 'anschrift'],
    exactIds: ['street', 'address', 'address1', 'address_line_1', 'street_address', 'strasse', 'straße', 'anschrift'],
    exactAutocompletes: ['street-address', 'address-line1'],
    labelKeywords: [
      /\b(street|address[\s_-]?line[\s_-]?1|street[\s_-]?address|stra[sß]e|stra[sß]enname|anschrift|hausadresse)\b/i
    ],
    negativeKeywords: [/\b(email|mail|ip|mac|web|url|line[\s_-]?2|state|city|postal|zip)\b/i]
  },

  // House Number
  {
    path: 'address.houseNumber',
    displayLabel: 'House Number / Hausnummer',
    exactNames: ['housenumber', 'house_number', 'hausnummer', 'building_number', 'hausnr'],
    exactIds: ['housenumber', 'house_number', 'hausnummer', 'building_number', 'hausnr'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(house[\s_-]?number|hausnummer|haus[\s_-]?nr|building[\s_-]?no|apt|suite)\b/i
    ],
    negativeKeywords: [/\b(street|stra[sß]e|phone|telefon)\b/i]
  },

  // Postal Code / PLZ
  {
    path: 'address.postalCode',
    displayLabel: 'Postal Code / Postleitzahl',
    exactNames: ['zip', 'zipcode', 'zip_code', 'postalcode', 'postal_code', 'plz', 'postleitzahl'],
    exactIds: ['zip', 'zipcode', 'zip_code', 'postalcode', 'postal_code', 'plz', 'postleitzahl'],
    exactAutocompletes: ['postal-code'],
    labelKeywords: [
      /\b(postal[\s_-]?code|zip[\s_-]?code|plz|postleitzahl|code[\s_-]?postal)\b/i
    ],
    negativeKeywords: []
  },

  // City / Town
  {
    path: 'address.city',
    displayLabel: 'City / Stadt / Ort',
    exactNames: ['city', 'town', 'stadt', 'ort', 'wohnort'],
    exactIds: ['city', 'town', 'stadt', 'ort', 'wohnort'],
    exactAutocompletes: ['address-level2'],
    labelKeywords: [
      /\b(city|town|stadt|wohnort|ort|gemeinde|ville|ciudad)\b/i
    ],
    negativeKeywords: [/\b(country|land|state|bundesland|birth|geburt)\b/i]
  },

  // State / Bundesland / Region
  {
    path: 'address.state',
    displayLabel: 'State / Bundesland',
    exactNames: ['state', 'province', 'region', 'bundesland', 'kanton'],
    exactIds: ['state', 'province', 'region', 'bundesland', 'kanton'],
    exactAutocompletes: ['address-level1'],
    labelKeywords: [
      /\b(state|province|region|bundesland|kanton|d[eé]partement|estado)\b/i
    ],
    negativeKeywords: [/\b(country|land|city|stadt)\b/i]
  },

  // Country
  {
    path: 'address.country',
    displayLabel: 'Country / Land',
    exactNames: ['country', 'land', 'staat', 'nation', 'residence_country', 'country_of_residence'],
    exactIds: ['country', 'land', 'staat', 'nation', 'residence_country', 'country_of_residence'],
    exactAutocompletes: ['country', 'country-name'],
    labelKeywords: [
      /\b(country|land|staat|nationalit[aä]t|citizenship|pays|pa[ií]s|wohnsitz|country[\s_-]?of[\s_-]?residence|land[\s/_-]?region[\s_-]?des[\s_-]?wohnsitzes|land[\s/_-]?region)\b/i
    ],
    negativeKeywords: [/\b(city|stadt|birth|geburt|phone|telefon|calling|dial|vorwahl)\b/i]
  },

  // LinkedIn Profile
  {
    path: 'contact.linkedin',
    displayLabel: 'LinkedIn Profile URL',
    exactNames: ['linkedin', 'linkedin_url', 'linkedin_profile', 'linkedinurl'],
    exactIds: ['linkedin', 'linkedin_url', 'linkedin_profile', 'linkedinurl'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(linkedin|linkedin[\s_-]?url|linkedin[\s_-]?profile|linkedin[\s_-]?profil)\b/i
    ],
    negativeKeywords: []
  },

  // GitHub Profile
  {
    path: 'contact.github',
    displayLabel: 'GitHub Profile URL',
    exactNames: ['github', 'github_url', 'github_profile', 'githuburl'],
    exactIds: ['github', 'github_url', 'github_profile', 'githuburl'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(github|github[\s_-]?url|github[\s_-]?profile|github[\s_-]?profil)\b/i
    ],
    negativeKeywords: []
  },

  // Portfolio / Personal Website
  {
    path: 'contact.portfolio',
    displayLabel: 'Portfolio / Website URL',
    exactNames: ['portfolio', 'website', 'webpage', 'personal_website', 'homepage', 'webseite'],
    exactIds: ['portfolio', 'website', 'webpage', 'personal_website', 'homepage', 'webseite'],
    exactAutocompletes: ['url'],
    labelKeywords: [
      /\b(portfolio|personal[\s_-]?website|webseite|webpage|homepage|link[\s_-]?to[\s_-]?work)\b/i
    ],
    negativeKeywords: [/\b(linkedin|github|twitter|facebook)\b/i]
  },

  // Webpage / Website URL
  {
    path: 'contact.website',
    displayLabel: 'Webpage / Website URL',
    exactNames: ['webpage', 'website', 'web_page', 'personal_site', 'webseite', 'url'],
    exactIds: ['webpage', 'website', 'web_page', 'personal_site', 'webseite', 'url'],
    exactAutocompletes: ['url'],
    labelKeywords: [
      /\b(webpage|website|webseite|personal[\s_-]?page|homepage)\b/i
    ],
    negativeKeywords: [/\b(linkedin|github|twitter|facebook)\b/i]
  },

  // Salary Expectations
  {
    path: 'salary.expectedAnnual',
    displayLabel: 'Salary Expectation / Gehaltsvorstellung',
    exactNames: ['salary', 'expected_salary', 'desired_salary', 'gehalt', 'gehaltsvorstellung', 'gehaltswunsch', 'compensation'],
    exactIds: ['salary', 'expected_salary', 'desired_salary', 'gehalt', 'gehaltsvorstellung', 'gehaltswunsch', 'compensation'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(salary|gehalt|gehaltsvorstellung(en)?|gehaltswunsch|expected[\s_-]?salary|desired[\s_-]?salary|salary[\s_-]?requirement(s)?|expected[\s_-]?compensation|desired[\s_-]?compensation|remuneration)\b/i
    ],
    negativeKeywords: [/\b(current|bisheriges|derzeitiges|previous)\b/i],
    isSensitive: true
  },

  // Earliest Start Date / Availability
  {
    path: 'jobPreferences.earliestStartDate',
    displayLabel: 'Earliest Start Date / Eintrittstermin',
    exactNames: ['start_date', 'earliest_start', 'available_from', 'verfuegbar_ab', 'eintrittstermin', 'availability', 'available'],
    exactIds: ['start_date', 'earliest_start', 'available_from', 'verfuegbar_ab', 'eintrittstermin', 'availability', 'available'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(earliest[\s_-]?start|available[\s_-]?from|eintrittstermin|fr[uü]hestm[oö]glicher[\s_-]?eintritt|start[\s_-]?date|joining[\s_-]?date|verf[uü]gbar[\s_-]?ab)\b/i
    ],
    negativeKeywords: [/\b(end|experience|education|university|studium|bis)\b/i]
  },

  // Notice Period / Kündigungsfrist / Verfügbarkeit
  {
    path: 'jobPreferences.noticePeriod',
    displayLabel: 'Notice Period / Kündigungsfrist / Verfügbarkeit',
    exactNames: ['notice_period', 'kuendigungsfrist', 'notice', 'verfuegbarkeit', 'availability', 'verfuegbar'],
    exactIds: ['notice_period', 'kuendigungsfrist', 'notice', 'verfuegbarkeit', 'availability', 'verfuegbar'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(verf[uü]gbarkeit|notice[\s_-]?period|k[uü]ndigungsfrist|notice|arbeitsverh[aä]ltnis|neuen[\s_-]?job[\s_-]?beginnen|sofort|immediate|availability)\b/i
    ],
    negativeKeywords: [/\b(end|experience|education|university|studium|bis)\b/i]
  },

  // Work Authorization / Sponsorship / EU-Staatsbürgerschaft
  {
    path: 'workAuthorization.legallyAuthorized',
    displayLabel: 'Authorized to Work / Arbeitserlaubnis / EU-Staatsbürgerschaft',
    exactNames: ['authorized_to_work', 'work_authorization', 'arbeitserlaubnis', 'work_permit', 'legally_authorized', 'eu_citizenship', 'staatsbuergerschaft'],
    exactIds: ['authorized_to_work', 'work_authorization', 'arbeitserlaubnis', 'work_permit', 'legally_authorized', 'eu_citizenship', 'staatsbuergerschaft'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(authorized[\s_-]?to[\s_-]?work|legally[\s_-]?authorized|arbeitserlaubnis|work[\s_-]?permit|eligible[\s_-]?to[\s_-]?work|berechtigung[\s_-]?zur[\s_-]?erwerbst[aä]tigkeit|eu[\s_-]?staatsb[uü]rgerschaft|g[uü]ltige[\s_-]?arbeitserlaubnis|arbeitserlaubnis[\s_-]?oder[\s_-]?eu[\s_-]?staatsb[uü]rgerschaft)\b/i
    ],
    negativeKeywords: [],
    isSensitive: true
  },

  // Referral Source / Wie hast du von uns erfahren?
  {
    path: 'jobPreferences.referralSource',
    displayLabel: 'Referral Source / Wie hast du von uns erfahren?',
    exactNames: ['source', 'referral_source', 'how_did_you_hear', 'heard_from', 'how_heard', 'wie_erfahren', 'aufmerksam_geworden', 'quelle', 'hear_about_us'],
    exactIds: ['source', 'referral_source', 'how_did_you_hear', 'heard_from', 'how_heard', 'wie_erfahren', 'aufmerksam_geworden', 'quelle', 'hear_about_us'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(wie[\s_-]?hast[\s_-]?du[\s_-]?von[\s_-]?uns[\s_-]?erfahren|wie[\s_-]?haben[\s_-]?sie[\s_-]?von[\s_-]?uns[\s_-]?erfahren|wie[\s_-]?bist[\s_-]?du[\s_-]?auf[\s_-]?uns[\s_-]?aufmerksam|woher[\s_-]?kennst[\s_-]?du[\s_-]?uns|how[\s_-]?did[\s_-]?you[\s_-]?hear[\s_-]?about[\s_-]?us|how[\s_-]?did[\s_-]?you[\s_-]?hear|where[\s_-]?did[\s_-]?you[\s_-]?hear|referral[\s_-]?source|application[\s_-]?source|wie[\s_-]?erfahren)\b/i
    ],
    negativeKeywords: []
  },

  // German Language Skills / Deutsch-Sprachkenntnisse
  {
    path: 'languages.german',
    displayLabel: 'German Language Skills / Deutsch-Sprachkenntnisse',
    exactNames: ['german_level', 'deutsch_kenntnisse', 'german_skills', 'sprachkenntnisse_deutsch', 'german_proficiency', 'deutsch_sprachkenntnisse'],
    exactIds: ['german_level', 'deutsch_kenntnisse', 'german_skills', 'sprachkenntnisse_deutsch', 'deutsch_sprachkenntnisse'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(deutsch[\s_-]?sprachkenntnisse|deutschkenntnisse|deutsch[\s_-]?niveau|sprachkenntnisse[\s_-]?deutsch|german[\s_-]?skills|german[\s_-]?language|german[\s_-]?proficiency|kenntnisse[\s_-]?in[\s_-]?deutsch)\b/i,
      /\b(deutsch.*bewerten|rate.*german)\b/i
    ],
    negativeKeywords: [/\b(englisch|english|französisch|french|spanisch|spanish)\b/i]
  },

  // English Language Skills / Englisch-Sprachkenntnisse
  {
    path: 'languages.english',
    displayLabel: 'English Language Skills / Englisch-Sprachkenntnisse',
    exactNames: ['english_level', 'englisch_kenntnisse', 'english_skills', 'sprachkenntnisse_englisch', 'english_proficiency', 'englisch_sprachkenntnisse'],
    exactIds: ['english_level', 'englisch_kenntnisse', 'english_skills', 'sprachkenntnisse_englisch', 'englisch_sprachkenntnisse'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(englisch[\s_-]?sprachkenntnisse|englischkenntnisse|englisch[\s_-]?niveau|sprachkenntnisse[\s_-]?englisch|english[\s_-]?skills|english[\s_-]?language|english[\s_-]?proficiency|kenntnisse[\s_-]?in[\s_-]?englisch)\b/i,
      /\b(englisch.*bewerten|rate.*english)\b/i
    ],
    negativeKeywords: [/\b(deutsch|german|französisch|french|spanisch|spanish)\b/i]
  },

  // Gender / Geschlecht
  {
    path: 'basic.gender',
    displayLabel: 'Gender / Geschlecht',
    exactNames: ['gender', 'geschlecht', 'geschlechtsidentitaet', 'gender_identity'],
    exactIds: ['gender', 'geschlecht', 'geschlechtsidentitaet', 'gender_identity'],
    exactAutocompletes: ['sex'],
    labelKeywords: [
      /\b(geschlecht[\s_-]?beschreiben|describe[\s_-]?your[\s_-]?gender|geschlecht|geschlechtsidentit[aä]t|gender|gender[\s_-]?identity)\b/i
    ],
    negativeKeywords: []
  },

  // Nationality / Nationalität
  {
    path: 'basic.nationality',
    displayLabel: 'Nationality / Nationalität',
    exactNames: ['nationality', 'nationalitaet', 'citizenship', 'staatsangehoerigkeit'],
    exactIds: ['nationality', 'nationalitaet', 'citizenship', 'staatsangehoerigkeit'],
    exactAutocompletes: ['nationality'],
    labelKeywords: [
      /\b(nationalit[aä]t(en)?[\s_-]?besitzt[\s_-]?du|which[\s_-]?nationality|nationalit[aä]t|staatsangeh[oö]rigkeit|citizenship)\b/i
    ],
    negativeKeywords: []
  },

  // Age Group / Altersgruppe
  {
    path: 'basic.ageGroup',
    displayLabel: 'Age Group / Altersgruppe',
    exactNames: ['age_group', 'altersgruppe', 'age', 'alter'],
    exactIds: ['age_group', 'altersgruppe', 'age', 'alter'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(altersgruppe|age[\s_-]?group|welche[\s_-]?ist[\s_-]?deine[\s_-]?altersgruppe|what[\s_-]?is[\s_-]?your[\s_-]?age[\s_-]?group)\b/i
    ],
    negativeKeywords: []
  },

  // Visa Sponsorship Required
  {
    path: 'workAuthorization.requireSponsorshipNow',
    displayLabel: 'Require Sponsorship / Visum Sponsoring',
    exactNames: ['require_sponsorship', 'sponsorship_required', 'visa_sponsorship', 'visum_sponsoring'],
    exactIds: ['require_sponsorship', 'sponsorship_required', 'visa_sponsorship', 'visum_sponsoring'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(require[\s_-]?visa[\s_-]?sponsorship|need[\s_-]?sponsorship|visa[\s_-]?sponsorship|sponsoring|visumbeschaffung)\b/i
    ],
    negativeKeywords: [],
    isSensitive: true
  },

  // Willing to Relocate
  {
    path: 'jobPreferences.willingToRelocate',
    displayLabel: 'Willing to Relocate / Umzugsbereitschaft',
    exactNames: ['relocate', 'willing_to_relocate', 'umzugsbereitschaft'],
    exactIds: ['relocate', 'willing_to_relocate', 'umzugsbereitschaft'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(willing[\s_-]?to[\s_-]?relocate|relocate|relocation|umzugsbereitschaft|bereit[\s_-]?umzuziehen)\b/i
    ],
    negativeKeywords: []
  },

  // Willing to Travel
  {
    path: 'jobPreferences.willingToTravel',
    displayLabel: 'Willing to Travel / Reisebereitschaft',
    exactNames: ['travel', 'willing_to_travel', 'reisebereitschaft'],
    exactIds: ['travel', 'willing_to_travel', 'reisebereitschaft'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(willing[\s_-]?to[\s_-]?travel|travel[\s_-]?percentage|reisebereitschaft|reise[\s_-]?bereit)\b/i
    ],
    negativeKeywords: []
  },

  // Education: Degree
  {
    path: 'education.latest.degree',
    displayLabel: 'Degree / Abschluss',
    exactNames: ['degree', 'education_degree', 'abschluss', 'studienabschluss', 'degree_level'],
    exactIds: ['degree', 'education_degree', 'abschluss', 'studienabschluss', 'degree_level'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(degree|highest[\s_-]?degree|abschluss|h[oö]chster[\s_-]?abschluss|qualification|studienabschluss)\b/i
    ],
    negativeKeywords: [/\b(field|major|university|school|subject)\b/i]
  },

  // Education: University / School
  {
    path: 'education.latest.university',
    displayLabel: 'University / Hochschule',
    exactNames: ['university', 'college', 'school', 'institution', 'hochschule', 'universitaet'],
    exactIds: ['university', 'college', 'school', 'institution', 'hochschule', 'universitaet'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(university|college|school|institution|hochschule|universit[aä]t|bildungsst[aä]tte)\b/i
    ],
    negativeKeywords: [/\b(degree|major|field|grade)\b/i]
  },

  // Education: Field of Study / Major
  {
    path: 'education.latest.fieldOfStudy',
    displayLabel: 'Field of Study / Studienfach',
    exactNames: ['field_of_study', 'major', 'discipline', 'studienfach', 'studiengang'],
    exactIds: ['field_of_study', 'major', 'discipline', 'studienfach', 'studiengang'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(field[\s_-]?of[\s_-]?study|major|area[\s_-]?of[\s_-]?study|studienfach|studiengang|fachrichtung)\b/i
    ],
    negativeKeywords: [/\b(university|degree|grade)\b/i]
  },

  // Experience: Company
  {
    path: 'experience.latest.company',
    displayLabel: 'Current/Previous Employer / Arbeitgeber',
    exactNames: ['employer', 'company', 'company_name', 'arbeitgeber', 'firma', 'organization'],
    exactIds: ['employer', 'company', 'company_name', 'arbeitgeber', 'firma', 'organization'],
    exactAutocompletes: ['organization'],
    labelKeywords: [
      /\b(employer|current[\s_-]?company|previous[\s_-]?company|arbeitgeber|firma|unternehmung|organisation)\b/i
    ],
    negativeKeywords: [/\b(university|school|title|position|email)\b/i]
  },

  // Experience: Job Title
  {
    path: 'experience.latest.title',
    displayLabel: 'Job Title / Position / Rolle',
    exactNames: ['job_title', 'position', 'role', 'berufsbezeichnung', 'stellenbezeichnung'],
    exactIds: ['job_title', 'position', 'role', 'berufsbezeichnung', 'stellenbezeichnung'],
    exactAutocompletes: ['organization-title'],
    labelKeywords: [
      /\b(job[\s_-]?title|current[\s_-]?title|position|berufsbezeichnung|stellenbezeichnung|aktueller[\s_-]?titel)\b/i
    ],
    negativeKeywords: [/\b(desired|sought|applying|company|university)\b/i]
  },

  // Cover Letter Textarea
  {
    path: 'coverLetter.text',
    displayLabel: 'Cover Letter / Anschreiben',
    exactNames: ['cover_letter', 'coverletter', 'anschreiben', 'motivation', 'motivational_letter', 'letter'],
    exactIds: ['cover_letter', 'coverletter', 'anschreiben', 'motivation', 'motivational_letter', 'letter'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(cover[\s_-]?letter|anschreiben|motivational[\s_-]?letter|motivationsschreiben|bewerbungsschreiben|why[\s_-]?join[\s_-]?us|why[\s_-]?work[\s_-]?here)\b/i
    ],
    negativeKeywords: [],
    typeFilter: ['textarea', 'text']
  },

  // Resume File Upload
  {
    path: 'document.resume',
    displayLabel: 'Resume / CV File',
    exactNames: ['resume', 'cv', 'lebenslauf', 'resume_file', 'cv_file'],
    exactIds: ['resume', 'cv', 'lebenslauf', 'resume_file', 'cv_file'],
    exactAutocompletes: [],
    labelKeywords: [
      /\b(resume|cv|curriculum[\s_-]?vitae|lebenslauf|resume[\s_-]?upload)\b/i
    ],
    negativeKeywords: [/\b(cover[\s_-]?letter|anschreiben|certificate|zeugnis)\b/i],
    typeFilter: ['file']
  }
];

// Dangerous keywords for checkboxes/buttons that must NEVER be auto-checked or auto-submitted
export const FORBIDDEN_CHECKBOX_KEYWORDS = [
  /\b(agree|consent|terms|conditions|privacy[\s_-]?policy|datenschutz|agb|einverst[aä]ndnis|background[\s_-]?check|criminal|declaration|legal|swear|certify[\s_-]?that)\b/i,
  /\b(datenschutz\w*|besch[aä]ftigungsbedingungen|vorstehenden\s+ausf(?:ü|ue)hrungen|akzeptiere\s+sie|i\s+acknowledge|i\s+hereby\s+certify)\b/i
];

export const FORBIDDEN_BUTTON_KEYWORDS = [
  /\b(submit[\s_-]?application|apply[\s_-]?now|bewerbung[\s_-]?abschicken|bewerbung[\s_-]?senden|confirm[\s_-]?and[\s_-]?submit|jetzt[\s_-]?bewerben)\b/i
];
