// Firebase SDKs

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ═══ FIREBASE INIT ═══════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyAll-aUKRP_w7lhvEx4tUfrMNVdIRzbRrU",
  authDomain: "tsogolo-bank.firebaseapp.com",
  projectId: "tsogolo-bank",
  storageBucket: "tsogolo-bank.firebasestorage.app",
  messagingSenderId: "151602914562",
  appId: "1:151602914562:web:d9242f39b230220d2bce1b",
  measurementId: "G-J2TW5ZH29Y",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const STATE_DOC = doc(db, "bank", "state");
const CFG_DOC = doc(db, "bank", "config"); // stores pw hash

// ═══ CONSTANTS ═══════════════════════════════════════════════
const CONTRIBUTION = 10000;
const TOTAL_WEEKS = 20;
const INTEREST = 0.3;
const LOAN_WEEKS = 5;
const DEFAULT_HASH =
  "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"; // admin123

// ═══ RUNTIME ═════════════════════════════════════════════════
let isAdmin = false;
let state = null; // live from Firestore
let isSaving = false;

function freshState() {
  return {
    currentWeek: 0,
    members: [],
    loans: [],
    contributions: {},
    nextLoanId: 1,
  };
}

// ═══ PERSISTENCE ═════════════════════════════════════════════
async function saveState() {
  isSaving = true;
  showSync(true);
  try {
    await setDoc(STATE_DOC, { data: JSON.stringify(state) });
  } catch (e) {
    alert("Save failed: " + e.message);
  }
  isSaving = false;
  showSync(false);
}

function showSync(on) {
  document.getElementById("sync-indicator").classList.toggle("show", on);
}

// ═══ AUTH ════════════════════════════════════════════════════
async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

async function storedHash() {
  try {
    const snap = await getDoc(CFG_DOC);
    return snap.exists() ? snap.data().pwHash || DEFAULT_HASH : DEFAULT_HASH;
  } catch {
    return DEFAULT_HASH;
  }
}

async function doLogin() {
  const pw = document.getElementById("auth-pw").value.trim();
  if (!pw) {
    asViewer();
    return;
  }
  const [h, stored] = await Promise.all([sha256(pw), storedHash()]);
  if (h === stored) {
    isAdmin = true;
    document.getElementById("auth-screen").classList.add("gone");
    applyRole();
  } else {
    document.getElementById("auth-err").textContent = "Incorrect password.";
  }
}
window.doLogin = doLogin;

function asViewer() {
  isAdmin = false;
  document.getElementById("auth-screen").classList.add("gone");
  applyRole();
}
window.asViewer = asViewer;

function showAuth() {
  document.getElementById("auth-pw").value = "";
  document.getElementById("auth-err").textContent = "";
  document.getElementById("auth-screen").classList.remove("gone");
  setTimeout(() => document.getElementById("auth-pw").focus(), 80);
}
window.showAuth = showAuth;

function lockApp() {
  isAdmin = false;
  applyRole();
}
window.lockApp = lockApp;

function applyRole() {
  const body = document.body,
    pill = document.getElementById("rpill");
  const banner = document.getElementById("vbanner");
  const lb = document.getElementById("lock-btn"),
    ub = document.getElementById("login-btn");
  if (isAdmin) {
    body.classList.remove("viewer");
    body.classList.add("admin");
    pill.textContent = "Admin";
    pill.className = "rpill admin";
    banner.classList.add("gone");
    lb.style.display = "";
    ub.style.display = "none";
  } else {
    body.classList.remove("admin");
    body.classList.add("viewer");
    pill.textContent = "Viewer";
    pill.className = "rpill viewer";
    banner.classList.remove("gone");
    lb.style.display = "none";
    ub.style.display = "";
  }
  renderAll();
}

// ═══ PASSWORD CHANGE ═════════════════════════════════════════
function openPwMo() {
  document.getElementById("pw-mo").classList.add("open");
}
window.openPwMo = openPwMo;
function closePwMo() {
  document.getElementById("pw-mo").classList.remove("open");
}
window.closePwMo = closePwMo;

async function savePw() {
  const cur = document.getElementById("pw-cur").value;
  const nw = document.getElementById("pw-new").value;
  const cf = document.getElementById("pw-cf").value;
  const err = document.getElementById("pw-err");
  const [curH, stored] = await Promise.all([sha256(cur), storedHash()]);
  if (curH !== stored) {
    err.textContent = "Current password is wrong.";
    return;
  }
  if (nw.length < 4) {
    err.textContent = "Min 4 characters.";
    return;
  }
  if (nw !== cf) {
    err.textContent = "Passwords do not match.";
    return;
  }
  const newH = await sha256(nw);
  await setDoc(CFG_DOC, { pwHash: newH });
  err.textContent = "";
  closePwMo();
  ["pw-cur", "pw-new", "pw-cf"].forEach(
    (id) => (document.getElementById(id).value = ""),
  );
  alert("Password changed.");
}
window.savePw = savePw;

// ═══ CLEAR DATA ══════════════════════════════════════════════
function openClearMo() {
  document.getElementById("clear-confirm").value = "";
  document.getElementById("clear-mo").classList.add("open");
}
window.openClearMo = openClearMo;
function closeClearMo() {
  document.getElementById("clear-mo").classList.remove("open");
}
window.closeClearMo = closeClearMo;

async function doClear() {
  if (document.getElementById("clear-confirm").value.trim() !== "CLEAR") {
    alert("Type CLEAR to confirm.");
    return;
  }
  state = freshState();
  await saveState();
  closeClearMo();
}
window.doClear = doClear;

// ═══ HELPERS ═════════════════════════════════════════════════
function fmt(n) {
  return "MWK " + Math.round(n).toLocaleString();
}
function getMember(id) {
  return state.members.find((m) => m.id === id);
}
function seedTotal() {
  return 100000 * state.members.length;
}
function loanTotalDue(l) {
  return l.principal * (1 + INTEREST);
}
function loanRepaid(l) {
  return l.repayments.reduce((s, r) => s + r.amount, 0);
}
function loanOutstanding(l) {
  return Math.max(0, loanTotalDue(l) - loanRepaid(l));
}
function memberActiveLoans(mid) {
  return state.loans.filter((l) => l.memberId === mid && l.status === "active");
}
function memberBalance(mid) {
  return memberActiveLoans(mid).reduce((s, l) => s + loanOutstanding(l), 0);
}
function totalContribs() {
  let t = 0;
  state.members.forEach((m) => {
    for (let w = 1; w <= state.currentWeek; w++)
      t += state.contributions[m.id]?.[w] || 0;
  });
  return t;
}
function totalInterest() {
  let t = 0;
  state.loans.forEach((l) => {
    const rep = loanRepaid(l);
    if (l.status === "paid") t += l.principal * INTEREST;
    else t += Math.max(0, rep - l.principal);
  });
  return t;
}
function poolTotal() {
  return seedTotal() + totalContribs() + totalInterest();
}
function memberMissed(mid) {
  let m = 0;
  for (let w = 1; w <= state.currentWeek; w++) {
    const p = state.contributions[mid]?.[w] || 0;
    if (p < CONTRIBUTION) m += CONTRIBUTION - p;
  }
  return m;
}

// ═══ TABS ════════════════════════════════════════════════════
let activeTab = "dash";
let viewedWeek = 1;

function showTab(tab) {
  activeTab = tab;
  ["dash", "members", "loans", "weekly", "share"].forEach((t, i) => {
    document.querySelectorAll(".tab")[i].classList.toggle("active", t === tab);
    document.getElementById("view-" + t).classList.toggle("on", t === tab);
  });
  renderTab(tab);
}
window.showTab = showTab;

function renderTab(t) {
  if (!state) return;
  if (t === "dash") renderDash();
  else if (t === "members") renderMembers();
  else if (t === "loans") renderLoans();
  else if (t === "weekly") renderWeekly();
  else if (t === "share") renderShare();
}

function renderAll() {
  if (!state) return;
  document.getElementById("hweek").textContent =
    `Week ${state.currentWeek} of ${TOTAL_WEEKS}`;
  document.getElementById("d-nextw").textContent = state.currentWeek + 1;
  const rb = document.getElementById("rollback-btn");
  const ab = document.getElementById("advance-btn");
  if (rb) {
    rb.style.display = isAdmin && state.currentWeek > 0 ? "" : "none";
  }
  if (ab) {
    ab.style.display = state.currentWeek >= TOTAL_WEEKS ? "none" : "";
  }
  renderTab(activeTab);
}

// ═══ ADVANCE / ROLLBACK WEEK ═════════════════════════════════
async function advanceWeek() {
  if (!isAdmin) {
    alert("Admin access required.");
    return;
  }
  if (state.currentWeek >= TOTAL_WEEKS) {
    alert("14-week cycle is complete.");
    return;
  }
  state.currentWeek++;
  viewedWeek = state.currentWeek;
  state.members.forEach((m) => {
    const paid = state.contributions[m.id]?.[state.currentWeek] || 0;
    if (paid < CONTRIBUTION)
      mkLoan(
        m.id,
        CONTRIBUTION - paid,
        `Missed contribution Wk${state.currentWeek}`,
      );
  });
  state.loans.forEach((ln) => {
    if (ln.status === "active" && ln.due_week < state.currentWeek) {
      const owed = loanOutstanding(ln);
      if (owed > 0) {
        ln.status = "rolled";
        mkLoan(ln.memberId, owed, `Rollover from loan #${ln.id}`);
      }
    }
  });
  await saveState();
}
window.advanceWeek = advanceWeek;

async function rollBackWeek() {
  if (!isAdmin) {
    alert("Admin access required.");
    return;
  }
  if (state.currentWeek === 0) {
    alert("Already at Week 0.");
    return;
  }
  if (
    !confirm(
      `Roll back from Week ${state.currentWeek} to Week ${state.currentWeek - 1}?\n\nAuto-generated missed-contribution and rollover loans from this week will be removed. Manually issued loans and repayments will not be removed.`,
    )
  )
    return;
  const w = state.currentWeek;
  const toRemove = new Set();
  state.loans.forEach((ln) => {
    if (ln.issued_week === w) {
      if (
        ln.note === `Missed contribution Wk${w}` ||
        ln.note.startsWith("Rollover from loan #")
      )
        toRemove.add(ln.id);
    }
  });
  state.loans.forEach((ln) => {
    if (ln.status === "rolled") {
      const rid = state.loans.find(
        (r) => r.note === `Rollover from loan #${ln.id}` && r.issued_week === w,
      )?.id;
      if (rid && toRemove.has(rid)) ln.status = "active";
    }
  });
  state.loans = state.loans.filter((ln) => !toRemove.has(ln.id));
  state.currentWeek--;
  viewedWeek = Math.max(1, state.currentWeek);
  await saveState();
}
window.rollBackWeek = rollBackWeek;

function mkLoan(memberId, principal, note) {
  if (principal <= 0) return;
  state.loans.push({
    id: state.nextLoanId++,
    memberId,
    principal,
    issued_week: state.currentWeek,
    due_week: state.currentWeek + LOAN_WEEKS,
    status: "active",
    note: note || "",
    repayments: [],
  });
}

// ═══ DASHBOARD ═══════════════════════════════════════════════
function renderDash() {
  const n = state.members.length;
  const aLoans = state.loans.filter((l) => l.status === "active");
  const totalOwed = aLoans.reduce((s, l) => s + loanOutstanding(l), 0);
  document.getElementById("d-stats").innerHTML = `
    <div class="scard"><div class="slabel">Total Pool</div><div class="sval">${fmt(poolTotal())}</div></div>
    <div class="scard"><div class="slabel">Seed (${n}×100k)</div><div class="sval">${fmt(seedTotal())}</div></div>
    <div class="scard"><div class="slabel">Contributions</div><div class="sval">${fmt(totalContribs())}</div></div>
    <div class="scard"><div class="slabel">Interest Earned</div><div class="sval">${fmt(totalInterest())}</div></div>
    <div class="scard"><div class="slabel">Outstanding Loans</div><div class="sval">${fmt(totalOwed)}</div></div>
    <div class="scard"><div class="slabel">Members</div><div class="sval">${n}</div></div>`;
  let alerts = "";
  if (state.currentWeek === 0)
    alerts +=
      '<div class="alert aa">Add members, then advance to Week 1 to begin.</div>';
  const od = aLoans.filter((l) => l.due_week < state.currentWeek);
  if (od.length)
    alerts += `<div class="alert ar">⚠ ${od.length} loan(s) overdue — will roll over on next week advance.</div>`;
  if (state.currentWeek >= TOTAL_WEEKS)
    alerts +=
      '<div class="alert ag">✓ Cycle complete! See the Share tab.</div>';
  document.getElementById("d-alerts").innerHTML = alerts;
  if (!aLoans.length) {
    document.getElementById("d-loans").innerHTML =
      '<div class="empty">No active loans.</div>';
    return;
  }
  const rCol = isAdmin ? "<th></th>" : "";
  const rows = aLoans
    .map((l) => {
      const m = getMember(l.memberId);
      const owed = loanOutstanding(l);
      const overdue = l.due_week < state.currentWeek;
      const rb = isAdmin
        ? `<td><button onclick="openRepay(${l.id})" style="padding:3px 8px;font-size:11px">Repay</button></td>`
        : "<td></td>";
      return `<tr><td>${m ? m.name : "?"}</td><td>${fmt(l.principal)}</td><td>${fmt(loanTotalDue(l))}</td><td>${fmt(owed)}</td><td>Wk${l.due_week}</td>
      <td>${overdue ? '<span class="badge br">Overdue</span>' : '<span class="badge ba">Active</span>'}</td>${rb}</tr>`;
    })
    .join("");
  document.getElementById("d-loans").innerHTML = `<div class="tw"><table>
    <thead><tr><th>Member</th><th>Principal</th><th>Total Due</th><th>Outstanding</th><th>Due</th><th>Status</th>${rCol}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// ═══ MEMBERS ═════════════════════════════════════════════════
let addMemOpen = false;
function toggleAddMember() {
  addMemOpen = !addMemOpen;
  document.getElementById("add-mem-card").style.display = addMemOpen
    ? "block"
    : "none";
}
window.toggleAddMember = toggleAddMember;

async function addMember() {
  if (!isAdmin) return;
  const name = document.getElementById("nm-name").value.trim();
  if (!name) {
    alert("Enter a name.");
    return;
  }
  const phone = document.getElementById("nm-phone").value.trim();
  const id = Date.now();
  state.members.push({ id, name, phone });
  state.contributions[id] = {};
  document.getElementById("nm-name").value = "";
  document.getElementById("nm-phone").value = "";
  addMemOpen = false;
  document.getElementById("add-mem-card").style.display = "none";
  await saveState();
}
window.addMember = addMember;

function openEditMember(id) {
  if (!isAdmin) return;
  const m = getMember(id);
  if (!m) return;
  document.getElementById("edit-mem-id").value = id;
  document.getElementById("edit-mem-name").value = m.name;
  document.getElementById("edit-mem-phone").value = m.phone || "";
  document.getElementById("edit-mem-mo").classList.add("open");
}
window.openEditMember = openEditMember;
function closeEditMemMo() {
  document.getElementById("edit-mem-mo").classList.remove("open");
}
window.closeEditMemMo = closeEditMemMo;

async function saveEditMember() {
  if (!isAdmin) return;
  const id = parseInt(document.getElementById("edit-mem-id").value);
  const name = document.getElementById("edit-mem-name").value.trim();
  if (!name) {
    alert("Name cannot be empty.");
    return;
  }
  const phone = document.getElementById("edit-mem-phone").value.trim();
  const m = getMember(id);
  if (!m) return;
  m.name = name;
  m.phone = phone;
  closeEditMemMo();
  await saveState();
}
window.saveEditMember = saveEditMember;

function renderMembers() {
  if (!state.members.length) {
    document.getElementById("mem-list").innerHTML =
      '<div class="empty">No members yet.</div>';
    return;
  }
  const rows = state.members
    .map((m) => {
      const bal = memberBalance(m.id);
      const missed = memberMissed(m.id);
      const lb = isAdmin
        ? `<button onclick="openIssueLoan(${m.id})" style="padding:3px 8px;font-size:11px">Loan</button>`
        : "";
      const eb = isAdmin
        ? `<button class="sec" onclick="openEditMember(${m.id})" style="padding:3px 8px;font-size:11px">Edit</button>`
        : "";
      return `<tr>
      <td><strong>${m.name}</strong>${m.phone ? `<br><span style="color:var(--tx3);font-size:11px">${m.phone}</span>` : ""}</td>
      <td>${missed > 0 ? `<span class="badge ba">MWK ${missed.toLocaleString()} missed</span>` : '<span class="badge bg">Up to date</span>'}</td>
      <td>${bal > 0 ? `<span style="color:var(--r600);font-weight:500">${fmt(bal)}</span>` : '<span style="color:var(--g600)">None</span>'}</td>
      <td><button class="sec" onclick="viewMember(${m.id})" style="padding:3px 8px;font-size:11px">View</button> ${eb} ${lb}</td>
    </tr>`;
    })
    .join("");
  document.getElementById("mem-list").innerHTML = `<div class="tw"><table>
    <thead><tr><th>Name</th><th>Contributions</th><th>Loan Balance</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function viewMember(id) {
  const m = getMember(id);
  if (!m) return;
  const loans = state.loans.filter((l) => l.memberId === id);
  let crows = "";
  for (let w = 1; w <= state.currentWeek; w++) {
    const p = state.contributions[id]?.[w] || 0;
    crows += `<tr><td>Week ${w}</td><td>${fmt(p)}</td><td>${p >= CONTRIBUTION ? '<span class="badge bg">Paid</span>' : '<span class="badge ba">Missed</span>'}</td></tr>`;
  }
  const lrows =
    loans
      .map((l) => {
        const owed = loanOutstanding(l);
        const bc =
          l.status === "paid" ? "bg" : l.status === "rolled" ? "bx" : "ba";
        return `<tr><td>#${l.id}</td><td>${fmt(l.principal)}</td><td>${fmt(loanTotalDue(l))}</td><td>${fmt(owed)}</td><td>Wk${l.due_week}</td><td><span class="badge ${bc}">${l.status}</span></td></tr>`;
      })
      .join("") ||
    '<tr><td colspan="6" style="color:var(--tx3)">No loans</td></tr>';
  document.getElementById("mem-mo-title").textContent = m.name;
  document.getElementById("mem-mo-body").innerHTML = `
    ${m.phone ? `<p style="color:var(--tx2);margin-bottom:11px">${m.phone}</p>` : ""}
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:500;text-transform:uppercase;color:var(--tx3);margin-bottom:7px">Seed Money</div>
      <div>${fmt(100000)} allocated</div>
    </div>
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:500;text-transform:uppercase;color:var(--tx3);margin-bottom:7px">Contributions</div>
      ${crows ? `<div class="tw"><table><thead><tr><th>Week</th><th>Paid</th><th>Status</th></tr></thead><tbody>${crows}</tbody></table></div>` : '<p style="color:var(--tx3)">No weeks yet.</p>'}
    </div>
    <div>
      <div style="font-size:11px;font-weight:500;text-transform:uppercase;color:var(--tx3);margin-bottom:7px">Loans</div>
      <div class="tw"><table><thead><tr><th>#</th><th>Principal</th><th>Total Due</th><th>Outstanding</th><th>Due</th><th>Status</th></tr></thead><tbody>${lrows}</tbody></table></div>
    </div>`;
  document.getElementById("mem-mo").classList.add("open");
}
window.viewMember = viewMember;
function closeMemMo() {
  document.getElementById("mem-mo").classList.remove("open");
}
window.closeMemMo = closeMemMo;

// ═══ LOANS ═══════════════════════════════════════════════════
function openIssueLoan(presetId) {
  if (!isAdmin) {
    alert("Admin access required.");
    return;
  }
  if (!state.members.length) {
    alert("Add members first.");
    return;
  }
  const opts = state.members
    .map(
      (m) =>
        `<option value="${m.id}"${m.id === presetId ? " selected" : ""}>${m.name}</option>`,
    )
    .join("");
  document.getElementById("loan-mo-body").innerHTML = `
    <div class="fg" style="margin-bottom:11px"><label>Member</label><select id="l-mem">${opts}</select></div>
    <div class="fg" style="margin-bottom:11px"><label>Loan Amount (MWK)</label><input type="number" id="l-amt" placeholder="e.g. 20000" min="100"></div>
    <div style="background:var(--b50);border-radius:var(--rads);padding:10px;font-size:12px;color:var(--b600);margin-bottom:11px">
      30% interest · Total = Principal × 1.30 · Due: Week ${state.currentWeek + LOAN_WEEKS}</div>
    <div class="mact"><button class="sec" onclick="closeLoanMo()">Cancel</button><button onclick="doIssueLoan()">Issue Loan</button></div>`;
  document.getElementById("loan-mo").classList.add("open");
}
window.openIssueLoan = openIssueLoan;
function closeLoanMo() {
  document.getElementById("loan-mo").classList.remove("open");
}
window.closeLoanMo = closeLoanMo;

async function doIssueLoan() {
  if (!isAdmin) return;
  if (state.currentWeek === 0) {
    alert("Advance to Week 1 first.");
    return;
  }
  const mid = parseInt(document.getElementById("l-mem").value);
  const amt = parseFloat(document.getElementById("l-amt").value);
  if (!mid || !amt || amt <= 0) {
    alert("Fill all fields.");
    return;
  }
  mkLoan(mid, amt, "Manual loan");
  closeLoanMo();
  await saveState();
}
window.doIssueLoan = doIssueLoan;

function openRepay(loanId) {
  if (!isAdmin) {
    alert("Admin access required.");
    return;
  }
  const ln = state.loans.find((l) => l.id === loanId);
  if (!ln) return;
  const m = getMember(ln.memberId);
  const owed = loanOutstanding(ln);
  document.getElementById("repay-mo-body").innerHTML = `
    <p style="margin-bottom:11px"><strong>${m?.name}</strong> — Loan #${ln.id}</p>
    <div style="background:var(--bg3);border-radius:var(--rads);padding:10px;font-size:13px;margin-bottom:11px">
      Principal: ${fmt(ln.principal)}<br>Total due: ${fmt(loanTotalDue(ln))}<br><strong>Outstanding: ${fmt(owed)}</strong></div>
    <div class="fg" style="margin-bottom:11px"><label>Amount Paid (MWK)</label><input type="number" id="r-amt" value="${Math.round(owed)}" min="1"></div>
    <div class="mact"><button class="sec" onclick="closeRepayMo()">Cancel</button><button onclick="doRepay(${loanId})">Record</button></div>`;
  document.getElementById("repay-mo").classList.add("open");
}
window.openRepay = openRepay;
function closeRepayMo() {
  document.getElementById("repay-mo").classList.remove("open");
}
window.closeRepayMo = closeRepayMo;

async function doRepay(loanId) {
  if (!isAdmin) return;
  const ln = state.loans.find((l) => l.id === loanId);
  if (!ln) return;
  const amt = parseFloat(document.getElementById("r-amt").value);
  if (!amt || amt <= 0) {
    alert("Enter a valid amount.");
    return;
  }
  ln.repayments.push({ week: state.currentWeek, amount: amt });
  if (loanOutstanding(ln) <= 0) ln.status = "paid";
  closeRepayMo();
  await saveState();
}
window.doRepay = doRepay;

function renderLoans() {
  if (!state.loans.length) {
    document.getElementById("loan-list").innerHTML =
      '<div class="empty">No loans yet.</div>';
    return;
  }
  const rCol = isAdmin ? "<th></th>" : "";
  const rows = state.loans
    .map((l) => {
      const m = getMember(l.memberId);
      const owed = loanOutstanding(l);
      const od = l.status === "active" && l.due_week < state.currentWeek;
      let bc = "bx";
      if (l.status === "active") bc = od ? "br" : "ba";
      if (l.status === "paid") bc = "bg";
      const rb =
        isAdmin && l.status === "active"
          ? `<td><button onclick="openRepay(${l.id})" style="padding:3px 8px;font-size:11px">Repay</button></td>`
          : "<td></td>";
      return `<tr><td>#${l.id}</td><td>${m ? m.name : "?"}</td><td>${fmt(l.principal)}</td><td>${fmt(loanTotalDue(l))}</td>
      <td>${fmt(owed)}</td><td>Wk${l.issued_week}</td><td>Wk${l.due_week}</td>
      <td><span class="badge ${bc}">${l.status}${od ? " ⚠" : ""}</span></td>
      <td style="font-size:11px;color:var(--tx3)">${l.note || ""}</td>${rb}</tr>`;
    })
    .join("");
  document.getElementById("loan-list").innerHTML = `<div class="tw"><table>
    <thead><tr><th>#</th><th>Member</th><th>Principal</th><th>Total Due</th><th>Outstanding</th><th>Issued</th><th>Due</th><th>Status</th><th>Note</th>${rCol}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// ═══ WEEKLY ══════════════════════════════════════════════════
function navW(d) {
  viewedWeek = Math.max(1, Math.min(state.currentWeek || 1, viewedWeek + d));
  renderWeekly();
}
window.navW = navW;

function renderWeekly() {
  if (state.currentWeek === 0) {
    document.getElementById("wk-table").innerHTML =
      '<div class="empty">Advance to Week 1 first.</div>';
    return;
  }
  viewedWeek = Math.max(1, Math.min(state.currentWeek, viewedWeek));
  document.getElementById("wk-label").textContent = `Week ${viewedWeek}`;
  if (!state.members.length) {
    document.getElementById("wk-table").innerHTML =
      '<div class="empty">Add members first.</div>';
    return;
  }
  const aC = isAdmin ? "<th></th>" : "";
  const rows = state.members
    .map((m) => {
      const paid = state.contributions[m.id]?.[viewedWeek] || 0;
      const st =
        paid >= CONTRIBUTION
          ? '<span class="badge bg">Paid</span>'
          : '<span class="badge ba">Missed</span>';
      const btn =
        isAdmin && viewedWeek <= state.currentWeek && paid < CONTRIBUTION
          ? `<td><button onclick="markPaid(${m.id},${viewedWeek})" style="padding:3px 8px;font-size:11px">Mark Paid</button></td>`
          : "<td></td>";
      return `<tr><td>${m.name}</td><td>${st}</td><td>${fmt(paid)}</td>${btn}</tr>`;
    })
    .join("");
  document.getElementById("wk-table").innerHTML = `<div class="tw"><table>
    <thead><tr><th>Member</th><th>Status</th><th>Amount</th>${aC}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

async function markPaid(mid, week) {
  if (!isAdmin) return;
  if (!state.contributions[mid]) state.contributions[mid] = {};
  state.contributions[mid][week] = CONTRIBUTION;
  const idx = state.loans.findIndex(
    (l) =>
      l.memberId === mid &&
      l.note === `Missed contribution Wk${week}` &&
      l.status === "active" &&
      l.repayments.length === 0,
  );
  if (idx > -1) state.loans.splice(idx, 1);
  await saveState();
}
window.markPaid = markPaid;

// ═══ SHARE ═══════════════════════════════════════════════════
function renderShare() {
  const el = document.getElementById("share-body");
  if (state.currentWeek < TOTAL_WEEKS) {
    el.innerHTML = `<div class="alert aa">Cycle ends at Week 20. Currently at Week ${state.currentWeek}.</div>`;
    return;
  }
  if (!state.members.length) {
    el.innerHTML = '<div class="empty">No members.</div>';
    return;
  }
  const pool = poolTotal();
  const n = state.members.length;
  const eq = pool / n;
  const rows = state.members
    .map((m) => {
      const debt = memberBalance(m.id);
      const net = Math.max(0, eq - debt);
      return `<tr><td><strong>${m.name}</strong></td><td>${fmt(75000)}</td><td>${fmt(eq)}</td>
      <td>${debt > 0 ? `<span style="color:var(--r600)">${fmt(debt)}</span>` : "—"}</td>
      <td><strong>${fmt(net)}</strong></td></tr>`;
    })
    .join("");
  el.innerHTML = `
    <div class="sgrid" style="margin-bottom:16px">
      <div class="scard"><div class="slabel">Total Pool</div><div class="sval">${fmt(pool)}</div></div>
      <div class="scard"><div class="slabel">Members</div><div class="sval">${n}</div></div>
      <div class="scard"><div class="slabel">Seed per Member</div><div class="sval">${fmt(75000)}</div></div>
      <div class="scard"><div class="slabel">Equal Share Each</div><div class="sval">${fmt(eq)}</div></div>
    </div>
    <div style="background:var(--g50);border:1px solid var(--g200);border-radius:var(--rad);padding:14px;margin-bottom:14px;font-size:13px;color:var(--g800)">
      Pool = Seed ${fmt(seedTotal())} + Contributions ${fmt(totalContribs())} + Interest ${fmt(totalInterest())} = <strong>${fmt(pool)}</strong><br>
      <span style="color:var(--g600);font-size:12px">÷ ${n} members = ${fmt(eq)} each, minus outstanding debts.</span>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Member</th><th>Seed</th><th>Equal Share</th><th>Deductions</th><th>Net Payout</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

// ═══ FIRESTORE REAL-TIME LISTENER ════════════════════════════
// Listen for changes from any device — UI updates automatically
onSnapshot(
  STATE_DOC,
  (snap) => {
    if (isSaving) return; // skip echoes of our own saves
    if (snap.exists()) {
      try {
        state = JSON.parse(snap.data().data);
      } catch {
        state = freshState();
      }
    } else {
      state = freshState();
    }

    // First load: hide loading, show auth
    if (
      document.getElementById("loading-screen") &&
      !document.getElementById("loading-screen").classList.contains("gone")
    ) {
      document.getElementById("loading-screen").classList.add("gone");
      document.getElementById("auth-screen").classList.remove("gone");
      setTimeout(() => document.getElementById("auth-pw").focus(), 100);
    } else {
      renderAll(); // live update from another device
    }
  },
  (error) => {
    document.getElementById("loading-screen").classList.add("gone");
    document.getElementById("auth-screen").classList.remove("gone");
    document.getElementById("auth-err").textContent =
      "Database connection failed: " + error.message;
  },
);
