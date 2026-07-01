// ═══ CONSTANTS ══════════════════════════════════════════════
const CONTRIBUTION = 10000;
const TOTAL_WEEKS = 20;
const INTEREST = 0.3;
const LOAN_WEEKS = 5;
const STORE_KEY = "vb_state_v4";
const PW_KEY = "vb_pw_v1";
// Default password hash for "admin123"
const DEFAULT_HASH =
  "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

// ═══ AUTH ════════════════════════════════════════════════════
let isAdmin = false;

async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function storedHash() {
  return localStorage.getItem(PW_KEY) || DEFAULT_HASH;
}

async function doLogin() {
  const pw = document.getElementById("auth-pw").value.trim();
  if (!pw) {
    asViewer();
    return;
  }
  const h = await sha256(pw);
  if (h === storedHash()) {
    isAdmin = true;
    document.getElementById("auth-screen").classList.add("gone");
    applyRole();
  } else {
    document.getElementById("auth-err").textContent = "Incorrect password.";
  }
}
function asViewer() {
  isAdmin = false;
  document.getElementById("auth-screen").classList.add("gone");
  applyRole();
}
function showAuth() {
  document.getElementById("auth-pw").value = "";
  document.getElementById("auth-err").textContent = "";
  document.getElementById("auth-screen").classList.remove("gone");
  setTimeout(() => document.getElementById("auth-pw").focus(), 80);
}
function lockApp() {
  isAdmin = false;
  applyRole();
}
function applyRole() {
  const body = document.body;
  const pill = document.getElementById("rpill");
  const banner = document.getElementById("vbanner");
  const lockBtn = document.getElementById("lock-btn");
  const loginBtn = document.getElementById("login-btn");
  if (isAdmin) {
    body.classList.remove("viewer");
    body.classList.add("admin");
    pill.textContent = "Admin";
    pill.className = "rpill admin";
    banner.classList.add("gone");
    lockBtn.style.display = "";
    loginBtn.style.display = "none";
  } else {
    body.classList.remove("admin");
    body.classList.add("viewer");
    pill.textContent = "Viewer";
    pill.className = "rpill viewer";
    banner.classList.remove("gone");
    lockBtn.style.display = "none";
    loginBtn.style.display = "";
  }
  renderAll();
}

// ═══ PASSWORD CHANGE ═════════════════════════════════════════
function openPwMo() {
  document.getElementById("pw-mo").classList.add("open");
}
function closePwMo() {
  document.getElementById("pw-mo").classList.remove("open");
}
async function savePw() {
  const cur = document.getElementById("pw-cur").value;
  const nw = document.getElementById("pw-new").value;
  const cf = document.getElementById("pw-cf").value;
  const err = document.getElementById("pw-err");
  if ((await sha256(cur)) !== storedHash()) {
    err.textContent = "Current password is wrong.";
    return;
  }
  if (nw.length < 4) {
    err.textContent = "New password must be at least 4 characters.";
    return;
  }
  if (nw !== cf) {
    err.textContent = "Passwords do not match.";
    return;
  }
  localStorage.setItem(PW_KEY, await sha256(nw));
  err.textContent = "";
  closePwMo();
  document.getElementById("pw-cur").value = "";
  document.getElementById("pw-new").value = "";
  document.getElementById("pw-cf").value = "";
  alert("Password changed successfully.");
}

// ═══ CLEAR DATA ══════════════════════════════════════════════
function openClearMo() {
  document.getElementById("clear-confirm").value = "";
  document.getElementById("clear-mo").classList.add("open");
}
function closeClearMo() {
  document.getElementById("clear-mo").classList.remove("open");
}
function doClear() {
  if (document.getElementById("clear-confirm").value.trim() !== "CLEAR") {
    alert("Please type CLEAR to confirm.");
    return;
  }
  state = freshState();
  saveState();
  closeClearMo();
  renderAll();
}

// ═══ STATE ═══════════════════════════════════════════════════
function freshState() {
  return {
    currentWeek: 0,
    members: [],
    loans: [],
    contributions: {},
    nextLoanId: 1,
  };
}
function loadState() {
  try {
    const s = localStorage.getItem(STORE_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

let state = loadState() || freshState();

// ═══ HELPERS ═════════════════════════════════════════════════
function fmt(n) {
  return "MWK " + Math.round(n).toLocaleString();
}
function getMember(id) {
  return state.members.find((m) => m.id === id);
}

// Seed money is 100,000 PER MEMBER
function seedTotal() {
  return 100000 * state.members.length;
}

function loanTotalDue(loan) {
  return loan.principal * (1 + INTEREST);
}
function loanRepaid(loan) {
  return loan.repayments.reduce((s, r) => s + r.amount, 0);
}
function loanOutstanding(loan) {
  return Math.max(0, loanTotalDue(loan) - loanRepaid(loan));
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
function renderTab(t) {
  if (t === "dash") renderDash();
  else if (t === "members") renderMembers();
  else if (t === "loans") renderLoans();
  else if (t === "weekly") renderWeekly();
  else if (t === "share") renderShare();
}
function renderAll() {
  document.getElementById("hweek").textContent =
    `Week ${state.currentWeek} of ${TOTAL_WEEKS}`;
  document.getElementById("d-nextw").textContent = state.currentWeek + 1;
  renderTab(activeTab);
}

// ═══ ADVANCE WEEK ════════════════════════════════════════════
function advanceWeek() {
  if (!isAdmin) {
    alert("Admin access required.");
    return;
  }
  if (state.currentWeek >= TOTAL_WEEKS) {
    alert("20-week cycle is complete.");
    return;
  }
  state.currentWeek++;
  viewedWeek = state.currentWeek;
  // Auto-loan for missed contributions
  state.members.forEach((m) => {
    const paid = state.contributions[m.id]?.[state.currentWeek] || 0;
    if (paid < CONTRIBUTION)
      mkLoan(
        m.id,
        CONTRIBUTION - paid,
        `Missed contribution Wk${state.currentWeek}`,
      );
  });
  // Roll over overdue loans
  state.loans.forEach((ln) => {
    if (ln.status === "active" && ln.due_week < state.currentWeek) {
      const owed = loanOutstanding(ln);
      if (owed > 0) {
        ln.status = "rolled";
        mkLoan(ln.memberId, owed, `Rollover from loan #${ln.id}`);
      }
    }
  });
  saveState();
  renderAll();
}
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
    <div class="scard"><div class="slabel">Seed (${n} × MWK 100k)</div><div class="sval">${fmt(seedTotal())}</div></div>
    <div class="scard"><div class="slabel">Contributions</div><div class="sval">${fmt(totalContribs())}</div></div>
    <div class="scard"><div class="slabel">Interest Earned</div><div class="sval">${fmt(totalInterest())}</div></div>
    <div class="scard"><div class="slabel">Outstanding Loans</div><div class="sval">${fmt(totalOwed)}</div></div>
    <div class="scard"><div class="slabel">Members</div><div class="sval">${n}</div></div>
  `;
  let alerts = "";
  if (state.currentWeek === 0)
    alerts +=
      '<div class="alert aa">Add members, then click "Advance to Week 1" to begin.</div>';
  const overdue = aLoans.filter((l) => l.due_week < state.currentWeek);
  if (overdue.length)
    alerts += `<div class="alert ar">⚠ ${overdue.length} loan(s) overdue — will roll over on next week advance.</div>`;
  if (state.currentWeek >= TOTAL_WEEKS)
    alerts +=
      '<div class="alert ag">✓ Cycle complete! See the Share tab for distribution.</div>';
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
      const od = l.due_week < state.currentWeek;
      const rb = isAdmin
        ? `<td><button onclick="openRepay(${l.id})" style="padding:3px 8px;font-size:11px">Repay</button></td>`
        : "<td></td>";
      return `<tr><td>${m ? m.name : "?"}</td><td>${fmt(l.principal)}</td><td>${fmt(loanTotalDue(l))}</td>
      <td>${fmt(owed)}</td><td>Wk${l.due_week}</td>
      <td>${od ? '<span class="badge br">Overdue</span>' : '<span class="badge ba">Active</span>'}</td>${rb}</tr>`;
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
function addMember() {
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
  saveState();
  document.getElementById("nm-name").value = "";
  document.getElementById("nm-phone").value = "";
  addMemOpen = false;
  document.getElementById("add-mem-card").style.display = "none";
  renderMembers();
  renderDash(); // refresh seed total
}
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
      return `<tr>
      <td><strong>${m.name}</strong>${m.phone ? `<br><span style="color:var(--tx3);font-size:11px">${m.phone}</span>` : ""}</td>
      <td>${missed > 0 ? `<span class="badge ba">MWK ${missed.toLocaleString()} missed</span>` : '<span class="badge bg">Up to date</span>'}</td>
      <td>${bal > 0 ? `<span style="color:var(--r600);font-weight:500">${fmt(bal)}</span>` : '<span style="color:var(--g600)">None</span>'}</td>
      <td><button class="sec" onclick="viewMember(${m.id})" style="padding:3px 8px;font-size:11px">View</button> ${lb}</td>
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
      <div style="font-size:14px">${fmt(100000)} allocated</div>
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
function closeMemMo() {
  document.getElementById("mem-mo").classList.remove("open");
}

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
function closeLoanMo() {
  document.getElementById("loan-mo").classList.remove("open");
}
function doIssueLoan() {
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
  saveState();
  closeLoanMo();
  renderAll();
}
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
function closeRepayMo() {
  document.getElementById("repay-mo").classList.remove("open");
}
function doRepay(loanId) {
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
  saveState();
  closeRepayMo();
  renderAll();
}
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
function markPaid(mid, week) {
  if (!isAdmin) return;
  if (!state.contributions[mid]) state.contributions[mid] = {};
  state.contributions[mid][week] = CONTRIBUTION;
  // Remove the auto-created missed contribution loan if untouched
  const idx = state.loans.findIndex(
    (l) =>
      l.memberId === mid &&
      l.note === `Missed contribution Wk${week}` &&
      l.status === "active" &&
      l.repayments.length === 0,
  );
  if (idx > -1) state.loans.splice(idx, 1);
  saveState();
  renderWeekly();
  renderDash();
}

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
      return `<tr><td><strong>${m.name}</strong></td><td>${fmt(100000)}</td><td>${fmt(eq)}</td>
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
      <span style="color:var(--g600);font-size:12px">Divided equally among ${n} member${n !== 1 ? "s" : ""} = ${fmt(eq)} each, minus outstanding debts.</span>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Member</th><th>Seed</th><th>Equal Share</th><th>Deductions</th><th>Net Payout</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

// ═══ INIT ════════════════════════════════════════════════════
// Default password is: admin123
renderAll();
