import { ProfileStorage, STORAGE_KEY } from '../storage/profile-storage';

// All tabs share this queue, so simultaneous learning cannot lose answers.
ProfileStorage.startCoordinator();

const MENU_ROOT = 'job-autofill-root';

/**
 * (Re)creates the context menu according to the "Enable right-click browser
 * context menu" setting. removeAll first: menus survive extension updates, and
 * creating an existing id again throws.
 */
function syncContextMenus(enabled: boolean): void {
  chrome.contextMenus.removeAll(() => {
    if (!enabled) return;

    chrome.contextMenus.create({
      id: MENU_ROOT,
      title: 'Job Autofill',
      contexts: ['page', 'editable']
    });

    chrome.contextMenus.create({
      id: 'job-autofill-run',
      parentId: MENU_ROOT,
      title: '⚡ Run Autofill (Ctrl+Shift+F)',
      contexts: ['page', 'editable']
    });

    chrome.contextMenus.create({
      id: 'job-autofill-preview',
      parentId: MENU_ROOT,
      title: '🔍 Preview Fields Before Filling',
      contexts: ['page', 'editable']
    });

    chrome.contextMenus.create({
      id: 'job-autofill-settings',
      parentId: MENU_ROOT,
      title: '⚙ Open Settings & Profile',
      contexts: ['page', 'editable']
    });
  });
}

/**
 * Pages without the content script (chrome:// pages, the Web Store, tabs opened
 * before the extension was installed) reject the message; that is expected.
 */
function sendToTab(tabId: number, message: { action: string }): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    // No content script in this tab.
  });
}

// Setup context menus on installation
chrome.runtime.onInstalled.addListener(async (details) => {
  // Ensure profile is seeded
  const profile = await ProfileStorage.getProfile();
  syncContextMenus(profile.settings.enableContextMenu !== false);

  // Open settings/onboarding on first installation
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// Follow the context-menu setting when it is changed in Settings.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
  const before = changes[STORAGE_KEY].oldValue?.settings?.enableContextMenu;
  const after = changes[STORAGE_KEY].newValue?.settings?.enableContextMenu;
  if (before !== after) {
    syncContextMenus(after !== false);
  }
});

// Context menu click listener
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === 'job-autofill-run') {
    sendToTab(tab.id, { action: 'RUN_AUTOFILL' });
  } else if (info.menuItemId === 'job-autofill-preview') {
    sendToTab(tab.id, { action: 'RUN_PREVIEW' });
  } else if (info.menuItemId === 'job-autofill-settings') {
    chrome.runtime.openOptionsPage();
  }
});

// Chrome global keyboard command listener (Ctrl+Shift+F)
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'run-autofill') return;

  const profile = await ProfileStorage.getProfile();
  if (!profile.settings.enableKeyboardShortcut) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    sendToTab(tab.id, { action: 'RUN_AUTOFILL' });
  }
});
