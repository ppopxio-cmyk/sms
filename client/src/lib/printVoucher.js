import { formatEthiopian, ETH_MONTHS } from './ethiopianDate';

const DEFAULT_COLLEGE = 'COLLEGE PAYMENT PORTAL';

// The college name lives in the college's system settings (Admin Settings → institution).
// `/api/status` is public and returns `{ name: settings.institution.name }`, so every
// role — accountant, registrar and the public payment portal — can print the letterhead.
let cachedCollegeName = '';
let cachedCollegeNameAt = 0;
const COLLEGE_CACHE_TTL = 10 * 60 * 1000;

export async function getCollegeName() {
  try {
    const stored = sessionStorage.getItem('sms-voucher-college');
    if (stored) {
      if (cachedCollegeName !== stored) {
        cachedCollegeName = stored;
        cachedCollegeNameAt = Date.now();
      }
      return stored;
    }
  } catch {
    // private mode — fall through to the network
  }
  if (cachedCollegeName && Date.now() - cachedCollegeNameAt < COLLEGE_CACHE_TTL) return cachedCollegeName;
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data?.name) {
      cachedCollegeName = data.name;
      cachedCollegeNameAt = Date.now();
      try {
        sessionStorage.setItem('sms-voucher-college', data.name);
      } catch {
        // ignore storage failures
      }
      return data.name;
    }
  } catch {
    // offline / endpoint unavailable — use the last name or the default
  }
  return cachedCollegeName || DEFAULT_COLLEGE;
}

const METHOD_LABELS = {
  cash: 'Cash Settlement',
  manual: 'Manual Bank Transfer',
  cbe_receipt: 'CBE Digital Receipt',
  chapa: 'Chapa Online Gateway',
};

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function methodLabel(method) {
  if (!method) return '—';
  return METHOD_LABELS[String(method).toLowerCase()] || String(method).toUpperCase();
}

function voucherStyles() {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      padding: 24px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .voucher {
      max-width: 780px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #cbd5e1;
      box-shadow: 0 10px 24px rgba(15, 23, 42, .12);
      position: relative;
      overflow: hidden;
    }
    .top-band { background: #0f172a; color: #fff; padding: 14px 26px; display: flex; justify-content: space-between; align-items: center; }
    .top-band .doc { font-size: 13px; font-weight: 800; letter-spacing: 2.5px; }
    .top-band .copy { font-size: 10px; letter-spacing: 1.5px; opacity: .85; border: 1px solid rgba(255,255,255,.4); padding: 3px 10px; border-radius: 999px; }
    .letterhead { padding: 22px 26px 14px; border-bottom: 3px solid #0f172a; display: flex; justify-content: space-between; gap: 16px; }
    .college-name { font-size: 20px; font-weight: 900; color: #0f172a; letter-spacing: .4px; }
    .college-sub { font-size: 11px; color: #475569; margin-top: 3px; }
    .voucher-title { text-align: right; }
    .voucher-title .lbl { font-size: 10px; letter-spacing: 1.6px; font-weight: 700; color: #64748b; text-transform: uppercase; }
    .voucher-title .no { font-family: 'Consolas', monospace; font-size: 18px; font-weight: 800; color: #047857; }
    .title-ribbon { margin: 0 26px; border-bottom: 1px dashed #94a3b8; padding: 12px 0 10px; display: flex; justify-content: space-between; align-items: center; }
    .title-ribbon h2 { font-size: 15px; font-weight: 800; letter-spacing: 3.2px; text-transform: uppercase; color: #0f172a; }
    .status-chip { font-size: 10px; font-weight: 800; letter-spacing: 1.2px; padding: 5px 14px; border-radius: 999px; }
    .status-chip.confirmed { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .status-chip.reversed { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .status-chip.other { background: #e2e8f0; color: #0f172a; border: 1px solid #94a3b8; }
    main { padding: 20px 26px 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 28px; }
    .field { padding-top: 4px; }
    .field .k { font-size: 9.5px; font-weight: 700; letter-spacing: 1.3px; color: #64748b; text-transform: uppercase; }
    .field .v { font-size: 13.5px; font-weight: 700; color: #0f172a; margin-top: 2px; }
    .field .v.mono { font-family: 'Consolas', monospace; }
    .amount-box { margin: 18px 26px 6px; display: flex; justify-content: space-between; align-items: center; background: #ecfdf5; border: 2px solid #10b981; border-radius: 12px; padding: 14px 20px; }
    .amount-box .k { font-size: 10px; font-weight: 800; letter-spacing: 1.6px; color: #065f46; text-transform: uppercase; }
    .amount-box .v { font-family: 'Consolas', monospace; font-size: 30px; font-weight: 900; color: #065f46; }
    .amount-words { margin: 0 26px; padding: 8px 0 0; font-size: 11px; color: #475569; border-bottom: 1px dashed #94a3b8; padding-bottom: 14px; }
    .note { margin: 0 26px; padding: 12px 0 0; font-size: 10px; color: #64748b; line-height: 1.5; }
    .sign { display: flex; justify-content: space-between; gap: 40px; margin: 26px 26px 4px; }
    .sig { flex: 1; border-top: 1.5px solid #0f172a; text-align: center; font-size: 10px; font-weight: 700; color: #334155; padding-top: 6px; }
    .stamp { position: absolute; right: 30px; bottom: 56px; width: 120px; height: 120px; border: 3px double rgba(16,185,129,.55); border-radius: 50%; display: flex; align-items: center; justify-content: center; transform: rotate(-14deg); opacity: .8; }
    .stamp span { font-size: 10px; font-weight: 800; letter-spacing: 1.6px; color: rgba(5,150,105,.85); text-align: center; text-transform: uppercase; }
    footer { margin-top: 18px; background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 12px 26px; display: flex; justify-content: space-between; font-size: 9.5px; color: #94a3b8; }
  `;
}

function printHtml(innerHtml, docTitle) {
  const doc = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(docTitle)}</title>
<style>${voucherStyles()}</style>
</head>
<body>${innerHtml}</body>
</html>`;

  // Hidden iframe: prints ONLY the voucher (no popup blockers involved).
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const fdoc = frame.contentWindow?.document;
  if (fdoc) {
    fdoc.open();
    fdoc.write(doc);
    fdoc.close();
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        setTimeout(() => frame.remove(), 60000);
      }
    }, 320);
  } else {
    // Fallback: popup window.
    const w = window.open('', 'sms-voucher-print', 'width=880,height=760');
    if (w) {
      w.document.open();
      w.document.write(doc);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 300);
    }
    setTimeout(() => frame.remove(), 100);
  }
}

function statusChipClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'confirmed') return 'status-chip confirmed';
  if (s === 'reversed') return 'status-chip reversed';
  return 'status-chip other';
}

function baseHeader({ college, receiptNumber, label = 'Payment Receipt Voucher', status = 'confirmed', isCopy = false }) {
  return `
    <div class="voucher">
      <div class="top-band">
        <div class="doc">STUDENT FEE MANAGEMENT SYSTEM</div>
        <div class="copy">${isCopy ? 'DUPLICATE / STUDENT COPY' : 'FINANCE OFFICE'}</div>
      </div>
      <div class="letterhead">
        <div>
          <div class="college-name">${esc(college)}</div>
          <div class="college-sub">Finance Office — Official Fee Collection Register</div>
        </div>
        <div class="voucher-title">
          <div class="lbl">Receipt / Voucher No.</div>
          <div class="no">${esc(receiptNumber || '—')}</div>
        </div>
      </div>
      <div class="title-ribbon">
        <h2>${esc(label)}</h2>
        <span class="${statusChipClass(status)}">${esc(String(status || '—').toUpperCase())}</span>
      </div>`;
}

function baseFooter({ printedAt }) {
  const now = printedAt ? new Date(printedAt) : new Date();
  return `
      </div>
      <footer>
        <span>Computer-generated voucher — valid without manual signature when stamped &amp; verified.</span>
        <span>Printed: ${esc(now.toLocaleString())}</span>
      </footer>
    </div>`;
}

/**
 * Print an official payment receipt voucher for a single confirmed payment.
 * data: { receiptNumber, status, studentName, studentId, programme, cycleTitle,
 *         amountEtb, method, bankReference, payerName, paidAt, recordedBy,
 *         chapaReference, receivingAccount, college }
 */
export async function printPaymentReceiptVoucher(data = {}) {
  const college = data.college || (await getCollegeName());
  const paidAtStr = data.paidAt
    ? `${formatEthiopian(data.paidAt, { time: true })} EC`
    : '—';

  const rowsA = `
    <div class="field"><div class="k">Student Name</div><div class="v">${esc(data.studentName || '—')}</div></div>
    <div class="field"><div class="k">Student ID</div><div class="v mono">${esc(data.studentId || '—')}</div></div>
    <div class="field"><div class="k">Programme / Batch</div><div class="v">${esc(data.programme || '—')}</div></div>
    <div class="field"><div class="k">Fee Cycle / Period</div><div class="v">${esc(data.cycleTitle || '—')}</div></div>
    <div class="field"><div class="k">Payment Date</div><div class="v">${esc(paidAtStr)}</div></div>
    <div class="field"><div class="k">Payment Method</div><div class="v">${esc(methodLabel(data.method))}</div></div>
    <div class="field"><div class="k">Bank / Receipt Reference</div><div class="v mono">${esc(data.bankReference || '—')}</div></div>
    <div class="field"><div class="k">Receiving Account</div><div class="v mono">${esc(data.receivingAccount || 'Chapa Payment Gateway')}</div></div>`;

  const payerRow = data.payerName
    ? `<div class="field"><div class="k">Payer / Depositor</div><div class="v">${esc(data.payerName)}</div></div>`
    : '';
  const chapaRow = data.chapaReference
    ? `<div class="field"><div class="k">Chapa Transaction Ref</div><div class="v mono">${esc(data.chapaReference)}</div></div>`
    : '';
  const recordedByRow = data.recordedBy
    ? `<div class="field"><div class="k">Recorded By</div><div class="v">${esc(data.recordedBy)}</div></div>`
    : '';

  printHtml(
    `${baseHeader({
      college,
      receiptNumber: data.receiptNumber,
      label: 'Payment Receipt Voucher',
      status: data.status,
      isCopy: Boolean(data.isCopy),
    })}
      <main><div class="grid">${rowsA}${payerRow}${chapaRow}${recordedByRow}</div></main>
      <div class="amount-box">
        <span class="k">Total Amount Paid</span>
        <span class="v">${esc(data.amountEtb || '0.00')} ETB</span>
      </div>
      <div class="amount-words"><strong>In words:</strong> ${
        esc(wordsFromAmount(data.amountEtb)) || '—'
      } birr only.</div>
      <div class="note">
        This voucher is issued upon confirmation of the student fee settlement listed above and is recorded in the official
        college payments ledger. Payment becomes final unless reversed with an explicit audit reason. Present this receipt
        in case of any dispute at the Finance Office.
      </div>
      <div class="stamp"><span>Paid &amp;<br />Verified</span></div>
      <div class="sign">
        <div class="sig">Prepared By — F/O Clerk</div>
        <div class="sig">Received By — Payer</div>
        <div class="sig">Approved By — Finance Head</div>
      </div>
      ${baseFooter({})}`,
    `Receipt ${data.receiptNumber || ''} — ${data.studentName || ''}`
  );
}

/**
 * Print a full student fee statement (charges + payments + summary) in the same voucher style.
 */
export async function printStudentFeeStatement({ student, summary, charges, payments, college, printedAt, isCopy }) {
  const c = college || (await getCollegeName());
  const chargeRows = (charges || [])
    .map(
      (ch) => `<tr>
        <td>${esc(ch.cycle?.title || '—')}</td>
        <td style="text-align:right">${esc(ch.amountDueEtb || (ch.amountDue ? (ch.amountDue / 100).toFixed(2) : '—'))}</td>
        <td style="text-align:center">${esc(String(
          new Date(ch.dueAt) < new Date() && ch.status === 'unpaid' ? 'overdue' : ch.status || '—'
        ).toUpperCase())}</td>
        <td>${esc(ch.dueAt ? formatEthiopian(ch.dueAt) : '—')}</td>
        <td style="font-family:'Consolas',monospace">${esc(ch.payment?.receiptNumber || (ch.waiver ? `WAIVER (${ch.waiver?.reason || ''})` : '—'))}</td>
      </tr>`
    )
    .join('');

  const paymentRows = (payments || [])
    .map(
      (p) => `<tr>
        <td style="font-family:'Consolas',monospace;font-weight:700">${esc(p.receiptNumber)}</td>
        <td>${esc(p.cycle?.title || '—')}</td>
        <td style="text-align:right;font-weight:700">${esc(p.amountEtb || (p.amount ? (p.amount / 100).toFixed(2) : '—'))}</td>
        <td style="text-align:center">${esc(methodLabel(p.method))}</td>
        <td>${esc(p.paidAt ? formatEthiopian(p.paidAt, { time: true }) : '—')}</td>
        <td style="text-align:center">${esc(String(p.status || '—').toUpperCase())}</td>
      </tr>`
    )
    .join('');

  printHtml(
    `${baseHeader({
      college: c,
      receiptNumber: `STATEMENT`,
      label: 'Student Fee Statement',
      status: summary?.hasHold ? 'HOLD' : 'ACTIVE',
      isCopy,
    })}
      <main>
        <div class="grid">
          <div class="field"><div class="k">Student Name</div><div class="v">${esc(student?.fullName || '—')}</div></div>
          <div class="field"><div class="k">Student ID</div><div class="v mono">${esc(student?.studentId || '—')}</div></div>
          <div class="field"><div class="k">Department</div><div class="v">${esc(student?.departmentName || (typeof student?.department === 'string' ? student.department : student?.department?.name) || '—')}</div></div>
          <div class="field"><div class="k">Programme</div><div class="v">${esc(student?.programmeName || (typeof student?.programme === 'string' ? student.programme : student?.program?.name) || '—')}</div></div>
          <div class="field"><div class="k">Batch</div><div class="v">${esc(student?.batchName || (typeof student?.batch === 'string' ? student.batch : student?.batch?.name) || '—')}</div></div>
          <div class="field"><div class="k">Statement Printed</div><div class="v">${esc(
    new Date(printedAt || new Date()).toLocaleString()
  )}</div></div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-top:16px; font-size:11.5px;">
          <thead>
            <tr style="background:#0f172a;color:#fff;">
              <th style="text-align:left;padding:7px 9px;">Fee Cycle</th>
              <th style="text-align:right;padding:7px 9px;">Amount (ETB)</th>
              <th style="text-align:center;padding:7px 9px;">Status</th>
              <th style="text-align:left;padding:7px 9px;">Due</th>
              <th style="text-align:left;padding:7px 9px;">Receipt / Waiver</th>
            </tr>
          </thead>
          <tbody>${chargeRows || '<tr><td colspan="5" style="text-align:center;padding:12px;color:#94a3b8">No charges recorded.</td></tr>'}</tbody>
        </table>
        <table style="width:100%; border-collapse:collapse; margin-top:14px; font-size:11.5px;">
          <thead>
            <tr style="background:#334155;color:#fff;">
              <th style="text-align:left;padding:7px 9px;">Receipt #</th>
              <th style="text-align:left;padding:7px 9px;">Cycle</th>
              <th style="text-align:right;padding:7px 9px;">Amount (ETB)</th>
              <th style="text-align:center;padding:7px 9px;">Method</th>
              <th style="text-align:left;padding:7px 9px;">Paid At</th>
              <th style="text-align:center;padding:7px 9px;">Status</th>
            </tr>
          </thead>
          <tbody>${paymentRows || '<tr><td colspan="6" style="text-align:center;padding:12px;color:#94a3b8">No payments recorded.</td></tr>'}</tbody>
        </table>
      </main>
      <div class="amount-box" style="background:#f8fafc;border-color:#0f172a;">
        <span class="k" style="color:#0f172a">Outstanding Balance</span>
        <span class="v" style="color:#0f172a">${esc(summary?.outstandingEtb || '0.00')} ETB</span>
      </div>
      <div class="amount-words"><strong>Billed:</strong> ${esc(summary?.totalBilledEtb || '0.00')} ETB &nbsp;•&nbsp; <strong>Settled:</strong> ${esc(
      summary?.totalPaidEtb || '0.00'
    )} ETB &nbsp;•&nbsp; <strong>Waived:</strong> ${esc(summary?.totalWaivedEtb || '0.00')} ETB</div>
      <div class="note">Official fee account statement generated from the college payments ledger. Any discrepancy must be reported to the Finance Office within 5 working days.</div>
      <div class="sign">
        <div class="sig">Prepared By — Accountant</div>
        <div class="sig">Checked By — Finance Head</div>
      </div>
      ${baseFooter({ printedAt })}`,
    `Fee Statement — ${student?.fullName || student?.studentId || ''}`
  );
}

/**
 * Print an official executive finance report voucher with black top-band letterhead,
 * KPI summary cards, monthly collection performance, and programme breakdown.
 */
export async function printFinancialReport({ reportData, selectedYear, selectedMonth, printedAt }) {
  const c = await getCollegeName();
  const totals = reportData?.totals || {};
  const monthRows = reportData?.monthRows || [];
  const programmeRows = reportData?.programmeRows || [];
  const methodRows = reportData?.methodRows || [];

  const money = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const billed = Number(totals.billed || 0);
  const paid = Number(totals.paid || 0);
  const outstanding = Number(totals.outstanding || 0);
  const recoveryRate = billed > 0 ? ((paid / billed) * 100).toFixed(1) + '%' : '0.0%';

  const periodLabel = selectedMonth
    ? `${ETH_MONTHS[Number(selectedMonth) - 1] || 'Month ' + selectedMonth} — ${selectedYear} EC`
    : `Academic Year ${selectedYear} EC (Full 12 Months)`;

  const mRowsHtml = monthRows
    .map(
      (m) => `<tr>
        <td style="padding:6px 9px;font-weight:600">${esc(m.month)}. ${esc(ETH_MONTHS[Number(m.month) - 1] || '—')}</td>
        <td style="padding:6px 9px;text-align:center">${esc(m.charges)}</td>
        <td style="padding:6px 9px;text-align:center">${esc(m.paidCount)}</td>
        <td style="padding:6px 9px;text-align:right;font-family:'Consolas',monospace">${esc(money(m.billed || (Number(m.paid || 0) + Number(m.outstanding || 0))))}</td>
        <td style="padding:6px 9px;text-align:right;font-family:'Consolas',monospace;font-weight:700;color:#047857">${esc(money(m.paid))}</td>
        <td style="padding:6px 9px;text-align:right;font-family:'Consolas',monospace;color:#b91c1c">${esc(money(m.outstanding || (Number(m.billed || 0) - Number(m.paid || 0))))}</td>
        <td style="padding:6px 9px;text-align:center;font-weight:700">${esc(m.rate || (Number(m.billed) > 0 ? ((Number(m.paid)/Number(m.billed))*100).toFixed(1)+'%' : '—'))}</td>
      </tr>`
    )
    .join('');

  const pRowsHtml = programmeRows
    .map(
      (p) => `<tr>
        <td style="padding:6px 9px;font-weight:600">${esc(p.programme)}</td>
        <td style="padding:6px 9px;text-align:center">${esc(p.charges)}</td>
        <td style="padding:6px 9px;text-align:right;font-family:'Consolas',monospace">${esc(money(p.billed))}</td>
        <td style="padding:6px 9px;text-align:right;font-family:'Consolas',monospace;font-weight:700;color:#047857">${esc(money(p.paid))}</td>
        <td style="padding:6px 9px;text-align:right;font-family:'Consolas',monospace;color:#b91c1c">${esc(money(p.outstanding))}</td>
      </tr>`
    )
    .join('');

  const methRowsHtml = methodRows
    .map(
      (m) => `<tr>
        <td style="padding:6px 9px;font-weight:600">${esc(m.method)}</td>
        <td style="padding:6px 9px;text-align:right;font-family:'Consolas',monospace;font-weight:700">${esc(money(m.amount))} ETB</td>
      </tr>`
    )
    .join('');

  const nowEth = formatEthiopian(new Date(), { time: true });

  const innerHtml = `
    ${baseHeader({
      college: c,
      receiptNumber: `${selectedYear}-EC-AUDIT`,
      label: 'Annual Financial Audit Report',
      status: 'confirmed',
    })}
    <main>
      <div class="grid">
        <div class="field"><div class="k">Reporting Period</div><div class="v">${esc(periodLabel)}</div></div>
        <div class="field"><div class="k">Calendar System</div><div class="v">Ethiopian Academic Calendar</div></div>
        <div class="field"><div class="k">Audit Generated Date</div><div class="v">${esc(nowEth)} EC</div></div>
        <div class="field"><div class="k">Cycles Audited</div><div class="v mono">${esc(totals.cycles || monthRows.length)} Fee Cycles (${esc(totals.charges || 0)} charges)</div></div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 12px;">
        <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:10px 12px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:1px;color:#4338ca;text-transform:uppercase;">Total Billed</div>
          <div style="font-family:'Consolas',monospace;font-size:16px;font-weight:800;color:#312e81;margin-top:2px;">${esc(money(billed))} ETB</div>
        </div>
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:10px 12px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:1px;color:#047857;text-transform:uppercase;">Total Collected</div>
          <div style="font-family:'Consolas',monospace;font-size:16px;font-weight:800;color:#065f46;margin-top:2px;">${esc(money(paid))} ETB</div>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:1px;color:#b91c1c;text-transform:uppercase;">Outstanding Due</div>
          <div style="font-family:'Consolas',monospace;font-size:16px;font-weight:800;color:#991b1b;margin-top:2px;">${esc(money(outstanding))} ETB</div>
        </div>
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:1px;color:#0f172a;text-transform:uppercase;">Recovery Rate</div>
          <div style="font-family:'Consolas',monospace;font-size:16px;font-weight:800;color:#0f172a;margin-top:2px;">${esc(recoveryRate)}</div>
        </div>
      </div>

      <div style="margin-top:16px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0f172a;margin-bottom:6px;">12-Month Ethiopian Calendar Performance</div>
        <table style="width:100%; border-collapse:collapse; font-size:11px;">
          <thead>
            <tr style="background:#0f172a;color:#fff;">
              <th style="text-align:left;padding:6px 9px;">Month</th>
              <th style="text-align:center;padding:6px 9px;">Charges</th>
              <th style="text-align:center;padding:6px 9px;">Payments</th>
              <th style="text-align:right;padding:6px 9px;">Billed (ETB)</th>
              <th style="text-align:right;padding:6px 9px;">Paid (ETB)</th>
              <th style="text-align:right;padding:6px 9px;">Overdue (ETB)</th>
              <th style="text-align:center;padding:6px 9px;">Rate</th>
            </tr>
          </thead>
          <tbody style="border:1px solid #cbd5e1;">
            ${mRowsHtml || '<tr><td colspan="7" style="text-align:center;padding:12px;color:#94a3b8">No records.</td></tr>'}
            <tr style="background:#e2e8f0;font-weight:700;">
              <td style="padding:6px 9px;">TOTAL / SUMMARY</td>
              <td style="padding:6px 9px;text-align:center">${esc(totals.charges || 0)}</td>
              <td style="padding:6px 9px;text-align:center">${esc(totals.payments || 0)}</td>
              <td style="padding:6px 9px;text-align:right;font-family:'Consolas',monospace">${esc(money(billed))}</td>
              <td style="padding:6px 9px;text-align:right;font-family:'Consolas',monospace;color:#047857">${esc(money(paid))}</td>
              <td style="padding:6px 9px;text-align:right;font-family:'Consolas',monospace;color:#b91c1c">${esc(money(outstanding))}</td>
              <td style="padding:6px 9px;text-align:center">${esc(recoveryRate)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-top:16px;">
        <div>
          <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0f172a;margin-bottom:6px;">Academic Programme Performance</div>
          <table style="width:100%; border-collapse:collapse; font-size:10.5px;">
            <thead>
              <tr style="background:#334155;color:#fff;">
                <th style="text-align:left;padding:6px 9px;">Programme</th>
                <th style="text-align:center;padding:6px 9px;">Charges</th>
                <th style="text-align:right;padding:6px 9px;">Billed</th>
                <th style="text-align:right;padding:6px 9px;">Paid</th>
                <th style="text-align:right;padding:6px 9px;">Overdue</th>
              </tr>
            </thead>
            <tbody style="border:1px solid #cbd5e1;">
              ${pRowsHtml || '<tr><td colspan="5" style="text-align:center;padding:12px;color:#94a3b8">No data.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div>
          <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0f172a;margin-bottom:6px;">Settlement Channels</div>
          <table style="width:100%; border-collapse:collapse; font-size:10.5px;">
            <thead>
              <tr style="background:#334155;color:#fff;">
                <th style="text-align:left;padding:6px 9px;">Channel</th>
                <th style="text-align:right;padding:6px 9px;">Volume</th>
              </tr>
            </thead>
            <tbody style="border:1px solid #cbd5e1;">
              ${methRowsHtml || '<tr><td colspan="2" style="text-align:center;padding:12px;color:#94a3b8">No payments.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <div class="note">This document is the official executive financial audit report generated by the College Management System. Reconciled and archived for institutional inspection.</div>
    <div class="sign" style="margin-top:20px;">
      <div class="sig">Prepared By — College Accountant</div>
      <div class="sig">Verified By — Chief Internal Auditor</div>
      <div class="sig">Approved By — Dean of Administration</div>
    </div>
    <div class="stamp"><span>OFFICIALLY AUDITED</span></div>
    ${baseFooter({ printedAt })}
  `;

  printHtml(innerHtml, `Finance-Report-${selectedYear}-EC`);
}

function wordsFromAmount(etbValue) {
  const n = Math.round(Number(etbValue || 0));
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function chunkToWords(num) {
    let s = '';
    if (num >= 100) {
      s += `${ones[Math.floor(num / 100)]} hundred`;
      num %= 100;
      if (num) s += ' ';
    }
    if (num >= 20) {
      s += tens[Math.floor(num / 10)];
      const r = num % 10;
      if (r) s += `-${ones[r]}`;
    } else if (num > 0) {
      s += ones[num];
    }
    return s;
  }

  let n2 = Math.floor(n);
  const parts = [];
  const scales = [
    [1_000_000_000, 'billion'],
    [1_000_000, 'million'],
    [1000, 'thousand'],
  ];
  for (const [scale, name] of scales) {
    if (n2 >= scale) {
      parts.push(`${chunkToWords(Math.floor(n2 / scale))} ${name}`);
      n2 %= scale;
    }
  }
  if (n2 > 0 || parts.length === 0) parts.push(chunkToWords(n2));
  const words = parts.join(' ').trim() || 'zero';
  return words.charAt(0).toUpperCase() + words.slice(1);
}
