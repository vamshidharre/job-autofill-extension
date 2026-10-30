# Job Autofill — Local Application Assistant

A local-first Chrome/Edge extension that learns answers while you complete job applications and reuses them on later forms.

## Features

- Remember radio buttons, dropdown choices, availability dates, and screening answers.
- Reuse saved answers automatically, independently of general profile autofill.
- Match fields through English/German labels, accessible names, and site adapters for Workday, Tesla, Greenhouse, Lever, and Personio.
- Recognize multi-step forms, changed field IDs, delayed dropdown options, and hidden steps.
- Keep site-specific choices and reusable answers in `chrome.storage.local`.
- Preview autofill, highlight populated fields, and clear filled values.
- Never submit applications automatically.
- Export/import profiles and download a local troubleshooting report that excludes answer values.

The bundled profile is **fictional demo data**. Configure your own information in Settings before enabling profile autofill. Real profiles, learned answers, and application history belong in local browser storage and are not included in this repository. No external inference service or analytics is used.

## Build and install

Requires Node.js and npm.

```sh
npm ci
npm run build
```

1. Open Chrome's or Edge's Extensions page.
2. Enable Developer mode.
3. Choose **Load unpacked** and select the generated `dist` directory.
4. Open the extension's Settings to review the demo profile and enter your own details.

To update an existing installation, rebuild and reload the same extension from the same directory, then refresh application tabs. Removing an extension removes its browser-local data; export your profile when you need a portable backup.

## Learn and reuse

On a recognized application form, select or enter an answer yourself. With Learning mode enabled, the extension stores the answer and any site-specific choice. Saved answers take priority over built-in defaults and are reused on later application forms.

General profile autofill is a separate opt-in. Automatic reuse of saved answers can be paused in Settings without deleting memory. Checkbox choices, including consent, are reused only after an explicit choice for the same question and site. Applications are never submitted automatically.

The popup shows the loaded version. If a page is missed, use **Having trouble with this page? → Download page report** to inspect recognized questions and memory matches. Answer values, personal profile values, query parameters, and option IDs are excluded from that report.

## Development

```sh
npm run dev        # Watch and rebuild the extension
npm run typecheck  # TypeScript validation
npm test          # Automated regression tests
npm run check     # TypeScript + tests + production build
```

The optional browser regressions require Python, Playwright, and Microsoft Edge:

```sh
python -m pip install playwright
npm run test:browser
```

Browser regressions use isolated browser contexts, simulated extension storage, and locally intercepted pages. They do not open a personal browser profile or submit real applications.

## Source layout

| Directory | Purpose |
| --- | --- |
| `src/content` | Detection, matching, learning, filling, and portal adapters |
| `src/storage` | Profile persistence, serialized updates, and demo data |
| `src/background` | Background worker and cross-tab storage coordination |
| `src/popup` | Extension popup and page troubleshooting |
| `src/options` | Profile and behavior settings |
| `tests` | Automated regressions |
| `scripts` | Icon generation and isolated browser regressions |
| `test-pages` | Sample application form |

Matching uses rules and saved answers. Custom widgets and ambiguous wording can still need manual review; the presence of a supported portal adapter does not guarantee every form variant is handled.
