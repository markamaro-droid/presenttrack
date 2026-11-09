# Royal Blue & Gold interface

Phone-specific layout rules live in `css/mobile.css`, loaded after the shared design system. They apply below 768px, with additional narrow-phone and landscape rules. Shared tokens and desktop module styles remain in their existing files; no browser sniffing or separate application markup is required.

Mobile validation: Chrome touch/phone emulation at 320, 360, 390, 412, and 767px, plus a 1440px desktop regression check. Twelve workspace navigation targets and authentication were checked for document, content, and header overflow. These checks use empty preview state, retain access gates, and do not substitute for real Android hardware testing. `tools/check-companion-ui.mjs` runs these checks along with the companion controls; set `UI_SCREENSHOT` to save the 390px dashboard preview.

`css/design-system.css` is the shared visual system, loaded after component and responsive styles. It owns light/dark theme colors, spacing, typography, surfaces, controls, navigation, and page treatments. Existing `--cs`, `--b2`, and `--clay-*` names are compatibility aliases; new styles should use the semantic tokens (`--panel`, `--brand`, `--ink`, `--line`, etc.). The legacy clay stylesheet is retained as an empty compatibility entry.

- Primary: royal blue `#1D4ED8`; emphasis: deep blue `#1E40AF`.
- Milestones: gold `#F59E0B` with navy text; warning copy uses a darker accessible amber in light mode.
- Light surfaces: ice blue `#EFF6FF`, white cards, navy `#111827` text.
- Dark surfaces: navy backgrounds, lighter navy cards, brighter link text and semantic status colors.
- Inter typography; 8px spacing tokens; 16px cards, 10px controls, 18px dialogs.
- Existing system theme detection and saved appearance preference remain intact.
- Focus indicators, 44px primary control targets, and reduced-motion rules apply globally.

The changes are confined to HTML font/stylesheet loading and CSS. Authentication, API configuration, database access, calculations, recording, routes, and the robot model are unchanged.

## Verification

- 120 application tests passed.
- 25 assessment tests passed.
- Production asset build passed.
- Headless Chrome: authentication and 12 workspace navigation targets checked at 1440, 768, and 390px in both themes (78 combinations); no document-level horizontal overflow or JavaScript exceptions. Checks used empty, in-memory preview state and did not write account data. Gated views retain their existing access behavior.
- Desktop dashboard screenshot visually inspected.
- Live authentication, recording, upload, and AI provider calls were not exercised; those require an authenticated account and device permissions. Automated layout checks do not constitute a complete accessibility audit.
