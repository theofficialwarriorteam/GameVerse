// GAMEVERSE Firebase configuration

export const firebaseConfig = {
  apiKey: "AIzaSyDoiSP6Ejey1dHyawKPQE1cMf2IYyd8HA0",
  authDomain: "gameverse-5f25c.firebaseapp.com",
  projectId: "gameverse-5f25c",
  storageBucket: "gameverse-5f25c.firebasestorage.app",
  messagingSenderId: "677494510255",
  appId: "1:677494510255:web:b2cc52e92b8f978898ba5a",
  measurementId: "G-WLTMHPXZHG"
};

// Authorized administrator
export const ADMIN_EMAIL = "aanjorajeev@gmail.com";

// Firebase configuration status
export const FIREBASE_CONFIGURED = !Object.values(firebaseConfig).some(
  value => String(value).startsWith("PASTE_")
);
// Optional default image host (Cloudinary "unsigned" upload preset).
// Can also be set from Admin → Image Library & Hosting. No secret keys belong here.
export const IMAGE_HOST = {
  provider: "cloudinary",
  cloudName: "opgoefim",
  uploadPreset: "gameverse_upload",
  folder: "gameverse"
};
