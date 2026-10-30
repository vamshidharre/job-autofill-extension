import { UserProfile, ApplicationHistoryItem, AutofillSettings, FieldOverride } from '../types/profile';
import { DEFAULT_USER_PROFILE } from './default-profile';
import { QuestionLearner, normalizeQuestion } from '../content/question-learner';

export const STORAGE_KEY = 'job_autofill_profile_v1';
const HISTORY_KEY = 'job_autofill_history_v1';
export const STORAGE_MESSAGE = 'JOB_AUTOFILL_STORAGE';
const OPERATIONS = ['getProfile', 'saveProfile', 'resetToDefault', 'clearAll', 'clearHistory',
  'importProfileJson', 'updateSettings', 'recordApplication', 'saveFieldOverride',
  'removeFieldOverride', 'removeCustomQA', 'addOrUpdateCustomQA', 'rememberChoice'] as const;
type StorageOperation = typeof OPERATIONS[number];

/**
 * DEFAULT_USER_PROFILE is a shared module-level object. Always hand out a copy:
 * returning or saving it directly let later edits (learned answers, lastUpdated)
 * leak into the "default" that Reset and seeding rely on.
 */
function cloneDefaultProfile(): UserProfile {
  return JSON.parse(JSON.stringify(DEFAULT_USER_PROFILE)) as UserProfile;
}

/**
 * Brings a stored profile up to date with fields introduced after it was saved.
 * Returns true when the profile was changed and should be persisted.
 */
function applyMigrations(current: UserProfile): boolean {
  let updated = false;

  if (current.jobPreferences && typeof current.jobPreferences.noticePeriod !== 'string') {
    current.jobPreferences.noticePeriod = 'Immediately';
    updated = true;
  }
  if (current.settings && typeof current.settings.learningModeEnabled !== 'boolean') {
    current.settings.learningModeEnabled = true;
    updated = true;
  }
  if (current.settings && typeof current.settings.autofillEnabled !== 'boolean') {
    current.settings.autofillEnabled = false;
    updated = true;
  }

  // Offer each built-in Q&A once. Entries the user deleted stay deleted.
  if (Array.isArray(current.customQA)) {
    const seeded = new Set(current.seededDefaultQaIds || []);
    let seededChanged = false;
    for (const defaultQa of DEFAULT_USER_PROFILE.customQA) {
      if (seeded.has(defaultQa.id)) continue;
      const exists = current.customQA.some((q) => q.question.toLowerCase() === defaultQa.question.toLowerCase());
      if (!exists) {
        current.customQA.push({ ...defaultQa, keywords: [...defaultQa.keywords] });
      }
      seeded.add(defaultQa.id);
      seededChanged = true;
    }
    if (seededChanged) {
      current.seededDefaultQaIds = Array.from(seeded);
      updated = true;
    }
  }

  return updated;
}

function seedProfile(): UserProfile {
  const profile = cloneDefaultProfile();
  profile.seededDefaultQaIds = DEFAULT_USER_PROFILE.customQA.map((qa) => qa.id);
  return profile;
}

// All extension contexts send operations to the service worker's single queue.
// The same queue also supports the standalone test sandbox.
let updateQueue: Promise<unknown> = Promise.resolve();

export class ProfileStorage {
  private static coordinator = false;

  /** Register synchronously at service-worker startup, before handling events. */
  public static startCoordinator(): void {
    if (this.coordinator) return;
    this.coordinator = true;
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.action !== STORAGE_MESSAGE) return;
      if (sender.id !== chrome.runtime.id || !OPERATIONS.includes(message.operation) || !Array.isArray(message.args)) {
        sendResponse({ success: false, error: 'Invalid storage request' });
        return;
      }
      const method = this[message.operation as StorageOperation] as (...args: any[]) => Promise<unknown>;
      Promise.resolve().then(() => method.apply(this, message.args)).then(
        (value) => sendResponse({ success: true, value }),
        (error) => sendResponse({ success: false, error: error instanceof Error ? error.message : 'Storage operation failed' })
      );
      return true; // Keep the channel open until the queued write completes.
    });
  }

  private static run<T>(operation: StorageOperation, args: unknown[], task: () => Promise<T>): Promise<T> {
    if (this.isChromeStorageAvailable() && !this.coordinator && chrome.runtime?.sendMessage) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: STORAGE_MESSAGE, operation, args }, (response) => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else if (!response?.success) reject(new Error(response?.error || 'Storage service unavailable. Reload the extension and this page.'));
          else resolve(response.value as T);
        });
      });
    }
    return this.enqueueUpdate(task);
  }

  private static isChromeStorageAvailable(): boolean {
    return (
      typeof chrome !== 'undefined' &&
      !!chrome.storage &&
      !!chrome.storage.local
    );
  }

  private static enqueueUpdate<T>(task: () => Promise<T>): Promise<T> {
    const run = updateQueue.then(task, task);
    updateQueue = run.catch(() => undefined);
    return run;
  }

  /**
   * Load the active profile. Seeds with DEFAULT_USER_PROFILE if not yet created.
   */
  public static async getProfile(): Promise<UserProfile> {
    return this.run('getProfile', [], () => this.readProfile());
  }

  private static async readProfile(): Promise<UserProfile> {
    if (this.isChromeStorageAvailable()) {
      const result = await new Promise<Record<string, any>>((resolve, reject) => {
        chrome.storage.local.get([STORAGE_KEY], (items) => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve(items || {});
        });
      });
      const current = result[STORAGE_KEY] as UserProfile | undefined;
      if (current) {
        if (applyMigrations(current)) {
          await this.writeProfile(current);
        }
        return current;
      }
      // First time run: Seed with default profile
      const seeded = seedProfile();
      await this.writeProfile(seeded);
      return seeded;
    }

    // Fallback for unit tests or non-extension environments
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const current = JSON.parse(stored) as UserProfile;
          if (applyMigrations(current)) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
          }
          return current;
        } catch {
          throw new Error('Saved profile could not be read. Existing data has been left untouched.');
        }
      }
      const seeded = seedProfile();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }

    return seedProfile();
  }

  /**
   * Save the updated profile to local storage.
   */
  public static async saveProfile(profile: UserProfile): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(profile)) as UserProfile;
    return this.run('saveProfile', [snapshot], async () => {
      const latest = await this.readProfile();
      // Memory has explicit mutation APIs. An old Settings tab must neither
      // overwrite new answers nor resurrect answers the user already removed.
      snapshot.customQA = latest.customQA;
      snapshot.fieldOverrides = latest.fieldOverrides;
      snapshot.history = latest.history;
      snapshot.seededDefaultQaIds = latest.seededDefaultQaIds;
      await this.writeProfile(snapshot);
    });
  }

  private static async writeProfile(profile: UserProfile): Promise<void> {
    profile.lastUpdated = new Date().toISOString();

    if (this.isChromeStorageAvailable()) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [STORAGE_KEY]: profile }, () => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        });
      });
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }
  }

  /**
   * Restore candidate defaults while retaining learned memory and settings.
   */
  public static async resetToDefault(): Promise<UserProfile> {
    return this.run('resetToDefault', [], async () => {
      const latest = await this.readProfile();
      const profile = { ...seedProfile(), customQA: latest.customQA,
        fieldOverrides: latest.fieldOverrides, history: latest.history,
        documents: latest.documents, settings: latest.settings,
        seededDefaultQaIds: latest.seededDefaultQaIds };
      await this.writeProfile(profile);
      return profile;
    });
  }

  /**
   * Completely clear local profile and history
   */
  public static async clearAll(): Promise<void> {
    return this.run('clearAll', [], () => this.removeAll());
  }

  private static async removeAll(): Promise<void> {
    if (this.isChromeStorageAvailable()) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.remove([STORAGE_KEY, HISTORY_KEY], () => {
          const error = chrome.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        });
      });
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(HISTORY_KEY);
    }
  }

  public static async clearHistory(): Promise<UserProfile> {
    return this.run('clearHistory', [], async () => {
      const profile = await this.readProfile();
      profile.history = [];
      await this.writeProfile(profile);
      return profile;
    });
  }

  /**
   * Export profile as formatted JSON string
   */
  public static async exportProfileJson(): Promise<string> {
    const profile = await this.getProfile();
    return JSON.stringify(profile, null, 2);
  }

  /**
   * Import profile from JSON string with safety validation
   */
  public static async importProfileJson(jsonString: string): Promise<{ success: boolean; error?: string }> {
    return this.run('importProfileJson', [jsonString], () => this.importProfile(jsonString));
  }

  private static async importProfile(jsonString: string): Promise<{ success: boolean; error?: string }> {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') {
        return { success: false, error: 'Invalid JSON structure' };
      }

      // Basic structure validation
      if (!parsed.basic || typeof parsed.basic !== 'object' || Array.isArray(parsed.basic)) {
        return { success: false, error: 'Missing or invalid "basic" personal information section' };
      }

      // Reject malformed memory rather than importing a profile that crashes
      // matching or silently discarding entries during a later migration.
      const strings = (value: unknown) => Array.isArray(value) && value.every((v) => typeof v === 'string');
      if (parsed.customQA !== undefined && (!Array.isArray(parsed.customQA) || parsed.customQA.some((qa: any) =>
        !qa || ['id', 'question', 'answer'].some((key) => typeof qa[key] !== 'string') || !strings(qa.keywords)))) {
        return { success: false, error: 'Invalid saved answers. Existing profile has not been changed.' };
      }
      if (parsed.fieldOverrides !== undefined && (!Array.isArray(parsed.fieldOverrides) || parsed.fieldOverrides.some((o: any) =>
        !o || ['id', 'host', 'key', 'label', 'fieldType', 'value', 'updatedAt'].some((key) => typeof o[key] !== 'string') ||
        (o.optionValue !== undefined && typeof o.optionValue !== 'string') ||
        (o.question !== undefined && typeof o.question !== 'string') ||
        (o.manualChoice !== undefined && typeof o.manualChoice !== 'boolean')))) {
        return { success: false, error: 'Invalid learned corrections. Existing profile has not been changed.' };
      }
      if (parsed.seededDefaultQaIds !== undefined && !strings(parsed.seededDefaultQaIds)) {
        return { success: false, error: 'Invalid default-answer metadata.' };
      }
      const current = await this.readProfile();

      // Merge with default structure to prevent missing newly introduced fields
      const defaults = cloneDefaultProfile();
      const merged: UserProfile = {
        ...defaults,
        ...parsed,
        basic: { ...defaults.basic, ...parsed.basic },
        contact: { ...defaults.contact, ...parsed.contact },
        address: { ...defaults.address, ...parsed.address },
        jobPreferences: { ...defaults.jobPreferences, ...parsed.jobPreferences },
        salary: { ...defaults.salary, ...parsed.salary },
        workAuthorization: { ...defaults.workAuthorization, ...parsed.workAuthorization },
        settings: { ...defaults.settings, ...(parsed.settings || {}) },
        education: Array.isArray(parsed.education) ? parsed.education : defaults.education,
        experience: Array.isArray(parsed.experience) ? parsed.experience : defaults.experience,
        skills: Array.isArray(parsed.skills) ? parsed.skills : defaults.skills,
        languages: Array.isArray(parsed.languages) ? parsed.languages : defaults.languages,
        customQA: this.mergeMemory(current.customQA, parsed.customQA || [], (qa) => normalizeQuestion(qa.question), (qa) => {
          // A fresh installation's untouched seed must not shadow personalized
          // answers restored from a backup. Locally edited answers still win.
          const seed = DEFAULT_USER_PROFILE.customQA.find((item) => item.id === qa.id);
          return !!seed && qa.question === seed.question && qa.answer === seed.answer &&
            qa.category === seed.category && JSON.stringify(qa.keywords) === JSON.stringify(seed.keywords);
        }),
        fieldOverrides: this.mergeMemory(current.fieldOverrides || [], parsed.fieldOverrides || [], (o) => `${o.host}|${o.key}`),
        seededDefaultQaIds: Array.from(new Set([...(current.seededDefaultQaIds || []), ...(parsed.seededDefaultQaIds || [])])),
        coverLetterTemplates: Array.isArray(parsed.coverLetterTemplates) ? parsed.coverLetterTemplates : defaults.coverLetterTemplates,
        history: this.mergeMemory(current.history || [], Array.isArray(parsed.history) ? parsed.history : [], (h) => h.id),
        lastUpdated: new Date().toISOString()
      };

      await this.writeProfile(merged);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error parsing JSON' };
    }
  }

  private static mergeMemory<T extends { id: string }>(
    current: T[], incoming: T[], key: (item: T) => string,
    mayReplace: (item: T) => boolean = () => false
  ): T[] {
    const result = [...current];
    const ids = new Set(current.map((item) => item.id));
    const keys = new Set(current.map(key));
    for (const item of incoming) {
      if (ids.has(item.id) || keys.has(key(item))) {
        const index = result.findIndex((entry) => entry.id === item.id || key(entry) === key(item));
        if (index >= 0 && mayReplace(result[index])) {
          result[index] = item;
          ids.add(item.id);
          keys.add(key(item));
        }
        continue;
      }
      result.push(item);
      ids.add(item.id);
      keys.add(key(item));
    }
    return result;
  }

  /**
   * Update individual settings on the latest stored profile (rather than on a
   * copy that may have been loaded minutes ago and is missing newer answers).
   */
  public static async updateSettings(changes: Partial<AutofillSettings>): Promise<UserProfile> {
    return this.run('updateSettings', [changes], async () => {
      const profile = await this.readProfile();
      profile.settings = { ...profile.settings, ...changes };
      await this.writeProfile(profile);
      return profile;
    });
  }

  /**
   * Record an autofill run in local history. Re-running on the same page updates
   * its entry instead of adding duplicates.
   */
  public static async recordApplication(item: Omit<ApplicationHistoryItem, 'id'>): Promise<void> {
    return this.run('recordApplication', [item], async () => {
      const profile = await this.readProfile();
      if (!profile.history) {
        profile.history = [];
      }

      const pageKey = this.pageKey(item.url);
      const existingIdx = profile.history.findIndex((h) => this.pageKey(h.url) === pageKey);

      if (existingIdx >= 0) {
        // Keep the id and any status the user has set (e.g. Interview) on the existing entry.
        const [existing] = profile.history.splice(existingIdx, 1);
        profile.history.unshift({ ...existing, ...item, id: existing.id, status: existing.status });
      } else {
        profile.history.unshift({
          ...item,
          id: 'app-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6)
        });
      }

      // Keep the most recent 100 applications
      if (profile.history.length > 100) {
        profile.history = profile.history.slice(0, 100);
      }

      await this.writeProfile(profile);
    });
  }

  private static pageKey(url: string): string {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
    } catch {
      return url;
    }
  }

  /**
   * Remember (or update) the candidate's correction for one field on one site.
   */
  public static async saveFieldOverride(override: Omit<FieldOverride, 'id' | 'updatedAt'>): Promise<FieldOverride> {
    return this.run('saveFieldOverride', [override], async () => {
      const profile = await this.readProfile();
      const overrides = profile.fieldOverrides || [];
      const existingIdx = overrides.findIndex((o) => o.host === override.host && o.key === override.key);
      const record: FieldOverride = {
        ...override,
        id: existingIdx >= 0 ? overrides[existingIdx].id : 'fo-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        updatedAt: new Date().toISOString()
      };
      if (existingIdx >= 0) {
        overrides[existingIdx] = record;
      } else {
        overrides.push(record);
      }
      profile.fieldOverrides = overrides;
      await this.writeProfile(profile);
      return record;
    });
  }

  /** Persist both forms of one observed choice in one worker operation/write. */
  public static async rememberChoice(
    override: Omit<FieldOverride, 'id' | 'updatedAt'>,
    answer?: { question: string; answer: string }
  ): Promise<{ profile: UserProfile; changed: boolean }> {
    return this.run('rememberChoice', [override, answer], async () => {
      const profile = await this.readProfile();
      if (!profile.settings.learningModeEnabled) return { profile, changed: false };
      let changed = false;
      const now = new Date().toISOString();
      if (answer?.question.trim() && answer.answer.trim()) {
        const question = answer.question.trim();
        const value = answer.answer.trim();
        const existing = profile.customQA.find((qa) => normalizeQuestion(qa.question) === normalizeQuestion(question));
        if (existing) {
          if (existing.answer !== value || !/^learned/i.test(existing.category || '')) {
            existing.answer = value;
            existing.category = 'Learned from manual application';
            existing.updatedAt = now;
            changed = true;
          }
        } else {
          const qa = QuestionLearner.createCustomQA(question, value, 'Learned from manual application');
          profile.customQA.push({ ...qa, updatedAt: now });
          changed = true;
        }
      }
      const overrides = profile.fieldOverrides ||= [];
      const index = overrides.findIndex((o) => o.host === override.host && (o.key === override.key ||
        (o.fieldType === override.fieldType && !!o.question && normalizeQuestion(o.question) === normalizeQuestion(override.question || ''))));
      const previous = overrides[index];
      if (!previous || previous.value !== override.value || previous.optionValue !== override.optionValue ||
          !previous.manualChoice || previous.question !== override.question) {
        const record = { ...override, manualChoice: true, id: previous?.id || 'fo-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), updatedAt: now };
        if (index >= 0) overrides[index] = record;
        else overrides.push(record);
        changed = true;
      }
      if (changed) await this.writeProfile(profile);
      return { profile, changed };
    });
  }

  /**
   * Forget one learned correction by id.
   */
  public static async removeFieldOverride(id: string): Promise<UserProfile> {
    return this.run('removeFieldOverride', [id], async () => {
      const profile = await this.readProfile();
      profile.fieldOverrides = (profile.fieldOverrides || []).filter((o) => o.id !== id);
      await this.writeProfile(profile);
      return profile;
    });
  }

  /**
   * Remove one saved Q&A entry by id from the latest stored profile.
   */
  public static async removeCustomQA(id: string): Promise<UserProfile> {
    return this.run('removeCustomQA', [id], async () => {
      const profile = await this.readProfile();
      profile.customQA = (profile.customQA || []).filter((qa) => qa.id !== id);
      await this.writeProfile(profile);
      return profile;
    });
  }

  /**
   * Adds or updates a learned question/answer pair in profile.customQA,
   * automatically extracting keywords and persisting immediately.
   */
  public static async addOrUpdateCustomQA(
    question: string,
    answer: string,
    category: string = 'Learned Question',
    extraKeywords: string[] = []
  ): Promise<UserProfile> {
    return this.run('addOrUpdateCustomQA', [question, answer, category, extraKeywords], async () => {
      const profile = await this.readProfile();
      if (!profile.customQA) {
        profile.customQA = [];
      }

      const cleanQ = question.trim();
      const cleanAns = answer.trim();
      const normQ = normalizeQuestion(cleanQ);
      if (!normQ || !cleanAns) return profile;

      // Similar wording can ask a different question (e.g. experience with FEM
      // versus FEM and CFD). Only the same normalized question updates memory.
      const existingIdx = profile.customQA.findIndex(
        (qa) => normalizeQuestion(qa.question) === normQ
      );

      // Extract salient keywords (stop words like "wie", "haben", "you" would make unrelated questions match)
      const keywords = [...new Set([...QuestionLearner.extractKeywords(cleanQ), ...extraKeywords])];

      if (existingIdx >= 0) {
        const existing = profile.customQA[existingIdx];
        if (existing.answer === cleanAns && existing.question === cleanQ && existing.category === category &&
            keywords.every((keyword) => existing.keywords.includes(keyword))) return profile;
        profile.customQA[existingIdx].answer = cleanAns;
        profile.customQA[existingIdx].question = cleanQ;
        // A personalized built-in answer is learned memory too, and must beat adapters.
        profile.customQA[existingIdx].category = category;
        profile.customQA[existingIdx].updatedAt = new Date().toISOString();
        const combined = new Set([...profile.customQA[existingIdx].keywords, ...keywords]);
        profile.customQA[existingIdx].keywords = Array.from(combined);
      } else {
        profile.customQA.push({
          id: 'qa-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          question: cleanQ,
          keywords: keywords.length > 0 ? keywords : [normQ.substring(0, 20)],
          answer: cleanAns,
          updatedAt: new Date().toISOString(),
          category
        });
      }

      await this.writeProfile(profile);
      return profile;
    });
  }
}
