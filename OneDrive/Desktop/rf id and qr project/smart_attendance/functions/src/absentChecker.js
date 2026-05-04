// functions/src/absentChecker.js
// ─────────────────────────────────────────────────────────────
// Scheduled function: runs at 10:05 AM IST every weekday.
// Finds students with no morning entry and sends absent SMS.
// ─────────────────────────────────────────────────────────────

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const { sendAbsentSMS } = require('./smsService');
const {
  allStudentsRef, allRecordsRef,
  getSettings, getTodayString,
} = require('./firestoreHelpers');

const absentChecker = functions
  .region('asia-south1')
  .pubsub
  .schedule('5 10 * * 1-5')        // 10:05 AM, Mon–Fri
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    console.log('[AbsentChecker] Starting run...');

    // Fetch all schools (multi-tenant support for future stages)
    const schoolsSnap = await admin.firestore().collection('schools').get();

    for (const schoolDoc of schoolsSnap.docs) {
      const schoolId = schoolDoc.id;
      try {
        await _processSchool(schoolId);
      } catch (err) {
        console.error(`[AbsentChecker] Error for school ${schoolId}:`, err);
      }
    }

    console.log('[AbsentChecker] Run complete.');
    return null;
  });

async function _processSchool(schoolId) {
  const settings = await getSettings(schoolId);
  const today    = getTodayString(settings.schoolTimezone);

  // Fetch all students and today's records in parallel
  const [studentsSnap, recordsSnap] = await Promise.all([
    allStudentsRef(schoolId).get(),
    allRecordsRef(schoolId, today).get(),
  ]);

  // Build set of students who already have a morning entry
  const presentIds = new Set(
    recordsSnap.docs
      .filter((d) => d.data().entryTime != null)
      .map((d) => d.id)
  );

  // Find absent students who haven't been notified yet
  const absentStudents = studentsSnap.docs.filter(
    (d) => !presentIds.has(d.id) &&
           !recordsSnap.docs.find((r) => r.id === d.id && r.data().absentNotified)
  );

  console.log(`[AbsentChecker] School ${schoolId}: ${absentStudents.length} absent students`);

  const db    = admin.firestore();
  const batch = db.batch();

  // Send SMS and update records in batch
  await Promise.all(absentStudents.map(async (stuDoc) => {
    const stu      = stuDoc.data();
    const recordRef = db.collection('schools').doc(schoolId)
      .collection('attendance').doc(today)
      .collection('records').doc(stuDoc.id);

    // Send absent SMS
    const { success } = await sendAbsentSMS({
      parentPhone: stu.parentPhone,
      studentName: stu.name,
    });

    // Create / update the attendance record
    batch.set(recordRef, {
      studentId:      stuDoc.id,
      date:           today,
      status:         'absent',
      markedBy:       'scheduler',
      smsSent:        success,
      absentNotified: true,
      smsRetryCount:  success ? 0 : 1,
      entryTime:      null,
      afternoonTime:  null,
    }, { merge: true });
  }));

  await batch.commit();

  // FCM push to admins with summary
  if (absentStudents.length > 0) {
    await admin.messaging().sendToTopic('admins', {
      notification: {
        title: 'Absent Students Alert',
        body:  `${absentStudents.length} student(s) absent today (${today})`,
      },
      data: { type: 'absent_summary', date: today, count: String(absentStudents.length) },
    }).catch((err) => console.error('[FCM] Absent push failed:', err));
  }
}

module.exports = { absentChecker };
