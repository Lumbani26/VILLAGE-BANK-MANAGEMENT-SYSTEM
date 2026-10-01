import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAll-aUKRP_w7lhvEx4tUfrMNVdIRzbRrU",
  authDomain: "tsogolo-bank.firebaseapp.com",
  projectId: "tsogolo-bank",
  storageBucket: "tsogolo-bank.firebasestorage.app",
  messagingSenderId: "151602914562",
  appId: "1:151602914562:web:d9242f39b230220d2bce1b",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const STATE_DOC = doc(db, "bank", "state");
const CFG_DOC = doc(db, "bank", "config");

// ═══ CYCLE RULES ═════════════════════════════════════════════
// Defaults; the admin can change them from the Rules dialog and the
// values are stored in state.rules so every device sees the same rules.
const DEFAULT_RULES = {
  contribution: 10000, // weekly contribution amount
  seedAmount: 100000, // seed per member
  seedDueWeek: 1, // seed is due on the first day of the cycle
  activeWeeks: 20, // contributions & loans: weeks 1..activeWeeks
  graceWeeks: 5, // grace period after the active weeks
  interest: 0.3, // loan interest (30%)
  loanWeeks: 6, // loans are repaid in the 6th week after collection
  minLoan: 1000000, // minimum loan each member must take per cycle
};
function rules() {
  return { ...DEFAULT_RULES, ...(state?.rules || {}) };
}
const MIN_LOAN_NOTE = "Minimum loan shortfall";
function totalWeeks() {
  return rules().activeWeeks + rules().graceWeeks;
}
// Contribution amount that applied in a given week (rule changes only
// affect weeks that start after the change)
function contribFor(w) {
  return state.weekAmounts?.[w] ?? rules().contribution;
}
const DEFAULT_HASH =
  "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"; // admin123

// ═══ AUTH ════════════════════════════════════════════════════
let isAdmin = false;
let state = null;
// let appReady = false;

async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function storedHash() {
  try {
    const s = await getDoc(CFG_DOC);
    return s.exists() ? s.data().pwHash || DEFAULT_HASH : DEFAULT_HASH;
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
  if (!serverSynced) {
    document.getElementById("auth-err").textContent =
      "Still connecting to the server. Try again in a moment.";
    return;
  }
  const [h, stored] = await Promise.all([sha256(pw), storedHash()]);
  if (h === stored) {
    isAdmin = true;
    document.getElementById("auth-screen").classList.add("gone");
    applyRole();
  } else
    document.getElementById("auth-err").textContent = "Incorrect password.";
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
  const banner = document.getElementById("vbanner"),
    lb = document.getElementById("lock-btn"),
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

// ═══ PASSWORD ════════════════════════════════════════════════
function openPwMo() {
  document.getElementById("pw-mo").classList.add("open");
}
window.openPwMo = openPwMo;
function closePwMo() {
  document.getElementById("pw-mo").classList.remove("open");
}
window.closePwMo = closePwMo;
async function savePw() {
  const cur = document.getElementById("pw-cur").value,
    nw = document.getElementById("pw-new").value,
    cf = document.getElementById("pw-cf").value,
    err = document.getElementById("pw-err");
  const [ch, stored] = await Promise.all([sha256(cur), storedHash()]);
  if (ch !== stored) {
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
  await setDoc(CFG_DOC, { pwHash: await sha256(nw) });
  err.textContent = "";
  closePwMo();
  ["pw-cur", "pw-new", "pw-cf"].forEach(
    (id) => (document.getElementById(id).value = ""),
  );
  alert("Password changed.");
}
window.savePw = savePw;

// ═══ CLEAR / NEW CYCLE ═══════════════════════════════════════
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
  if (document.getElementById("clear-confirm").value.trim() !== "NEWCYCLE") {
    alert("Type NEWCYCLE to confirm.");
    return;
  }
  // Keep members, reset everything else
  const keptMembers = state.members;
  const newContribs = {};
  const newSeedPaid = {};
  keptMembers.forEach((m) => {
    newContribs[m.id] = {};
    newSeedPaid[m.id] = 0;
  });
  state = {
    ...freshState(),
    members: keptMembers,
    contributions: newContribs,
    seedPaid: newSeedPaid,
    rules: state.rules || { ...DEFAULT_RULES },
  };
  await saveState();
  closeClearMo();
}
window.doClear = doClear;

// ═══ DELETE MEMBER ═══════════════════════════════════════════
let deleteMemberId = null;
function openDeleteMember(id) {
  if (!isAdmin) return;
  const m = getMember(id);
  if (!m) return;
  deleteMemberId = id;
  const hasActivity =
    state.loans.some((l) => l.memberId === id) ||
    Object.keys(state.contributions[id] || {}).length > 0;
  document.getElementById("del-mem-body").innerHTML = `
    <div style="background:var(--r50);border:1px solid var(--r600);border-radius:var(--rads);padding:12px;margin-bottom:14px;font-size:13px;color:var(--r600)">
      Removes <strong>${m.name}</strong> and all their loan and contribution records. You can reverse this with Undo.
    </div>
    ${hasActivity ? `<div class="alert aa" style="margin-bottom:0">⚠ This member has recorded activity this cycle. Consider using "Start New Cycle" instead of deleting mid-cycle.</div>` : ""}`;
  document.getElementById("del-mem-mo").classList.add("open");
}
window.openDeleteMember = openDeleteMember;
function closeDelMemMo() {
  document.getElementById("del-mem-mo").classList.remove("open");
  deleteMemberId = null;
}
window.closeDelMemMo = closeDelMemMo;
async function confirmDeleteMember() {
  if (!isAdmin || deleteMemberId === null) return;
  state.members = state.members.filter((m) => m.id !== deleteMemberId);
  state.loans = state.loans.filter((l) => l.memberId !== deleteMemberId);
  delete state.contributions[deleteMemberId];
  delete state.seedPaid[deleteMemberId];
  closeDelMemMo();
  await saveState();
}
window.confirmDeleteMember = confirmDeleteMember;

// ═══ RULES (admin-adjustable) ════════════════════════════════
const RULE_FIELDS = [
  ["contribution", "Weekly contribution (MWK)", 1, 1],
  ["seedAmount", "Seed per member (MWK)", 1, 1],
  ["seedDueWeek", "Seed due by week", 1, 1],
  ["activeWeeks", "Active weeks (contributions & loans)", 1, 1],
  ["graceWeeks", "Grace weeks (repayments only)", 0, 1],
  ["interest", "Loan interest (%)", 0, 0.1],
  ["loanWeeks", "Loan duration (weeks)", 1, 1],
  ["minLoan", "Minimum loan per member per cycle (MWK, 0 = none)", 0, 1000],
];
function openRulesMo() {
  if (!isAdmin) return;
  const r = rules();
  document.getElementById("rules-body").innerHTML = RULE_FIELDS.map(
    ([k, label, min, step]) =>
      `<div class="fg"><label>${label}</label><input type="number" id="rule-${k}" min="${min}" step="${step}" value="${k === "interest" ? +(r[k] * 100).toFixed(2) : r[k]}"></div>`,
  ).join("");
  document.getElementById("rules-mo").classList.add("open");
}
window.openRulesMo = openRulesMo;
function closeRulesMo() {
  document.getElementById("rules-mo").classList.remove("open");
}
window.closeRulesMo = closeRulesMo;
async function saveRules() {
  if (!isAdmin) return;
  const next = {};
  for (const [k, label, min] of RULE_FIELDS) {
    const v = parseFloat(document.getElementById("rule-" + k).value);
    if (!Number.isFinite(v) || v < min) {
      alert(`${label}: enter a value of at least ${min}.`);
      return;
    }
    next[k] = k === "interest" ? v / 100 : v;
  }
  if (
    next.activeWeeks < state.currentWeek &&
    !confirm(
      `The cycle is already at Week ${state.currentWeek}. With ${next.activeWeeks} active weeks it will count as grace period. Continue?`,
    )
  )
    return;
  state.rules = next;
  closeRulesMo();
  await saveState();
}
window.saveRules = saveRules;

// ═══ BANK RECONCILIATION ═════════════════════════════════════
// The books say what the pool should be; the bank may differ because of
// charges or interest. Each adjustment is logged and flows into the pool
// (and therefore the member payouts). The statement balance is a separate
// figure used only to show what is still unexplained.
function bankAdjTotal() {
  return (state.bank?.adjustments || []).reduce((s, a) => s + a.amount, 0);
}
function signedFmt(n) {
  return (Math.round(n) < 0 ? "-" : "") + fmt(Math.abs(n));
}
function openBankMo() {
  if (!isAdmin) return;
  document.getElementById("bank-stmt").value = state.bank.statement ?? "";
  document.getElementById("bank-adj-amt").value = "";
  document.getElementById("bank-adj-note").value = "";
  document.getElementById("bank-adj-type").value = "charge";
  document.getElementById("bank-log").innerHTML = bankLogHtml();
  document.getElementById("bank-mo").classList.add("open");
}
window.openBankMo = openBankMo;
function closeBankMo() {
  document.getElementById("bank-mo").classList.remove("open");
}
window.closeBankMo = closeBankMo;
async function saveBankStatement() {
  if (!isAdmin) return;
  const raw = document.getElementById("bank-stmt").value.trim();
  const v = raw === "" ? null : parseFloat(raw);
  if (raw !== "" && !Number.isFinite(v)) {
    alert("Enter a valid balance.");
    return;
  }
  state.bank.statement = v;
  await saveState();
  document.getElementById("bank-log").innerHTML = bankLogHtml();
}
window.saveBankStatement = saveBankStatement;
async function addBankAdjustment() {
  if (!isAdmin) return;
  const amt = parseFloat(document.getElementById("bank-adj-amt").value);
  if (!amt || amt <= 0) {
    alert("Enter an amount greater than zero.");
    return;
  }
  const charge = document.getElementById("bank-adj-type").value === "charge";
  state.bank.adjustments.push({
    id: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    amount: charge ? -amt : amt,
    note:
      document.getElementById("bank-adj-note").value.trim() ||
      (charge ? "Bank charge" : "Bank interest"),
  });
  document.getElementById("bank-adj-amt").value = "";
  document.getElementById("bank-adj-note").value = "";
  await saveState();
  document.getElementById("bank-log").innerHTML = bankLogHtml();
}
window.addBankAdjustment = addBankAdjustment;
async function removeBankAdjustment(id) {
  if (!isAdmin) return;
  state.bank.adjustments = state.bank.adjustments.filter((a) => a.id !== id);
  await saveState();
  document.getElementById("bank-log").innerHTML = bankLogHtml();
}
window.removeBankAdjustment = removeBankAdjustment;
function bankLogHtml() {
  const a = state.bank.adjustments;
  if (!a.length) return '<div class="empty" style="padding:14px">No adjustments yet.</div>';
  return `<div class="tw"><table><tbody>${a
    .map(
      (x) =>
        `<tr><td>${x.date}</td><td>${x.note}</td><td style="color:${x.amount < 0 ? "var(--r600)" : "var(--g600)"}">${signedFmt(x.amount)}</td><td><button class="red sm" onclick="removeBankAdjustment(${x.id})">Remove</button></td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}
// A loan is cash-backed if it was issued manually, or is a rollover of one
function isCashLoan(l) {
  for (let i = 0; i < 50 && l; i++) {
    if (l.note === "Manual loan") return true;
    const m = /^Rollover from loan #(\d+)$/.exec(l.note || "");
    if (!m) return false;
    l = state.loans.find((x) => x.id === +m[1]);
  }
  return false;
}
function renderBank() {
  const b = state.bank;
  // only loans actually paid out in cash leave the bank; automatic loans
  // (missed seed/contributions, minimum-loan shortfall) never did
  const out = state.loans
    .filter((l) => l.status === "active" && isCashLoan(l))
    .reduce((s, l) => s + loanOutstanding(l), 0);
  // cash that should be in the bank = pool (incl. adjustments) less money still lent out
  const expected = poolTotal() - out;
  const diff = b.statement === null ? null : b.statement - expected;
  const ok = diff !== null && Math.round(diff) === 0;
  document.getElementById("bank-card").innerHTML = `
    <div class="sh"><span class="st">Bank reconciliation</span><button class="ao sec" onclick="openBankMo()">Update</button></div>
    <div class="sgrid" style="margin-bottom:0">
      <div class="scard"><div class="slabel">Expected in bank</div><div class="sval">${fmt(expected)}</div></div>
      <div class="scard"><div class="slabel">Charges / interest</div><div class="sval">${signedFmt(bankAdjTotal())}</div></div>
      <div class="scard"><div class="slabel">Statement balance</div><div class="sval">${b.statement === null ? "Not set" : fmt(b.statement)}</div></div>
      <div class="scard"><div class="slabel">Unexplained</div><div class="sval" style="color:${diff === null ? "inherit" : ok ? "var(--g600)" : "var(--r600)"}">${diff === null ? "—" : ok ? "Balanced" : signedFmt(diff)}</div></div>
    </div>`;
}

// ═══ COMMENCEMENT DATE ═══════════════════════════════════════
function openDateMo() {
  const v = state.commenceDate || "";
  document.getElementById("commence-date").value = v;
  document.getElementById("date-mo").classList.add("open");
}
window.openDateMo = openDateMo;
function closeDateMo() {
  document.getElementById("date-mo").classList.remove("open");
}
window.closeDateMo = closeDateMo;
async function saveCommenceDate() {
  const d = document.getElementById("commence-date").value;
  if (!d) {
    alert("Please select a date.");
    return;
  }
  state.commenceDate = d;
  closeDateMo();
  await saveState();
}
window.saveCommenceDate = saveCommenceDate;

// Calculate the calendar date for a given week number
function weekDate(weekNum) {
  if (!state.commenceDate) return "";
  const base = new Date(state.commenceDate + "T00:00:00");
  base.setDate(base.getDate() + (weekNum - 1) * 7);
  return base.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ═══ STATE ═══════════════════════════════════════════════════
function freshState() {
  return {
    currentWeek: 0,
    members: [],
    loans: [],
    contributions: {},
    seedPaid: {},
    nextLoanId: 1,
    commenceDate: "",
    rules: { ...DEFAULT_RULES },
    weekAmounts: {},
    bank: { statement: null, adjustments: [] },
  };
}
// ═══ UNDO / REDO ═════════════════════════════════════════════
// Actions mutate `state` in place and then call saveState(), so the
// snapshot to undo to is the last state we saved or received.
const HISTORY_LIMIT = 50;
let undoStack = [];
let redoStack = [];
let lastSaved = null; // JSON of the last saved/loaded state

async function saveState() {
  const now = JSON.stringify(state);
  if (lastSaved !== null && lastSaved !== now) {
    undoStack.push(lastSaved);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
  }
  await writeState(now);
}
async function writeState(json) {
  lastSaved = json;
  showSync(true);
  try {
    await setDoc(STATE_DOC, { data: json });
  } catch (e) {
    alert("Save failed: " + e.message);
  }
  showSync(false);
  renderAll();
}
async function undo() {
  if (!isAdmin || !undoStack.length) return;
  redoStack.push(JSON.stringify(state));
  state = JSON.parse(undoStack.pop());
  await writeState(JSON.stringify(state));
}
window.undo = undo;
async function redo() {
  if (!isAdmin || !redoStack.length) return;
  undoStack.push(JSON.stringify(state));
  state = JSON.parse(redoStack.pop());
  await writeState(JSON.stringify(state));
}
window.redo = redo;
function renderUndoRedo() {
  document.getElementById("undo-btn").disabled = !undoStack.length;
  document.getElementById("redo-btn").disabled = !redoStack.length;
}
document.addEventListener("keydown", (e) => {
  if (!isAdmin || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  // Leave native text undo alone while typing in a visible field
  const t = e.target;
  if (
    t.matches?.("input, textarea, select, [contenteditable]") &&
    t.getClientRects().length
  )
    return;
  const k = e.key.toLowerCase();
  if (k === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if (k === "y" || (k === "z" && e.shiftKey)) {
    e.preventDefault();
    redo();
  }
});
function showSync(on) {
  document.getElementById("sync-indicator").classList.toggle("show", on);
}

// ═══ HELPERS ═════════════════════════════════════════════════
function shortAmt(n) {
  return n >= 1000 ? n / 1000 + "k" : String(n);
}
function fmt(n) {
  return "MWK " + Math.round(n).toLocaleString();
}
function getMember(id) {
  return state.members.find((m) => m.id === id);
}
function seedTotal() {
  return rules().seedAmount * state.members.length;
}
// Each loan keeps the rate it was issued at, so changing the rule later
// does not alter existing loans.
function loanRate(l) {
  return l.rate ?? rules().interest;
}
function loanTotalDue(l) {
  return l.principal * (1 + loanRate(l));
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
function isGracePeriod() {
  return state.currentWeek > rules().activeWeeks;
}
function isCycleComplete() {
  return state.currentWeek >= totalWeeks();
}

function totalContribs() {
  let t = 0;
  state.members.forEach((m) => {
    for (let w = 1; w <= Math.min(state.currentWeek, rules().activeWeeks); w++)
      t += state.contributions[m.id]?.[w] || 0;
  });
  return t;
}
function totalSeedRepaid() {
  let t = 0;
  state.members.forEach((m) => {
    t += state.seedPaid[m.id] || 0;
  });
  return t;
}
function totalInterest() {
  let t = 0;
  state.loans.forEach((l) => {
    const rep = loanRepaid(l);
    if (l.status === "paid") t += l.principal * loanRate(l);
    else t += Math.max(0, rep - l.principal);
  });
  return t;
}
function poolTotal() {
  return seedTotal() + totalContribs() + totalInterest() + bankAdjTotal();
}

// Overpayment: total paid by member minus what they owe
function memberTotalPaid(mid) {
  let paid = 0;
  // contributions
  for (let w = 1; w <= rules().activeWeeks; w++)
    paid += state.contributions[mid]?.[w] || 0;
  // seed repayment
  paid += state.seedPaid[mid] || 0;
  // loan repayments
  state.loans
    .filter((l) => l.memberId === mid)
    .forEach((l) => (paid += loanRepaid(l)));
  return paid;
}
function memberTotalOwed(mid) {
  // contributions expected
  const weeksActive = Math.min(state.currentWeek, rules().activeWeeks);
  let owed = 0;
  for (let w = 1; w <= weeksActive; w++) owed += contribFor(w);
  // seed
  owed += rules().seedAmount;
  // loans total due (all loans ever taken)
  state.loans
    .filter((l) => l.memberId === mid)
    .forEach((l) => (owed += loanTotalDue(l)));
  return owed;
}
function memberOverpayment(mid) {
  return Math.max(0, memberTotalPaid(mid) - memberTotalOwed(mid));
}
function memberMissed(mid) {
  let m = 0;
  for (let w = 1; w <= Math.min(state.currentWeek, rules().activeWeeks); w++) {
    const p = state.contributions[mid]?.[w] || 0;
    if (p < contribFor(w)) m += contribFor(w) - p;
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
  renderUndoRedo();
  const grace = isGracePeriod();
  const complete = isCycleComplete();
  document.getElementById("hweek").textContent =
    `Week ${state.currentWeek} of ${rules().activeWeeks}${grace ? " (Grace)" : ""}`;
  document.getElementById("d-nextw").textContent = state.currentWeek + 1;
  document.getElementById("grace-banner").innerHTML =
    `<strong>Grace Period (Weeks ${rules().activeWeeks + 1}–${totalWeeks()}):</strong> No new contributions or loans. All outstanding balances must be repaid before Week ${totalWeeks()}.`;
  document.getElementById("grace-badge").style.display = grace ? "" : "none";
  document.getElementById("grace-banner").style.display =
    grace && !complete ? "block" : "none";

  // Week control buttons
  const rb = document.getElementById("rollback-btn");
  const ab = document.getElementById("advance-btn");
  const db2 = document.getElementById("date-btn");
  if (rb) rb.style.display = isAdmin && state.currentWeek > 0 ? "" : "none";
  if (ab) {
    ab.style.display = complete ? "none" : "";
    ab.innerHTML = grace
      ? `Advance Grace Week <span id="d-nextw">${state.currentWeek + 1}</span> →`
      : `Advance to Week <span id="d-nextw">${state.currentWeek + 1}</span> →`;
  }
  if (db2) db2.style.display = isAdmin ? "" : "none";

  // Desc text
  const desc = document.getElementById("week-ctrl-desc");
  if (desc)
    desc.textContent = grace
      ? "Grace period: no new contributions or loans. Only repayments are accepted."
      : "Advance the week to record contributions and check loan maturity. Roll back to undo.";

  // Issue loan button hidden in grace period
  const ilb = document.getElementById("issue-loan-btn");
  if (ilb) ilb.style.display = isAdmin && !grace ? "" : "none";

  renderTab(activeTab);
}

// ═══ ADVANCE WEEK ════════════════════════════════════════════
async function advanceWeek() {
  if (!isAdmin) {
    alert("Admin access required.");
    return;
  }
  if (isCycleComplete()) {
    alert("Cycle is fully complete (Week 25).");
    return;
  }
  state.currentWeek++;
  viewedWeek = state.currentWeek;
  state.weekAmounts = state.weekAmounts || {};
  if (state.weekAmounts[state.currentWeek] === undefined)
    state.weekAmounts[state.currentWeek] = rules().contribution;
  const grace = isGracePeriod();

  if (!grace) {
    // Regular week: check contributions & seed
    state.members.forEach((m) => {
      // Missed weekly contribution → auto loan
      const paid = state.contributions[m.id]?.[state.currentWeek] || 0;
      if (paid < contribFor(state.currentWeek))
        mkLoan(
          m.id,
          contribFor(state.currentWeek) - paid,
          `Missed contribution Wk${state.currentWeek}`,
        );

      // Seed due by week 5: if not paid in full → auto loan
      if (state.currentWeek === rules().seedDueWeek) {
        const seedRepaid = state.seedPaid[m.id] || 0;
        const seedOwed = rules().seedAmount - seedRepaid;
        if (seedOwed > 0)
          mkLoan(m.id, seedOwed, `Seed repayment due Wk${rules().seedDueWeek}`);
      }
    });
  }

  // End of the active weeks: members who never took the minimum loan are
  // treated as having taken the shortfall (interest still payable)
  if (state.currentWeek === rules().activeWeeks + 1 && rules().minLoan > 0) {
    state.members.forEach((m) => {
      const taken = state.loans
        .filter((l) => l.memberId === m.id && l.note === "Manual loan")
        .reduce((t, l) => t + l.principal, 0);
      const ln = mkLoan(m.id, rules().minLoan - taken, MIN_LOAN_NOTE);
      if (ln) ln.due_week = totalWeeks();
    });
  }

  // Roll over overdue loans (applies in both regular and grace weeks)
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
      `Roll back from Week ${state.currentWeek} to Week ${state.currentWeek - 1}?\n\nAuto-generated missed-contribution, seed, and rollover loans from this week will be removed. Manual loans and repayments will not be removed.`,
    )
  )
    return;
  const w = state.currentWeek;
  const toRemove = new Set();
  state.loans.forEach((ln) => {
    if (ln.issued_week === w) {
      if (
        ln.note === `Missed contribution Wk${w}` ||
        ln.note === `Seed repayment due Wk${rules().seedDueWeek}` ||
        ln.note === MIN_LOAN_NOTE ||
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
  delete state.weekAmounts?.[state.currentWeek];
  state.currentWeek--;
  viewedWeek = Math.max(1, state.currentWeek);
  await saveState();
}
window.rollBackWeek = rollBackWeek;

function mkLoan(memberId, principal, note) {
  if (principal <= 0) return null;
  const loan = {
    id: state.nextLoanId++,
    memberId,
    principal,
    issued_week: state.currentWeek,
    due_week: state.currentWeek + rules().loanWeeks,
    rate: rules().interest,
    status: "active",
    note: note || "",
    repayments: [],
  };
  state.loans.push(loan);
  return loan;
}

// ═══ DASHBOARD ═══════════════════════════════════════════════
function renderDash() {
  const n = state.members.length;
  const aLoans = state.loans.filter((l) => l.status === "active");
  const totalOwed = aLoans.reduce((s, l) => s + loanOutstanding(l), 0);
  renderBank();
  const grace = isGracePeriod();
  document.getElementById("d-stats").innerHTML = `
    <div class="scard"><div class="slabel">Total Pool</div><div class="sval">${fmt(poolTotal())}</div></div>
    <div class="scard"><div class="slabel">Seed (${n}×${shortAmt(rules().seedAmount)})</div><div class="sval">${fmt(seedTotal())}</div></div>
    <div class="scard"><div class="slabel">Contributions</div><div class="sval">${fmt(totalContribs())}</div></div>
    <div class="scard"><div class="slabel">Interest Earned</div><div class="sval">${fmt(totalInterest())}</div></div>
    <div class="scard"><div class="slabel">Outstanding Loans</div><div class="sval">${fmt(totalOwed)}</div></div>
    <div class="scard"><div class="slabel">Members</div><div class="sval">${n}</div></div>
    <div class="scard"><div class="slabel">Bank Charges / Interest</div><div class="sval">${signedFmt(bankAdjTotal())}</div></div>`;

  let alerts = "";
  if (state.currentWeek === 0)
    alerts +=
      '<div class="alert aa">Add members then advance to Week 1 to begin. Optionally set a commencement date.</div>';
  if (state.commenceDate && state.currentWeek > 0)
    alerts += `<div class="alert ag"> Week ${state.currentWeek} — ${weekDate(state.currentWeek)}</div>`;
  if (grace && !isCycleComplete())
    alerts += `<div class="alert ap">Grace period active. Weeks ${rules().activeWeeks + 1}–${totalWeeks()}. All debts must be cleared by Week ${totalWeeks()}.</div>`;
  const od = aLoans.filter((l) => l.due_week < state.currentWeek);
  if (od.length)
    alerts += `<div class="alert ar">⚠ ${od.length} loan(s) overdue — will roll over on next week advance.</div>`;
  const seedWarning = state.members.filter(
    (m) =>
      (state.seedPaid[m.id] || 0) < rules().seedAmount &&
      state.currentWeek < rules().seedDueWeek &&
      state.currentWeek > 0,
  );
  if (seedWarning.length && !grace)
    alerts += `<div class="alert aa"> ${seedWarning.length} member(s) yet to repay their seed. Due by Week ${rules().seedDueWeek}.</div>`;
  if (isCycleComplete())
    alerts +=
      '<div class="alert ag">✓ Cycle complete! See the Share tab for final distribution.</div>';
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
        ? `<td style="white-space:nowrap">
      <button class="sm" onclick="openRepay(${l.id})">Repay</button>
      <button class="red sm" onclick="openDeleteLoan(${l.id})">Delete</button></td>`
        : "<td></td>";
      return `<tr><td>${m ? m.name : "?"}</td><td>${fmt(l.principal)}</td><td>${fmt(loanTotalDue(l))}</td><td>${fmt(owed)}</td><td>Wk${l.due_week}${l.due_week && state.commenceDate ? ` <span style="color:var(--tx3);font-size:11px">(${weekDate(l.due_week)})</span>` : ""}
      </td><td>${overdue ? '<span class="badge br">Overdue</span>' : '<span class="badge ba">Active</span>'}</td>${rb}</tr>`;
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
  state.seedPaid[id] = 0;
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
      const seedPd = state.seedPaid[m.id] || 0;
      const seedOwed = Math.max(0, rules().seedAmount - seedPd);
      const seedBadge =
        seedOwed === 0
          ? '<span class="badge bg">Seed ✓</span>'
          : `<span class="badge ba">Seed MWK ${seedOwed.toLocaleString()} due</span>`;
      const lb =
        isAdmin && !isGracePeriod()
          ? `<button class="sm" onclick="openIssueLoan(${m.id})">Loan</button>`
          : "";
      const eb = isAdmin
        ? `<button class="sec sm" onclick="openEditMember(${m.id})">Edit</button>`
        : "";
      const spb =
        isAdmin && seedOwed > 0
          ? `<button class="sec sm" onclick="openSeedRepay(${m.id})">Seed Repay</button>`
          : "";
      const db = isAdmin
        ? `<button class="red sm" onclick="openDeleteMember(${m.id})">Delete</button>`
        : "";
      return `<tr>
      <td><strong>${m.name}</strong>${m.phone ? `<br><span style="color:var(--tx3);font-size:11px">${m.phone}</span>` : ""}</td>
      <td>${seedBadge}</td>
      <td>${missed > 0 ? `<span class="badge ba">MWK ${missed.toLocaleString()} missed</span>` : '<span class="badge bg">Up to date</span>'}</td>
      <td>${bal > 0 ? `<span style="color:var(--r600);font-weight:500">${fmt(bal)}</span>` : '<span style="color:var(--g600)">None</span>'}</td>
      <td style="white-space:nowrap"><button class="sec sm" onclick="viewMember(${m.id})">View</button> ${eb} ${spb} ${lb} ${db}</td>
    </tr>`;
    })
    .join("");
  document.getElementById("mem-list").innerHTML = `<div class="tw"><table>
    <thead><tr><th>Name</th><th>Seed</th><th>Contributions</th><th>Loan Balance</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// Seed repayment modal
function openSeedRepay(mid) {
  if (!isAdmin) return;
  const m = getMember(mid);
  if (!m) return;
  const seedPd = state.seedPaid[mid] || 0;
  const seedOwed = Math.max(0, rules().seedAmount - seedPd);
  document.getElementById("repay-mo-body").innerHTML = `
    <p style="margin-bottom:11px"><strong>${m.name}</strong> — Seed Repayment</p>
    <div style="background:var(--bg3);border-radius:var(--rads);padding:10px;font-size:13px;margin-bottom:11px">
      Seed Amount: ${fmt(rules().seedAmount)}<br>Already Paid: ${fmt(seedPd)}<br><strong>Outstanding: ${fmt(seedOwed)}</strong><br>
      <span style="color:var(--tx3);font-size:12px">Due by Week ${rules().seedDueWeek}${state.commenceDate ? ` (${weekDate(rules().seedDueWeek)})` : ""}</span></div>
    <div class="fg" style="margin-bottom:11px"><label>Amount Paid (MWK)</label><input type="number" id="r-amt" value="${Math.round(seedOwed)}" min="1"></div>
    <div class="mact"><button class="sec" onclick="closeRepayMo()">Cancel</button><button onclick="doSeedRepay(${mid})">Record</button></div>`;
  document.getElementById("repay-mo").classList.add("open");
}
window.openSeedRepay = openSeedRepay;
async function doSeedRepay(mid) {
  if (!isAdmin) return;
  const amt = parseFloat(document.getElementById("r-amt").value);
  if (!amt || amt <= 0) {
    alert("Enter a valid amount.");
    return;
  }
  if (!state.seedPaid) state.seedPaid = {};
  state.seedPaid[mid] = (state.seedPaid[mid] || 0) + amt;
  // Remove auto seed loan if it exists and this payment covers it
  const idx = state.loans.findIndex(
    (l) =>
      l.memberId === mid &&
      l.note === `Seed repayment due Wk${rules().seedDueWeek}` &&
      l.status === "active" &&
      l.repayments.length === 0,
  );
  if (idx > -1) state.loans.splice(idx, 1);
  closeRepayMo();
  await saveState();
}
window.doSeedRepay = doSeedRepay;

function viewMember(id) {
  const m = getMember(id);
  if (!m) return;
  const loans = state.loans.filter((l) => l.memberId === id);
  const seedPd = state.seedPaid[id] || 0;
  const seedOwed = Math.max(0, rules().seedAmount - seedPd);
  let crows = "";
  for (let w = 1; w <= Math.min(state.currentWeek, rules().activeWeeks); w++) {
    const p = state.contributions[id]?.[w] || 0;
    const dateStr = state.commenceDate
      ? ` <span style="color:var(--tx3);font-size:11px">${weekDate(w)}</span>`
      : "";
    crows += `<tr><td>Week ${w}${dateStr}</td><td>${fmt(p)}</td><td>${p >= contribFor(w) ? '<span class="badge bg">Paid</span>' : '<span class="badge ba">Missed</span>'}</td></tr>`;
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
  const overpay = memberOverpayment(id);
  document.getElementById("mem-mo-title").textContent = m.name;
  document.getElementById("mem-mo-body").innerHTML = `
    ${m.phone ? `<p style="color:var(--tx2);margin-bottom:11px">${m.phone}</p>` : ""}
    <div style="background:var(--bg3);border-radius:var(--rads);padding:12px;margin-bottom:14px;font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><div style="color:var(--tx3);font-size:11px;margin-bottom:2px">SEED ALLOCATED</div><strong>${fmt(rules().seedAmount)}</strong></div>
      <div><div style="color:var(--tx3);font-size:11px;margin-bottom:2px">SEED REPAID</div><strong>${fmt(seedPd)}</strong></div>
      <div><div style="color:var(--tx3);font-size:11px;margin-bottom:2px">SEED OUTSTANDING</div><strong style="color:${seedOwed > 0 ? "var(--r600)" : "var(--g600)"}">${fmt(seedOwed)}</strong></div>
      ${overpay > 0 ? `<div><div style="color:var(--tx3);font-size:11px;margin-bottom:2px">OVERPAYMENT</div><strong style="color:var(--g600)">${fmt(overpay)} (refund)</strong></div>` : ""}
    </div>
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:500;text-transform:uppercase;color:var(--tx3);margin-bottom:7px">Weekly Contributions</div>
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
  if (isGracePeriod()) {
    alert("No new loans during the grace period.");
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
      ${Math.round(rules().interest * 100)}% interest · Total = Principal × ${(1 + rules().interest).toFixed(2)} · Due: Week ${state.currentWeek + rules().loanWeeks}${state.commenceDate ? ` (${weekDate(state.currentWeek + rules().loanWeeks)})` : ""}</div>
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

let deleteLoanId = null;
function openDeleteLoan(loanId) {
  if (!isAdmin) {
    alert("Admin access required.");
    return;
  }
  const ln = state.loans.find((l) => l.id === loanId);
  if (!ln) return;
  const m = getMember(ln.memberId);
  deleteLoanId = loanId;
  document.getElementById("del-loan-body").innerHTML = `
    <div style="background:var(--r50);border:1px solid var(--r600);border-radius:var(--rads);padding:12px;margin-bottom:14px;font-size:13px;color:var(--r600)">Permanently removes this loan and all its repayment records.</div>
    <div style="background:var(--bg3);border-radius:var(--rads);padding:12px;font-size:13px">
      <strong>Loan #${ln.id}</strong> — ${m ? m.name : "Unknown"}<br>
      Principal: ${fmt(ln.principal)}<br>Total Due: ${fmt(loanTotalDue(ln))}<br>
      Status: ${ln.status}${ln.note ? `<br>Note: ${ln.note}` : ""}</div>`;
  document.getElementById("del-loan-mo").classList.add("open");
}
window.openDeleteLoan = openDeleteLoan;
function closeDelLoanMo() {
  document.getElementById("del-loan-mo").classList.remove("open");
  deleteLoanId = null;
}
window.closeDelLoanMo = closeDelLoanMo;
async function confirmDeleteLoan() {
  if (!isAdmin || deleteLoanId === null) return;
  const ln = state.loans.find((l) => l.id === deleteLoanId);
  if (ln?.note.startsWith("Rollover from loan #")) {
    const origId = parseInt(ln.note.replace("Rollover from loan #", ""));
    const orig = state.loans.find((l) => l.id === origId);
    if (orig?.status === "rolled") orig.status = "active";
  }
  state.loans = state.loans.filter((l) => l.id !== deleteLoanId);
  closeDelLoanMo();
  await saveState();
}
window.confirmDeleteLoan = confirmDeleteLoan;

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
      const dueStr = `Wk${l.due_week}${state.commenceDate ? `<br><span style="font-size:10px;color:var(--tx3)">${weekDate(l.due_week)}</span>` : ""}`;
      const actions = isAdmin
        ? `<td style="white-space:nowrap">
      ${l.status === "active" ? `<button class="sm" onclick="openRepay(${l.id})">Repay</button> ` : ""}
      <button class="red sm" onclick="openDeleteLoan(${l.id})">Delete</button></td>`
        : "<td></td>";
      return `<tr><td>#${l.id}</td><td>${m ? m.name : "?"}</td><td>${fmt(l.principal)}</td><td>${fmt(loanTotalDue(l))}</td>
      <td>${fmt(owed)}</td><td>Wk${l.issued_week}</td><td>${dueStr}</td>
      <td><span class="badge ${bc}">${l.status}${od ? " ⚠" : ""}</span></td>
      <td style="font-size:11px;color:var(--tx3)">${l.note || ""}</td>${actions}</tr>`;
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
  const dateStr = state.commenceDate ? ` — ${weekDate(viewedWeek)}` : "";
  document.getElementById("wk-label").textContent =
    `Week ${viewedWeek}${dateStr}`;
  if (!state.members.length) {
    document.getElementById("wk-table").innerHTML =
      '<div class="empty">Add members first.</div>';
    return;
  }
  const isActiveWk = viewedWeek <= rules().activeWeeks;
  const aC = isAdmin && isActiveWk ? "<th></th>" : "";
  const seedCol = isAdmin ? "<th>Seed</th>" : "<th>Seed</th>";
  const rows = state.members
    .map((m) => {
      const paid = isActiveWk
        ? state.contributions[m.id]?.[viewedWeek] || 0
        : 0;
      const st = !isActiveWk
        ? '<span class="badge bx">Grace Week</span>'
        : paid >= contribFor(viewedWeek)
          ? '<span class="badge bg">Paid</span>'
          : '<span class="badge ba">Missed</span>';
      const seedPd = state.seedPaid[m.id] || 0;
      const seedOwed = Math.max(0, rules().seedAmount - seedPd);
      const seedSt =
        seedOwed === 0
          ? '<span class="badge bg">✓</span>'
          : `<span class="badge ba">${fmt(seedOwed)} due</span>`;
      const btn =
        isAdmin &&
        isActiveWk &&
        viewedWeek <= state.currentWeek &&
        paid < contribFor(viewedWeek)
          ? `<td><button class="sm" onclick="markPaid(${m.id},${viewedWeek})">Mark Paid</button></td>`
          : isAdmin
            ? "<td></td>"
            : "";
      return `<tr><td>${m.name}</td><td>${seedSt}</td><td>${isActiveWk ? st : ""}</td><td>${isActiveWk ? fmt(paid) : ""}</td>${btn}</tr>`;
    })
    .join("");
  document.getElementById("wk-table").innerHTML = `<div class="tw"><table>
    <thead><tr><th>Member</th>${seedCol}<th>Status</th><th>Amount</th>${aC}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
async function markPaid(mid, week) {
  if (!isAdmin) return;
  if (!state.contributions[mid]) state.contributions[mid] = {};
  state.contributions[mid][week] = contribFor(week);
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
  if (!isCycleComplete()) {
    el.innerHTML = `<div class="alert aa">Cycle ends at Week ${totalWeeks()} (Active: ${rules().activeWeeks} weeks + ${rules().graceWeeks}-week grace). Currently at Week ${state.currentWeek}.</div>`;
    // Show preview during grace period
    if (!isGracePeriod()) return;
    el.innerHTML +=
      '<div class="alert ap">Preview below — final numbers update as repayments come in during the grace period.</div>';
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
      const seedOwed = Math.max(0, rules().seedAmount - (state.seedPaid[m.id] || 0));
      const totalDebt = debt + seedOwed;
      const overpay = memberOverpayment(m.id);
      const netShare = Math.max(0, eq - totalDebt) + overpay;
      const flags = [];
      if (debt > 0)
        flags.push(`<span class="badge br">Loans: ${fmt(debt)}</span>`);
      if (seedOwed > 0)
        flags.push(`<span class="badge ba">Seed: ${fmt(seedOwed)}</span>`);
      if (overpay > 0)
        flags.push(`<span class="badge bg">Refund: ${fmt(overpay)}</span>`);
      return `<tr>
      <td><strong>${m.name}</strong></td>
      <td>${fmt(eq)}</td>
      <td>${flags.length ? flags.join(" ") : "—"}</td>
      <td><strong style="color:${netShare > 0 ? "var(--g600)" : "var(--r600)"}">${fmt(netShare)}</strong></td>
    </tr>`;
    })
    .join("");

  el.innerHTML =
    (el.innerHTML || "") +
    `
    <div class="sgrid" style="margin-bottom:16px">
      <div class="scard"><div class="slabel">Total Pool</div><div class="sval">${fmt(pool)}</div></div>
      <div class="scard"><div class="slabel">Members</div><div class="sval">${n}</div></div>
      <div class="scard"><div class="slabel">Seed per Member</div><div class="sval">${fmt(rules().seedAmount)}</div></div>
      <div class="scard"><div class="slabel">Equal Share Each</div><div class="sval">${fmt(eq)}</div></div>
    </div>
    <div style="background:var(--g50);border:1px solid var(--g200);border-radius:var(--rad);padding:14px;margin-bottom:14px;font-size:13px;color:var(--g800)">
      Pool = Seed ${fmt(seedTotal())} + Contributions ${fmt(totalContribs())} + Interest ${fmt(totalInterest())} + Bank adjustments ${signedFmt(bankAdjTotal())} = <strong>${fmt(pool)}</strong><br>
      <span style="color:var(--g600);font-size:12px">Equal share = ${fmt(eq)} per member. Deductions for unpaid loans/seed. Refunds for overpayments.</span>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Member</th><th>Equal Share</th><th>Adjustments</th><th>Net Payout</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

// ═══ FIRESTORE LISTENER ═════════════════════════════════════
// Fast start: the last server copy is cached in localStorage and shown
// straight away (read-only) while Firestore connects. Admin login waits for
// the first server snapshot so a stale cache can never overwrite newer data.
const CACHE_KEY = "vb_cache_v1";
let appReady = false;
let serverSynced = false;

function normalize(d) {
  if (!d.seedPaid) d.seedPaid = {};
  if (!d.rules) d.rules = { ...DEFAULT_RULES };
  if (!d.weekAmounts) d.weekAmounts = {};
  if (!d.bank) d.bank = { statement: null, adjustments: [] };
  d.members.forEach((m) => {
    if (d.seedPaid[m.id] === undefined) d.seedPaid[m.id] = 0;
  });
  return d;
}
function showAuthScreen() {
  document.getElementById("loading-screen").classList.add("gone");
  document.getElementById("auth-screen").classList.remove("gone");
  setTimeout(() => document.getElementById("auth-pw").focus(), 100);
}
try {
  const c = localStorage.getItem(CACHE_KEY);
  if (c) {
    state = normalize(JSON.parse(c));
    lastSaved = JSON.stringify(state);
    appReady = true;
    showAuthScreen();
  }
} catch {}

onSnapshot(
  STATE_DOC,
  (snap) => {
    let incoming;
    try {
      incoming = snap.exists() ? JSON.parse(snap.data().data) : freshState();
    } catch {
      incoming = freshState();
    }
    normalize(incoming);
    if (!snap.metadata.fromCache) {
      serverSynced = true;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(incoming));
      } catch {}
    }

    if (!appReady) {
      state = incoming;
      lastSaved = JSON.stringify(incoming);
      appReady = true;
      showAuthScreen();
    } else {
      const a = JSON.stringify(incoming),
        b = JSON.stringify(state);
      if (a !== lastSaved) {
        // Another device changed the data; our history no longer applies
        undoStack = [];
        redoStack = [];
      }
      lastSaved = a;
      if (a !== b) {
        state = incoming;
        renderAll();
      }
    }
  },
  (err) => {
    document.getElementById("loading-screen").classList.add("gone");
    document.getElementById("auth-screen").classList.remove("gone");
    document.getElementById("auth-err").textContent =
      "Connection failed: " + err.message;
  },
);
