import { AutofillEngine } from './autofill-engine';
import { ProfileStorage } from '../storage/profile-storage';
import { FieldDetector } from './field-detector';
import { FieldMatcher } from './field-matcher';
import { QuestionDetector, QuestionLearner, normalizeQuestion } from './question-learner';
import { UIOverlay } from './ui-overlay';
import { ApplicationPageDetector, ApplicationPageStatus } from './application-page-detector';
import { decideCorrection, findTriggerForPopup, hostOf, readUserValue, UserFieldValue, fieldDisplayLabel } from './correction-memory';
import { isChoiceField, isScreeningDate, questionOf } from './field-context';
import { AutofillReport, DetectedField } from '../types/engine';
import { UserProfile } from '../types/profile';
import { pageDiagnostics } from './page-diagnostics';

const engine = new AutofillEngine(isApplicationPage);
const matcher = new FieldMatcher();
let applicationStatus: ApplicationPageStatus | null = null;
let applicationCheckTimer: number | undefined;

const isTopFrame = window === window.top;

// Messages that concern "the application form in this tab". With all_frames,
// every frame receives them and the first reply wins.
const PAGE_ACTIONS = new Set([
  'GET_PAGE_STATUS',
  'GET_PAGE_DIAGNOSTICS',
  'GET_UNANSWERED_QUESTIONS',
  'APPLY_LEARNED_ANSWER',
  'LEARN_FROM_PAGE',
  'OPEN_QUESTION_ASSISTANT',
  'RUN_AUTOFILL',
  'RUN_PREVIEW'
]);
const SLOW_PAGE_ACTIONS = new Set(['APPLY_LEARNED_ANSWER', 'LEARN_FROM_PAGE', 'OPEN_QUESTION_ASSISTANT', 'RUN_AUTOFILL', 'RUN_PREVIEW']);

const NOT_APPLICATION_ERROR = 'This page is not a verified job application form.';
const LEARNING_ONLY_ERROR = 'Autofill is off while Learning mode is active. Enable it in Settings when you are ready.';

function getApplicationStatus(): { status: ApplicationPageStatus; fields: ReturnType<typeof FieldDetector.detectFields> } {
  const fields = FieldDetector.detectFields(document);
  const pageText = (document.body?.innerText || '').slice(0, 20000);
  applicationStatus = ApplicationPageDetector.detect(window.location.href, document.title, fields, pageText);
  return { status: applicationStatus, fields };
}

function scheduleApplicationCheck(): void {
  // Coalesce mutations without postponing forever on animated/loading pages.
  if (applicationCheckTimer !== undefined) return;
  applicationCheckTimer = window.setTimeout(() => {
    applicationCheckTimer = undefined;
    void maybeAutoStart(getApplicationStatus().status);
  }, 350);
}

const autoStartedPages = new Set<string>();

/**
 * Optional (Settings → "Start autofill automatically"): run autofill once per
 * page as soon as it is recognised as an application form, without a click.
 */
async function maybeAutoStart(status: ApplicationPageStatus): Promise<void> {
  const pageKey = window.location.href;
  if (!status.isApplication) return;
  if (engine.isBusy) { scheduleApplicationCheck(); return; }
  const profile = await ProfileStorage.getProfile();
  await engine.replayRememberedAnswers(profile);
  if (autoStartedPages.has(pageKey)) return;
  if (!profile.settings.autofillEnabled || profile.settings.autoStartOnApplicationPages !== true) return;
  autoStartedPages.add(pageKey);
  await runAutofillFromTrigger();
}

// Fields the candidate clicked or typed in. Used to (a) keep re-scans away from
// them and (b) learn only real answers when leaving a step, never page defaults
// such as a preselected "US +1".
const userTouched = new WeakSet<Element>();
// Focus/pointer interaction alone does not mean that a page default was chosen.
const userEdited = new WeakSet<Element>();
const NON_EDIT_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'Escape', 'Enter', 'CapsLock']);

function noteInteraction(event: Event): void {
  if (!event.isTrusted || engine.isBusy || !(event.target instanceof Element)) return;
  if (event instanceof KeyboardEvent && NON_EDIT_KEYS.has(event.key)) return;
  const source = event.composedPath?.()[0] instanceof Element ? event.composedPath()[0] as Element : event.target;
  const el = source.closest<HTMLElement>('input, select, textarea, button, [role="combobox"], [role="textbox"], [role="radio"], [role="checkbox"]');
  if (!el) return;
  userTouched.add(el);
  if (event.type === 'input' || event.type === 'change') userEdited.add(el);
  engine.noteUserEdit(el);
}

function isApplicationPage(): boolean {
  return getApplicationStatus().status.isApplication;
}

/**
 * @param isChange true for `change` events: the candidate actually edited the
 *   field. Corrections are only learned from real edits, never from merely
 *   tabbing through a field.
 */
async function learnManualEntry(target: EventTarget | null, event: Event, isChange: boolean): Promise<void> {
  // Programmatic autofill emits synthetic events, and its focus()/blur() calls emit
  // trusted ones; only a real user interaction may become persistent memory.
  if (!event.isTrusted || !(target instanceof HTMLElement) || engine.isBusy) return;
  const source = event.composedPath?.()[0];
  if (source instanceof HTMLElement) target = source;
  // Capture before awaiting storage: Next/Submit may unmount this form immediately.
  if (!isApplicationPage()) return;
  const fields = FieldDetector.detectFields(document);
  const field = fields.find((candidate) => candidate.element === target);
  if (!field) return;
  if (isChoiceField(field) || isScreeningDate(field)) {
    if (!isChange && !userEdited.has(field.element)) return;
    const { learned } = await learnChoice(field);
    const last = learned[learned.length - 1];
    if (last) UIOverlay.showLearnedNotice(last.label, last.value, last.scope, last.manageIn);
    return;
  }
  let profile = await ProfileStorage.getProfile();
  if (!profile.settings.learningModeEnabled) return;

  if (!isChange) {
    // Blur also fires when merely tabbing through page defaults. Only a real
    // edit may refresh screening-question memory.
    if (!userEdited.has(field.element)) return;
    const learned = QuestionLearner.getLearnableAnswer(field, true);
    if (learned) await ProfileStorage.addOrUpdateCustomQA(learned.question, learned.answer, 'Learned from manual application');
    return;
  }

  const { learned } = await learnFromField(field, profile);
  const last = learned[learned.length - 1];
  if (last) UIOverlay.showLearnedNotice(last.label, last.value, last.scope, last.manageIn);
}

interface LearnedItem {
  label: string;
  value: string;
  scope: string;
  manageIn: string;
}

/** Capture the value before any await, then send one durable worker request. */
async function learnChoice(field: DetectedField, selected?: UserFieldValue): Promise<{ profile: UserProfile; learned: LearnedItem[] }> {
  const question = questionOf(field);
  const user = selected || readUserValue(field);
  const host = hostOf(window.location.href);
  if (!user || !host || question.length < 3) return { profile: await ProfileStorage.getProfile(), learned: [] };
  const reusable = field.type === 'checkbox' ? undefined : { question, answer: user.value };
  const result = await ProfileStorage.rememberChoice({
    host, key: `${field.type}|question:${normalizeQuestion(question)}`, question,
    label: fieldDisplayLabel(field), fieldType: field.type, value: user.value,
    optionValue: user.optionValue || undefined, manualChoice: true
  }, reusable);
  return { profile: result.profile, learned: result.changed ? [{ label: question, value: user.value,
    scope: host, manageIn: 'Settings → Learned Corrections' }] : [] };
}

/**
 * Learns everything one field can teach: the answer to a custom screening
 * question (reused on any site) and a correction of what autofill enters for
 * this field on this site (or forgets one that is no longer needed).
 */
async function learnFromField(
  field: DetectedField,
  profile: UserProfile,
  optionValue?: string
): Promise<{ profile: UserProfile; learned: LearnedItem[] }> {
  if (isChoiceField(field) || isScreeningDate(field)) return learnChoice(field);
  const learned: LearnedItem[] = [];

  const answer = QuestionLearner.getLearnableAnswer(field, true);
  if (answer) {
    const normalizedQuestion = answer.question.trim().toLowerCase();
    const previousAnswer = profile.customQA?.find((qa) => qa.question.trim().toLowerCase() === normalizedQuestion)?.answer;
    profile = await ProfileStorage.addOrUpdateCustomQA(answer.question, answer.answer, 'Learned from manual application');
    if (previousAnswer !== answer.answer.trim()) {
      learned.push({ label: answer.question, value: answer.answer, scope: 'all sites', manageIn: 'Settings → Saved Answers (Q&A)' });
    }
  }

  const decision = decideCorrection(field, profile, window.location.href, document, matcher, optionValue, true);
  if (decision.type === 'save') {
    await ProfileStorage.saveFieldOverride(decision.override);
    learned.push({ label: decision.override.label, value: decision.override.value, scope: decision.override.host, manageIn: 'Settings → Learned Corrections' });
  } else if (decision.type === 'remove') {
    await ProfileStorage.removeFieldOverride(decision.id);
  }

  return { profile, learned };
}

const ADVANCE_ACTION = /\b(weiter|next|continue|fortfahren|submit|absenden|abschicken|senden|bewerben|apply|review|überprüfen|ueberpruefen|speichern|save)\b/i;
const NOT_ADVANCE_ACTION = /\b(add|hinzuf\w*|remove|entfernen|delete|löschen|cancel|abbrechen|back|zurück)\b/i;

/**
 * When the candidate moves to the next step or submits, learn every field they
 * filled on this step in one go. This catches date pickers and other custom
 * widgets that set values without a `change` event. Only fields the candidate
 * clicked or typed in are considered.
 */
async function learnBeforeLeavingStep(event: Event): Promise<void> {
  if (!event.isTrusted || engine.isBusy || !(event.target instanceof Element)) return;
  if (event.type === 'click') {
    const button = event.target.closest<HTMLElement>('button, input[type="submit"], input[type="button"], [role="button"]');
    if (!button) return;
    const text = `${button.textContent || ''} ${button.getAttribute('aria-label') || ''} ${(button as HTMLInputElement).value || ''}`;
    if (!ADVANCE_ACTION.test(text) || NOT_ADVANCE_ACTION.test(text)) return;
  }

  // Snapshot synchronously: the page may replace this step as soon as the click is handled.
  if (!isApplicationPage()) return;
  const fields = FieldDetector.detectFields(document).filter((field) => userTouched.has(field.element));
  if (fields.length === 0) return;

  const selectedFields = fields.filter((field) => field.type !== 'radio' || field.isChecked);
  // Dispatch every choice now; a navigation must not interrupt a serial save loop.
  const pending = selectedFields.filter((field) => isChoiceField(field) || isScreeningDate(field)).map((field) => learnChoice(field));
  const results = await Promise.all(pending);
  const learnedAll: LearnedItem[] = results.flatMap((result) => result.learned);
  let profile = await ProfileStorage.getProfile();
  if (!profile.settings.learningModeEnabled) return;
  for (const field of selectedFields.filter((field) => !isChoiceField(field) && !isScreeningDate(field))) {
    const result = await learnFromField(field, profile);
    profile = result.profile;
    learnedAll.push(...result.learned);
  }

  if (learnedAll.length === 1) {
    const [item] = learnedAll;
    UIOverlay.showLearnedNotice(item.label, item.value, item.scope, item.manageIn);
  } else if (learnedAll.length > 1) {
    UIOverlay.showLearnedNotice(`${learnedAll.length} answers from this step`, 'saved', hostOf(window.location.href) || 'this site', 'Settings');
  }
}

/**
 * Custom dropdowns (e.g. Tesla's phone country-code picker) fire no `change`
 * event; learn from the candidate clicking one of their options instead.
 */
async function learnDropdownChoice(event: MouseEvent): Promise<void> {
  if (!event.isTrusted || engine.isBusy || !(event.target instanceof Element)) return;
  const option = event.target.closest<HTMLElement>('[role="option"]');
  const listbox = option?.closest<HTMLElement>('[role="listbox"]');
  if (!option || !listbox) return;

  const trigger = findTriggerForPopup(listbox);
  if (!trigger) return;
  const optionValue =
    option.getAttribute('data-value') || option.getAttribute('data-tds-value') || option.getAttribute('value') || (option.textContent || '').trim();

  if (!isApplicationPage()) return;
  const field = FieldDetector.detectFields(document).find((candidate) => candidate.element === trigger);
  if (field) {
    // The clicked option already contains the answer, even if the popup or
    // entire step is removed by its click handler before an async callback runs.
    const { learned } = await learnChoice(field, { value: (option.textContent || '').trim(), optionValue });
    const last = learned[learned.length - 1];
    if (last) UIOverlay.showLearnedNotice(last.label, last.value, last.scope, last.manageIn);
  }
}

/**
 * Shared by the popup button, the browser command / context menu (via
 * RUN_AUTOFILL) and the in-page shortcut, so every trigger honours the same
 * settings and records history the same way.
 */
async function runAutofillFromTrigger(): Promise<{ status: string; report?: AutofillReport; error?: string }> {
  const profile = await ProfileStorage.getProfile();
  if (!profile.settings.autofillEnabled) {
    return { status: 'learning_only', error: LEARNING_ONLY_ERROR };
  }

  const report = await engine.runAutofill(profile, profile.settings.previewBeforeFilling === true);

  if (report.filledCount > 0) {
    // The extension never submits, so this is a prepared application, not a sent one.
    await ProfileStorage.recordApplication({
      company: detectCompanyName(),
      jobTitle: detectJobTitle(),
      url: window.location.href,
      date: new Date().toISOString(),
      location: detectLocation(),
      status: 'Saved',
      notes: `Autofilled ${report.filledCount} fields (${report.reviewCount} flagged for review). Not submitted.`,
      fieldsFilledCount: report.filledCount
    });
  }

  return { status: 'ok', report };
}

// Application portals often render their form after initial page load. Recheck
// on DOM changes, but keep all inspection local and inert on non-app pages.
scheduleApplicationCheck();
new MutationObserver(scheduleApplicationCheck).observe(document.documentElement, {
  childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'style', 'class']
});
document.addEventListener('pointerdown', noteInteraction, true);
document.addEventListener('keydown', noteInteraction, true);
document.addEventListener('input', noteInteraction, true);
document.addEventListener('change', noteInteraction, true);
document.addEventListener('change', (event) => void learnManualEntry(event.target, event, true), true);
document.addEventListener('blur', (event) => void learnManualEntry(event.target, event, false), true);
document.addEventListener('click', (event) => void learnDropdownChoice(event), true);
// ARIA controls use click handlers rather than native change events.
document.addEventListener('click', (event) => {
  const source = event.composedPath?.()[0] || event.target;
  if (!event.isTrusted || !(source instanceof Element) || engine.isBusy) return;
  const control = source.closest<HTMLElement>('[role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"]');
  if (control) window.setTimeout(() => void learnManualEntry(control, event, true), 0);
}, true);
document.addEventListener('click', (event) => void learnBeforeLeavingStep(event), true);
document.addEventListener('submit', (event) => void learnBeforeLeavingStep(event), true);
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') scheduleApplicationCheck(); });
}

// Listen for messages from background script or popup
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const action = message?.action;
    const isApp = PAGE_ACTIONS.has(action) ? isApplicationPage() : false;
    let replyDelayMs = 0;

    if (PAGE_ACTIONS.has(action) && !isApp) {
      // Frames without the form stay silent, so an unrelated iframe (reCAPTCHA,
      // ads, chat widgets) cannot answer "not an application" for the whole tab.
      if (!isTopFrame) return false;
      // The top frame still answers so the caller always gets a reply, but it
      // gives an embedded application iframe time to answer first.
      if (document.querySelector('iframe')) {
        replyDelayMs = SLOW_PAGE_ACTIONS.has(action) ? 5000 : 400;
      }
    }

    const reply = (response: unknown) => {
      if (replyDelayMs > 0) {
        window.setTimeout(() => sendResponse(response), replyDelayMs);
      } else {
        sendResponse(response);
      }
    };

    (async () => {
      try {
        switch (action) {
          case 'PING': {
            reply({ status: 'ok', pong: true });
            break;
          }

          case 'GET_PAGE_STATUS': {
            const { fields, status } = getApplicationStatus();
            reply({
              status: 'ok',
              fieldsCount: fields.length,
              url: window.location.href,
              title: document.title,
              isApplication: status.isApplication,
              applicationConfidence: status.confidence,
              applicationReasons: status.reasons
            });
            break;
          }

          case 'GET_PAGE_DIAGNOSTICS': {
            const { fields, status } = getApplicationStatus();
            const profile = await ProfileStorage.getProfile();
            const remembered = matcher.matchFields(fields, profile, window.location.href, document, { learnedOnly: true });
            reply({ status: 'ok', report: pageDiagnostics(chrome.runtime.getManifest?.().version || 'unknown',
              window.location.href, status, fields, profile, remembered) });
            break;
          }

          case 'GET_UNANSWERED_QUESTIONS': {
            if (!isApp) {
              reply({ status: 'not_application', questions: [] });
              break;
            }
            const profile = await ProfileStorage.getProfile();
            const fields = FieldDetector.detectFields(document);
            const matches = matcher.matchFields(fields, profile, window.location.href, document);
            const unanswered = QuestionDetector.getUnansweredQuestions(fields, matches);
            reply({ status: 'ok', questions: unanswered });
            break;
          }

          case 'APPLY_LEARNED_ANSWER': {
            if (!isApp) {
              reply({ status: 'not_application', filled: 0 });
              break;
            }
            const profile = await ProfileStorage.getProfile();
            const { questionText, answer, fieldIds } = message;
            const filled = await engine.fillAnswerForFields(fieldIds, answer, profile);
            await ProfileStorage.addOrUpdateCustomQA(questionText, answer);
            reply({ status: 'ok', filled });
            break;
          }

          case 'LEARN_FROM_PAGE': {
            if (!isApp) {
              reply({ status: 'not_application', learnedCount: 0, learned: [] });
              break;
            }
            const fields = FieldDetector.detectFields(document);
            const learned = QuestionLearner.extractFilledQuestionsFromPage(fields);
            for (const item of learned) {
              await ProfileStorage.addOrUpdateCustomQA(item.question, item.answer);
            }
            reply({ status: 'ok', learnedCount: learned.length, learned });
            break;
          }

          case 'OPEN_QUESTION_ASSISTANT': {
            if (!isApp) {
              reply({ status: 'not_application', count: 0 });
              break;
            }
            const profile = await ProfileStorage.getProfile();
            const fields = FieldDetector.detectFields(document);
            const matches = matcher.matchFields(fields, profile, window.location.href, document);
            const unanswered = QuestionDetector.getUnansweredQuestions(fields, matches);
            if (unanswered.length > 0) {
              UIOverlay.showQuestionAssistantModal(unanswered, async (answers) => {
                for (const a of answers) {
                  await engine.fillAnswerForFields(a.fieldIds, a.answer, profile);
                  await ProfileStorage.addOrUpdateCustomQA(a.questionText, a.answer);
                }
              });
            }
            reply({ status: 'ok', count: unanswered.length });
            break;
          }

          case 'RUN_AUTOFILL': {
            if (!isApp) {
              reply({ status: 'not_application', error: NOT_APPLICATION_ERROR });
              break;
            }
            reply(await runAutofillFromTrigger());
            break;
          }

          case 'RUN_PREVIEW': {
            if (!isApp) {
              reply({ status: 'not_application', error: NOT_APPLICATION_ERROR });
              break;
            }
            // Applying a preview fills the form, so it is gated like Run Autofill.
            const profile = await ProfileStorage.getProfile();
            if (!profile.settings.autofillEnabled) {
              reply({ status: 'learning_only', error: LEARNING_ONLY_ERROR });
              break;
            }
            const report = await engine.runAutofill(profile, true);
            reply({ status: 'ok', report });
            break;
          }

          case 'CLEAR_FILLED': {
            engine.clearFilledFields();
            reply({ status: 'ok' });
            break;
          }

          default:
            reply({ status: 'unknown_action' });
        }
      } catch (err: any) {
        reply({ status: 'error', error: err?.message || 'Unknown content script error' });
      }
    })();

    return true; // Keep channel open for async response
  });
}

// In-page keyboard shortcut listener (Ctrl + Shift + F). Normally the browser
// command handles this key; this covers pages where the command is not bound.
window.addEventListener('keydown', (e) => {
  if (!((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f')) return;
  // Leave the key alone on every other page (it is a common site shortcut).
  if (!isApplicationPage()) return;
  e.preventDefault();

  void (async () => {
    const profile = await ProfileStorage.getProfile();
    if (profile.settings.enableKeyboardShortcut) {
      await runAutofillFromTrigger();
    }
  })();
});

function detectCompanyName(): string {
  // Check common meta tags and page titles
  const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
  if (ogSiteName) return ogSiteName.trim();

  const title = document.title;
  if (title.includes(' at ')) {
    return title.split(' at ')[1].split(/[-|–]/)[0].trim();
  }
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    return parts[parts.length - 1].trim();
  }

  return window.location.hostname.replace('www.', '').split('.')[0];
}

function detectJobTitle(): string {
  const h1 = document.querySelector('h1, .job-title, [data-automation-id="jobPostingHeader"]');
  if (h1 && h1.textContent) {
    return h1.textContent.trim();
  }
  return document.title.split(/[-|–]/)[0].trim();
}

function detectLocation(): string {
  const locEl = document.querySelector('.location, [data-automation-id="locations"], [itemprop="addressLocality"]');
  if (locEl && locEl.textContent) {
    return locEl.textContent.trim();
  }
  return '';
}
