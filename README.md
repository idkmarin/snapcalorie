# SnapCalorie

SnapCalorie is a camera-first calorie tracking PWA for fast phone logging.

## Features

- Full-screen camera-first meal capture flow
- Explicit camera permission prompt and upload fallback
- Flashlight toggle (when supported by device/browser camera APIs)
- On-device AI-style food detection estimate after capture
- Improved quantity heuristics for countable foods (for example eggs and peas)
- Editable confirmation step for food names, quantities, and per-item macros
- Per-item and overall AI confidence scoring shown during confirmation and in memories
- Auto-updating calories remaining after confirmed meal save
- Swipe-up memories timeline with saved meal photos, date, macros, and expandable item details
- Local browser storage persistence for goals and confirmed meal memories
- Installable PWA support (manifest + service worker)

## Test on your phone

1. Clone this repository and serve it over HTTP/HTTPS from the repo root (for example: `python -m http.server 4173`).
2. Ensure your phone and computer are on the same network.
3. Open `http://<your-computer-ip>:4173` on your phone.
4. Capture a meal photo, review the AI estimate, confirm/edit items, then refresh to confirm persistence.
5. Use **Add to Home Screen** from the browser menu to verify installability.

## Notes

- This project intentionally avoids Snapchat branding, logos, and proprietary UI.
- AI detection is a lightweight on-device estimate intended for quick confirmation edits before saving.
