import { ProfileStorage } from '../storage/profile-storage';
import { UserProfile, AutofillMode } from '../types/profile';
import { AutofillReport, UnansweredQuestion } from '../types/engine';

document.addEventListener('DOMContentLoaded', async () => {
  const profileStatusPill = document.getElementById('profile-status-pill') as HTMLElement;
  const pageStatusPill = document.getElementById('page-status-pill') as HTMLElement;
  const learningStatusPill = document.getElementById('learning-status-pill') as HTMLElement;
  const selectMode = document.getElementById('select-mode') as HTMLSelectElement;
  const btnRun = document.getElementById('btn-run-autofill') as HTMLButtonElement;
  const btnPreview = document.getElementById('btn-preview') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  const btnOpenSettings = document.getElementById('btn-open-settings') as HTMLButtonElement;
  const btnSettingsIcon = document.getElementById('btn-settings-icon') as HTMLButtonElement;

  const reportSection = document.getElementById('report-section') as HTMLElement;
  const statFilled = document.getElementById('stat-filled') as HTMLElement;
  const statReview = document.getElementById('stat-review') as HTMLElement;
  const statSkipped = document.getElementById('stat-skipped') as HTMLElement;
  const reportMsg = document.getElementById('report-message') as HTMLElement;

  const unansweredSection = document.getElementById('unanswered-section') as HTMLElement;
  const unansweredBadge = document.getElementById('unanswered-count-badge') as HTMLElement;
  const unansweredContainer = document.getElementById('unanswered-questions-container') as HTMLElement;
  const btnLearnPage = document.getElementById('btn-learn-page') as HTMLButtonElement;
  const btnSaveAllQA = document.getElementById('btn-save-all-qa') as HTMLButtonElement;

  let profile: UserProfile = await ProfileStorage.getProfile();
  let currentUnanswered: UnansweredQuestion[] = [];
  let activeTabId: number | null = null;
  let pageIsApplication = false;
  const version = document.getElementById('extension-version');
  if (version) version.textContent = chrome.runtime.getManifest().version;

  document.getElementById('btn-page-report')?.addEventListener('click', async () => {
    const message = document.getElementById('page-report-status');
    try {
      if (!activeTabId) throw new Error('Open an application page first.');
      if (!await ensureScriptInjected(activeTabId)) throw new Error('Refresh the application tab first.');
      const response = await chrome.tabs.sendMessage(activeTabId, { action: 'GET_PAGE_DIAGNOSTICS' });
      if (!response?.report) throw new Error(response?.error || 'Page report unavailable.');
      const blob = new Blob([JSON.stringify(response.report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'job-autofill-page-report.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (message) message.textContent = 'Report saved locally.';
    } catch (error) {
      if (message) message.textContent = error instanceof Error ? error.message : 'Could not create report.';
    }
  });

  // Populate profile status
  const isComplete = profile.basic.firstName && profile.contact.email;
  if (isComplete) {
    profileStatusPill.textContent = 'Ready';
    profileStatusPill.className = 'status-pill status-complete';
  } else {
    profileStatusPill.textContent = 'Setup Incomplete';
    profileStatusPill.className = 'status-pill status-incomplete';
  }

  // Populate mode dropdown
  selectMode.value = profile.settings.mode || 'safe';
  selectMode.addEventListener('change', async () => {
    // Update the stored profile, not the copy loaded when the popup opened:
    // answers learned on the page since then would otherwise be overwritten.
    profile = await ProfileStorage.updateSettings({ mode: selectMode.value as AutofillMode });
  });

  function updateLearningStatus(): void {
    const learningOn = profile.settings.learningModeEnabled;
    if (!pageIsApplication) {
      learningStatusPill.textContent = 'Inactive';
      learningStatusPill.className = 'status-pill status-none';
    } else if (learningOn) {
      learningStatusPill.textContent = profile.settings.reuseLearnedAnswers !== false ? 'Learning & reusing answers' : 'Learning manual answers';
      learningStatusPill.className = 'status-pill status-complete';
    } else if (profile.settings.reuseLearnedAnswers !== false) {
      learningStatusPill.textContent = 'Reusing saved answers';
      learningStatusPill.className = 'status-pill status-complete';
    } else {
      learningStatusPill.textContent = 'Paused in Settings';
      learningStatusPill.className = 'status-pill status-none';
    }

    // Preview → Apply fills the form too, so it follows the same gate as Run.
    const canFill = pageIsApplication && profile.settings.autofillEnabled;
    const gateTitle = profile.settings.autofillEnabled
      ? ''
      : 'Saved answers replay automatically when enabled. Enable profile autofill in Settings to fill other fields.';
    btnRun.disabled = !canFill;
    btnRun.title = gateTitle;
    btnPreview.disabled = !canFill;
    btnPreview.title = gateTitle;
  }

  async function ensureScriptInjected(tabId: number): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'PING' }, async (res) => {
        if (chrome.runtime.lastError || !res) {
          try {
            if (chrome.scripting) {
              await chrome.scripting.executeScript({
                target: { tabId, allFrames: true },
                files: ['content/content.js']
              });
              await chrome.scripting.insertCSS({
                target: { tabId, allFrames: true },
                files: ['content/content.css']
              });
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { action: 'PING' }, (pong) => {
                  resolve(!chrome.runtime.lastError && !!pong);
                });
              }, 120);
              return;
            }
          } catch (e) {
            console.warn('Job Autofill: Dynamic injection error', e);
          }
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  async function refreshPageStatus() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0] && tabs[0].id) {
        activeTabId = tabs[0].id;
        const isReady = await ensureScriptInjected(activeTabId);

        if (isReady) {
          chrome.tabs.sendMessage(activeTabId, { action: 'GET_PAGE_STATUS' }, (res) => {
            if (chrome.runtime.lastError) res = undefined;
            pageIsApplication = Boolean(res?.isApplication);
            if (pageIsApplication && res.fieldsCount > 0) {
              pageStatusPill.textContent = `Application form (${res.fieldsCount} fields)`;
              pageStatusPill.className = 'status-pill status-ready';
            } else if (res) {
              pageStatusPill.textContent = 'Not an application form';
              pageStatusPill.className = 'status-pill status-none';
            } else {
              pageStatusPill.textContent = 'Page unavailable';
              pageStatusPill.className = 'status-pill status-none';
            }
            if (res) pageStatusPill.title = (res.applicationReasons || []).join('\n');
            updateLearningStatus();
          });

          await loadUnansweredQuestions();
        } else {
          pageStatusPill.textContent = 'Click to Reload';
          pageStatusPill.className = 'status-pill status-none';
          pageStatusPill.title = 'Click here to reload the page and connect extension';
          pageStatusPill.style.cursor = 'pointer';
          pageStatusPill.onclick = () => {
            if (activeTabId) chrome.tabs.reload(activeTabId);
            window.close();
          };
        }
      }
    } catch {
      pageStatusPill.textContent = 'Page inaccessible';
    }
  }

  async function loadUnansweredQuestions() {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, { action: 'GET_UNANSWERED_QUESTIONS' }, (res) => {
      if (chrome.runtime.lastError) res = undefined;
      if (res && res.questions && res.questions.length > 0) {
        currentUnanswered = res.questions;
        renderUnansweredQuestions(currentUnanswered);
      } else {
        currentUnanswered = [];
        if (unansweredSection) unansweredSection.classList.add('hidden');
      }
    });
  }

  function renderUnansweredQuestions(questions: UnansweredQuestion[]) {
    if (!unansweredSection || !unansweredContainer || !unansweredBadge) return;

    unansweredBadge.textContent = String(questions.length);
    unansweredContainer.innerHTML = '';

    if (questions.length === 0) {
      unansweredSection.classList.add('hidden');
      return;
    }

    questions.forEach((q, idx) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'qa-card-mini';
      cardEl.dataset.index = String(idx);

      let inputHtml = '';
      if (q.type === 'choice' && q.options && q.options.length > 0) {
        const isBinary = q.options.length <= 3 && q.options.every((o) => o.label.length <= 15);
        if (isBinary) {
          inputHtml = `
            <div class="qa-radio-group-mini">
              ${q.options
                .map(
                  (opt, optIdx) => `
                <label style="display:inline-flex; align-items:center; gap:4px; cursor:pointer;">
                  <input type="radio" name="mini-radio-${idx}" value="${escapeHtml(opt.value)}" ${optIdx === 0 ? 'checked' : ''} />
                  <span>${escapeHtml(opt.label)}</span>
                </label>
              `
                )
                .join('')}
            </div>
          `;
        } else {
          inputHtml = `
            <select class="qa-input-mini" data-index="${idx}">
              ${q.options
                .map(
                  (opt) => `
                <option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>
              `
                )
                .join('')}
            </select>
          `;
        }
      } else if (q.type === 'boolean') {
        inputHtml = `
          <label style="display:inline-flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;">
            <input type="checkbox" class="qa-input-check-mini" data-index="${idx}" />
            <span>Yes</span>
          </label>
        `;
      } else {
        inputHtml = `
          <input type="text" class="qa-input-mini" data-index="${idx}" placeholder="Type answer..." />
        `;
      }

      cardEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4px;">
          <span class="qa-title-mini">${idx + 1}. ${escapeHtml(q.questionText)}</span>
          <button class="btn-text-action btn-save-single" data-index="${idx}" style="font-size:10px; padding:0 4px; white-space:nowrap;">Save & Fill</button>
        </div>
        ${inputHtml}
      `;

      unansweredContainer.appendChild(cardEl);
    });

    // Attach listener for single save
    unansweredContainer.querySelectorAll('.btn-save-single').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const targetBtn = e.currentTarget as HTMLButtonElement;
        const idx = parseInt(targetBtn.dataset.index || '0', 10);
        const q = questions[idx];
        if (!q || !activeTabId) return;

        const cardItem = getCardByIndex(idx);
        const val = getQuestionAnswerValue(cardItem, q, idx);
        if (!val) return;

        targetBtn.disabled = true;
        targetBtn.textContent = 'Saving...';

        chrome.tabs.sendMessage(
          activeTabId,
          {
            action: 'APPLY_LEARNED_ANSWER',
            questionText: q.questionText,
            answer: val,
            fieldIds: q.fieldIds
          },
          () => {
            currentUnanswered = currentUnanswered.filter((_, i) => i !== idx);
            renderUnansweredQuestions(currentUnanswered);
          }
        );
      });
    });

    unansweredSection.classList.remove('hidden');
  }

  function getCardByIndex(idx: number): HTMLElement {
    return unansweredContainer.querySelector(`.qa-card-mini[data-index="${idx}"]`) as HTMLElement;
  }

  function getQuestionAnswerValue(parent: HTMLElement, q: UnansweredQuestion, idx: number): string {
    if (!parent) return '';
    if (q.type === 'choice' && q.options && q.options.length > 0) {
      const isBinary = q.options.length <= 3 && q.options.every((o) => o.label.length <= 15);
      if (isBinary) {
        const checked = parent.querySelector(`input[name="mini-radio-${idx}"]:checked`) as HTMLInputElement;
        return checked ? checked.value : q.options[0].value;
      }
      const sel = parent.querySelector('select') as HTMLSelectElement;
      return sel ? sel.value : '';
    }
    if (q.type === 'boolean') {
      const chk = parent.querySelector('input[type="checkbox"]') as HTMLInputElement;
      return chk && chk.checked ? 'true' : 'false';
    }
    const inp = parent.querySelector('input[type="text"]') as HTMLInputElement;
    return inp ? inp.value.trim() : '';
  }

  function escapeHtml(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  await refreshPageStatus();

  // Handle RUN AUTOFILL
  btnRun.addEventListener('click', async () => {
    if (!activeTabId || !pageIsApplication) return;

    btnRun.disabled = true;
    btnRun.innerHTML = '<span>Scanning & Filling...</span>';

    const ready = await ensureScriptInjected(activeTabId);
    if (!ready) {
      btnRun.disabled = false;
      btnRun.innerHTML = '<span class="btn-icon">⚡</span><span>RUN AUTOFILL</span>';
      reportMsg.innerHTML = 'Could not connect to page. <a href="#" id="link-reload-page">Reload Page</a> to activate.';
      reportSection.classList.remove('hidden');
      document.getElementById('link-reload-page')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (activeTabId) chrome.tabs.reload(activeTabId);
        window.close();
      });
      return;
    }

    try {
      chrome.tabs.sendMessage(activeTabId, { action: 'RUN_AUTOFILL' }, (res) => {
        if (chrome.runtime.lastError) res = undefined;
        btnRun.disabled = false;
        btnRun.innerHTML = '<span class="btn-icon">⚡</span><span>RUN AUTOFILL</span>';

        if (res && res.report) {
          displayReport(res.report);
          loadUnansweredQuestions();
        } else if (res?.error) {
          reportMsg.textContent = res.error;
          reportSection.classList.remove('hidden');
        } else {
          reportMsg.textContent = 'No autofillable fields detected on this page.';
          reportSection.classList.remove('hidden');
        }
      });
    } catch {
      btnRun.disabled = false;
      btnRun.innerHTML = '<span class="btn-icon">⚡</span><span>RUN AUTOFILL</span>';
    }
  });

  // Handle Save All Q&A
  if (btnSaveAllQA) {
    btnSaveAllQA.addEventListener('click', async () => {
      if (!activeTabId || currentUnanswered.length === 0) return;
      btnSaveAllQA.disabled = true;
      btnSaveAllQA.textContent = 'Saving...';

      for (let i = 0; i < currentUnanswered.length; i++) {
        const q = currentUnanswered[i];
        const cardItem = getCardByIndex(i);
        const val = getQuestionAnswerValue(cardItem, q, i);
        if (val) {
          await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              activeTabId!,
              {
                action: 'APPLY_LEARNED_ANSWER',
                questionText: q.questionText,
                answer: val,
                fieldIds: q.fieldIds
              },
              () => resolve(true)
            );
          });
        }
      }

      btnSaveAllQA.disabled = false;
      btnSaveAllQA.textContent = 'Save & Fill Page';
      currentUnanswered = [];
      renderUnansweredQuestions(currentUnanswered);
    });
  }

  // Handle Learn from Page
  if (btnLearnPage) {
    btnLearnPage.addEventListener('click', async () => {
      if (!activeTabId) return;
      btnLearnPage.disabled = true;
      btnLearnPage.textContent = 'Learning...';

      chrome.tabs.sendMessage(activeTabId, { action: 'LEARN_FROM_PAGE' }, (res) => {
        if (chrome.runtime.lastError) res = undefined;
        btnLearnPage.disabled = false;
        btnLearnPage.textContent = '📥 Learn from Page';

        if (res && res.learnedCount > 0) {
          reportMsg.textContent = `Successfully learned ${res.learnedCount} answer(s) from page!`;
          reportSection.classList.remove('hidden');
          loadUnansweredQuestions();
        } else if (res?.status === 'not_application') {
          reportMsg.textContent = 'Learning is only active on verified job-application forms.';
          reportSection.classList.remove('hidden');
        } else {
          reportMsg.textContent = 'No filled values found to learn. Type answers into the form first.';
          reportSection.classList.remove('hidden');
        }
      });
    });
  }

  // Handle PREVIEW
  btnPreview.addEventListener('click', async () => {
    if (!activeTabId) return;
    await ensureScriptInjected(activeTabId);
    chrome.tabs.sendMessage(activeTabId, { action: 'RUN_PREVIEW' }).catch(() => undefined);
    window.close();
  });

  // Handle CLEAR
  btnClear.addEventListener('click', async () => {
    if (!activeTabId) return;
    await ensureScriptInjected(activeTabId);
    chrome.tabs.sendMessage(activeTabId, { action: 'CLEAR_FILLED' }).catch(() => undefined);
    reportSection.classList.add('hidden');
    loadUnansweredQuestions();
  });

  // Handle Settings
  const openSettings = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/settings.html'));
    }
  };

  btnOpenSettings.addEventListener('click', openSettings);
  btnSettingsIcon.addEventListener('click', openSettings);

  function displayReport(report: AutofillReport): void {
    statFilled.textContent = String(report.filledCount);
    statReview.textContent = String(report.reviewCount);
    statSkipped.textContent = String(report.skippedCount);

    if (report.filledCount === 0 && report.totalDetected === 0) {
      reportMsg.textContent = 'No application form inputs detected on this page.';
    } else if (report.reviewCount > 0) {
      reportMsg.textContent = `${report.reviewCount} field(s) flagged for manual review on the page.`;
    } else {
      reportMsg.textContent = 'All high-confidence fields successfully filled!';
    }

    reportSection.classList.remove('hidden');
  }
});
