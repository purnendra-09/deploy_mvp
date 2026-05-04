import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, where, orderBy, doc, deleteDoc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCsiFFAxDZr9p7LJWNL1q3JGv5WUzTCWDQ",
  authDomain: "rfid-qr-id-attendance.firebaseapp.com",
  projectId: "rfid-qr-id-attendance",
  storageBucket: "rfid-qr-id-attendance.firebasestorage.app",
  messagingSenderId: "796822823876",
  appId: "1:796822823876:web:eeaca5e2f0df69345fba91",
  measurementId: "G-RBFE9GG522",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── State ──
let currentCameraStream = null;
let currentScanTimer = null;
const state = { students: [], classes: [], attendance: [] };
const filterState = { status: "all" };
let selectedStudents = [];
const qrSettings = {
  size: 5,
  darkness: 'standard',
  showName: true,
  showClass: true,
  showRoll: true
};

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  bindAuth();
  bindNavigation();
  bindHamburger();
  bindStudentForm();
  bindClassForm();
  bindScanner();
  bindAttendanceFilters();
  bindLabelPrinting();
  bindQrConfig();
  document.getElementById("attendanceDateFilter").value = todayStr();
});

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════
// 1. AUTH
// ═══════════════════════════════════════════
function bindAuth() {
  document.getElementById("loginBtn").addEventListener("click", () => handleAuth(false));
  document.getElementById("registerBtn").addEventListener("click", () => handleAuth(true));
  document.getElementById("logoutBtn").addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, (user) => {
    if (user) {
      document.getElementById("authView").style.display = "none";
      document.getElementById("appShell").style.display = "grid";
      document.getElementById("userEmailDisplay").textContent = user.email;
      document.getElementById("profileEmail").textContent = user.email;
      document.getElementById("profileName").textContent = user.email.split("@")[0];
      document.getElementById("profileAvatar").textContent = user.email.charAt(0).toUpperCase();
      startRealtimeListeners();
    } else {
      document.getElementById("authView").style.display = "flex";
      document.getElementById("appShell").style.display = "none";
    }
  });
}

async function handleAuth(isRegister) {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const r = document.getElementById("authResult");
  try {
    if (isRegister) await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    r.textContent = e.message;
    r.className = "inline-result error";
  }
}

// ═══════════════════════════════════════════
// 2. NAVIGATION
// ═══════════════════════════════════════════
function navigateTo(route) {
  document.querySelectorAll(".nav__item").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));

  const btn = document.querySelector(`.nav__item[data-route="${route}"]`);
  if (btn) btn.classList.add("active");
  const view = document.getElementById(route);
  if (view) view.classList.add("active");

  const titles = {
    dashboard: "Dashboard", students: "Students", classes: "Classes",
    scanner: "Scanner", attendance: "Attendance", profile: "Profile",
    about: "About Us", studentDetail: "Student Details", classDetail: "Class Details"
  };
  document.getElementById("pageTitle").textContent = titles[route] || route;
  document.getElementById("pageSubtitle").textContent =
    route === "dashboard" ? "Overview of system activities." : `Viewing ${titles[route] || route} Module`;

  // Close hamburger on mobile
  closeSidebar();
}

function bindNavigation() {
  document.querySelectorAll(".nav__item").forEach(btn => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.route));
  });
  document.getElementById("backToStudents").addEventListener("click", () => navigateTo("students"));
  document.getElementById("backToClasses").addEventListener("click", () => navigateTo("classes"));
}

// ═══════════════════════════════════════════
// 3. HAMBURGER MENU (REQ 2)
// ═══════════════════════════════════════════
function bindHamburger() {
  const hamburger = document.getElementById("hamburgerBtn");
  const overlay = document.getElementById("sidebarOverlay");
  hamburger.addEventListener("click", () => {
    document.getElementById("sidebar").classList.add("open");
    overlay.classList.add("open");
  });
  overlay.addEventListener("click", closeSidebar);
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("open");
}

// ═══════════════════════════════════════════
// 4. STUDENT MANAGEMENT
// ═══════════════════════════════════════════
function showQRCode(name, studentId) {
  const qrContainer = document.getElementById("qrContainer");
  qrContainer.innerHTML = `
    <h3>${name}'s QR Code</h3>
    <div id="qrDraw" style="margin-bottom:10px;"></div>
    <p class="muted">Student ID: ${studentId}</p>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button class="button button--primary" onclick="window.__printQR('${name}','${studentId}')">Print QR</button>
      <button class="button button--outline" onclick="window.__downloadQR()">Download QR</button>
    </div>`;
  new QRCode(document.getElementById("qrDraw"), { text: studentId, width: 160, height: 160 });
  qrContainer.scrollIntoView({ behavior: "smooth" });
}

// REQ 5: Print + Download
window.__printQR = function (name, studentId) {
  const student = state.students.find(s => s.id === studentId);
  const cls = student ? state.classes.find(c => c.id === student.classId) : null;
  document.getElementById("printStudentName").textContent = name;
  document.getElementById("printStudentMeta").textContent =
    `Roll: ${student?.rollNo || "N/A"} | Class: ${cls?.name || "N/A"}`;
  document.getElementById("printStudentId").textContent = `ID: ${studentId}`;
  const qrCanvas = document.querySelector("#qrDraw canvas") || document.querySelector("#sdQrDraw canvas");
  const printImg = document.getElementById("printQrImage");
  printImg.innerHTML = "";
  if (qrCanvas) {
    const img = document.createElement("img");
    img.src = qrCanvas.toDataURL();
    img.style.width = "200px";
    img.style.height = "200px";
    printImg.appendChild(img);
  }
  document.body.classList.add("print-single");
  window.print();
  document.body.classList.remove("print-single");
};

window.__downloadQR = function () {
  const canvas = document.querySelector("#qrDraw canvas") || document.querySelector("#sdQrDraw canvas");
  if (!canvas) return;
  const link = document.createElement("a");
  link.download = "qr-code.png";
  link.href = canvas.toDataURL();
  link.click();
};

function bindStudentForm() {
  const form = document.getElementById("addStudentForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("studName").value.trim();
    const rollNo = document.getElementById("studRoll").value.trim();
    const classId = document.getElementById("studClass").value.trim();
    if (!classId) return;
    try {
      const docRef = await addDoc(collection(db, "students"), {
        name, rollNo, classId, ownerId: auth.currentUser.uid
      });
      await setDoc(docRef, { qrCode: docRef.id }, { merge: true });
      document.getElementById("studResult").textContent = "Student created!";
      document.getElementById("studResult").className = "inline-result ok";
      showQRCode(name, docRef.id);
      form.reset();
    } catch (err) {
      document.getElementById("studResult").textContent = err.message;
      document.getElementById("studResult").className = "inline-result error";
    }
  });
}

// REQ 6: Student Actions
function renderStudents() {
  const container = document.getElementById("studentListContainer");
  container.innerHTML = "";
  if (state.students.length === 0) {
    container.innerHTML = "<p class='muted'>No students found. Add your first student above.</p>";
    updateSelectionUI();
    return;
  }

  state.students.forEach(student => {
    const cls = state.classes.find(c => c.id === student.classId);
    const clsName = cls ? cls.name : "—";
    const isChecked = selectedStudents.includes(student.id);

    const row = document.createElement("article");
    row.className = "record";
    row.innerHTML = `
      <label class="student-checkbox" onclick="event.stopPropagation()">
        <input type="checkbox" data-student-id="${student.id}" ${isChecked ? "checked" : ""} />
      </label>
      <div class="avatar">${student.name.charAt(0).toUpperCase()}</div>
      <div class="record__info">
        <strong class="record__name">${student.name}</strong>
        <span class="record__meta">Roll: ${student.rollNo} · ${clsName}</span>
      </div>
      <div class="record__actions">
        <button class="button button--primary" data-action="qr">View QR</button>
        <button class="button button--outline" data-action="details">Details</button>
        <button class="button button--danger" data-action="remove">Remove</button>
      </div>`;

    row.querySelector('input[type="checkbox"]').addEventListener("change", (e) => {
      toggleStudentSelection(student.id, e.target.checked);
    });
    row.querySelector('[data-action="qr"]').onclick = () => showQRCode(student.name, student.id);
    row.querySelector('[data-action="details"]').onclick = () => openStudentDetail(student.id);
    row.querySelector('[data-action="remove"]').onclick = async () => {
      if (confirm(`Remove ${student.name}?`)) await deleteDoc(doc(db, "students", student.id));
    };
    container.appendChild(row);
  });

  // Clean up selected students that no longer exist
  selectedStudents = selectedStudents.filter(id => state.students.some(s => s.id === id));
  updateSelectionUI();

  document.getElementById("dashTotalStudents").textContent = state.students.length;
  document.getElementById("profileStudents").textContent = state.students.length;
}

// ═══════════════════════════════════════════
// QR LABEL PRINTING SYSTEM
// ═══════════════════════════════════════════
function bindLabelPrinting() {
  document.getElementById("selectAllStudents").addEventListener("change", (e) => {
    toggleSelectAll(e.target.checked);
  });
  document.getElementById("printSelectedLabelsBtn").addEventListener("click", openQrConfig);
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// QR CONFIGURATION & PREVIEW
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
function bindQrConfig() {
  const modal = document.getElementById("qrConfigModal");
  const closeBtn = document.getElementById("closeConfigBtn");
  const cancelBtn = document.getElementById("cancelPrintBtn");
  const confirmBtn = document.getElementById("confirmPrintBtn");

  const inputs = {
    qrSize: document.querySelectorAll('input[name="qrSize"]'),
    darkness: document.getElementById("qrDarkness")
  };

  closeBtn.onclick = cancelBtn.onclick = () => modal.classList.remove("active");
  confirmBtn.onclick = confirmPrint;

  inputs.qrSize.forEach(r => r.onchange = (e) => {
    qrSettings.size = parseFloat(e.target.value);
  });

  inputs.darkness.onchange = (e) => { qrSettings.darkness = e.target.value; };
}

function openQrConfig() {
  if (selectedStudents.length === 0) return;
  document.getElementById("qrConfigModal").classList.add("active");
}

function generateQrImage(text) {
  return new Promise((resolve) => {
    const tempDiv = document.createElement("div");
    new QRCode(tempDiv, {
      text: text,
      width: 512, // High resolution output >= 500px
      height: 512,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: qrSettings.darkness === 'extra' ? QRCode.CorrectLevel.H : QRCode.CorrectLevel.M
    });
    
    // The library renders an img eventually
    const check = setInterval(() => {
      const img = tempDiv.querySelector("img");
      if (img && img.src) {
        clearInterval(check);
        resolve(img.src);
      }
    }, 50);
  });
}

function toggleStudentSelection(studentId, isSelected) {
  if (isSelected && !selectedStudents.includes(studentId)) {
    selectedStudents.push(studentId);
  } else if (!isSelected) {
    selectedStudents = selectedStudents.filter(id => id !== studentId);
  }
  updateSelectionUI();
}

function toggleSelectAll(selectAll) {
  if (selectAll) {
    selectedStudents = state.students.map(s => s.id);
  } else {
    selectedStudents = [];
  }
  document.querySelectorAll('#studentListContainer input[type="checkbox"]').forEach(cb => {
    cb.checked = selectAll;
  });
  updateSelectionUI();
}

function updateSelectionUI() {
  const count = selectedStudents.length;
  const total = state.students.length;
  const countEl = document.getElementById("selectedCount");
  const btn = document.getElementById("printSelectedLabelsBtn");
  const selectAllCb = document.getElementById("selectAllStudents");

  countEl.textContent = count > 0 ? `${count} student${count !== 1 ? "s" : ""} selected` : "";
  btn.disabled = count === 0;

  if (total > 0) {
    selectAllCb.checked = count === total;
    selectAllCb.indeterminate = count > 0 && count < total;
  } else {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
  }
}

async function confirmPrint() {
  document.getElementById("qrConfigModal").classList.remove("active");
  
  if (selectedStudents.length === 0) return;

  const uniqueStudents = [];
  const seenIds = new Set();
  const selected = state.students.filter(s => selectedStudents.includes(s.id));
  
  selected.forEach(s => {
    if (seenIds.has(s.id)) {
      console.warn(`Duplicate student: ${s.name} (ID: ${s.id}).`);
    } else {
      seenIds.add(s.id);
      uniqueStudents.push(s);
    }
  });

  const grid = document.getElementById("labelGrid");
  grid.innerHTML = '<div style="text-align:center;width:100%;padding:20px;">Generating labels...</div>';

  const labelsData = [];
  for (const student of uniqueStudents) {
    const dataUrl = await generateQrImage(student.id);
    labelsData.push({ student, dataUrl });
  }

  grid.innerHTML = "";
  // QR 4cm -> max padding, QR 6cm -> min padding
  const baseGap = qrSettings.size > 5 ? "0.1cm" : "0.3cm";

  labelsData.forEach(({ student, dataUrl }) => {
    const cls = state.classes.find(c => c.id === student.classId);
    const label = document.createElement("div");
    label.className = "label";
    
    // Structure: Name (top), QR (center), Class/Roll (bottom)
    label.innerHTML = `
      <div class="label-name">${student.name}</div>
      <img class="qr-img" src="${dataUrl}" style="width:${qrSettings.size}cm; height:${qrSettings.size}cm;" />
      <div class="label-roll" style="margin-top:${baseGap};">
        Class: ${cls?.name || "N/A"} | Roll: ${student.rollNo}
      </div>
    `;
    grid.appendChild(label);
  });

  document.body.classList.add("print-labels");
  setTimeout(() => {
    window.print();
    document.body.classList.remove("print-labels");
  }, 500);
}

// ═══════════════════════════════════════════
// 5. STUDENT DETAIL (REQ 7)
// ═══════════════════════════════════════════
function openStudentDetail(studentId) {
  const student = state.students.find(s => s.id === studentId);
  if (!student) return;
  const cls = state.classes.find(c => c.id === student.classId);

  document.getElementById("sdAvatar").textContent = student.name.charAt(0).toUpperCase();
  document.getElementById("sdName").textContent = student.name;
  document.getElementById("sdMeta").textContent = `Roll: ${student.rollNo} · Class: ${cls?.name || "—"} · ID: ${student.id}`;

  // QR buttons
  const qrArea = document.getElementById("sdQrArea");
  qrArea.style.display = "none";
  document.getElementById("sdViewQR").onclick = () => {
    qrArea.style.display = "block";
    const draw = document.getElementById("sdQrDraw");
    draw.innerHTML = "";
    new QRCode(draw, { text: student.id, width: 180, height: 180 });
  };
  document.getElementById("sdPrintQR").onclick = () => {
    // Make sure QR is visible for canvas access
    if (qrArea.style.display === "none") document.getElementById("sdViewQR").click();
    setTimeout(() => window.__printQR(student.name, student.id), 200);
  };
  document.getElementById("sdDownloadQR").onclick = () => {
    if (qrArea.style.display === "none") document.getElementById("sdViewQR").click();
    setTimeout(() => window.__downloadQR(), 200);
  };

  // Attendance stats for this student
  const records = state.attendance.filter(a => a.studentId === studentId);
  const dates = [...new Set(state.attendance.map(a => a.date))]; // All unique dates
  const totalDays = dates.length || 0;
  const presentDays = records.length;
  const absentDays = totalDays - presentDays;
  const pct = totalDays === 0 ? 0 : Math.round((presentDays / totalDays) * 100);

  document.getElementById("sdTotalDays").textContent = totalDays;
  document.getElementById("sdPresent").textContent = presentDays;
  document.getElementById("sdAbsent").textContent = absentDays < 0 ? 0 : absentDays;
  document.getElementById("sdPercent").textContent = `${pct}%`;

  // History list
  const historyContainer = document.getElementById("sdHistoryList");
  historyContainer.innerHTML = "";
  if (dates.length === 0) {
    historyContainer.innerHTML = "<p class='muted'>No attendance history yet.</p>";
  } else {
    dates.sort((a, b) => b.localeCompare(a));
    dates.forEach(date => {
      const rec = records.find(r => r.date === date);
      const status = rec ? "present" : "absent";
      const row = document.createElement("article");
      row.className = "record";
      row.innerHTML = `
        <div class="avatar" style="font-size:11px;">${date.slice(5)}</div>
        <div class="record__info"><strong class="record__name">${date}</strong></div>
        <span class="badge badge--${status}">${status}</span>`;
      historyContainer.appendChild(row);
    });
  }

  navigateTo("studentDetail");
}

// ═══════════════════════════════════════════
// 6. CLASSES MANAGEMENT
// ═══════════════════════════════════════════
function bindClassForm() {
  const form = document.getElementById("addClassForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const className = document.getElementById("className").value.trim();
    if (!className) return;
    try {
      await addDoc(collection(db, "classes"), {
        name: className, ownerId: auth.currentUser.uid
      });
      form.reset();
    } catch (err) {
      alert("Error: " + err.message);
    }
  });
}

// REQ 10: Clickable classes
function renderClasses() {
  const container = document.getElementById("classListContainer");
  container.innerHTML = "";

  if (state.classes.length === 0) {
    container.innerHTML = "<p class='muted'>No classes found. Create one above.</p>";
  } else {
    state.classes.forEach(cls => {
      const count = state.students.filter(s => s.classId === cls.id).length;
      const row = document.createElement("article");
      row.className = "record record--clickable";
      row.innerHTML = `
        <div class="avatar" style="background:#ede9fe; color:#7c3aed;">C</div>
        <div class="record__info">
          <strong class="record__name">${cls.name}</strong>
          <span class="record__meta">${count} student${count !== 1 ? "s" : ""}</span>
        </div>
        <span class="badge" style="background:var(--surface-blue); color:var(--primary);">View →</span>`;
      row.onclick = () => openClassDetail(cls.id);
      container.appendChild(row);
    });
  }

  // Populate dropdowns
  [document.getElementById("studClass"), document.getElementById("attendanceClassFilter")].forEach(sel => {
    const first = sel.options[0];
    sel.innerHTML = "";
    sel.appendChild(first);
    state.classes.forEach(cls => {
      const op = document.createElement("option");
      op.value = cls.id;
      op.textContent = cls.name;
      sel.appendChild(op);
    });
  });

  document.getElementById("profileClasses").textContent = state.classes.length;
}

// ═══════════════════════════════════════════
// 7. CLASS DETAIL (REQ 10)
// ═══════════════════════════════════════════
function openClassDetail(classId) {
  const cls = state.classes.find(c => c.id === classId);
  if (!cls) return;

  document.getElementById("cdClassName").textContent = cls.name;

  const classStudents = state.students.filter(s => s.classId === classId);
  const today = todayStr();
  const todayRecords = state.attendance.filter(a => a.date === today);

  let presentCount = 0;
  const rows = [];

  classStudents.forEach(student => {
    const mark = todayRecords.find(r => r.studentId === student.id);
    const status = mark ? "present" : "absent";
    if (mark) presentCount++;
    rows.push({ student, status });
  });

  const total = classStudents.length;
  const absentCount = total - presentCount;
  const pct = total === 0 ? 0 : Math.round((presentCount / total) * 100);

  document.getElementById("cdTotal").textContent = total;
  document.getElementById("cdPresent").textContent = presentCount;
  document.getElementById("cdAbsent").textContent = absentCount;
  document.getElementById("cdPercent").textContent = `${pct}%`;

  const container = document.getElementById("cdStudentList");
  container.innerHTML = "";
  if (rows.length === 0) {
    container.innerHTML = "<p class='muted'>No students in this class.</p>";
  } else {
    rows.forEach(({ student, status }) => {
      const row = document.createElement("article");
      row.className = "record";
      row.innerHTML = `
        <div class="avatar">${student.name.charAt(0).toUpperCase()}</div>
        <div class="record__info">
          <strong class="record__name">${student.name}</strong>
          <span class="record__meta">Roll: ${student.rollNo}</span>
        </div>
        <span class="badge badge--${status}">${status}</span>`;
      container.appendChild(row);
    });
  }

  navigateTo("classDetail");
}

// ═══════════════════════════════════════════
// 8. QR SCANNER
// ═══════════════════════════════════════════
function bindScanner() {
  document.getElementById("startScannerBtn").addEventListener("click", async () => {
    const hint = document.getElementById("scannerHint");
    const video = document.getElementById("cameraPreview");
    try {
      currentCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, audio: false
      });
      video.srcObject = currentCameraStream;
      await video.play();

      if (!("BarcodeDetector" in window)) {
        hint.textContent = "Browser does not support native QR detection.";
        return;
      }
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      hint.textContent = "Scanning…";
      currentScanTimer = setInterval(async () => {
        const codes = await detector.detect(video).catch(() => []);
        if (codes.length > 0) { stopScanner(); handleScannedQR(codes[0].rawValue); }
      }, 700);
    } catch (err) {
      hint.textContent = "Camera error: " + err.message;
    }
  });
  document.getElementById("stopScannerBtn").addEventListener("click", stopScanner);
}

function stopScanner() {
  if (currentScanTimer) clearInterval(currentScanTimer);
  if (currentCameraStream) currentCameraStream.getTracks().forEach(t => t.stop());
  currentScanTimer = null;
  currentCameraStream = null;
  document.getElementById("cameraPreview").srcObject = null;
  document.getElementById("scannerHint").textContent = "Camera stopped.";
}

async function handleScannedQR(studentId) {
  const feedback = document.getElementById("scannerFeedback");
  const student = state.students.find(s => s.id === studentId);
  if (!student) {
    feedback.textContent = `Invalid QR: Unknown student (${studentId})`;
    feedback.className = "inline-result error";
    return;
  }

  const today = todayStr();
  const uid = auth.currentUser.uid;

  const dupQuery = query(
    collection(db, "attendance"),
    where("studentId", "==", studentId),
    where("date", "==", today),
    where("ownerId", "==", uid)
  );
  const dupSnap = await getDocs(dupQuery);
  if (!dupSnap.empty) {
    feedback.textContent = `${student.name} already marked today.`;
    feedback.className = "inline-result error";
    return;
  }

  try {
    await addDoc(collection(db, "attendance"), {
      studentId, classId: student.classId, date: today,
      timestamp: serverTimestamp(), status: "present", ownerId: uid
    });
    feedback.textContent = `✓ ${student.name} marked present!`;
    feedback.className = "inline-result ok";
    setTimeout(() => document.getElementById("startScannerBtn").click(), 2000);
  } catch (err) {
    feedback.textContent = "Error: " + err.message;
    feedback.className = "inline-result error";
  }
}

// ═══════════════════════════════════════════
// 9. ATTENDANCE FILTERS + RENDERING
// ═══════════════════════════════════════════
function bindAttendanceFilters() {
  document.getElementById("applyAttFilterBtn").addEventListener("click", renderAttendance);
  document.getElementById("sf-all").addEventListener("click", () => setStatusFilter("all"));
  document.getElementById("sf-present").addEventListener("click", () => setStatusFilter("present"));
  document.getElementById("sf-absent").addEventListener("click", () => setStatusFilter("absent"));
}

function setStatusFilter(status) {
  filterState.status = status;
  ["sf-all", "sf-present", "sf-absent"].forEach(id => {
    document.getElementById(id).className = "button button--outline";
  });
  document.getElementById("sf-" + status).className = "button button--primary";
  renderAttendance();
}

// ═══════════════════════════════════════════
// 10. REALTIME LISTENERS
// ═══════════════════════════════════════════
function startRealtimeListeners() {
  const uid = auth.currentUser.uid;

  onSnapshot(query(collection(db, "students"), where("ownerId", "==", uid)), snap => {
    state.students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderStudents();
    renderClasses();
    renderAttendance();
  });

  onSnapshot(query(collection(db, "classes"), where("ownerId", "==", uid)), snap => {
    state.classes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderClasses();
    renderStudents();
  });

  onSnapshot(query(collection(db, "attendance"), where("ownerId", "==", uid)), snap => {
    state.attendance = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
      const tA = a.timestamp ? a.timestamp.toMillis() : 0;
      const tB = b.timestamp ? b.timestamp.toMillis() : 0;
      return tB - tA;
    });
    renderAttendance();
    renderDashboardFeed();
  });
}

// ═══════════════════════════════════════════
// 11. RENDERERS
// ═══════════════════════════════════════════
function renderAttendance() {
  const dateInput = document.getElementById("attendanceDateFilter");
  if (!dateInput.value) dateInput.value = todayStr();
  const selectedDate = dateInput.value;
  const classFilter = document.getElementById("attendanceClassFilter").value;

  let baseStudents = state.students;
  if (classFilter !== "all" && classFilter !== "") {
    baseStudents = baseStudents.filter(s => s.classId === classFilter);
  }

  const dayRecords = state.attendance.filter(r => r.date === selectedDate);
  const aggregated = [];
  baseStudents.forEach(student => {
    const mark = dayRecords.find(r => r.studentId === student.id);
    aggregated.push({
      student,
      status: mark ? "present" : "absent",
      time: mark?.timestamp || null
    });
  });

  const total = baseStudents.length;
  const present = aggregated.filter(r => r.status === "present").length;
  const absent = total - present;
  const pct = total === 0 ? 0 : Math.round((present / total) * 100);

  document.getElementById("attTotalStudents").textContent = total;
  document.getElementById("attTotalPresent").textContent = present;
  document.getElementById("attTotalAbsent").textContent = absent;
  document.getElementById("attPercent").textContent = `${pct}%`;

  if (selectedDate === todayStr() && (classFilter === "all" || classFilter === "")) {
    document.getElementById("dashAttendancePercent").textContent = `${pct}%`;
    document.getElementById("profileAttendance").textContent = `${pct}%`;
  }

  let display = aggregated;
  if (filterState.status !== "all") display = display.filter(r => r.status === filterState.status);

  const container = document.getElementById("attendanceListContainer");
  container.innerHTML = "";
  if (display.length === 0) {
    container.innerHTML = "<p class='muted'>No records match filters.</p>";
    return;
  }

  display.forEach(item => {
    const row = document.createElement("article");
    row.className = "record";
    let timeStr = "—";
    if (item.time && item.time.toDate) timeStr = item.time.toDate().toLocaleTimeString();
    row.innerHTML = `
      <div class="avatar">${item.student.name.charAt(0).toUpperCase()}</div>
      <div class="record__info">
        <strong class="record__name">${item.student.name}</strong>
        <span class="record__meta">${timeStr}</span>
      </div>
      <span class="badge badge--${item.status}">${item.status}</span>`;
    container.appendChild(row);
  });
}

function renderDashboardFeed() {
  const container = document.getElementById("activityFeedList");
  const recent = state.attendance.slice(0, 10);
  container.innerHTML = "";
  if (recent.length === 0) {
    container.innerHTML = "<p class='muted'>No recent activity.</p>";
    return;
  }
  recent.forEach(record => {
    const student = state.students.find(s => s.id === record.studentId);
    const name = student ? student.name : "Unknown";
    let timeStr = "Just now";
    if (record.timestamp && record.timestamp.toDate) timeStr = record.timestamp.toDate().toLocaleTimeString();
    const row = document.createElement("article");
    row.className = "record";
    row.innerHTML = `
      <div class="avatar" style="background:var(--surface-green); color:var(--green);">✓</div>
      <div class="record__info">
        <strong class="record__name">${name} scanned in</strong>
        <span class="record__meta">${timeStr} · ${record.date}</span>
      </div>
      <span class="badge badge--present">present</span>`;
    container.appendChild(row);
  });
}
