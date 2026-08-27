import type { AnalysisReport } from '@mailiac/shared-types';

/**
 * Escapes characters for PDF literal strings (e.g. parentheses and backslashes).
 */
function escapePdf(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ');
}

/**
 * Generates an official PDF 1.4 forensic report buffer for an AnalysisReport.
 * Zero external npm dependencies — relies entirely on standard PDF 1.4 specification objects.
 */
export async function generateForensicPdf(report: AnalysisReport): Promise<Buffer> {
  const messageId = report?.messageId ?? 'Unknown-ID';
  const senderDomain = report?.senderDomain ?? 'unknown';
  const timestamp = report?.timestamp ?? new Date().toISOString();
  const finalScore = report?.riskMatrix?.finalScore ?? 0;
  const executionTimeMs = report?.executionTimeMs ?? 0;

  // Determine threat level badge label
  let threatLevel = 'LOW RISK / VERIFIED';
  if (finalScore >= 70) {
    threatLevel = 'HIGH RISK QUARANTINE';
  } else if (finalScore >= 40) {
    threatLevel = 'MEDIUM RISK SUSPICIOUS';
  }

  const lines: string[] = [];

  // Page Header
  lines.push('BT');
  lines.push('/F1 20 Tf');
  lines.push('50 740 Td');
  lines.push(`(MAILIAC FORENSIC REPORT) Tj`);
  lines.push('ET');

  lines.push('BT');
  lines.push('/F2 10 Tf');
  lines.push('50 722 Td');
  lines.push(`(Generated: ${escapePdf(timestamp)} | Execution Time: ${executionTimeMs}ms) Tj`);
  lines.push('ET');

  // Horizontal Rule
  lines.push('0.5 w');
  lines.push('50 710 m 562 710 l S');

  // Executive Summary Section
  lines.push('BT');
  lines.push('/F1 14 Tf');
  lines.push('50 685 Td');
  lines.push(`(EXECUTIVE THREAT SUMMARY) Tj`);
  lines.push('ET');

  lines.push('BT');
  lines.push('/F2 11 Tf');
  lines.push('50 665 Td');
  lines.push(`(Case / Message ID: ${escapePdf(messageId)}) Tj`);
  lines.push('0 -16 Td');
  lines.push(`(Sender Domain:     ${escapePdf(senderDomain)}) Tj`);
  lines.push('0 -16 Td');
  lines.push(`(Overall Risk Score: ${finalScore}/100 - [ ${threatLevel} ]) Tj`);
  lines.push('ET');

  // 4-Pillar Risk Scores Table
  lines.push('BT');
  lines.push('/F1 12 Tf');
  lines.push('50 605 Td');
  lines.push(`(4-Pillar Forensic Scores Breakdown) Tj`);
  lines.push('ET');

  const authScore = report?.riskMatrix?.authScore ?? 0;
  const identityScore = report?.riskMatrix?.identityScore ?? 0;
  const ipScore = report?.riskMatrix?.ipScore ?? 0;
  const nlpScore = report?.riskMatrix?.nlpScore ?? 0;

  lines.push('BT');
  lines.push('/F2 10 Tf');
  lines.push('50 585 Td');
  lines.push(`(- Cryptographic Authentication (Auth):  ${authScore}/100) Tj`);
  lines.push('0 -14 Td');
  lines.push(`(- Identity & Homoglyph Score:          ${identityScore}/100) Tj`);
  lines.push('0 -14 Td');
  lines.push(`(- Infrastructure & IP Reputation:       ${ipScore}/100) Tj`);
  lines.push('0 -14 Td');
  lines.push(`(- AI & NLP Intent Urgency:             ${nlpScore}/100) Tj`);
  lines.push('ET');

  // Authentication Status Section
  lines.push('BT');
  lines.push('/F1 12 Tf');
  lines.push('50 515 Td');
  lines.push(`(Cryptographic Auth Results) Tj`);
  lines.push('ET');

  const spf = report?.authResults?.spf ?? 'none';
  const dkim = report?.authResults?.dkim ?? 'none';
  const dmarc = report?.authResults?.dmarcAlignment ?? 'fail';

  lines.push('BT');
  lines.push('/F2 10 Tf');
  lines.push('50 495 Td');
  lines.push(`(SPF: ${escapePdf(spf).toUpperCase()}  |  DKIM: ${escapePdf(dkim).toUpperCase()}  |  DMARC Alignment: ${escapePdf(dmarc).toUpperCase()}) Tj`);
  lines.push('ET');

  // Reverse-Hop Forensic Path Section
  lines.push('BT');
  lines.push('/F1 12 Tf');
  lines.push('50 465 Td');
  lines.push(`(Reverse-Hop Transport Trace Path) Tj`);
  lines.push('ET');

  const hops = report?.forensicPath || [];
  lines.push('BT');
  lines.push('/F2 9 Tf');
  lines.push('50 445 Td');
  if (hops.length === 0) {
    lines.push(`(No reverse-hop transport path recorded.) Tj`);
  } else {
    const maxHops = Math.min(hops.length, 5);
    for (let i = 0; i < maxHops; i++) {
      const h = hops[i];
      if (!h) continue;
      const trustStatus = h.trusted ? 'TRUSTED' : 'UNTRUSTED/PROXY';
      const ipStr = h.ip || 'Unknown IP';
      const countryStr = h.country ? ` (${h.country})` : '';
      lines.push(`(Hop #${i + 1}: ${escapePdf(ipStr)}${escapePdf(countryStr)} - Status: ${trustStatus}) Tj`);
      if (i < maxHops - 1) {
        lines.push('0 -12 Td');
      }
    }
  }
  lines.push('ET');

  // Key Findings Section
  lines.push('BT');
  lines.push('/F1 12 Tf');
  lines.push('50 365 Td');
  lines.push(`(Key Forensic Findings & Telemetry) Tj`);
  lines.push('ET');

  const allFindings = [
    ...(report?.riskMatrix?.pillars?.authentication?.findings || []),
    ...(report?.riskMatrix?.pillars?.identity?.findings || []),
    ...(report?.riskMatrix?.pillars?.infrastructure?.findings || []),
    ...(report?.riskMatrix?.pillars?.nlp?.findings || []),
  ];

  lines.push('BT');
  lines.push('/F2 9 Tf');
  lines.push('50 345 Td');
  if (allFindings.length === 0) {
    lines.push(`(No negative findings recorded.) Tj`);
  } else {
    const maxFindings = Math.min(allFindings.length, 6);
    for (let i = 0; i < maxFindings; i++) {
      const f = allFindings[i];
      if (!f) continue;
      const desc = escapePdf(f.description || f.type);
      lines.push(`([${f.severity}] ${desc}) Tj`);
      if (i < maxFindings - 1) {
        lines.push('0 -12 Td');
      }
    }
  }
  lines.push('ET');

  // Cryptographic Telemetry Integrity Footer
  const hash = report?.aiSummary?.integrityHash ?? 'N/A';
  lines.push('0.5 w');
  lines.push('50 80 m 562 80 l S');

  lines.push('BT');
  lines.push('/F2 8 Tf');
  lines.push('50 65 Td');
  lines.push(`(Audit Integrity Signature: ${escapePdf(hash)}) Tj`);
  lines.push('0 -10 Td');
  lines.push(`(Mailiac Security Forensics Engine - Automated Chain-of-Custody Report) Tj`);
  lines.push('ET');

  const contentStreamText = lines.join('\n');
  const streamLength = Buffer.byteLength(contentStreamText, 'ascii');

  // Construct PDF Objects
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 =
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n';
  const obj4 = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${contentStreamText}\nendstream\nendobj\n`;
  const obj5 = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';
  const obj6 = '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  const header = '%PDF-1.4\n';

  let offset = header.length;
  const offsets: number[] = [0];

  offsets.push(offset);
  offset += Buffer.byteLength(obj1, 'ascii');

  offsets.push(offset);
  offset += Buffer.byteLength(obj2, 'ascii');

  offsets.push(offset);
  offset += Buffer.byteLength(obj3, 'ascii');

  offsets.push(offset);
  offset += Buffer.byteLength(obj4, 'ascii');

  offsets.push(offset);
  offset += Buffer.byteLength(obj5, 'ascii');

  offsets.push(offset);
  offset += Buffer.byteLength(obj6, 'ascii');

  const xrefOffset = offset;

  let xref = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    xref += `${offStr} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfString = header + obj1 + obj2 + obj3 + obj4 + obj5 + obj6 + xref + trailer;

  return Buffer.from(pdfString, 'binary');
}
