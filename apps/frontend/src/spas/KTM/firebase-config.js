// Paste your own Firebase web app config here.
// Firebase console -> Project settings -> Your apps -> Web app -> SDK setup and configuration.
// Use a NEW Firebase project for the kanban (see BUILD_SPEC.md section 5.2).
const firebaseConfig = {
    apiKey: "AIzaSyBcUxhdbSwqxbuhgOv5dM5Y-92-OmIAht8",
    authDomain: "mytaskmanager-a9bd6.firebaseapp.com",
    projectId: "mytaskmanager-a9bd6",
    storageBucket: "mytaskmanager-a9bd6.firebasestorage.app",
    messagingSenderId: "187803680538",
    appId: "1:187803680538:web:49d258725eb023cc6176a3",
    measurementId: "G-N9NGSYLMRQ"
  };

// Google OAuth Web client ID, used only for the Calendar-scoped token request
// (Google Identity Services, not Firebase Auth). Firebase console -> Authentication
// -> Sign-in method -> Google -> "Web SDK configuration" -> Web client ID.
// Not a secret — this is a public identifier, safe to ship client-side.
const GOOGLE_OAUTH_CLIENT_ID = "187803680538-dvg3l587vigrkcv65os7lunjmgkjrprq.apps.googleusercontent.com";
