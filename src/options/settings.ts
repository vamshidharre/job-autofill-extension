import { ProfileStorage, STORAGE_KEY } from '../storage/profile-storage';
import { DEFAULT_USER_PROFILE } from '../storage/default-profile';
import {
  UserProfile,
  EducationEntry,
  WorkExperienceEntry,
  SkillItem,
  LanguageItem,
  CoverLetterTemplate
} from '../types/profile';

let profile: UserProfile;

document.addEventListener('DOMContentLoaded', async () => {
  profile = await ProfileStorage.getProfile();

  setupNavigation();
  populateFormFields();
  setupDynamicLists();
  setupActionButtons();
  watchExternalChanges();
});

/**
 * While this page is open, the content script keeps learning answers and
 * recording history in other tabs. Keep those lists current here, otherwise the
 * next Save writes this page's stale copy back and silently drops them.
 * Form fields are left alone so unsaved edits are not lost.
 */
function watchExternalChanges(): void {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[STORAGE_KEY]?.newValue || !profile) return;
    refreshMemoryLists(changes[STORAGE_KEY].newValue as UserProfile);
  });
}

function refreshMemoryLists(latest: UserProfile): void {
  profile.customQA = latest.customQA || [];
  profile.history = latest.history || [];
  profile.seededDefaultQaIds = latest.seededDefaultQaIds;
  profile.fieldOverrides = latest.fieldOverrides || [];
  renderQAList();
  renderHistoryList();
  renderCorrectionsList();
}

function showStorageError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  alert(`Your changes could not be saved. ${message}`);
}

/**
 * Sidebar tab switching
 */
function setupNavigation(): void {
  const navItems = document.querySelectorAll('.nav-item');
  const panes = document.querySelectorAll('.tab-pane');
  const sectionTitle = document.getElementById('section-title') as HTMLElement;

  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = item.getAttribute('data-tab');

      navItems.forEach((n) => n.classList.remove('active'));
      panes.forEach((p) => p.classList.remove('active'));

      item.classList.add('active');
      const activePane = document.getElementById(`tab-${tabId}`);
      if (activePane) activePane.classList.add('active');

      const itemSpan = item.querySelector('span:not(.nav-icon)');
      if (itemSpan && sectionTitle) {
        sectionTitle.textContent = itemSpan.textContent || 'Settings';
      }
    });
  });

  document.getElementById('btn-start-wizard')?.addEventListener('click', () => {
    const basicTab = document.querySelector('[data-tab="basic"]') as HTMLElement;
    basicTab?.click();
  });
}

/**
 * Populate standard inputs from active profile
 */
function populateFormFields(): void {
  // Basic
  setVal('inp-firstName', profile.basic.firstName);
  setVal('inp-middleName', profile.basic.middleName);
  setVal('inp-lastName', profile.basic.lastName);
  setVal('inp-fullName', profile.basic.fullName);
  setVal('inp-preferredName', profile.basic.preferredName);
  setVal('inp-dateOfBirth', profile.basic.dateOfBirth);
  setVal('inp-gender', profile.basic.gender);
  setVal('inp-nationality', profile.basic.nationality);
  setVal('inp-countryOfBirth', profile.basic.countryOfBirth);

  // Contact
  setVal('inp-email', profile.contact.email);
  setVal('inp-phone', profile.contact.phone);
  setVal('inp-altPhone', profile.contact.altPhone);
  setVal('inp-linkedin', profile.contact.linkedin);
  setVal('inp-github', profile.contact.github);
  setVal('inp-portfolio', profile.contact.portfolio);

  // Address
  setVal('inp-street', profile.address.street);
  setVal('inp-houseNumber', profile.address.houseNumber);
  setVal('inp-postalCode', profile.address.postalCode);
  setVal('inp-city', profile.address.city);
  setVal('inp-state', profile.address.state);
  setVal('inp-country', profile.address.country);

  // Preferences
  setVal('inp-desiredTitle', profile.jobPreferences.desiredTitle);
  setVal('inp-altTitles', profile.jobPreferences.alternativeTitles.join(', '));
  setVal('inp-remotePreference', profile.jobPreferences.remotePreference);
  setVal('inp-preferredLocations', profile.jobPreferences.preferredLocations.join(', '));
  setChecked('inp-willingToRelocate', profile.jobPreferences.willingToRelocate);
  setChecked('inp-willingToTravel', profile.jobPreferences.willingToTravel);
  setVal('inp-earliestStartDate', profile.jobPreferences.earliestStartDate);
  setVal('inp-availableFrom', profile.jobPreferences.availableFrom);
  setVal('inp-noticePeriod', profile.jobPreferences.noticePeriod);
  setVal('inp-weeklyWorkingHours', String(profile.jobPreferences.weeklyWorkingHours || 40));
  setVal('inp-currentEmploymentStatus', profile.jobPreferences.currentEmploymentStatus);

  // Salary
  setVal('inp-expectedAnnual', String(profile.salary.expectedAnnual || ''));
  setVal('inp-minAnnual', String(profile.salary.minAnnual || ''));
  setVal('inp-currency', profile.salary.currency || 'EUR');
  setVal('inp-monthlyExpectation', String(profile.salary.monthlyExpectation || ''));
  setVal('inp-hourlyExpectation', String(profile.salary.hourlyExpectation || ''));
  setChecked('inp-salaryNegotiable', profile.salary.negotiable);

  // Work Authorization
  setChecked('inp-legallyAuthorized', profile.workAuthorization.legallyAuthorized);
  setChecked('inp-requireSponsorshipNow', profile.workAuthorization.requireSponsorshipNow);
  setChecked('inp-requireSponsorshipFuture', profile.workAuthorization.requireSponsorshipFuture);
  setVal('inp-currentAuthType', profile.workAuthorization.currentAuthType);
  setVal('inp-authExpiryDate', profile.workAuthorization.authExpiryDate);
  setVal('inp-authNotes', profile.workAuthorization.additionalNotes);

  // Autofill Config
  setVal('cfg-mode', profile.settings.mode);
  setVal('cfg-threshold', String(profile.settings.confidenceThreshold));
  setChecked('cfg-highlight', profile.settings.highlightFilledFields);
  setChecked('cfg-preview', profile.settings.previewBeforeFilling);
  setChecked('cfg-askSensitive', profile.settings.askBeforeSensitiveFields);
  setChecked('cfg-keyboard', profile.settings.enableKeyboardShortcut);
  setChecked('cfg-contextMenu', profile.settings.enableContextMenu);
  setChecked('cfg-learningMode', profile.settings.learningModeEnabled);
  setChecked('cfg-reuseLearned', profile.settings.reuseLearnedAnswers !== false);
  setChecked('cfg-autofillEnabled', profile.settings.autofillEnabled);
  setChecked('cfg-autoStart', profile.settings.autoStartOnApplicationPages === true);
}

/**
 * Harvest current inputs into the profile object
 */
function harvestFormFields(): void {
  profile.basic.firstName = getVal('inp-firstName');
  profile.basic.middleName = getVal('inp-middleName');
  profile.basic.lastName = getVal('inp-lastName');
  profile.basic.fullName = getVal('inp-fullName') || `${profile.basic.firstName} ${profile.basic.lastName}`.trim();
  profile.basic.preferredName = getVal('inp-preferredName');
  profile.basic.dateOfBirth = getVal('inp-dateOfBirth');
  profile.basic.gender = getVal('inp-gender');
  profile.basic.nationality = getVal('inp-nationality');
  profile.basic.countryOfBirth = getVal('inp-countryOfBirth');

  profile.contact.email = getVal('inp-email');
  profile.contact.phone = getVal('inp-phone');
  profile.contact.altPhone = getVal('inp-altPhone');
  profile.contact.linkedin = getVal('inp-linkedin');
  profile.contact.github = getVal('inp-github');
  profile.contact.portfolio = getVal('inp-portfolio');

  profile.address.street = getVal('inp-street');
  profile.address.houseNumber = getVal('inp-houseNumber');
  profile.address.addressLine1 = `${profile.address.street} ${profile.address.houseNumber}`.trim();
  profile.address.postalCode = getVal('inp-postalCode');
  profile.address.city = getVal('inp-city');
  profile.address.state = getVal('inp-state');
  profile.address.country = getVal('inp-country');

  profile.jobPreferences.desiredTitle = getVal('inp-desiredTitle');
  profile.jobPreferences.alternativeTitles = getVal('inp-altTitles')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  profile.jobPreferences.remotePreference = getVal('inp-remotePreference') as any;
  profile.jobPreferences.preferredLocations = getVal('inp-preferredLocations')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  profile.jobPreferences.willingToRelocate = getChecked('inp-willingToRelocate');
  profile.jobPreferences.willingToTravel = getChecked('inp-willingToTravel');
  profile.jobPreferences.earliestStartDate = getVal('inp-earliestStartDate');
  profile.jobPreferences.availableFrom = getVal('inp-availableFrom');
  profile.jobPreferences.noticePeriod = getVal('inp-noticePeriod');
  profile.jobPreferences.weeklyWorkingHours = parseInt(getVal('inp-weeklyWorkingHours') || '40', 10);
  profile.jobPreferences.currentEmploymentStatus = getVal('inp-currentEmploymentStatus');

  profile.salary.expectedAnnual = parseFloat(getVal('inp-expectedAnnual') || '0');
  profile.salary.minAnnual = parseFloat(getVal('inp-minAnnual') || '0');
  profile.salary.currency = getVal('inp-currency');
  profile.salary.monthlyExpectation = parseFloat(getVal('inp-monthlyExpectation') || '0');
  profile.salary.hourlyExpectation = parseFloat(getVal('inp-hourlyExpectation') || '0');
  profile.salary.negotiable = getChecked('inp-salaryNegotiable');

  profile.workAuthorization.legallyAuthorized = getChecked('inp-legallyAuthorized');
  profile.workAuthorization.requireSponsorshipNow = getChecked('inp-requireSponsorshipNow');
  profile.workAuthorization.requireSponsorshipFuture = getChecked('inp-requireSponsorshipFuture');
  profile.workAuthorization.currentAuthType = getVal('inp-currentAuthType');
  profile.workAuthorization.authExpiryDate = getVal('inp-authExpiryDate');
  profile.workAuthorization.additionalNotes = getVal('inp-authNotes');

  profile.settings.mode = getVal('cfg-mode') as any;
  profile.settings.confidenceThreshold = parseFloat(getVal('cfg-threshold') || '0.85');
  profile.settings.highlightFilledFields = getChecked('cfg-highlight');
  profile.settings.previewBeforeFilling = getChecked('cfg-preview');
  profile.settings.askBeforeSensitiveFields = getChecked('cfg-askSensitive');
  profile.settings.enableKeyboardShortcut = getChecked('cfg-keyboard');
  profile.settings.enableContextMenu = getChecked('cfg-contextMenu');
  profile.settings.learningModeEnabled = getChecked('cfg-learningMode');
  profile.settings.reuseLearnedAnswers = getChecked('cfg-reuseLearned');
  profile.settings.autofillEnabled = getChecked('cfg-autofillEnabled');
  profile.settings.autoStartOnApplicationPages = getChecked('cfg-autoStart');
}

/**
 * Render dynamic list sections (Education, Experience, Skills, Q&A, Templates, History)
 */
function setupDynamicLists(): void {
  renderEducationList();
  renderExperienceList();
  renderSkillsList();
  renderLanguagesList();
  renderDocumentsList();
  renderQAList();
  renderCorrectionsList();
  renderTemplatesList();
  renderHistoryList();
}

function renderCorrectionsList(): void {
  const container = document.getElementById('corrections-list-container');
  if (!container) return;

  const overrides = [...(profile.fieldOverrides || [])].sort(
    (a, b) => a.host.localeCompare(b.host) || a.label.localeCompare(b.label)
  );
  if (overrides.length === 0) {
    container.innerHTML = `<p style="font-size:13px; color:#94a3b8; text-align:center; padding:20px 0;">Nothing learned yet. Corrections appear here after you change an autofilled value on an application form.</p>`;
    return;
  }

  container.innerHTML = overrides
    .map(
      (o) => `
    <div class="item-card" style="padding:10px 14px;">
      <div class="item-card-header" style="margin:0;">
        <div>
          <div class="item-title">${escapeHtml(o.label)}</div>
          <div class="item-subtitle">${escapeHtml(o.host)} • learned ${new Date(o.updatedAt).toLocaleDateString()}</div>
          <div style="font-size:12px; color:#334155; margin-top:4px;">→ ${o.value ? escapeHtml(o.value) : '<em>leave empty</em>'}</div>
        </div>
        <button class="btn btn-secondary btn-del-correction" data-id="${escapeHtml(o.id)}" style="color:#ef4444; padding:3px 8px;">✕ Remove</button>
      </div>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.btn-del-correction').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).getAttribute('data-id') || '';
      try {
        refreshMemoryLists(await ProfileStorage.removeFieldOverride(id));
      } catch (error) {
        showStorageError(error);
      }
    });
  });
}

function renderEducationList(): void {
  const container = document.getElementById('education-list-container');
  if (!container) return;

  container.innerHTML = profile.education
    .map(
      (edu, i) => `
    <div class="item-card">
      <div class="item-card-header">
        <div>
          <div class="item-title">${escapeHtml(edu.degree)} in ${escapeHtml(edu.fieldOfStudy)}</div>
          <div class="item-subtitle">${escapeHtml(edu.university)} (${escapeHtml(edu.startDate)} - ${escapeHtml(
        edu.endDate
      )}) • GPA: ${escapeHtml(edu.gradeGpa)}</div>
        </div>
        <button class="btn btn-secondary btn-del-edu" data-index="${i}" style="color:#ef4444; padding:3px 8px;">✕ Remove</button>
      </div>
      <p style="font-size:12px; margin:0 0 6px 0; color:#334155;">${escapeHtml(edu.thesisTitle ? `Thesis: ${edu.thesisTitle}` : '')}</p>
      <div style="font-size:11px; color:#64748b;">${escapeHtml(edu.relevantCoursework?.join(' • ') || '')}</div>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.btn-del-edu').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).getAttribute('data-index') || '0', 10);
      profile.education.splice(idx, 1);
      renderEducationList();
    });
  });
}

function renderExperienceList(): void {
  const container = document.getElementById('experience-list-container');
  if (!container) return;

  container.innerHTML = profile.experience
    .map(
      (exp, i) => `
    <div class="item-card">
      <div class="item-card-header">
        <div>
          <div class="item-title">${escapeHtml(exp.jobTitle)} @ ${escapeHtml(exp.company)}</div>
          <div class="item-subtitle">${escapeHtml(exp.location)} | ${escapeHtml(exp.startDate)} - ${escapeHtml(
        exp.endDate
      )} (${escapeHtml(exp.employmentType)})</div>
        </div>
        <button class="btn btn-secondary btn-del-exp" data-index="${i}" style="color:#ef4444; padding:3px 8px;">✕ Remove</button>
      </div>
      <p style="font-size:12px; margin:0 0 6px 0; color:#334155;">${escapeHtml(exp.description)}</p>
      <div style="font-size:11px; color:#64748b;">Tech: ${escapeHtml(exp.technologies?.join(', ') || '')}</div>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.btn-del-exp').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).getAttribute('data-index') || '0', 10);
      profile.experience.splice(idx, 1);
      renderExperienceList();
    });
  });
}

function renderSkillsList(): void {
  const container = document.getElementById('skills-list-container');
  if (!container) return;

  container.innerHTML = profile.skills
    .map(
      (sk, i) => `
    <div class="skill-chip">
      <div>
        <div class="skill-chip-name">${escapeHtml(sk.name)}</div>
        <div class="skill-chip-meta">${escapeHtml(sk.category)} • ${escapeHtml(sk.proficiency)}</div>
      </div>
      <button class="btn-del-skill" data-index="${i}" style="border:none; background:none; cursor:pointer; color:#94a3b8; font-size:14px;">✕</button>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.btn-del-skill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).getAttribute('data-index') || '0', 10);
      profile.skills.splice(idx, 1);
      renderSkillsList();
    });
  });
}

function renderLanguagesList(): void {
  const container = document.getElementById('languages-list-container');
  if (!container) return;

  container.innerHTML = profile.languages
    .map(
      (lang, i) => `
    <div class="item-card" style="padding:10px 14px;">
      <div class="item-card-header" style="margin:0;">
        <div>
          <strong>${escapeHtml(lang.language)}</strong>
          <span style="background:#e0f2fe; color:#0369a1; padding:1px 6px; border-radius:4px; font-size:11px; font-weight:700; margin-left:8px;">${escapeHtml(
            lang.overallLevel
          )}</span>
          <span style="font-size:12px; color:#64748b; margin-left:8px;">${escapeHtml(lang.certificate || '')}</span>
        </div>
        <button class="btn-del-lang" data-index="${i}" style="border:none; background:none; cursor:pointer; color:#ef4444;">✕</button>
      </div>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.btn-del-lang').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).getAttribute('data-index') || '0', 10);
      profile.languages.splice(idx, 1);
      renderLanguagesList();
    });
  });
}

function renderDocumentsList(): void {
  const container = document.getElementById('documents-list-container');
  if (!container) return;

  container.innerHTML = profile.documents
    .map(
      (doc, i) => `
    <div class="item-card" style="display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:20px;">📄</span>
        <div>
          <div style="font-weight:600; font-size:13px;">${escapeHtml(doc.name)}</div>
          <div style="font-size:11px; color:#64748b;">${(doc.fileSize / 1024).toFixed(1)} KB | Uploaded: ${new Date(
        doc.uploadedAt
      ).toLocaleDateString()}</div>
        </div>
      </div>
      <button class="btn btn-secondary btn-del-doc" data-index="${i}" style="color:#ef4444; padding:3px 8px;">✕ Remove</button>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.btn-del-doc').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).getAttribute('data-index') || '0', 10);
      profile.documents.splice(idx, 1);
      renderDocumentsList();
    });
  });
}

function renderQAList(): void {
  const container = document.getElementById('qa-list-container');
  if (!container) return;

  container.innerHTML = profile.customQA
    .map(
      (qa, i) => `
    <div class="item-card">
      <div class="item-card-header">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="item-title">${escapeHtml(qa.question)}</span>
            ${qa.category ? `<span style="font-size:10px; background:#ede9fe; color:#6d28d9; padding:2px 6px; border-radius:4px; font-weight:600;">${escapeHtml(qa.category)}</span>` : ''}
          </div>
          <div class="item-subtitle">Keywords: ${escapeHtml(qa.keywords.join(', '))}</div>
        </div>
        <button class="btn btn-secondary btn-del-qa" data-index="${i}" style="color:#ef4444; padding:3px 8px;">✕ Remove</button>
      </div>
      <p style="font-size:12px; margin:0; color:#334155; line-height:1.4;">${escapeHtml(qa.answer)}</p>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.btn-del-qa').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = parseInt((btn as HTMLElement).getAttribute('data-index') || '0', 10);
      const qa = profile.customQA[idx];
      if (!qa) return;
      try {
        refreshMemoryLists(await ProfileStorage.removeCustomQA(qa.id));
      } catch (error) {
        showStorageError(error);
      }
    });
  });
}

function renderTemplatesList(): void {
  const container = document.getElementById('templates-list-container');
  if (!container) return;

  container.innerHTML = profile.coverLetterTemplates
    .map(
      (tpl, i) => `
    <div class="item-card">
      <div class="item-card-header">
        <div>
          <div class="item-title">${escapeHtml(tpl.name)} (${escapeHtml(tpl.category)})</div>
          <div class="item-subtitle">${escapeHtml(tpl.subject)}</div>
        </div>
        <button class="btn btn-secondary btn-del-tpl" data-index="${i}" style="color:#ef4444; padding:3px 8px;">✕ Remove</button>
      </div>
      <pre style="font-size:11px; color:#475569; background:#fff; padding:10px; border-radius:6px; border:1px solid #e2e8f0; white-space:pre-wrap; max-height:120px; overflow-y:auto; margin:0;">${escapeHtml(
        tpl.body
      )}</pre>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.btn-del-tpl').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).getAttribute('data-index') || '0', 10);
      profile.coverLetterTemplates.splice(idx, 1);
      renderTemplatesList();
    });
  });
}

function renderHistoryList(): void {
  const container = document.getElementById('history-list-container');
  if (!container) return;

  if (!profile.history || profile.history.length === 0) {
    container.innerHTML = `<p style="font-size:13px; color:#94a3b8; text-align:center; padding:20px 0;">No applications recorded yet. Applications will automatically appear here after running Autofill.</p>`;
    return;
  }

  const rows = profile.history
    .map(
      (h) => `
    <tr>
      <td style="font-weight:600;">${escapeHtml(h.company || 'Unknown')}</td>
      <td>${escapeHtml(h.jobTitle || 'Role')}</td>
      <td>${new Date(h.date).toLocaleDateString()}</td>
      <td><span class="status-pill status-ready">${escapeHtml(h.status)}</span></td>
      <td style="font-size:12px; color:#64748b;">${escapeHtml(h.notes || '')}</td>
    </tr>
  `
    )
    .join('');

  container.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead>
        <tr style="text-align:left; background:#f8fafc; border-bottom:2px solid #e2e8f0;">
          <th style="padding:8px 10px;">Company</th>
          <th style="padding:8px 10px;">Job Title</th>
          <th style="padding:8px 10px;">Date</th>
          <th style="padding:8px 10px;">Status</th>
          <th style="padding:8px 10px;">Details</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Topbar & Dialog Action Handlers
 */
function setupActionButtons(): void {
  const saveIndicator = document.getElementById('save-status-indicator') as HTMLElement;
  let saveStatusTimer: ReturnType<typeof setTimeout> | undefined;

  const triggerSave = async () => {
    clearTimeout(saveStatusTimer);
    try {
      harvestFormFields();
      await ProfileStorage.saveProfile(profile);
      refreshMemoryLists(await ProfileStorage.getProfile());
      if (saveIndicator) {
        saveIndicator.textContent = '✓ Saved locally!';
        saveIndicator.style.background = '#dcfce7';
        saveIndicator.style.color = '#15803d';
        saveStatusTimer = setTimeout(() => {
          saveIndicator.textContent = 'Saved locally';
        }, 2500);
      }
    } catch (error) {
      if (saveIndicator) {
        saveIndicator.textContent = 'Save failed — please retry';
        saveIndicator.style.background = '#fee2e2';
        saveIndicator.style.color = '#b91c1c';
      }
      showStorageError(error);
    }
  };

  document.getElementById('btn-save-all')?.addEventListener('click', triggerSave);

  // Load fictional demo profile.
  const loadSeed = async () => {
    if (confirm('Load the demo profile? This replaces your profile details and unsaved edits. Saved answers, learned corrections, application history, and settings are kept.')) {
      try {
        profile = await ProfileStorage.resetToDefault();
        populateFormFields();
        setupDynamicLists();
      } catch (error) {
        showStorageError(error);
      }
    }
  };

  document.getElementById('btn-seed-profile')?.addEventListener('click', loadSeed);
  document.getElementById('btn-load-seed-quick')?.addEventListener('click', loadSeed);

  // Clear History
  document.getElementById('btn-clear-history')?.addEventListener('click', async () => {
    if (confirm('Clear your local application history?')) {
      try {
        refreshMemoryLists(await ProfileStorage.clearHistory());
      } catch (error) {
        showStorageError(error);
      }
    }
  });

  // Export JSON
  document.getElementById('btn-export-json')?.addEventListener('click', async () => {
    try {
      // Include current form edits and the latest memories from other tabs.
      harvestFormFields();
      refreshMemoryLists(await ProfileStorage.getProfile());
      const json = JSON.stringify(profile, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'job-autofill-profile.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`The profile could not be exported. ${message}`);
    }
  });

  // Import JSON
  document.getElementById('btn-import-json')?.addEventListener('click', () => {
    const fileInput = document.getElementById('inp-import-json') as HTMLInputElement;
    if (!fileInput.files || fileInput.files.length === 0) {
      alert('Please select a .json profile file first.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const res = await ProfileStorage.importProfileJson(content);
        if (res.success) {
          profile = await ProfileStorage.getProfile();
          populateFormFields();
          setupDynamicLists();
          alert('Profile imported. Your existing saved answers and learned corrections have been kept.');
        } else {
          alert(`Error importing profile: ${res.error}`);
        }
      } catch (error) {
        showStorageError(error);
      }
    };
    reader.onerror = () => alert('The selected profile file could not be read.');
    reader.readAsText(fileInput.files[0]);
  });

  // Clear All
  document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
    if (confirm('WARNING: Are you sure you want to delete all stored profile data, custom answers, and history from your computer? This cannot be undone.')) {
      try {
        await ProfileStorage.clearAll();
        profile = JSON.parse(JSON.stringify(DEFAULT_USER_PROFILE));
        populateFormFields();
        setupDynamicLists();
        alert('All local profile data has been wiped.');
      } catch (error) {
        showStorageError(error);
      }
    }
  });

  // Dynamic Add Modals / Prompts
  document.getElementById('btn-add-education')?.addEventListener('click', () => {
    const degree = prompt('Degree (e.g. Master of Science / Bachelor of Engineering):');
    if (!degree) return;
    const field = prompt('Field of Study (e.g. Computational Engineering):') || '';
    const univ = prompt('University / Institution:') || '';
    const gpa = prompt('Grade / GPA:') || '';

    const newEdu: EducationEntry = {
      id: 'edu-' + Date.now(),
      degree,
      fieldOfStudy: field,
      university: univ,
      location: '',
      startDate: '2022-10',
      endDate: '2026-09',
      graduationDate: '2026-09',
      gradeGpa: gpa,
      gpaScale: 'German scale',
      thesisTitle: '',
      description: '',
      relevantCoursework: []
    };
    profile.education.unshift(newEdu);
    renderEducationList();
    triggerSave();
  });

  document.getElementById('btn-add-experience')?.addEventListener('click', () => {
    const title = prompt('Job Title / Position:');
    if (!title) return;
    const company = prompt('Company Name:') || '';
    const type = prompt('Employment Type (e.g. Full-time, Internship, Working Student):') || 'Full-time';

    const newExp: WorkExperienceEntry = {
      id: 'exp-' + Date.now(),
      jobTitle: title,
      company,
      location: '',
      employmentType: type,
      startDate: '2025-01',
      endDate: 'Present',
      currentlyWorkingHere: true,
      description: '',
      responsibilities: [],
      achievements: [],
      technologies: [],
      skills: []
    };
    profile.experience.unshift(newExp);
    renderExperienceList();
    triggerSave();
  });

  document.getElementById('btn-add-skill')?.addEventListener('click', () => {
    const name = prompt('Skill Name (e.g. ANSYS Mechanical, Python, NASTRAN):');
    if (!name) return;
    const cat = prompt('Category (e.g. Simulation / FEA / FEM, Programming & Scripting):') || 'Technical';

    const newSkill: SkillItem = {
      id: 'sk-' + Date.now(),
      name,
      category: cat as any,
      yearsOfExperience: 2,
      proficiency: 'Advanced',
      activeForApplications: true
    };
    profile.skills.push(newSkill);
    renderSkillsList();
    triggerSave();
  });

  document.getElementById('btn-add-language')?.addEventListener('click', () => {
    const lang = prompt('Language Name (e.g. German, French):');
    if (!lang) return;
    const level = prompt('CEFR Level (A1, A2, B1, B2, C1, C2, Native):') || 'B1';

    const newLang: LanguageItem = {
      id: 'lang-' + Date.now(),
      language: lang,
      overallLevel: level as any,
      speakingLevel: 'Intermediate',
      writingLevel: 'Intermediate',
      readingLevel: 'Intermediate',
      certificate: '',
      certificateDate: ''
    };
    profile.languages.push(newLang);
    renderLanguagesList();
    triggerSave();
  });

  document.getElementById('btn-add-qa')?.addEventListener('click', async () => {
    const q = prompt('Question (e.g. Why should we hire you?):');
    if (!q?.trim()) return;
    const ans = prompt('Reusable Answer:');
    if (!ans?.trim()) return;
    const kw = prompt('Keywords for matching (comma-separated):') || '';

    try {
      const latest = await ProfileStorage.addOrUpdateCustomQA(
        q,
        ans,
        'Saved Question',
        kw.split(',').map((k) => k.trim()).filter(Boolean)
      );
      refreshMemoryLists(latest);
      await triggerSave();
    } catch (error) {
      showStorageError(error);
    }
  });

  document.getElementById('btn-add-template')?.addEventListener('click', () => {
    const name = prompt('Template Name:');
    if (!name) return;
    const cat = prompt('Category (e.g. Automotive, Simulation, Robotics):') || 'General';

    const newTpl: CoverLetterTemplate = {
      id: 'tpl-' + Date.now(),
      name,
      category: cat as any,
      subject: 'Application as {{role}} - Alex Example',
      body: 'Dear Hiring Team at {{company}},\n\n[Your content here]'
    };
    profile.coverLetterTemplates.push(newTpl);
    renderTemplatesList();
    triggerSave();
  });
}

function setVal(id: string, val: string): void {
  const el = document.getElementById(id) as HTMLInputElement;
  if (el) el.value = val || '';
}

function getVal(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement;
  return el ? el.value.trim() : '';
}

function setChecked(id: string, val: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement;
  if (el) el.checked = Boolean(val);
}

function getChecked(id: string): boolean {
  const el = document.getElementById(id) as HTMLInputElement;
  return el ? el.checked : false;
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
