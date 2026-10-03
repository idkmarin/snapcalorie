# SnapCalorie

SnapCalorie is a camera-first calorie tracking PWA for fast phone logging.

## Features

- Camera-first meal entry with mobile camera capture
- Manual meal entry for forgotten photos
- Calories remaining at the top of the app
- Editable daily calorie goal
- Swipe-up memories/history drawer
- Meal editing and deletion
- Local browser storage persistence
- Installable PWA support (manifest + service worker)

## Test on your phone

1. Clone this repository and serve it over HTTP/HTTPS from the repo root (for example: `python -m http.server 4173`).
2. Ensure your phone and computer are on the same network.
3. Open `http://<your-computer-ip>:4173` on your phone.
4. Add a meal using camera capture, then refresh to confirm local persistence.
5. Use **Add to Home Screen** from the browser menu to verify installability.

## Notes

- This project intentionally avoids Snapchat branding, logos, and proprietary UI.
- AI food recognition is planned for a future release; current calorie entry is manual.
