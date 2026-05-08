// ══════════════════════════════════════════════════════════════════════════════
//  Firebase Configuration — Book Tracker
// ══════════════════════════════════════════════════════════════════════════════
//
//  SETUP (one-time, ~5 minutes):
//
//  1. Go to https://console.firebase.google.com/
//  2. Click "Add project" → give it a name (e.g. "book-tracker") → Continue
//  3. Disable Google Analytics if you don't need it → Create project
//  4. Click the </> Web icon to add a Web App → register it → copy the config below
//  5. In the left sidebar: Build → Firestore Database
//       → Create database → Start in production mode → choose a region → Enable
//  6. In Firestore: click "Rules" tab and replace the rules with:
//
//       rules_version = '2';
//       service cloud.firestore {
//         match /databases/{database}/documents {
//           match /users/{uid}/books/{bookId} {
//             allow read, write: if request.auth != null && request.auth.uid == uid;
//           }
//         }
//       }
//
//       Then click Publish.
//
//  7. In the left sidebar: Build → Authentication
//       → Get started → Sign-in method → Google → Enable → Save
//
//  8. Replace the placeholder values below with your actual config and push to GitHub.
//
//  NOTE: Firebase web API keys are safe to commit publicly — access is controlled
//  by the Firestore Security Rules you set in step 6, not by the key itself.
//
// ══════════════════════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDKk8H0AaVOBqXJPa78hQLBknlFwToim2I",
  authDomain:        "book-tracker-9a8cf.firebaseapp.com",
  projectId:         "book-tracker-9a8cf",
  storageBucket:     "book-tracker-9a8cf.firebasestorage.app",
  messagingSenderId: "844507556614",
  appId:             "1:844507556614:web:461033da946caa19544c87",
  measurementId:     "G-XNHJXD9G35",
};
