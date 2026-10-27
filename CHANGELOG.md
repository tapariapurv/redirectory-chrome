# Changelog

## 1.1.0 — 2026-10-27

### Added
- **Rest of today**: continue to a blocked site until midnight, alongside 5/15/30 minutes. Existing installs get the option automatically.
- **Real logos everywhere**: official brand marks for task apps (Notion, Todoist, TickTick, Google Tasks, Google Calendar, Linear, Asana, Trello, ClickUp) and 40+ popular sites; real favicons, fetched once and cached, for everything else.
- **Themes**: Ember, Ocean, Forest, Grape, Rose and Mono, each in light and dark, or following the system. Applied before first paint, so no flash.
- **Keyboard shortcuts**: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> blocks the current site; <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> opens the popup.
- Bundled Inter typeface for consistent rendering on every OS.
- Smoother motion: soft cross-fades on list changes and panel switches (clicks are never blocked), exit fade when continuing to a site.
- Project website, privacy policy, CI, and contribution guide.

### Fixed
- Blocked sites showed Redirectory's own icon instead of theirs. Chrome links favicons across redirects, so its favicon cache is no longer used.

### Changed
- Removed the `favicon` permission.

## 1.0.0 — 2026-10-26

First release: block list with subdomain and path matching, quick lists, block page with gated continue and focus panel (built-in tasks or embedded task apps), allowances that re-block when they end, pause, insights, backup.
