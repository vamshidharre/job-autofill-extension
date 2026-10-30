import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldDetector } from '../src/content/field-detector';
import { ApplicationPageDetector } from '../src/content/application-page-detector';
import { ProfileStorage } from '../src/storage/profile-storage';
import { DEFAULT_USER_PROFILE } from '../src/storage/default-profile';
import { DetectedField } from '../src/types/engine';

class ElementDouble {}
class InputDouble extends ElementDouble {
  value = 'Page-provided answer';
  closest() { return this; }
}

const listeners = new Map<string, Array<(event: Event) => void>>();
let input: InputDouble;
const profile = structuredClone(DEFAULT_USER_PROFILE);
profile.settings.learningModeEnabled = true;

function currentField(): DetectedField {
  return {
    id: 'screening', element: input as unknown as HTMLElement, tag: 'input', type: 'text',
    name: 'screening', htmlId: '', placeholder: '', autocomplete: '', ariaLabel: '',
    ariaLabelledBy: '', ariaDescribedBy: '', labelText: 'What motivates your interest in engineering?',
    surroundingText: '', fieldsetLegend: '', currentValue: input.value,
    isRequired: false, isDisabled: false, isReadOnly: false, isVisible: true,
    rect: { top: 0, left: 0, width: 100, height: 20 }
  };
}

async function dispatch(type: string, isTrusted = true) {
  const event = { type, isTrusted, target: input } as unknown as Event;
  for (const handler of listeners.get(type) || []) handler(event);
  // Content handlers are intentionally fire-and-forget; flush their storage awaits.
  await new Promise<void>((resolve) => setImmediate(resolve));
}

beforeAll(async () => {
  vi.stubGlobal('Element', ElementDouble);
  vi.stubGlobal('HTMLElement', InputDouble);
  vi.stubGlobal('KeyboardEvent', class extends Event {});
  vi.stubGlobal('chrome', {});
  const pageWindow = {
    top: null as unknown, location: { href: 'https://jobs.example.com/apply', hostname: 'jobs.example.com' },
    setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(), addEventListener: vi.fn()
  };
  pageWindow.top = pageWindow;
  vi.stubGlobal('window', pageWindow);
  vi.stubGlobal('document', {
    body: { innerText: '' }, title: 'Application', documentElement: {},
    addEventListener: (type: string, handler: (event: Event) => void) => {
      listeners.set(type, [...listeners.get(type) || [], handler]);
    }
  });
  vi.stubGlobal('MutationObserver', class { observe() {} });
  vi.spyOn(ProfileStorage, 'getProfile').mockResolvedValue(profile);
  vi.spyOn(ProfileStorage, 'addOrUpdateCustomQA').mockResolvedValue(profile);
  vi.spyOn(FieldDetector, 'detectFields').mockImplementation(() => [currentField()]);
  vi.spyOn(ApplicationPageDetector, 'detect').mockReturnValue({
    isApplication: true, confidence: 1, score: 10, reasons: ['test application']
  });
  await import('../src/content/content');
});

beforeEach(() => {
  input = new InputDouble();
  vi.mocked(ProfileStorage.addOrUpdateCustomQA).mockClear();
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Manual answer learning events', () => {
  it('does not learn a page default when tabbing through a field', async () => {
    await dispatch('blur');
    expect(ProfileStorage.addOrUpdateCustomQA).not.toHaveBeenCalled();
  });

  it('does not learn a page default after clicking without editing', async () => {
    await dispatch('pointerdown');
    await dispatch('blur');
    expect(ProfileStorage.addOrUpdateCustomQA).not.toHaveBeenCalled();
  });

  it('learns the candidate answer after a trusted input and blur', async () => {
    input.value = 'I enjoy solving practical engineering problems.';
    await dispatch('input');
    await dispatch('blur');
    expect(ProfileStorage.addOrUpdateCustomQA).toHaveBeenCalledWith(
      currentField().labelText, input.value, 'Learned from manual application'
    );
  });

  it('does not mistake a synthetic autofill input for the candidate own answer', async () => {
    await dispatch('input', false);
    await dispatch('blur');
    expect(ProfileStorage.addOrUpdateCustomQA).not.toHaveBeenCalled();
  });
});
