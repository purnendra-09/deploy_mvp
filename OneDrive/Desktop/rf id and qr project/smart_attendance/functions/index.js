// functions/index.js
// ─────────────────────────────────────────────────────────────
// Single entry point for all Cloud Functions.
// To add a new function: create its file in src/, import here.
// Nothing else in this file changes.
// ─────────────────────────────────────────────────────────────

const admin = require('firebase-admin');
admin.initializeApp();

// ── Feature modules ───────────────────────────────────────────
const { markAttendance, manualAttendanceOverride } = require('./src/markAttendance');
const { absentChecker }  = require('./src/absentChecker');
const { generateQR }     = require('./src/generateQR');

// ── Exports ───────────────────────────────────────────────────
module.exports = {
  markAttendance,
  manualAttendanceOverride,
  absentChecker,
  generateQR,
};
