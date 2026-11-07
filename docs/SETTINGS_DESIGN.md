# Settings redesign

The Settings module now uses five compact, responsive sections: Profile,
Account & Security, Appearance, Coaching Preferences, and Data & Privacy.
Section links support keyboard focus and reduced-motion preferences. Existing
purple tokens, icons, workspace shell, history navigation and guided tour remain.

## Controls and persistence

- Name: saves through Supabase Auth `updateUser` and updates the account header.
- Photo: validates JPG/PNG/WebP ≤2 MB, crops/resizes to 192×192 JPEG, previews
  locally, and saves only on **Save profile**. Remove follows the same save flow.
- Photo and voice: saved under `user_data.data.settings` by the existing
  authenticated snapshot save; restored on sign-in. No schema change. Demo
  accounts retain these settings only within the current page session.
- Theme: Light, Dark or System, persisted on this browser with localStorage.
  If storage is blocked, the UI explains that the change is temporary.
- Password reset: existing Supabase email recovery method and recovery handler.
  Requires a cloud account and the existing valid Auth redirect/email setup.
- Sign out: uses the existing application sign-out flow.
- Export: downloads the current saved workspace as JSON (including transcripts,
  results and settings); excludes authentication tokens and provider credentials.
- Report export: opens existing History, with its filtered CSV and report links.
- Voice and profile failures do not report success. Account identity is checked
  after asynchronous writes before applying the response locally.

No account-deletion control, fake email-reminder toggle, password field or
decorative chart was added. Email is displayed as account information rather
than an editable field that would misrepresent a login-email change.

## References reviewed

- [Mobbin settings examples](https://mobbin.com/blog/how-to-use-mobbin-mcp):
  section navigation and descriptions explaining the effect of a setting.
- [NN/g application design showcase](https://media.nngroup.com/media/reports/free/Application_Design_Showcase_1st_edition.pdf):
  categorized account/preferences settings and explicit save controls.
- [Supabase updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser)
  and [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail):
  existing API contracts used for profile and reset actions.

## Validation

Automated tests cover section availability, preference restoration/account
isolation, successful and failed saves, late responses after account changes,
and rejection of unsafe stored image URLs. Local browser checks cover profile
editing, theme selection, voice persistence and 390px layout without horizontal
page overflow. Build verification excludes secrets from public output.

Production password-email delivery and live Supabase writes were not exercised;
browser checks used isolated fixtures. No new environment variables or SQL
migration are required. Deploy the frontend assets together.
