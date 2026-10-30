import { UserProfile } from '../types/profile';

// Fictional demo data only. Personal profiles and learned answers belong in local browser storage.
export const DEFAULT_USER_PROFILE: UserProfile = {
  "basic": {
    "firstName": "Alex",
    "middleName": "",
    "lastName": "Example",
    "fullName": "Alex Example",
    "preferredName": "Alex",
    "dateOfBirth": "2000-01-01",
    "gender": "male",
    "nationality": "Indian",
    "countryOfBirth": "India"
  },
  "contact": {
    "email": "alex@example.com",
    "phone": "+49 000 00000000",
    "altPhone": "",
    "linkedin": "https://www.linkedin.com/in/alex-example/",
    "github": "https://github.com/example",
    "portfolio": "",
    "website": "https://www.linkedin.com/in/alex-example/"
  },
  "address": {
    "street": "Example Street",
    "houseNumber": "1",
    "addressLine1": "Example Street 1",
    "addressLine2": "",
    "postalCode": "00000",
    "city": "Example City",
    "state": "Baden-Württemberg",
    "country": "Germany"
  },
  "jobPreferences": {
    "desiredTitle": "CAE / Simulation Engineer (FEA, NVH, Structural Dynamics)",
    "alternativeTitles": [
      "Berechnungsingenieur NVH / Strukturmechanik",
      "Structural Dynamics Engineer",
      "Vibroacoustic Simulation Engineer",
      "CAE Automation Engineer",
      "Mechanical Simulation Engineer"
    ],
    "preferredDepartments": [
      "Simulation / CAE",
      "Structural Analysis & FEA",
      "NVH & Vibroacoustics",
      "Powertrain & E-Mobility",
      "R&D"
    ],
    "preferredIndustries": [
      "Automotive",
      "Aerospace",
      "Robotics",
      "Mechanical Engineering",
      "Clean Energy"
    ],
    "preferredLocations": [
      "Stuttgart",
      "München",
      "Nürnberg",
      "Erlangen",
      "Remote"
    ],
    "willingToRelocate": true,
    "willingToTravel": true,
    "remotePreference": "hybrid",
    "employmentTypes": {
      "fullTime": true,
      "partTime": false,
      "workingStudent": true,
      "internship": true,
      "contract": false,
      "permanent": true
    },
    "earliestStartDate": "2026-10-01",
    "availableFrom": "October 2026",
    "noticePeriod": "Immediately",
    "currentEmploymentStatus": "Master Student / Intern",
    "preferredWorkingHours": "Full-time (40h/week)",
    "weeklyWorkingHours": 40
  },
  "salary": {
    "expectedAnnual": 60000,
    "minAnnual": 60000,
    "maxAnnual": 70000,
    "currency": "EUR",
    "monthlyExpectation": 5000,
    "hourlyExpectation": 32,
    "negotiable": true
  },
  "workAuthorization": {
    "legallyAuthorized": true,
    "requireSponsorshipNow": false,
    "requireSponsorshipFuture": false,
    "currentAuthType": "Example only: enter your own authorization",
    "authExpiryDate": "",
    "willingToObtainAuthorization": true,
    "additionalNotes": "Demo data; replace all authorization answers with your own information."
  },
  "education": [
    {
      "id": "edu-1",
      "degree": "Master of Science (M.Sc.)",
      "fieldOfStudy": "Computational Engineering",
      "university": "Example Technical University",
      "location": "Erlangen, Germany",
      "startDate": "2022-10",
      "endDate": "2026-09",
      "graduationDate": "2026-09",
      "gradeGpa": "2.0",
      "gpaScale": "1.0 - 5.0 (German Scale)",
      "thesisTitle": "Example engineering research project",
      "description": "Fictional education entry. Replace this with your own education.",
      "relevantCoursework": [
        "Advanced Finite Element Methods",
        "Computational Structural Dynamics & NVH",
        "Machine Learning & Neural Networks",
        "Numerical Mathematics & Optimization",
        "Continuum Mechanics"
      ]
    },
    {
      "id": "edu-2",
      "degree": "Bachelor of Technology (B.Tech.)",
      "fieldOfStudy": "Mechanical Engineering",
      "university": "Example Engineering College",
      "location": "Example City, India",
      "startDate": "2018-08",
      "endDate": "2022-07",
      "graduationDate": "2022-07",
      "gradeGpa": "1.7",
      "gpaScale": "German Grade Equivalent (8.2/10 CGPA)",
      "thesisTitle": "Example engineering research project",
      "description": "Fictional education entry. Replace this with your own education.",
      "relevantCoursework": [
        "Mechanics of Solids",
        "Machine Design",
        "Finite Element Methods",
        "CAD/CAM"
      ]
    }
  ],
  "experience": [
    {
      "id": "exp-1",
      "jobTitle": "Intern - CAE & AI Surrogate Modeling",
      "company": "Example Mobility AG",
      "location": "Example City, Germany",
      "employmentType": "Internship",
      "startDate": "2026-04",
      "endDate": "Present",
      "currentlyWorkingHere": true,
      "description": "• Example simulation engineering responsibilities.\n• Example automation and validation project.",
      "responsibilities": [
        "Example simulation engineering responsibilities",
        "Example automation and validation project"
      ],
      "achievements": [
        "Example achievement; replace with a verified result."
      ],
      "technologies": [
        "NASTRAN",
        "Hypermesh",
        "Python",
        "TensorFlow",
        "Keras",
        "DIMGP"
      ],
      "skills": [
        "NVH",
        "FRF Analysis",
        "Surrogate Modeling",
        "Simulation Automation"
      ]
    },
    {
      "id": "exp-2",
      "jobTitle": "Intern - Vibroacoustic Simulation & Automation",
      "company": "Example Sensors GmbH",
      "location": "Example City, Germany",
      "employmentType": "Internship",
      "startDate": "2025-09",
      "endDate": "2026-03",
      "currentlyWorkingHere": false,
      "description": "• Example simulation engineering responsibilities.\n• Example automation and validation project.",
      "responsibilities": [
        "Example simulation engineering responsibilities",
        "Example automation and validation project"
      ],
      "achievements": [
        "Example achievement; replace with a verified result."
      ],
      "technologies": [
        "Simcenter 3D",
        "NX Open API",
        "Python",
        "Acoustics",
        "FFT"
      ],
      "skills": [
        "Vibroacoustics",
        "Acoustic Simulation",
        "Python Automation"
      ]
    },
    {
      "id": "exp-3",
      "jobTitle": "Master Thesis Student - Electric Powertrain NVH",
      "company": "Example Systems GmbH",
      "location": "Example City, Germany",
      "employmentType": "Master Thesis",
      "startDate": "2025-03",
      "endDate": "2025-08",
      "currentlyWorkingHere": false,
      "description": "• Example simulation engineering responsibilities.\n• Example automation and validation project.",
      "responsibilities": [
        "Example simulation engineering responsibilities",
        "Example automation and validation project"
      ],
      "achievements": [
        "Example achievement; replace with a verified result."
      ],
      "technologies": [
        "ANSYS Mechanical",
        "Hypermesh",
        "NASTRAN",
        "FFT",
        "Accelerometer Data"
      ],
      "skills": [
        "Electric Motor NVH",
        "Harmonic Response",
        "Simulation-Test Correlation"
      ]
    },
    {
      "id": "exp-4",
      "jobTitle": "Working Student - Simulation & Thermo-Mechanics",
      "company": "Example Systems GmbH",
      "location": "Example City, Germany",
      "employmentType": "Working Student",
      "startDate": "2024-08",
      "endDate": "2025-02",
      "currentlyWorkingHere": false,
      "description": "• Example simulation engineering responsibilities.\n• Example automation and validation project.",
      "responsibilities": [
        "Example simulation engineering responsibilities",
        "Example automation and validation project"
      ],
      "achievements": [
        "Example achievement; replace with a verified result."
      ],
      "technologies": [
        "ANSYS Mechanical",
        "IronPython",
        "Python",
        "ACT Scripting"
      ],
      "skills": [
        "Thermo-elastic Analysis",
        "CAE Automation",
        "FEA"
      ]
    }
  ],
  "skills": [
    {
      "id": "sk-1",
      "name": "ANSYS Mechanical",
      "category": "Simulation / FEA / FEM",
      "yearsOfExperience": 3,
      "proficiency": "Expert",
      "activeForApplications": true
    },
    {
      "id": "sk-2",
      "name": "NASTRAN",
      "category": "Simulation / FEA / FEM",
      "yearsOfExperience": 2,
      "proficiency": "Advanced",
      "activeForApplications": true
    },
    {
      "id": "sk-3",
      "name": "Altair Hypermesh",
      "category": "Simulation / FEA / FEM",
      "yearsOfExperience": 2,
      "proficiency": "Advanced",
      "activeForApplications": true
    },
    {
      "id": "sk-4",
      "name": "Siemens Simcenter 3D",
      "category": "Simulation / FEA / FEM",
      "yearsOfExperience": 1,
      "proficiency": "Intermediate",
      "activeForApplications": true
    },
    {
      "id": "sk-5",
      "name": "Structural Dynamics & NVH",
      "category": "Simulation / FEA / FEM",
      "yearsOfExperience": 3,
      "proficiency": "Expert",
      "activeForApplications": true
    },
    {
      "id": "sk-6",
      "name": "Vibroacoustics & Modal Analysis",
      "category": "Simulation / FEA / FEM",
      "yearsOfExperience": 2,
      "proficiency": "Advanced",
      "activeForApplications": true
    },
    {
      "id": "sk-7",
      "name": "Simulation-Test Correlation",
      "category": "Simulation / FEA / FEM",
      "yearsOfExperience": 2,
      "proficiency": "Advanced",
      "activeForApplications": true
    },
    {
      "id": "sk-8",
      "name": "Python",
      "category": "Programming & Scripting",
      "yearsOfExperience": 4,
      "proficiency": "Expert",
      "activeForApplications": true
    },
    {
      "id": "sk-9",
      "name": "IronPython / ANSYS ACT",
      "category": "Programming & Scripting",
      "yearsOfExperience": 2,
      "proficiency": "Advanced",
      "activeForApplications": true
    },
    {
      "id": "sk-10",
      "name": "NX Open API",
      "category": "Programming & Scripting",
      "yearsOfExperience": 1,
      "proficiency": "Intermediate",
      "activeForApplications": true
    },
    {
      "id": "sk-11",
      "name": "MATLAB",
      "category": "Programming & Scripting",
      "yearsOfExperience": 3,
      "proficiency": "Advanced",
      "activeForApplications": true
    },
    {
      "id": "sk-12",
      "name": "TensorFlow & Keras",
      "category": "Machine Learning / AI",
      "yearsOfExperience": 2,
      "proficiency": "Advanced",
      "activeForApplications": true
    },
    {
      "id": "sk-13",
      "name": "Neural Surrogate Modeling (PINNs / GNNs)",
      "category": "Machine Learning / AI",
      "yearsOfExperience": 2,
      "proficiency": "Advanced",
      "activeForApplications": true
    },
    {
      "id": "sk-14",
      "name": "SolidWorks",
      "category": "CAD & Design",
      "yearsOfExperience": 3,
      "proficiency": "Advanced",
      "activeForApplications": true
    },
    {
      "id": "sk-15",
      "name": "Git & Version Control",
      "category": "Engineering Tools",
      "yearsOfExperience": 3,
      "proficiency": "Advanced",
      "activeForApplications": true
    }
  ],
  "languages": [
    {
      "id": "lang-1",
      "language": "English",
      "overallLevel": "C2",
      "speakingLevel": "Fluent",
      "writingLevel": "Fluent",
      "readingLevel": "Fluent",
      "certificate": "TOEFL / Academic English",
      "certificateDate": "2022"
    },
    {
      "id": "lang-2",
      "language": "German (Deutsch)",
      "overallLevel": "B1",
      "speakingLevel": "Intermediate",
      "writingLevel": "Intermediate",
      "readingLevel": "Intermediate",
      "certificate": "Goethe / telc B1",
      "certificateDate": "2024"
    },
    {
      "id": "lang-3",
      "language": "Telugu",
      "overallLevel": "Native",
      "speakingLevel": "Native",
      "writingLevel": "Native",
      "readingLevel": "Native",
      "certificate": "Mother Tongue",
      "certificateDate": ""
    }
  ],
  "documents": [],
  "customQA": [
    {
      "id": "qa-1",
      "keywords": [
        "why join",
        "why work",
        "warum",
        "interested in this position",
        "motivation"
      ],
      "question": "Why are you interested in this position and our company?",
      "answer": "I enjoy solving engineering problems through simulation and automation. Replace this example with your own motivation.",
      "category": "Motivation"
    },
    {
      "id": "qa-2",
      "keywords": [
        "strengths",
        "stärken",
        "why should we hire you"
      ],
      "question": "What are your greatest technical strengths?",
      "answer": "My greatest strengths lie at the intersection of rigorous structural mechanics (FEA in ANSYS Mechanical and NASTRAN) and computational automation (Python scripting, neural surrogate modeling with TensorFlow/Keras). I can bridge the gap between physical vibration testing and virtual simulation, accelerating development cycles without compromising fidelity.",
      "category": "Capabilities"
    },
    {
      "id": "qa-3",
      "keywords": [
        "salary",
        "gehalt",
        "compensation",
        "gehaltsvorstellung",
        "gehaltswunsch"
      ],
      "question": "What is your salary expectation / Gehaltsvorstellung?",
      "answer": "60000",
      "category": "Compensation"
    },
    {
      "id": "qa-availability-en",
      "keywords": [
        "availability",
        "notice period",
        "notice",
        "available",
        "period"
      ],
      "question": "What is your availability or notice period?",
      "answer": "Immediately",
      "category": "Availability"
    },
    {
      "id": "qa-availability-de",
      "keywords": [
        "verfügbarkeit",
        "kündigungsfrist",
        "arbeitsverhältnis",
        "sofort",
        "beginnen",
        "anfangen"
      ],
      "question": "Verfügbarkeit / Kündigungsfrist",
      "answer": "Sofort",
      "category": "Availability"
    },
    {
      "id": "qa-availability-tesla-de",
      "keywords": [
        "wie ist ihre verfügbarkeit",
        "verfügbarkeit oder kündigungsfrist",
        "kündigungsfrist",
        "unmittelbar"
      ],
      "question": "Wie ist Ihre Verfügbarkeit oder Kündigungsfrist?",
      "answer": "Unmittelbar",
      "category": "Availability"
    },
    {
      "id": "qa-referral-source",
      "keywords": [
        "erfahren",
        "aufmerksam",
        "geworden",
        "hear",
        "about",
        "source",
        "quelle",
        "woher"
      ],
      "question": "Wie hast du von uns erfahren? / How did you hear about us?",
      "answer": "LinkedIn",
      "category": "Application Source"
    },
    {
      "id": "qa-eu-citizenship-permit",
      "keywords": [
        "staatsbürgerschaft",
        "arbeitserlaubnis",
        "work permit",
        "citizenship",
        "gültige",
        "eu"
      ],
      "question": "Hast du eine gültige EU-Staatsbürgerschaft oder Arbeitserlaubnis? / Valid EU citizenship or work permit?",
      "answer": "Ja",
      "category": "Work Authorization"
    },
    {
      "id": "qa-german-skills",
      "keywords": [
        "deutsch",
        "sprachkenntnisse",
        "bewerten",
        "german",
        "proficiency",
        "level"
      ],
      "question": "Wie würdest du deine Deutsch-Sprachkenntnisse bewerten? / Rate your German skills",
      "answer": "B1",
      "category": "Languages"
    },
    {
      "id": "qa-english-skills",
      "keywords": [
        "englisch",
        "sprachkenntnisse",
        "bewerten",
        "english",
        "proficiency",
        "level"
      ],
      "question": "Wie würdest du deine Englisch-Sprachkenntnisse bewerten? / Rate your English skills",
      "answer": "C2",
      "category": "Languages"
    },
    {
      "id": "qa-gender",
      "keywords": [
        "geschlecht",
        "beschreiben",
        "gender",
        "describe",
        "geschlechtsidentität"
      ],
      "question": "Wie würdest du dein Geschlecht beschreiben? / How would you describe your gender?",
      "answer": "Männlich",
      "category": "Demographics"
    },
    {
      "id": "qa-nationality",
      "keywords": [
        "nationalität",
        "nationalitäten",
        "besitzt",
        "nationality",
        "nationalities"
      ],
      "question": "Welche Nationalität (oder Nationalitäten) besitzt du? / Which nationality (or nationalities) do you have?",
      "answer": "Indisch",
      "category": "Demographics"
    },
    {
      "id": "qa-age-group",
      "keywords": [
        "altersgruppe",
        "age",
        "group",
        "alter"
      ],
      "question": "Welche ist deine Altersgruppe? / What is your age group?",
      "answer": "25-29",
      "category": "Demographics"
    },
    {
      "id": "qa-4",
      "keywords": [
        "start date",
        "earliest",
        "availability",
        "verfügbar",
        "notice period"
      ],
      "question": "When can you start?",
      "answer": "Immediately (or from October 2026 by agreement).",
      "category": "Availability"
    },
    {
      "id": "qa-5",
      "keywords": [
        "sponsorship",
        "work permit",
        "visa",
        "arbeitserlaubnis",
        "authorized"
      ],
      "question": "Are you authorized to work in Germany / EU?",
      "answer": "Example only. Enter your own current work authorization details.",
      "category": "Work Authorization"
    },
    {
      "id": "qa-6",
      "keywords": [
        "relocate",
        "umzug",
        "willing to relocate"
      ],
      "question": "Are you willing to relocate?",
      "answer": "Yes, I am completely flexible and willing to relocate for the right role.",
      "category": "Logistics"
    },
    {
      "id": "qa-telefontyp-mobil",
      "keywords": [
        "kontakt",
        "telefontyp",
        "gerätedevice",
        "phone device",
        "device type",
        "kontakt - telefontyp"
      ],
      "question": "Kontakt - Telefontyp / Phone Device Type",
      "answer": "Mobil",
      "category": "Contact"
    },
    {
      "id": "qa-telefon-country-code",
      "keywords": [
        "telefon",
        "vorwahl",
        "country code",
        "calling code",
        "landesvorwahl",
        "dial code"
      ],
      "question": "Telefon - DE +49 / Phone Country Code",
      "answer": "DE +49",
      "category": "Contact"
    },
    {
      "id": "qa-wohnsitz-deutschland",
      "keywords": [
        "land/region des wohnsitzes",
        "wohnsitz",
        "residence country",
        "land/region",
        "land des wohnsitzes"
      ],
      "question": "Land/Region des Wohnsitzes / Country of Residence",
      "answer": "Deutschland",
      "category": "Address"
    }
  ],
  "coverLetterTemplates": [
    {
      "id": "clt-eng",
      "name": "Engineering & CAE Simulation",
      "category": "Engineering",
      "subject": "Application as {{role}} - Alex Example",
      "body": "Dear Hiring Team at {{company}},\n\nI am interested in the {{role}} position. Replace this fictional example with your own application.\n\nBest regards,\nAlex Example"
    },
    {
      "id": "clt-gen",
      "name": "General Technical Application",
      "category": "General",
      "subject": "Application as {{role}} - Alex Example",
      "body": "Dear Hiring Team at {{company}},\n\nI am interested in the {{role}} position. Replace this fictional example with your own application.\n\nBest regards,\nAlex Example"
    }
  ],
  "history": [],
  "settings": {
    "mode": "safe",
    "confidenceThreshold": 0.85,
    "highlightFilledFields": true,
    "previewBeforeFilling": false,
    "askBeforeSensitiveFields": true,
    "autoSubmitEnabled": false,
    "enableKeyboardShortcut": true,
    "enableContextMenu": true,
    "localOnlyMode": true,
    "externalAiEnabled": false,
    "learningModeEnabled": true,
    "reuseLearnedAnswers": true,
    "autofillEnabled": false,
    "autoStartOnApplicationPages": false
  },
  "isComplete": true,
  "lastUpdated": "2026-10-30T00:00:00.000Z",
  "fieldOverrides": []
};
