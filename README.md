# PresentTrack

Presentation-rehearsal demo app (login/register, practice room, reports, 3D robot guide).
Plain HTML/CSS/JS, no build step.

## Run
Open `index.html` in a browser, or serve the folder:

    python3 -m http.server 8000   # then visit http://localhost:8000

Internet access is needed for Google Fonts and three.js (loaded from CDN).

## Structure
    index.html                 page markup + script/style includes
    css/                       loaded in this order (cascade matters)
      base.css                   theme tokens, reset, page shell
      hero.css                   left hero panel
      auth.css                   login/register card
      tour-demo.css              20-second product-tour player on the login page
      app-shell.css              dashboard base components (sidebar, panels, tables, modal)
      landing.css                welcome page, page-wipe transition, robot dock position
      clay.css                   claymorphism theme for the dashboard
      dashboard.css              dashboard pages, charts, top bar
      tour-guide.css             guided-tour bar, spotlight, robot controls
    js/                        classic scripts, loaded in this order (they share globals like $ and podium)
      auth.js                    tabs, validation, login/register, theme toggle
      water.js                   WebGL water-ripple background
      hero-tour-demo.js          scripted looping demo on the login page
      dashboard.js               app state, views, practice flow, guided tour, robot commands
      config.js                  Supabase URL + publishable key (empty = demo mode)
      cloud.js                   Supabase Auth + cloud save (loads before auth.js)
      robot.js                   three.js robot companion (needs THREE + GLTFLoader)
    assets/models/
      robot.glb                  source 3D model
      robot-glb.js               GENERATED base64 copy of robot.glb (lets file:// work)
    sql/schema.sql             run once in Supabase SQL Editor (table + Row Level Security)
    tools/embed_glb.py         regenerate robot-glb.js after changing robot.glb

## Supabase (real accounts + saved data)
1. Create a project at supabase.com.
2. SQL Editor -> paste `sql/schema.sql` -> Run.
3. Project Settings -> API: copy the Project URL and the publishable (or anon) key into `js/config.js`.
4. Authentication -> URL Configuration: set Site URL to your Vercel URL (and add it to Redirect URLs).
5. (Optional, for quick testing) Authentication -> Sign In / Providers -> Email: turn off "Confirm email".
6. Commit + push; Vercel redeploys.
Never put the secret / service_role key in the frontend.

## Robot controls
- Tap (or press Enter on) the robot: shows the speaker, Guide me and Minimize buttons. They hide again after 8 s, on a second tap, or when you tap elsewhere.
- Press and hold the robot (about 0.2 s), or hold Space / T: talk to it.
- During the guided tour, the arrow at the end of the control bar collapses Back / Pause / Next / Skip tour / CC (and the subtitle strip) into a single small arrow.

## Notes
- With `js/config.js` empty the app runs in demo mode: accounts and data live in memory and reset on reload.
- App state (presentations, sessions, notifications, goals) is saved as one JSON row per user in `user_data`
  (autosave every few seconds when something changed, and on sign out). Uploaded file contents are not stored yet,
  only name/size.
- Changes vs the original single file: `robot.js` reads the model from `window.PT_ROBOT_GLB_B64`; `auth.js` and
  `dashboard.js` have small `PTCloud` branches (search for `PTCloud`).
