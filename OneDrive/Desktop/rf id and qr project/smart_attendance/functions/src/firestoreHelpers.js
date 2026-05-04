// functions/src/firestoreHelpers.js
// ─────────────────────────────────────────────────────────────
// Reusable Firestore path builders and helper reads.
// No business logic here — only path construction and queries.
// ─────────────────────────────────────────────────────────────

const admin = require('firebase-admin');

const db = () => admin.firestore();

// ── Path builders ─────────────────────────────────────────────
const studentRef = (schoolId, studentId) =>
  db().collection('schools').doc(schoolId)
      .collection('students').doc(studentId);

const attendanceRecordRef = (schoolId, date, studentId) =>
  db().collection('schools').doc(schoolId)
      .collection('attendance').doc(date)
      .collection('records').doc(studentId);

const allRecordsRef = (schoolId, date) =>
  db().collection('schools').doc(schoolId)
      .collection('attendance').doc(date)
      .collection('records');

const settingsRef = (schoolId) =>
  db().collection('schools').doc(schoolId)
      .collection('settings').doc('config');

const allStudentsRef = (schoolId) =>
  db().collection('schools').doc(schoolId).collection('students');

// ── Helpers ────────────────────────────────────────────────────
async function getStudent(schoolId, studentId) {
  const functions = require('firebase-functions');
  const snap = await studentRef(schoolId, studentId).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', `Student ${studentId} not found.`);
  }
  return { id: snap.id, ...snap.data() };
}

async function getSettings(schoolId) {
  const snap = await settingsRef(schoolId).get();
  return snap.exists ? snap.data() : {
    morningCutoffHour: 12,
    schoolTimezone:    'Asia/Kolkata',
    attendanceThreshold: 75,
  };
}

function getTodayString(timezone = 'Asia/Kolkata') {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone }); // 'YYYY-MM-DD'
}

function getTimeSlot(timezone = 'Asia/Kolkata', cutoffHour = 12) {
  const hour = parseInt(
    new Date().toLocaleTimeString('en-IN', { timeZone: timezone, hour: '2-digit', hour12: false }),
    10
  );
  return hour < cutoffHour ? 'morning' : 'afternoon';
}

module.exports = {
  studentRef, attendanceRecordRef, allRecordsRef,
  settingsRef, allStudentsRef,
  getStudent, getSettings, getTodayString, getTimeSlot,
};
