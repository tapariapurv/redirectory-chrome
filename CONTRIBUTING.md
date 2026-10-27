# Contributing

Thanks for helping make Redirectory better.

## Setup

No build step. Load the folder as an unpacked extension (`chrome://extensions` → Developer mode → Load unpacked) and reload it after changes.

```bash
npm install          # only needed for the Playwright tests
npm test             # unit tests (node:test, no browser)
npm run test:e2e     # loads the real extension in Chromium
npm run screenshots  # regenerates docs/screenshots
```

## Guidelines

- Keep it dependency-free at runtime: plain ES modules, no bundler.
- Pure logic goes in `src/lib/` with unit tests; anything touching navigation or the UI gets an E2E test in `tests/e2e/`.
- Friction is the product. Changes that make blocking easier to bypass need a strong reason.
- Nothing leaves the user's browser except icon lookups. Don't add analytics or remote calls.

## Adding a brand logo

Drop the SVG from [simple-icons](https://simpleicons.org) into `src/assets/brands/<slug>.svg` and add an entry with its domains and colour to `src/lib/brands.js`. The unit tests check that every entry has a file.
