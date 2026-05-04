# Smart Attendance Web

Plain HTML, CSS, and JavaScript demo web app for school attendance tracking.

The app is Firebase-ready, but runs with mock data until real Firebase config is added in `web/app.js`.

## Project Structure

```text
smart_attendance/
  web/
    index.html      # Main web app shell and views
    styles.css      # Responsive UI styling
    app.js          # Routing, mock data, scanner, Firebase-ready actions
  functions/
    index.js        # Cloud Functions exports
    src/
      markAttendance.js
      absentChecker.js
      generateQR.js
      smsService.js
      validators.js
      firestoreHelpers.js
  firebase.json
  firestore.rules
  firestore.indexes.json
  storage.rules
  .env.example
```

## Web Screens

- Dashboard
- QR scanner / manual QR payload
- Manual attendance entry
- Parent view
- Settings
- Sign-in dialog

## Run Locally

Open `web/index.html` directly in a browser for mock mode.

For camera permissions and production-like routing, serve the `web` folder with any static server:

```bash
python -m http.server 5174 --directory web
```

Then open:

```text
http://localhost:5174
```

## Firebase Setup

Detailed setup steps are in [`FIREBASE_SETUP.md`](FIREBASE_SETUP.md).

Quick version:

1. Create a Firebase project.
2. Enable Firebase Auth, Firestore, Functions, Storage, and Hosting.
3. Enable Email/Password sign-in in Firebase Auth.
4. Copy `.firebaserc.example` to `.firebaserc` and set your Firebase project ID.
5. Paste your web Firebase config into `web/app.js`.
6. Install Cloud Function dependencies:

```bash
cd functions
npm install
```

7. Set production secrets:

```bash
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_FROM_NUMBER
firebase functions:secrets:set QR_HMAC_SECRET
```

8. Deploy:

```bash
firebase deploy --only hosting,functions,firestore:rules,firestore:indexes,storage
```

## Firestore Shape

```text
schools/{schoolId}/
  students/{studentId}
  attendance/{YYYY-MM-DD}/records/{studentId}
  settings/config
  admins/{adminId}
```

## Notes

- `web/app.js` currently uses mock data when Firebase config contains placeholder values.
- The Cloud Functions still contain the original QR attendance, manual override, QR generation, and SMS logic.
- This folder no longer contains Flutter source or Android/iOS app setup.
