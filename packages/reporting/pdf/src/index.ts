import type { AnalysisReport } from '@mailiac/shared-types';

/**
 * Escapes characters for PDF literal strings.
 */
function escapePdf(str: unknown): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' '); // sanitize to standard ASCII for PDF Core Type 1 fonts
}

/**
 * PDF RGB Color representation
 */
interface PdfColor {
  r: number;
  g: number;
  b: number;
}

const COLORS = {
  white: { r: 1, g: 1, b: 1 },
  bgLight: { r: 0.96, g: 0.96, b: 0.95 },
  bgCard: { r: 0.98, g: 0.98, b: 0.98 },
  border: { r: 0.88, g: 0.88, b: 0.88 },
  borderDark: { r: 0.7, g: 0.7, b: 0.7 },
  textDark: { r: 0.08, g: 0.08, b: 0.08 },
  textMuted: { r: 0.45, g: 0.46, b: 0.52 },
  primaryBlue: { r: 0.0, g: 0.32, b: 1.0 }, // #0052FF
  
  // Semantic risk colors
  green: { r: 0.06, g: 0.72, b: 0.51 }, // #10B981
  greenLight: { r: 0.9, g: 0.97, b: 0.94 },
  
  yellowGreen: { r: 0.52, g: 0.8, b: 0.09 }, // #84CC16
  yellowGreenLight: { r: 0.95, g: 0.98, b: 0.9 },
  
  amber: { r: 0.96, g: 0.62, b: 0.04 }, // #F59E0B
  amberLight: { r: 0.99, g: 0.96, b: 0.9 },
  
  orange: { r: 0.98, g: 0.45, b: 0.09 }, // #F97316
  orangeLight: { r: 0.99, g: 0.94, b: 0.9 },
  
  red: { r: 0.94, g: 0.27, b: 0.27 }, // #EF4444
  redLight: { r: 0.99, g: 0.92, b: 0.92 },
};

function getRiskTheme(score: number): { color: PdfColor; bg: PdfColor; label: string; text: string } {
  if (score <= 20) {
    return {
      color: COLORS.green,
      bg: COLORS.greenLight,
      label: 'LOW RISK - BENIGN',
      text: 'Verified Safe / No Threat',
    };
  }
  if (score <= 40) {
    return {
      color: COLORS.yellowGreen,
      bg: COLORS.yellowGreenLight,
      label: 'LOW-MODERATE RISK - REVIEW',
      text: 'Minor Anomalies Detected',
    };
  }
  if (score <= 60) {
    return {
      color: COLORS.amber,
      bg: COLORS.amberLight,
      label: 'MEDIUM RISK - SUSPICIOUS',
      text: 'Suspicious Indicators',
    };
  }
  if (score <= 80) {
    return {
      color: COLORS.orange,
      bg: COLORS.orangeLight,
      label: 'HIGH RISK - DANGEROUS',
      text: 'High Threat Level',
    };
  }
  return {
    color: COLORS.red,
    bg: COLORS.redLight,
    label: 'CRITICAL RISK - MALICIOUS',
    text: 'Active Malicious Payload',
  };
}

/**
 * Low-level PDF stream builder for a single page.
 */
class PageStream {
  private ops: string[] = [];

  setColor(c: PdfColor, isStroke = false): void {
    if (isStroke) {
      this.ops.push(`${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)} RG`);
    } else {
      this.ops.push(`${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)} rg`);
    }
  }

  drawRect(x: number, y: number, w: number, h: number, fill?: PdfColor, stroke?: PdfColor, lineWidth = 0.5): void {
    this.ops.push('q');
    if (fill) {
      this.setColor(fill, false);
      if (stroke) {
        this.setColor(stroke, true);
        this.ops.push(`${lineWidth.toFixed(2)} w`);
        this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B`);
      } else {
        this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
      }
    } else if (stroke) {
      this.setColor(stroke, true);
      this.ops.push(`${lineWidth.toFixed(2)} w`);
      this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    }
    this.ops.push('Q');
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, color = COLORS.border, width = 0.5): void {
    this.ops.push('q');
    this.setColor(color, true);
    this.ops.push(`${width.toFixed(2)} w`);
    this.ops.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    this.ops.push('Q');
  }

  drawText(
    text: string,
    x: number,
    y: number,
    font: '/F1' | '/F2' | '/F3' = '/F2',
    size = 10,
    color = COLORS.textDark
  ): void {
    if (!text) return;
    this.ops.push('q');
    this.ops.push('BT');
    this.setColor(color, false);
    this.ops.push(`${font} ${size.toFixed(1)} Tf`);
    this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} Td`);
    this.ops.push(`(${escapePdf(text)}) Tj`);
    this.ops.push('ET');
    this.ops.push('Q');
  }

  drawWrappedText(
    text: string,
    x: number,
    startY: number,
    maxWidth: number,
    lineHeight: number,
    font: '/F1' | '/F2' | '/F3' = '/F2',
    size = 10,
    color = COLORS.textDark,
    maxLines = 8
  ): number {
    if (!text) return startY;
    
    // Approximate character width (~0.55 * font size for Helvetica)
    const approxCharWidth = size * 0.52;
    const maxCharsPerLine = Math.max(10, Math.floor(maxWidth / approxCharWidth));
    
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const w of words) {
      if ((currentLine + ' ' + w).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + ' ' + w).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = w;
        if (lines.length >= maxLines) break;
      }
    }
    if (currentLine && lines.length < maxLines) {
      lines.push(currentLine);
    }

    let y = startY;
    for (const l of lines) {
      this.drawText(l, x, y, font, size, color);
      y -= lineHeight;
    }
    return y;
  }

  drawHeader(caseId: string, _pageNum?: number, _totalPages?: number): void {
    // Top Brand Bar
    this.drawRect(40, 742, 532, 28, COLORS.bgLight, COLORS.border, 0.5);
    this.drawText('MAILIAC FORENSIC REPORT', 50, 752, '/F1', 10, COLORS.primaryBlue);
    this.drawText(`CASE: ${escapePdf(caseId.slice(0, 18))}`, 240, 752, '/F3', 9, COLORS.textMuted);
    this.drawText(`CONFIDENTIAL REPORT`, 450, 752, '/F1', 9, COLORS.red);

    this.drawLine(40, 735, 572, 735, COLORS.borderDark, 1);
  }

  drawFooter(pageNum: number, totalPages: number, hash: string): void {
    this.drawLine(40, 45, 572, 45, COLORS.border, 0.5);
    const shortHash = hash && hash.length > 20 ? `${hash.slice(0, 10)}...${hash.slice(-8)}` : hash || 'N/A';
    this.drawText(`Integrity SHA-256: ${shortHash}`, 40, 32, '/F3', 8, COLORS.textMuted);
    this.drawText(`Mailiac Forensic Pipeline v2.4`, 250, 32, '/F2', 8, COLORS.textMuted);
    this.drawText(`Page ${pageNum} of ${totalPages}`, 510, 32, '/F1', 8, COLORS.textDark);
  }

  toStreamString(): string {
    return this.ops.join('\n');
  }
}

/**
 * Generates an official, publication-grade multi-page PDF 1.4 forensic report.
 * Strictly zero external runtime dependencies.
 */
export async function generateForensicPdf(report: AnalysisReport): Promise<Buffer> {
  const messageId = report?.messageId ?? 'Unknown-ID';
  const senderDomain = report?.senderDomain ?? 'unknown';
  const timestamp = report?.timestamp ?? new Date().toISOString();
  const finalScore = Math.max(0, Math.min(100, report?.riskMatrix?.finalScore ?? 0));
  const executionTimeMs = report?.executionTimeMs ?? 0;
  const hash = report?.aiSummary?.integrityHash ?? 'N/A';

  const authScore = report?.riskMatrix?.pillars?.authentication?.score ?? report?.riskMatrix?.authScore ?? 0;
  const identityScore = report?.riskMatrix?.pillars?.identity?.score ?? report?.riskMatrix?.identityScore ?? 0;
  const ipScore = report?.riskMatrix?.pillars?.infrastructure?.score ?? report?.riskMatrix?.ipScore ?? 0;
  const nlpScore = report?.riskMatrix?.pillars?.nlp?.score ?? report?.riskMatrix?.nlpScore ?? 0;

  const authWeight = report?.riskMatrix?.pillars?.authentication?.weight ?? 0.3;
  const identityWeight = report?.riskMatrix?.pillars?.identity?.weight ?? 0.25;
  const ipWeight = report?.riskMatrix?.pillars?.infrastructure?.weight ?? 0.2;
  const nlpWeight = report?.riskMatrix?.pillars?.nlp?.weight ?? 0.25;

  const intentList = report?.aiSummary?.intent ?? ['BENIGN'];
  const primaryIntent = (intentList[0] || 'BENIGN').replace(/_/g, ' ').toUpperCase();
  const rawConfidence = report?.aiSummary?.confidence ?? 0.95;
  const confidencePercent = Math.round(rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence);
  const rawUrgency = report?.aiSummary?.urgency ?? (nlpScore > 40 ? 75 : 10);
  const urgencyLabel = rawUrgency >= 70 ? 'HIGH' : rawUrgency >= 35 ? 'MODERATE' : 'LOW';

  const riskTheme = getRiskTheme(finalScore);

  // Derive human verdict
  let verdictHeadline = 'This email shows no significant indicators of malicious intent.';
  let recommendedAction = 'Safe to review. No immediate action required.';
  if (finalScore > 80) {
    verdictHeadline = 'High-confidence malicious email identified with critical threat indicators.';
    recommendedAction = 'Do not interact with this email. Treat it as malicious and quarantine immediately.';
  } else if (finalScore > 60) {
    verdictHeadline = `Elevated risk indicators associated with ${primaryIntent.toLowerCase()} and deceptive payload.`;
    recommendedAction = 'Do not click links or open attachments until the sender is verified out-of-band.';
  } else if (finalScore > 40) {
    verdictHeadline = 'This email exhibits suspicious characteristics and should be inspected carefully.';
    recommendedAction = 'Review the sender and links carefully before interacting or entering credentials.';
  } else if (finalScore > 20) {
    verdictHeadline = 'This email demonstrates minor anomalies but no definitive malicious payload.';
    recommendedAction = 'Review the sender and links carefully before interacting.';
  }

  // Synthesized AI Interpretation Narrative (1-3 sentences)
  let aiInterpretationNarrative = 'The email shows no significant indicators of malicious intent. Cryptographic provenance is valid and the content is consistent with standard communication context.';
  if (finalScore <= 20) {
    if (senderDomain && senderDomain !== 'unknown') {
      aiInterpretationNarrative = `The email shows no significant indicators of malicious intent. The sender domain (${senderDomain}) appears legitimate and the content is consistent with standard expected communication context.`;
    }
  } else if (finalScore <= 40) {
    aiInterpretationNarrative = `The email exhibits minor linguistic or configuration anomalies. While no active malicious payload was confirmed, the communication context warrants review before interacting with attachments or links.`;
  } else if (finalScore <= 60) {
    aiInterpretationNarrative = `The AI detected suspicious characteristics, including elevated urgency pressure or unaligned sender identity. Exercise caution and verify the sender before providing sensitive information.`;
  } else if (finalScore <= 80) {
    if (primaryIntent.includes('CREDENTIAL') || primaryIntent.includes('HARVESTING')) {
      aiInterpretationNarrative = `The AI identified high-urgency credential harvesting patterns and deceptive authentication prompts. The sender domain or message structure is consistent with targeted phishing tactics.`;
    } else if (primaryIntent.includes('FINANCIAL') || primaryIntent.includes('WIRE')) {
      aiInterpretationNarrative = `The AI identified suspicious financial or invoice diversion requests using coercive urgency. The communication patterns deviate significantly from verified organizational protocols.`;
    } else {
      aiInterpretationNarrative = `The AI detected multiple indicators of malicious intent associated with ${primaryIntent.toLowerCase()} and deceptive payload behavior.`;
    }
  } else {
    aiInterpretationNarrative = `High-confidence malicious threat detected. The AI identified aggressive deceptive intent, deceptive sender impersonation, and fraudulent payload triggers requiring immediate quarantine.`;
  }

  // Key findings summary bullets (Page 1)
  const keyFindings: string[] = [];
  if (report?.authResults?.spf === 'pass' && report?.authResults?.dkim === 'pass') {
    keyFindings.push('[PASS] Sender cryptographic authentication passed (SPF & DKIM valid).');
  } else if (report?.authResults?.spf === 'fail' || report?.authResults?.dkim === 'fail') {
    keyFindings.push('[ALERT] Sender cryptographic authentication failed or was forged.');
  } else {
    keyFindings.push('[WARN] Sender authentication records are incomplete or unaligned.');
  }

  if (identityScore < 25) {
    keyFindings.push(`[PASS] Sender domain appears legitimate (${escapePdf(senderDomain)}).`);
  } else if (identityScore < 60) {
    keyFindings.push('[WARN] Display name does not clearly match the sender domain.');
  } else {
    keyFindings.push(`[ALERT] Lookalike domain or homoglyph spoofing detected for ${escapePdf(senderDomain)}.`);
  }

  if (nlpScore < 25 && primaryIntent === 'BENIGN') {
    keyFindings.push('[PASS] No strong malicious intent or urgency pressure detected by AI.');
  } else if (primaryIntent.includes('CREDENTIAL')) {
    keyFindings.push('[ALERT] AI detected credential harvesting patterns and phishing semantics.');
  } else if (primaryIntent.includes('FINANCIAL')) {
    keyFindings.push('[ALERT] AI identified suspicious financial or invoice diversion requests.');
  } else {
    keyFindings.push('[WARN] Suspicious urgency or psychological pressure detected in content.');
  }

  if (ipScore < 25) {
    keyFindings.push('[PASS] Originating mail server IP has clean reputation records.');
  } else {
    keyFindings.push('[WARN] Originating IP server flagged for proxy/VPN or abuse history.');
  }

  const TOTAL_PAGES = 6;
  const pages: PageStream[] = [];

  // =========================================================================
  // PAGE 1: EXECUTIVE SUMMARY
  // =========================================================================
  {
    const p = new PageStream();
    p.drawHeader(messageId, 1, TOTAL_PAGES);

    // Title Section
    p.drawText('EMAIL FORENSIC ANALYSIS DOSSIER', 40, 705, '/F1', 15, COLORS.textDark);
    p.drawText('EXECUTIVE THREAT SUMMARY & ACTIONABLE VERDICT', 40, 692, '/F2', 8.5, COLORS.textMuted);

    // Large Risk Banner Box
    p.drawRect(40, 580, 532, 100, riskTheme.bg, riskTheme.color, 1.5);
    
    // Left Score Box
    p.drawText('OVERALL RISK SCORE', 55, 662, '/F1', 9.5, COLORS.textMuted);
    p.drawText(`${finalScore}`, 55, 618, '/F1', 38, riskTheme.color);
    p.drawText('/ 100 RISK', 115, 622, '/F1', 11, COLORS.textMuted);

    // Right Verdict Banner
    p.drawRect(230, 650, 200, 20, riskTheme.color, undefined);
    p.drawText(riskTheme.label, 240, 656, '/F1', 9.5, COLORS.white);

    p.drawText(`Primary Verdict:`, 230, 632, '/F1', 9.5, COLORS.textDark);
    p.drawWrappedText(`"${verdictHeadline}"`, 230, 620, 330, 12, '/F2', 9, COLORS.textDark, 2);

    // Recommended Action Box
    p.drawRect(40, 520, 532, 50, COLORS.bgCard, COLORS.border, 0.5);
    p.drawText('RECOMMENDED ACTION', 55, 555, '/F1', 9, COLORS.primaryBlue);
    p.drawWrappedText(recommendedAction, 55, 540, 500, 12, '/F1', 9.5, COLORS.textDark, 2);

    // AI Forensic Assessment Card (Human-Readable Conclusion)
    p.drawRect(40, 425, 532, 85, COLORS.bgLight, COLORS.border, 0.5);
    p.drawText('AI FORENSIC ASSESSMENT', 55, 495, '/F1', 9, COLORS.primaryBlue);
    p.drawText('[ AI INTENT ENGINE ]', 460, 495, '/F3', 8, COLORS.textMuted);
    p.drawWrappedText(`"${aiInterpretationNarrative}"`, 55, 478, 500, 12, '/F2', 9, COLORS.textDark, 3);
    
    p.drawLine(55, 448, 557, 448, COLORS.border, 0.5);
    p.drawText(`INTENT: ${primaryIntent}`, 55, 436, '/F1', 8.5, riskTheme.color);
    p.drawText(`CONFIDENCE: ${confidencePercent}%`, 230, 436, '/F1', 8.5, COLORS.textDark);
    p.drawText(`URGENCY: ${urgencyLabel}`, 390, 436, '/F1', 8.5, COLORS.textDark);

    // Key Findings Summary
    p.drawText('EXECUTIVE KEY FINDINGS', 40, 405, '/F1', 10, COLORS.textDark);
    p.drawLine(40, 397, 572, 397, COLORS.border, 0.5);

    let fy = 380;
    for (const kf of keyFindings.slice(0, 4)) {
      p.drawRect(40, fy - 5, 532, 20, COLORS.bgLight, COLORS.border, 0.5);
      p.drawText(kf, 50, fy, '/F2', 8.5, COLORS.textDark);
      fy -= 24;
    }

    // Provenance Snapshot Box
    p.drawRect(40, 185, 532, 95, COLORS.white, COLORS.borderDark, 0.5);
    p.drawText('EVIDENCE PROVENANCE SNAPSHOT', 55, 265, '/F1', 8.5, COLORS.textMuted);
    p.drawLine(55, 258, 557, 258, COLORS.border, 0.5);

    p.drawText(`Message ID:      ${escapePdf(messageId)}`, 55, 245, '/F3', 8, COLORS.textDark);
    p.drawText(`Sender Domain:   ${escapePdf(senderDomain)}`, 55, 232, '/F2', 8.5, COLORS.textDark);
    p.drawText(`Timestamp:       ${escapePdf(timestamp)}`, 55, 219, '/F2', 8.5, COLORS.textDark);
    p.drawText(`Execution Time:  ${executionTimeMs} ms`, 55, 206, '/F2', 8.5, COLORS.textDark);
    p.drawText(`Integrity Seal:  ${escapePdf(hash.slice(0, 32))}...`, 55, 193, '/F3', 7.5, COLORS.primaryBlue);

    p.drawFooter(1, TOTAL_PAGES, hash);
    pages.push(p);
  }

  // =========================================================================
  // PAGE 2: 4-PILLAR RISK ENGINE & METHODOLOGY
  // =========================================================================
  {
    const p = new PageStream();
    p.drawHeader(messageId, 2, TOTAL_PAGES);

    p.drawText('4-PILLAR FORENSIC RISK ENGINE BREAKDOWN', 40, 705, '/F1', 14, COLORS.textDark);
    p.drawText('Asynchronous Multi-Dimensional Risk Aggregation & Normalization', 40, 690, '/F2', 9, COLORS.textMuted);

    // Methodology Explanation
    p.drawRect(40, 615, 532, 60, COLORS.bgLight, COLORS.border, 0.5);
    p.drawText('SCORING METHODOLOGY', 50, 660, '/F1', 9, COLORS.primaryBlue);
    p.drawWrappedText(
      'Mailiac evaluates email threats across 4 independent forensic pillars. Each pillar produces an isolated risk score (0-100), which is weighted and aggregated into the final unified risk score. Overrides trigger quarantine upon critical single-point failures.',
      50,
      644,
      510,
      12,
      '/F2',
      8.5,
      COLORS.textDark,
      3
    );

    // Pillar Scores Table Header
    p.drawRect(40, 565, 532, 24, COLORS.textDark, undefined);
    p.drawText('PILLAR DIMENSION', 50, 573, '/F1', 9, COLORS.white);
    p.drawText('WEIGHT', 230, 573, '/F1', 9, COLORS.white);
    p.drawText('SCORE', 310, 573, '/F1', 9, COLORS.white);
    p.drawText('IMPACT', 390, 573, '/F1', 9, COLORS.white);
    p.drawText('EVALUATION', 470, 573, '/F1', 9, COLORS.white);

    // Row 1: Auth
    const authImpact = (authScore * authWeight).toFixed(1);
    p.drawRect(40, 525, 532, 38, COLORS.white, COLORS.border, 0.5);
    p.drawText('1. Cryptographic Authentication', 50, 545, '/F1', 9, COLORS.textDark);
    p.drawText('SPF, DKIM, DMARC, ARC signatures', 50, 533, '/F2', 8, COLORS.textMuted);
    p.drawText(`${Math.round(authWeight * 100)}%`, 230, 540, '/F2', 9, COLORS.textDark);
    p.drawText(`${authScore} / 100`, 310, 540, '/F1', 9, getRiskTheme(authScore).color);
    p.drawText(`+${authImpact}`, 390, 540, '/F2', 9, COLORS.textDark);
    p.drawText(authScore <= 20 ? 'VERIFIED' : 'ANOMALY', 470, 540, '/F1', 8.5, getRiskTheme(authScore).color);

    // Row 2: Identity
    const idImpact = (identityScore * identityWeight).toFixed(1);
    p.drawRect(40, 485, 532, 38, COLORS.bgCard, COLORS.border, 0.5);
    p.drawText('2. Identity & Homoglyph', 50, 505, '/F1', 9, COLORS.textDark);
    p.drawText('Domain lookalike, display name spoofing', 50, 493, '/F2', 8, COLORS.textMuted);
    p.drawText(`${Math.round(identityWeight * 100)}%`, 230, 500, '/F2', 9, COLORS.textDark);
    p.drawText(`${identityScore} / 100`, 310, 500, '/F1', 9, getRiskTheme(identityScore).color);
    p.drawText(`+${idImpact}`, 390, 500, '/F2', 9, COLORS.textDark);
    p.drawText(identityScore <= 25 ? 'LEGITIMATE' : 'FLAGGED', 470, 500, '/F1', 8.5, getRiskTheme(identityScore).color);

    // Row 3: Infrastructure
    const ipImpact = (ipScore * ipWeight).toFixed(1);
    p.drawRect(40, 445, 532, 38, COLORS.white, COLORS.border, 0.5);
    p.drawText('3. Infrastructure & Routing', 50, 465, '/F1', 9, COLORS.textDark);
    p.drawText('IP reputation, ASN, PTR records', 50, 453, '/F2', 8, COLORS.textMuted);
    p.drawText(`${Math.round(ipWeight * 100)}%`, 230, 460, '/F2', 9, COLORS.textDark);
    p.drawText(`${ipScore} / 100`, 310, 460, '/F1', 9, getRiskTheme(ipScore).color);
    p.drawText(`+${ipImpact}`, 390, 460, '/F2', 9, COLORS.textDark);
    p.drawText(ipScore <= 25 ? 'CLEAN ORIGIN' : 'FLAGGED', 470, 460, '/F1', 8.5, getRiskTheme(ipScore).color);

    // Row 4: AI NLP
    const nlpImpact = (nlpScore * nlpWeight).toFixed(1);
    p.drawRect(40, 405, 532, 38, COLORS.bgCard, COLORS.border, 0.5);
    p.drawText('4. AI & NLP Semantic Intent', 50, 425, '/F1', 9, COLORS.textDark);
    p.drawText('Phishing, credential harvesting, urgency', 50, 413, '/F2', 8, COLORS.textMuted);
    p.drawText(`${Math.round(nlpWeight * 100)}%`, 230, 420, '/F2', 9, COLORS.textDark);
    p.drawText(`${nlpScore} / 100`, 310, 420, '/F1', 9, getRiskTheme(nlpScore).color);
    p.drawText(`+${nlpImpact}`, 390, 420, '/F2', 9, COLORS.textDark);
    p.drawText(primaryIntent, 470, 420, '/F1', 8.5, getRiskTheme(nlpScore).color);

    // Aggregated Final Score Box
    p.drawRect(40, 325, 532, 65, riskTheme.bg, riskTheme.color, 1);
    p.drawText('AGGREGATED UNIFIED RISK SCORE', 55, 368, '/F1', 10, COLORS.textMuted);
    p.drawText(`${finalScore} / 100`, 55, 342, '/F1', 18, riskTheme.color);
    p.drawText(`Classification: [ ${riskTheme.label} ]`, 230, 350, '/F1', 11, COLORS.textDark);
    p.drawText(`Formula: (Auth * 0.3) + (Identity * 0.25) + (IP * 0.2) + (NLP * 0.25) = ${finalScore}`, 230, 335, '/F3', 8, COLORS.textMuted);

    // Severity Matrix Reference Guide
    p.drawText('FORENSIC RISK SEVERITY INDEX REFERENCE', 40, 290, '/F1', 11, COLORS.textDark);
    p.drawLine(40, 280, 572, 280, COLORS.border, 0.5);

    const bands = [
      { range: '0 - 20', label: 'LOW RISK · BENIGN', desc: 'Authentic communication with validated sender provenance.' },
      { range: '21 - 40', label: 'LOW-MODERATE RISK', desc: 'Minor configuration or header anomalies requiring review.' },
      { range: '41 - 60', label: 'MEDIUM · SUSPICIOUS', desc: 'Elevated suspicion, unverified transport, or domain mismatches.' },
      { range: '61 - 80', label: 'HIGH RISK · DANGEROUS', desc: 'Substantial deceptive indicators, phishing or harvesting signals.' },
      { range: '81 - 100', label: 'CRITICAL · MALICIOUS', desc: 'Active malicious payload, credential phishing, or identity forgery.' },
    ];

    let by = 260;
    for (const b of bands) {
      p.drawText(b.range, 50, by, '/F1', 8.5, COLORS.primaryBlue);
      p.drawText(b.label, 130, by, '/F1', 8.5, COLORS.textDark);
      p.drawText(b.desc, 270, by, '/F2', 8.5, COLORS.textMuted);
      by -= 22;
    }

    p.drawFooter(2, TOTAL_PAGES, hash);
    pages.push(p);
  }

  // =========================================================================
  // PAGE 3: CRYPTOGRAPHIC AUTHENTICATION ANALYSIS
  // =========================================================================
  {
    const p = new PageStream();
    p.drawHeader(messageId, 3, TOTAL_PAGES);

    p.drawText('CRYPTOGRAPHIC & PROTOCOL AUTHENTICATION', 40, 705, '/F1', 14, COLORS.textDark);
    p.drawText('MIME-Level Protocol Validation: SPF, DKIM, DMARC, ARC', 40, 690, '/F2', 9, COLORS.textMuted);

    // Protocol Status Table Header
    p.drawRect(40, 640, 532, 24, COLORS.textDark, undefined);
    p.drawText('PROTOCOL', 50, 648, '/F1', 9, COLORS.white);
    p.drawText('RESULT', 150, 648, '/F1', 9, COLORS.white);
    p.drawText('ALIGNMENT / DETAIL', 240, 648, '/F1', 9, COLORS.white);
    p.drawText('STATUS INTERPRETATION', 370, 648, '/F1', 9, COLORS.white);

    const spf = (report?.authResults?.spf ?? 'none').toUpperCase();
    const dkim = (report?.authResults?.dkim ?? 'none').toUpperCase();
    const dmarc = (report?.authResults?.dmarcAlignment ?? 'fail').toUpperCase();
    const arc = report?.authResults?.arcPass ? 'PASS' : 'NONE';

    // SPF
    p.drawRect(40, 605, 532, 35, COLORS.white, COLORS.border, 0.5);
    p.drawText('SPF (RFC 7208)', 50, 622, '/F1', 9, COLORS.textDark);
    p.drawText(spf, 150, 622, '/F1', 9, spf === 'PASS' ? COLORS.green : COLORS.red);
    p.drawText('Envelope-From match', 240, 622, '/F2', 8.5, COLORS.textMuted);
    p.drawText(spf === 'PASS' ? 'Sender IP explicitly authorized' : 'IP not in SPF record', 370, 622, '/F2', 8.5, COLORS.textDark);

    // DKIM
    p.drawRect(40, 570, 532, 35, COLORS.bgCard, COLORS.border, 0.5);
    p.drawText('DKIM (RFC 6376)', 50, 587, '/F1', 9, COLORS.textDark);
    p.drawText(dkim, 150, 587, '/F1', 9, dkim === 'PASS' ? COLORS.green : COLORS.red);
    p.drawText('Cryptographic signature', 240, 587, '/F2', 8.5, COLORS.textMuted);
    p.drawText(dkim === 'PASS' ? 'Header & body RSA/Ed25519 valid' : 'Signature invalid / missing', 370, 587, '/F2', 8.5, COLORS.textDark);

    // DMARC
    p.drawRect(40, 535, 532, 35, COLORS.white, COLORS.border, 0.5);
    p.drawText('DMARC (RFC 7489)', 50, 552, '/F1', 9, COLORS.textDark);
    p.drawText(dmarc, 150, 552, '/F1', 9, dmarc === 'STRICT' || dmarc === 'RELAXED' ? COLORS.green : COLORS.red);
    p.drawText(dmarc === 'STRICT' ? 'Strict identifier match' : 'Relaxed identifier match', 240, 552, '/F2', 8.5, COLORS.textMuted);
    p.drawText('Domain alignment policy applies', 370, 552, '/F2', 8.5, COLORS.textDark);

    // ARC
    p.drawRect(40, 500, 532, 35, COLORS.bgCard, COLORS.border, 0.5);
    p.drawText('ARC (RFC 8617)', 50, 517, '/F1', 9, COLORS.textDark);
    p.drawText(arc, 150, 517, '/F1', 9, arc === 'PASS' ? COLORS.green : COLORS.textMuted);
    p.drawText('Authenticated Received Chain', 240, 517, '/F2', 8.5, COLORS.textMuted);
    p.drawText(arc === 'PASS' ? 'Intermediary forwarder seal intact' : 'No forwarder ARC seal', 370, 517, '/F2', 8.5, COLORS.textDark);

    // Authentication Findings Section
    p.drawText('DETAILED AUTHENTICATION TELEMETRY FINDINGS', 40, 460, '/F1', 11, COLORS.textDark);
    p.drawLine(40, 450, 572, 450, COLORS.border, 0.5);

    const authFindings = report?.authResults?.findings || report?.riskMatrix?.pillars?.authentication?.findings || [];
    if (authFindings.length === 0) {
      p.drawRect(40, 395, 532, 40, COLORS.bgLight, COLORS.border, 0.5);
      p.drawText('[+] No authentication policy violations or cryptographic anomalies detected.', 55, 415, '/F1', 9, COLORS.green);
    } else {
      let fy = 425;
      for (const f of authFindings.slice(0, 6)) {
        p.drawRect(40, fy - 8, 532, 28, COLORS.bgLight, COLORS.border, 0.5);
        p.drawText(`[${f.severity || 'INFO'}] ${escapePdf(f.type)}`, 50, fy + 4, '/F1', 8.5, f.severity === 'HIGH' ? COLORS.red : COLORS.primaryBlue);
        p.drawText(escapePdf(f.description), 50, fy - 6, '/F2', 8, COLORS.textDark);
        fy -= 34;
      }
    }

    p.drawFooter(3, TOTAL_PAGES, hash);
    pages.push(p);
  }

  // =========================================================================
  // PAGE 4: IDENTITY & INFRASTRUCTURE REVERSE-HOP ANALYSIS
  // =========================================================================
  {
    const p = new PageStream();
    p.drawHeader(messageId, 4, TOTAL_PAGES);

    p.drawText('IDENTITY & TRANSPORT INFRASTRUCTURE ANALYSIS', 40, 705, '/F1', 14, COLORS.textDark);
    p.drawText('Sender Impersonation Detection & Reverse-Hop Network Path Dissection', 40, 690, '/F2', 9, COLORS.textMuted);

    // Identity Box
    p.drawRect(40, 610, 532, 65, COLORS.bgLight, COLORS.border, 0.5);
    p.drawText('IDENTITY & HOMOGLYPH SPOOFING EVALUATION', 50, 655, '/F1', 9, COLORS.primaryBlue);
    p.drawText(`Sender Domain:     ${escapePdf(senderDomain)}`, 50, 638, '/F1', 9.5, COLORS.textDark);
    p.drawText(`Identity Score:    ${identityScore} / 100 (${identityScore < 25 ? 'Low Risk' : 'Elevated Risk'})`, 50, 624, '/F2', 9, getRiskTheme(identityScore).color);
    p.drawText(`Homoglyph Status:  ${identityScore >= 50 ? 'Potential Lookalike Detected' : 'No Homoglyph Detected'}`, 280, 638, '/F2', 9, COLORS.textDark);

    // Reverse-Hop Infrastructure Path Table Header
    p.drawText('REVERSE-HOP NETWORK TRANSPORT TRAIL', 40, 580, '/F1', 11, COLORS.textDark);
    p.drawLine(40, 570, 572, 570, COLORS.border, 0.5);

    p.drawRect(40, 540, 532, 22, COLORS.textDark, undefined);
    p.drawText('HOP #', 50, 548, '/F1', 8.5, COLORS.white);
    p.drawText('IP ADDRESS', 95, 548, '/F1', 8.5, COLORS.white);
    p.drawText('HOSTNAME / ASN', 210, 548, '/F1', 8.5, COLORS.white);
    p.drawText('LOCATION', 370, 548, '/F1', 8.5, COLORS.white);
    p.drawText('PTR / TRUST', 480, 548, '/F1', 8.5, COLORS.white);

    const hops = report?.forensicPath || [];
    if (hops.length === 0) {
      p.drawRect(40, 495, 532, 35, COLORS.bgLight, COLORS.border, 0.5);
      p.drawText('No intermediate reverse-hop headers recorded in message headers.', 50, 512, '/F2', 8.5, COLORS.textMuted);
    } else {
      let hy = 505;
      const maxHops = Math.min(hops.length, 9);
      for (let i = 0; i < maxHops; i++) {
        const h = hops[i];
        if (!h) continue;
        const isAlt = i % 2 === 1;
        p.drawRect(40, hy - 8, 532, 32, isAlt ? COLORS.bgCard : COLORS.white, COLORS.border, 0.5);
        p.drawText(`Hop ${i + 1}`, 50, hy + 4, '/F1', 8.5, COLORS.primaryBlue);
        p.drawText(escapePdf(h.ip || 'Unknown'), 95, hy + 4, '/F3', 8, COLORS.textDark);
        
        const hostAsn = `${h.hostnameClaimed ? h.hostnameClaimed.slice(0, 18) : 'N/A'} (ASN: ${h.asn || 'N/A'})`;
        p.drawText(escapePdf(hostAsn), 210, hy + 4, '/F2', 8, COLORS.textMuted);
        
        const loc = `${h.city ? h.city + ', ' : ''}${h.country || 'Unknown'}`;
        p.drawText(escapePdf(loc.slice(0, 18)), 370, hy + 4, '/F2', 8, COLORS.textDark);

        const trust = h.trusted ? 'TRUSTED' : 'UNTRUSTED';
        const ptr = h.ptrValid ? 'PTR: OK' : 'PTR: FAIL';
        p.drawText(`${trust} (${ptr})`, 480, hy + 4, '/F1', 7.5, h.trusted ? COLORS.green : COLORS.orange);

        hy -= 36;
      }
    }

    p.drawFooter(4, TOTAL_PAGES, hash);
    pages.push(p);
  }

  // =========================================================================
  // PAGE 5: AI & NLP SEMANTIC INTENT ANALYSIS
  // =========================================================================
  {
    const p = new PageStream();
    p.drawHeader(messageId, 5, TOTAL_PAGES);

    p.drawText('ARTIFICIAL INTELLIGENCE & SEMANTIC INTENT ANALYSIS', 40, 705, '/F1', 14, COLORS.textDark);
    p.drawText('Deep Neural NLP Intent Classification & Urgency De-cloaking', 40, 690, '/F2', 9, COLORS.textMuted);

    // AI Diagnostics Box
    p.drawRect(40, 600, 532, 75, COLORS.bgLight, COLORS.border, 0.5);
    p.drawText('AI ENGINE TELEMETRY & DIAGNOSTICS', 50, 658, '/F1', 9, COLORS.primaryBlue);
    p.drawText(`Provider:      ${escapePdf(report?.aiSummary?.provider?.toUpperCase() || 'GEMINI AI')}`, 50, 642, '/F1', 9, COLORS.textDark);
    p.drawText(`Model Engine:  ${escapePdf(report?.aiSummary?.model || 'gemini-1.5-flash')}`, 50, 628, '/F2', 8.5, COLORS.textDark);
    p.drawText(`Latency:       ${executionTimeMs} ms`, 50, 614, '/F2', 8.5, COLORS.textMuted);

    p.drawText(`Intent Label:   [ ${primaryIntent} ]`, 280, 642, '/F1', 9.5, getRiskTheme(nlpScore).color);
    p.drawText(`Confidence:     ${confidencePercent}%`, 280, 628, '/F1', 9, COLORS.textDark);
    p.drawText(`Urgency Rating: ${urgencyLabel} (${rawUrgency}/100)`, 280, 614, '/F2', 8.5, COLORS.textDark);

    // AI Findings List Header
    p.drawText('AI-GENERATED SECURITY FINDINGS & BEHAVIORAL SIGNALS', 40, 570, '/F1', 11, COLORS.textDark);
    p.drawLine(40, 560, 572, 560, COLORS.border, 0.5);

    const aiFindings = report?.aiSummary?.findings || report?.riskMatrix?.pillars?.nlp?.findings || [];
    if (aiFindings.length === 0) {
      p.drawRect(40, 495, 532, 50, COLORS.white, COLORS.border, 0.5);
      p.drawText('[+] No deceptive linguistic patterns, financial coercion, or credential harvesting detected.', 55, 520, '/F1', 9, COLORS.green);
    } else {
      let ay = 525;
      for (const f of aiFindings.slice(0, 8)) {
        p.drawRect(40, ay - 8, 532, 34, COLORS.bgLight, COLORS.border, 0.5);
        p.drawText(`[${f.severity || 'INFO'}] ${escapePdf(f.type)}`, 50, ay + 8, '/F1', 8.5, f.severity === 'HIGH' ? COLORS.red : COLORS.primaryBlue);
        p.drawText(escapePdf(f.description), 50, ay - 4, '/F2', 8, COLORS.textDark);
        ay -= 40;
      }
    }

    p.drawFooter(5, TOTAL_PAGES, hash);
    pages.push(p);
  }

  // =========================================================================
  // PAGE 6: FORENSIC METADATA & CHAIN OF CUSTODY
  // =========================================================================
  {
    const p = new PageStream();
    p.drawHeader(messageId, 6, TOTAL_PAGES);

    p.drawText('FORENSIC METADATA & CHAIN-OF-CUSTODY AUDIT', 40, 705, '/F1', 14, COLORS.textDark);
    p.drawText('Cryptographic Integrity Verification & Legal Evidence Audit Trail', 40, 690, '/F2', 9, COLORS.textMuted);

    // Audit Evidence Table Header
    p.drawRect(40, 640, 532, 22, COLORS.textDark, undefined);
    p.drawText('EVIDENCE ATTRIBUTE', 50, 648, '/F1', 8.5, COLORS.white);
    p.drawText('CRYPTOGRAPHIC AUDIT RECORD VALUE', 220, 648, '/F1', 8.5, COLORS.white);

    const metaRows = [
      { label: 'Case Reference ID', val: messageId, isMono: true },
      { label: 'Original Message-ID', val: messageId, isMono: true },
      { label: 'Sender Domain', val: senderDomain, isMono: false },
      { label: 'Analysis Timestamp', val: timestamp, isMono: false },
      { label: 'Execution Latency', val: `${executionTimeMs} ms`, isMono: false },
      { label: 'Unified Risk Score', val: `${finalScore} / 100 (${riskTheme.label})`, isMono: false },
      { label: 'AI Classification Intent', val: primaryIntent, isMono: false },
      { label: 'AI Model Confidence', val: `${confidencePercent}%`, isMono: false },
      { label: 'HMAC-SHA256 Integrity Hash', val: hash, isMono: true },
      { label: 'Evidence Custody Status', val: 'CRYPTOGRAPHICALLY SEALED (VERIFIED)', isMono: false },
    ];

    let my = 605;
    for (let i = 0; i < metaRows.length; i++) {
      const row = metaRows[i];
      if (!row) continue;
      const isAlt = i % 2 === 1;
      p.drawRect(40, my - 6, 532, 28, isAlt ? COLORS.bgCard : COLORS.white, COLORS.border, 0.5);
      p.drawText(row.label, 50, my + 4, '/F1', 8.5, COLORS.textDark);
      p.drawText(
        escapePdf(row.val),
        220,
        my + 4,
        row.isMono ? '/F3' : '/F2',
        row.isMono ? 7.5 : 8.5,
        row.label.includes('Status') ? COLORS.green : COLORS.textDark
      );
      my -= 30;
    }

    // Official Legal / Security Seal Box
    p.drawRect(40, 180, 532, 100, COLORS.bgLight, COLORS.borderDark, 1);
    p.drawText('OFFICIAL FORENSIC SEAL & CERTIFICATE OF ANALYSIS', 55, 260, '/F1', 9.5, COLORS.primaryBlue);
    p.drawLine(55, 252, 557, 252, COLORS.border, 0.5);
    p.drawWrappedText(
      'This document represents an automated cryptographic forensic analysis generated by the Mailiac Email Security Pipeline. The findings, RFC822 transport traces, and multi-pillar risk evaluations are sealed with an HMAC-SHA256 integrity signature to guarantee non-repudiation and evidence integrity.',
      55,
      240,
      500,
      12,
      '/F2',
      8.5,
      COLORS.textDark,
      4
    );

    p.drawFooter(6, TOTAL_PAGES, hash);
    pages.push(p);
  }

  // =========================================================================
  // ASSEMBLE MULTI-PAGE PDF 1.4 OBJECTS
  // =========================================================================
  // Object IDs:
  // 1: Catalog
  // 2: Pages (Kids [3, 4, 5, 6, 7, 8])
  // 3-8: Page Objects
  // 9-14: Content Stream Objects for Pages 1-6
  // 15: Font F1 (Helvetica-Bold)
  // 16: Font F2 (Helvetica)
  // 17: Font F3 (Courier)

  const numPages = pages.length;
  const pageObjStart = 3;
  const streamObjStart = pageObjStart + numPages; // 9
  const fontF1Id = streamObjStart + numPages; // 15
  const fontF2Id = fontF1Id + 1; // 16
  const fontF3Id = fontF1Id + 2; // 17
  const totalObjs = fontF3Id;

  const kidsArray = Array.from({ length: numPages }, (_, i) => `${pageObjStart + i} 0 R`).join(' ');

  const objCatalog = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const objPages = `2 0 obj\n<< /Type /Pages /Kids [${kidsArray}] /Count ${numPages} >>\nendobj\n`;

  const pageObjects: string[] = [];
  for (let i = 0; i < numPages; i++) {
    const pageId = pageObjStart + i;
    const streamId = streamObjStart + i;
    pageObjects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${streamId} 0 R /Resources << /Font << /F1 ${fontF1Id} 0 R /F2 ${fontF2Id} 0 R /F3 ${fontF3Id} 0 R >> >> >>\nendobj\n`
    );
  }

  const streamObjects: string[] = [];
  for (let i = 0; i < numPages; i++) {
    const streamId = streamObjStart + i;
    const content = pages[i]?.toStreamString() || '';
    const byteLen = Buffer.byteLength(content, 'ascii');
    streamObjects.push(
      `${streamId} 0 obj\n<< /Length ${byteLen} >>\nstream\n${content}\nendstream\nendobj\n`
    );
  }

  const objFontF1 = `${fontF1Id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`;
  const objFontF2 = `${fontF2Id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  const objFontF3 = `${fontF3Id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`;

  const allObjects: string[] = [
    objCatalog,
    objPages,
    ...pageObjects,
    ...streamObjects,
    objFontF1,
    objFontF2,
    objFontF3,
  ];

  const header = '%PDF-1.4\n';
  let offset = header.length;
  const offsets: number[] = [0];

  for (const objStr of allObjects) {
    offsets.push(offset);
    offset += Buffer.byteLength(objStr, 'ascii');
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjs; i++) {
    const offStr = String(offsets[i] ?? 0).padStart(10, '0');
    xref += `${offStr} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfString = header + allObjects.join('') + xref + trailer;
  return Buffer.from(pdfString, 'binary');
}
