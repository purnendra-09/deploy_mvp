// functions/src/markAttendance.js
// ─────────────────────────────────────────────────────────────
// Core QR scan handler. Called by the web app via httpsCallable.
// Also used by manual override with a different input path.
// ─────────────────────────────────────────────────────────────

const functions  = require('firebase-functions');
const admin      = require('firebase-admin');
const { validateQRToken, validateManualEntry } = require('./validators');
const {
  getStudent, getSettings,
  attendanceRecordRef, studentRef,
  getTodayString, getTimeSlot,
} = require('./firestoreHelpers');
const { sendPresentSMS, sendManualOverrideSMS } = require('./smsService');

// ── QR Scan (Web Scanner) ─────────────────────────────────────
const markAttendance = functions
  .region('asia-south1')
  .https.onCall(async (data, context) => {
    // 1. Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required.');
    }
    const claims = context.auth.token;
    if (!['admin', 'scanner'].includes(claims.role)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin or scanner role required.'
      );
    }

    // 2. Validate QR token → extract studentId + schoolId
    const { studentId, schoolId } = validateQRToken(data.token);
    if (claims.schoolId !== schoolId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'QR belongs to a different school.'
      );
    }

    // 3. Fetch student
    const student  = await getStudent(schoolId, studentId);

    // 4. Get settings & determine time slot
    const settings = await getSettings(schoolId);
    const today    = getTodayString(settings.schoolTimezone);
    const slot     = getTimeSlot(settings.schoolTimezone, settings.morningCutoffHour);
    const slotField = slot === 'morning' ? 'entryTime' : 'afternoonTime';

    const recordRef = attendanceRecordRef(schoolId, today, studentId);

    // 5. Atomic transaction: duplicate check + write
    await admin.firestore().runTransaction(async (t) => {
      const snap = await t.get(recordRef);

      if (snap.exists && snap.data()[slotField]) {
        throw new functions.https.HttpsError(
          'already-exists',
          `${slot} attendance already marked for ${student.name}.`
        );
      }

      const now        = admin.firestore.FieldValue.serverTimestamp();
      const isPresent  = slot === 'afternoon' && snap.exists && snap.data()?.entryTime;
      const newStatus  = isPresent ? 'present' : slot === 'morning' ? 'present' : 'partial';

      t.set(recordRef, {
        studentId,
        date:           today,
        [slotField]:    now,
        status:         newStatus,
        markedBy:       'qr',
        smsSent:        false,
        absentNotified: false,
        smsRetryCount:  0,
      }, { merge: true });

      // Update attendance percentage on student doc atomically
      const stuRef    = studentRef(schoolId, studentId);
      const stuSnap   = await t.get(stuRef);
      const stuData   = stuSnap.data() || {};
      const attended  = (stuData.daysAttended  || 0) + (slot === 'morning' ? 1 : 0);
      const total     = stuData.totalWorkingDays || 1;
      const percent   = Math.round((attended / total) * 100 * 10) / 10;
      t.update(stuRef, { daysAttended: attended, attendancePercent: percent });
    });

    // 6. Send SMS async (don't block response)
    sendPresentSMS({
      parentPhone:  student.parentPhone,
      studentName:  student.name,
      slot,
    }).then(({ success }) => {
      if (!success) {
        recordRef.update({ smsSent: false, smsRetryCount: admin.firestore.FieldValue.increment(1) });
      } else {
        recordRef.update({ smsSent: true });
      }
    });

    // 7. FCM push to admin devices
    admin.messaging().sendToTopic('admins', {
      notification: {
        title: 'Attendance Marked',
        body:  `${student.name} — ${slot} present`,
      },
      data: { studentId, slot, date: getTodayString(settings.schoolTimezone) },
    }).catch((err) => console.error('[FCM] Admin push failed:', err));

    return { success: true, student: student.name, slot, status: 'present' };
  });

// ── Manual Override (Web Admin Portal) ────────────────────────
const manualAttendanceOverride = functions
  .region('asia-south1')
  .https.onCall(async (data, context) => {
    // Auth + role check
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required.');
    }
    const claims = context.auth.token;
    if (claims.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin role required.');
    }

    validateManualEntry(data);
    const { studentId, date, slot, status } = data;
    const schoolId  = claims.schoolId;
    const student   = await getStudent(schoolId, studentId);
    const slotField = slot === 'morning' ? 'entryTime' : 'afternoonTime';
    const recordRef = attendanceRecordRef(schoolId, date, studentId);

    await recordRef.set({
      studentId,
      date,
      [slotField]: admin.firestore.FieldValue.serverTimestamp(),
      status,
      markedBy: `admin:${context.auth.uid}`,
      smsSent:  false,
      absentNotified: false,
      smsRetryCount: 0,
    }, { merge: true });

    // SMS for manual override
    await sendManualOverrideSMS({
      parentPhone: student.parentPhone,
      studentName: student.name,
      status,
    });

    return { success: true };
  });

module.exports = { markAttendance, manualAttendanceOverride };
