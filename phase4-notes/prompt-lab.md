You are lane «lab» of GLYPHOS phase 4. Read /tmp/claude-0/-home-user-ASCII-Shader-Lab/c7654661-29b9-5e25-b7aa-7f9752113607/scratchpad/phase4/brief4.md completely first, then /tmp/claude-0/-home-user-ASCII-Shader-Lab/c7654661-29b9-5e25-b7aa-7f9752113607/scratchpad/phase4/architecture.md. BASE: bce83c5c3f107bf43e778672660e0a151c1986e8. Branch: ws/p4-lab. E2E port: 4196. Work autonomously to completion (no push); commit at milestones.

Parallel lanes build the new photo/video studio in src/project/**, src/fx/**, src/glyphs/** (do not touch those). Lane «core» may make a small additive change in src/studio/store.ts (the media garbage-collection «referenced» set: gcMedia/collectMedia) and src/studio/mediaStore.ts — do not edit those functions. A later lane adds the «Laboratorio ⇄ Foto y video» switch to the lab top bar: leave TopBar structure easy to extend (no need to add it yourself).

Your job — two things in the existing LAB (/studio/), both mandatory:

A. Camera: fix the «inverted» feeling, honestly and with preview = file.
   Today startCamera() (src/studio/media.ts) asks facingMode 'user' only; recipe.media.mirror defaults to false, so the
   front camera looks reversed compared with a phone's own camera app, while the file matches the preview.
   - When the camera starts and the active track is user-facing (track.getSettings().facingMode === 'user', or unknown on
     a desktop webcam → treat as user-facing), set mirror ON by default; rear camera ('environment') → mirror OFF. It is
     recipe-level (media.mirror), so the stage, stills, recordings, GIF/video and code exports all show the same thing.
     Respect a user's explicit choice: once they toggle «Espejo» for the camera, do not override it on restart in the same
     session (remember per facing mode).
   - Front/rear: a clear control to switch camera (facingMode user/environment; when enumerateDevices lists several
     video inputs, let the user pick the device; labels may be empty before permission — handle it). Keep the 44 px
     targets and Spanish copy (e.g. «Cámara frontal», «Cámara trasera», «Espejo: como te ves en el espejo»).
   - A short honest hint near the mirror toggle: what you see is what the file will be.
   - Tests: e2e with Chromium's fake camera (--use-fake-device-for-media-stream --use-fake-ui-for-media-stream, check how
     existing specs launch; add a project or per-spec launch options) proving: default mirror on for the front camera,
     the recording/still equals the stage orientation (compare an asymmetric frame: the fake stream has a moving
     pattern — or draw a marker), switching to rear turns mirror off, the user's toggle survives a restart. Unit tests for
     the pure decision function (facing → default mirror, user override memory).

B. The lab on a vertical phone (360–430 px wide, 640–932 px tall), without breaking tablet/desktop:
   - The art as big as possible (measure the stage's share of the viewport before/after at 360×740, 390×844, 430×932 and
     report the numbers), no clipped UI, no horizontal scroll.
   - Frequent actions within thumb reach at the bottom: Azar, anterior/siguiente, favorito, exportar, and a clear way to
     open controls. Section switching (the lab's spaces/tabs/panels) must be one tap and obvious; controls compact
     (bottom sheet with snap points or similar that never covers the piece for good: peek/half/full, drag handle, swipe
     down to close, the stage stays visible above the sheet at half).
   - Export flow comfortable on a phone (sheet, big targets, progress visible, share where supported).
   - An «inmersivo» toggle in the lab too: hides everything except the art + Azar/prev/next/«herramientas» (the photo
     studio will have the same idea; build it as a small reusable piece in src/studio/ui so it can be shared).
   - Respect safe areas (env(safe-area-inset-*)), landscape phones, reduced motion, keyboard/screen-reader access, 44 px.
   - Read the existing mobile specs (tests/e2e/*mobile*.spec.ts, layout*.spec.ts, touch-mobile, controls-mobile) and keep
     them green or update them only where the new design intentionally changes a behaviour (say which and why).
   - Take screenshots at 360×740, 390×844, 430×932 (+ landscape 844×390, tablet 820×1180, desktop 1440×900) before and
     after, READ them, iterate until it looks calm and excellent («Telar de precisión»). Put them under
     /tmp/claude-0/-home-user-ASCII-Shader-Lab/c7654661-29b9-5e25-b7aa-7f9752113607/scratchpad/phase4/shots/lab/.

Ownership: src/studio/** (lab UI, css, media.ts camera code), src/engine/recipe.ts only if a default must change (keep old
recipes identical: a recipe without the new field must render exactly as before), tests for them. At the end run the lab's
mobile + layout + a11y + export + data specs and the unit suite (PW_PORT=4196; workers=1) and report pass counts.
Final answer: the report described in the brief.
