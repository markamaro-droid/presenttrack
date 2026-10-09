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
      robot.js                   three.js robot companion (needs THREE + GLTFLoader)
    assets/models/
      robot.glb                  source 3D model
      robot-glb.js               GENERATED base64 copy of robot.glb (lets file:// work)
    tools/embed_glb.py         regenerate robot-glb.js after changing robot.glb

## Notes
- Demo only: accounts and data live in memory and reset on reload.
- The only code change from the original single file: `robot.js` reads the model from
  `window.PT_ROBOT_GLB_B64` instead of a `<script id="glbdata">` block.
