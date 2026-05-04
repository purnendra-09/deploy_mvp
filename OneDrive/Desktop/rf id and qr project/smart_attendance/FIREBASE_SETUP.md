# Firebase Setup

Use this checklist to connect the Smart Attendance web app to a real Firebase project.

## 1. Install Required Tools

Install Node.js LTS first. It includes `npm`.

Then install Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
```

## 2. Create Firebase Project

In Firebase Console:

1. Create a Firebase project.
2. Add a Web app.
3. Enable Authentication.
4. Enable Email/Password sign-in.
5. Create Firestore Database.
6. Enable Cloud Storage.
7. Enable Cloud Functions.
8. Enable Firebase Hosting.

## 3. Link This Repo To Your Firebase Project

Copy `.firebaserc.example` to `.firebaserc`, then replace `your-firebase-project-id`:

```json
{
  "projects": {
    "default": "your-real-project-id"
  }
}
```

You can also run:

```bash
firebase use --add
```

## 4. Paste Web App Config

In `web/app.js`, replace this block:

```js
const firebaseConfig = {
  apiKey: "YOUR_WEB_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_WEB_APP_ID",
};
```

Use the config from Firebase Console:

Project settings -> General -> Your apps -> Web app -> SDK setup and configuration.

## 5. Configure Auth Users

This project currently uses Firebase Email/Password login.

Create users in Firebase Authentication, then add custom claims using Firebase Admin SDK:

```js
await admin.auth().setCustomUserClaims(uid, {
  role: "admin",
  schoolId: "demo_school"
});
```

Supported roles in the backend:

- `admin`: can generate QR codes and manually override attendance
- `scanner`: can mark attendance using QR scan
- `parent`: can read linked student attendance
- `student`: can read their own data

## 6. Configure Secrets

Set these production secrets:

```bash
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_FROM_NUMBER
firebase functions:secrets:set QR_HMAC_SECRET
```

Use a long random value for `QR_HMAC_SECRET`.

## 7. Install Function Dependencies

```bash
cd functions
npm install
cd ..
```

## 8. Deploy

```bash
firebase deploy --only hosting,functions,firestore:rules,firestore:indexes,storage
```

After deployment, the app should switch from mock mode to live Firebase mode once `web/app.js` has real config values.
