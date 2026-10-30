import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileStorage, STORAGE_KEY, STORAGE_MESSAGE } from '../src/storage/profile-storage';
import { DEFAULT_USER_PROFILE } from '../src/storage/default-profile';

const correction = { host: 'jobs.example.com', key: 'text|name:solver', label: 'Solver', fieldType: 'text', value: 'Nastran' };
const history = { company: 'Example', jobTitle: 'Engineer', date: '2026-10-30', location: 'Berlin', status: 'Saved' as const, notes: '', url: 'https://jobs.example.com/apply/1' };

describe('Preserving learned memory', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('chrome', undefined);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key)
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps answers, corrections and history when saving a stale settings snapshot', async () => {
    const stale = await ProfileStorage.getProfile();
    await ProfileStorage.addOrUpdateCustomQA('Preferred solver for crash?', 'LS-DYNA');
    const saved = await ProfileStorage.saveFieldOverride(correction);
    await ProfileStorage.recordApplication(history);
    stale.basic.firstName = 'Updated';
    await ProfileStorage.saveProfile(stale);
    const latest = await ProfileStorage.getProfile();
    expect(latest.basic.firstName).toBe('Updated');
    expect(latest.customQA.some((qa) => qa.answer === 'LS-DYNA')).toBe(true);
    expect(latest.fieldOverrides).toContainEqual(saved);
    expect(latest.history).toHaveLength(1);
  });

  it('does not resurrect removed memory when an older settings page saves', async () => {
    await ProfileStorage.addOrUpdateCustomQA('Preferred solver for crash?', 'LS-DYNA');
    const saved = await ProfileStorage.saveFieldOverride(correction);
    const stale = await ProfileStorage.getProfile();
    const qa = stale.customQA.find((qa) => qa.answer === 'LS-DYNA')!;
    await ProfileStorage.removeCustomQA(qa.id);
    await ProfileStorage.removeFieldOverride(saved.id);
    await ProfileStorage.saveProfile(stale);
    const latest = await ProfileStorage.getProfile();
    expect(latest.customQA.some((entry) => entry.id === qa.id)).toBe(false);
    expect(latest.fieldOverrides).toHaveLength(0);
  });

  it('restores candidate defaults without clearing memory, history or settings', async () => {
    await ProfileStorage.addOrUpdateCustomQA('Preferred solver for crash?', 'LS-DYNA');
    const saved = await ProfileStorage.saveFieldOverride(correction);
    await ProfileStorage.recordApplication(history);
    await ProfileStorage.updateSettings({ autofillEnabled: true });
    const before = await ProfileStorage.getProfile();
    const reset = await ProfileStorage.resetToDefault();
    expect(reset.customQA).toEqual(before.customQA);
    expect(reset.fieldOverrides).toEqual([saved]);
    expect(reset.history).toEqual(before.history);
    expect(reset.settings.autofillEnabled).toBe(true);
  });

  it('merges imports without replacing local answers or corrections', async () => {
    await ProfileStorage.addOrUpdateCustomQA('Preferred solver for crash?', 'LS-DYNA');
    const saved = await ProfileStorage.saveFieldOverride(correction);
    const incoming = structuredClone(await ProfileStorage.getProfile());
    incoming.basic.firstName = 'Imported';
    incoming.customQA.find((qa) => qa.answer === 'LS-DYNA')!.answer = 'Older answer';
    incoming.customQA.push({ id: 'imported-qa', question: 'Preferred mesh topology?', answer: 'Hex', keywords: ['mesh', 'topology'] });
    incoming.fieldOverrides![0].value = 'Older correction';
    incoming.fieldOverrides!.push({ ...saved, id: 'imported-correction', key: 'text|name:mesh', value: 'Hex' });
    expect(await ProfileStorage.importProfileJson(JSON.stringify(incoming))).toEqual({ success: true });
    const latest = await ProfileStorage.getProfile();
    expect(latest.basic.firstName).toBe('Imported');
    expect(latest.customQA.some((qa) => qa.answer === 'LS-DYNA')).toBe(true);
    expect(latest.customQA.some((qa) => qa.answer === 'Hex')).toBe(true);
    expect(latest.fieldOverrides).toContainEqual(saved);
    expect(latest.fieldOverrides).toHaveLength(2);
  });

  it('rejects invalid imported memory without writing over existing data', async () => {
    await ProfileStorage.saveFieldOverride(correction);
    const before = store.get(STORAGE_KEY);
    const result = await ProfileStorage.importProfileJson(JSON.stringify({ basic: {}, customQA: [{ question: 123 }] }));
    expect(result.success).toBe(false);
    expect(store.get(STORAGE_KEY)).toBe(before);
  });

  it('restores personalized built-in answers over untouched defaults on a fresh installation', async () => {
    const incoming = structuredClone(DEFAULT_USER_PROFILE);
    incoming.customQA[0].answer = 'Personalized answer from my backup';
    expect(await ProfileStorage.importProfileJson(JSON.stringify(incoming))).toEqual({ success: true });
    expect((await ProfileStorage.getProfile()).customQA.find((qa) => qa.id === incoming.customQA[0].id)?.answer)
      .toBe('Personalized answer from my backup');
    incoming.customQA[0].answer = 'An older backup answer';
    await ProfileStorage.importProfileJson(JSON.stringify(incoming));
    expect((await ProfileStorage.getProfile()).customQA.find((qa) => qa.id === incoming.customQA[0].id)?.answer)
      .toBe('Personalized answer from my backup');
  });

  it('retains legacy learned entries and user-defined notice periods through migration', async () => {
    const legacy: any = structuredClone(DEFAULT_USER_PROFILE);
    legacy.jobPreferences.noticePeriod = 'By Agreement';
    delete legacy.settings.learningModeEnabled;
    delete legacy.settings.autofillEnabled;
    legacy.customQA.push({ id: 'legacy-qa', question: 'Legacy question', answer: 'Keep me', keywords: ['legacy'] });
    legacy.fieldOverrides = [{ ...correction, id: 'legacy-override', updatedAt: '' }];
    store.set(STORAGE_KEY, JSON.stringify(legacy));
    const latest = await ProfileStorage.getProfile();
    expect(latest.jobPreferences.noticePeriod).toBe('By Agreement');
    expect(latest.customQA).toContainEqual(legacy.customQA.at(-1));
    expect(latest.fieldOverrides).toEqual(legacy.fieldOverrides);
    expect(latest.settings.learningModeEnabled).toBe(true);
    expect(latest.settings.autofillEnabled).toBe(false);
  });

  it('leaves unreadable stored data intact instead of resetting it', async () => {
    store.set(STORAGE_KEY, '{broken JSON');
    await expect(ProfileStorage.getProfile()).rejects.toThrow('left untouched');
    expect(store.get(STORAGE_KEY)).toBe('{broken JSON');
  });

  it('updates equivalent questions but preserves questions with additional meaning', async () => {
    await ProfileStorage.addOrUpdateCustomQA('Experience with FEM', '3 years');
    await ProfileStorage.addOrUpdateCustomQA('Experience with FEM and CFD', '1 year');
    await ProfileStorage.addOrUpdateCustomQA(' EXPERIENCE  with FEM? * ', '4 years', 'Saved', ['finite elements']);
    const profile = await ProfileStorage.getProfile();
    expect(profile.customQA.filter((qa) => qa.question.includes('CFD'))).toHaveLength(1);
    expect(profile.customQA.some((qa) => qa.answer === '1 year')).toBe(true);
    expect(profile.customQA.some((qa) => qa.answer === '3 years')).toBe(false);
    expect(profile.customQA.find((qa) => qa.answer === '4 years')?.keywords).toContain('finite elements');
  });

  it('clears only history through the dedicated action', async () => {
    await ProfileStorage.saveFieldOverride(correction);
    await ProfileStorage.recordApplication(history);
    const latest = await ProfileStorage.clearHistory();
    expect(latest.history).toEqual([]);
    expect(latest.fieldOverrides).toHaveLength(1);
  });
});

describe('Storage coordination between extension contexts', () => {
  let disk: Record<string, any>;
  let handler: (message: any, sender: any, respond: (response: any) => void) => unknown;
  let failWrite: boolean;
  let mockChrome: any;

  beforeEach(() => {
    disk = {};
    failWrite = false;
    mockChrome = {
      runtime: {
        id: 'test-extension',
        onMessage: { addListener: (listener: typeof handler) => { handler = listener; } },
        sendMessage: (message: any, respond: (response: any) => void) => {
          queueMicrotask(() => handler(message, { id: 'test-extension' }, respond));
        }
      },
      storage: { local: {
        get: (_keys: string[], callback: (items: any) => void) => setTimeout(() => callback(structuredClone(disk)), 1),
        set: (items: any, callback: () => void) => setTimeout(() => {
          if (failWrite) mockChrome.runtime.lastError = { message: 'Quota exceeded' };
          else disk = { ...disk, ...structuredClone(items) };
          callback();
          delete mockChrome.runtime.lastError;
        }, 1)
      } }
    };
    vi.stubGlobal('chrome', mockChrome);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function createContexts() {
    vi.resetModules();
    const worker = (await import('../src/storage/profile-storage')).ProfileStorage;
    worker.startCoordinator();
    vi.resetModules();
    const tabA = (await import('../src/storage/profile-storage')).ProfileStorage;
    vi.resetModules();
    const tabB = (await import('../src/storage/profile-storage')).ProfileStorage;
    return { tabA, tabB };
  }

  it('serializes first-run seeding and simultaneous learning from independent tabs', async () => {
    const { tabA, tabB } = await createContexts();
    await Promise.all([
      tabA.getProfile(), tabB.getProfile(),
      tabA.addOrUpdateCustomQA('Preferred solver for crash?', 'LS-DYNA'),
      tabB.addOrUpdateCustomQA('Preferred mesh topology?', 'Hex'),
      tabA.saveFieldOverride(correction),
      tabB.updateSettings({ autofillEnabled: true })
    ]);
    const latest = await tabA.getProfile();
    expect(latest.customQA.some((qa) => qa.answer === 'LS-DYNA')).toBe(true);
    expect(latest.customQA.some((qa) => qa.answer === 'Hex')).toBe(true);
    expect(latest.fieldOverrides).toHaveLength(1);
    expect(latest.settings.autofillEnabled).toBe(true);
  });

  it('reports write errors and continues processing subsequent updates', async () => {
    const { tabA, tabB } = await createContexts();
    await tabA.getProfile();
    failWrite = true;
    await expect(tabA.saveFieldOverride(correction)).rejects.toThrow('Quota exceeded');
    failWrite = false;
    await tabB.saveFieldOverride(correction);
    expect((await tabA.getProfile()).fieldOverrides).toHaveLength(1);
  });

  it('coordinates the answer and site choice as one update across extension contexts', async () => {
    const { tabA, tabB } = await createContexts();
    const choice = { ...correction, key: 'select|question:internship duration', question: 'Internship duration?', value: '6 months', manualChoice: true };
    await Promise.all([
      tabA.rememberChoice(choice, { question: choice.question, answer: choice.value }),
      tabB.addOrUpdateCustomQA('Another saved question?', 'Keep this too')
    ]);
    const profile = await tabA.getProfile();
    expect(profile.customQA.some((qa) => qa.question === choice.question && qa.answer === choice.value)).toBe(true);
    expect(profile.customQA.some((qa) => qa.answer === 'Keep this too')).toBe(true);
    expect(profile.fieldOverrides).toEqual([expect.objectContaining(choice)]);
    const before = structuredClone(disk);
    failWrite = true;
    await expect(tabA.rememberChoice({ ...choice, value: '3 months' }, { question: choice.question, answer: '3 months' })).rejects.toThrow('Quota exceeded');
    expect(disk).toEqual(before);
  });

  it('does not overwrite data after a failed storage read', async () => {
    const { tabA } = await createContexts();
    await tabA.saveFieldOverride(correction);
    const before = structuredClone(disk);
    mockChrome.storage.local.get = (_keys: string[], callback: (items: any) => void) => {
      mockChrome.runtime.lastError = { message: 'Read failed' };
      callback({});
      delete mockChrome.runtime.lastError;
    };
    await expect(tabA.getProfile()).rejects.toThrow('Read failed');
    expect(disk).toEqual(before);
  });

  it('does not fall back to a competing writer when the worker is unavailable', async () => {
    const { tabA } = await createContexts();
    mockChrome.runtime.sendMessage = (_message: any, callback: (response: any) => void) => callback(undefined);
    await expect(tabA.saveFieldOverride(correction)).rejects.toThrow('Storage service unavailable');
    expect(disk).toEqual({});
  });

  it('rejects requests for non-public methods', async () => {
    await createContexts();
    const respond = vi.fn();
    handler({ action: STORAGE_MESSAGE, operation: 'writeProfile', args: [] }, { id: 'test-extension' }, respond);
    expect(respond).toHaveBeenCalledWith({ success: false, error: 'Invalid storage request' });
    expect(disk).toEqual({});
  });
});
