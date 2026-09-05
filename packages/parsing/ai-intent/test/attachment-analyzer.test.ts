import { describe, it, expect } from 'vitest';
import type { ParsedAttachment } from '@mailiac/shared-types';
import {
  analyzeAttachment,
  analyzeAttachments,
  scoreIntent,
  KNOWN_MALICIOUS_HASHES,
} from '../src/index.js';

describe('Attachment Threat & Malware Analyzer (@mailiac/parsing-ai-intent)', () => {
  const benignSha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  it('1. Benign attachments produce zero threat findings', async () => {
    const benignPdf: ParsedAttachment = {
      filename: 'Quarterly_Report.pdf',
      contentType: 'application/pdf',
      sizeBytes: 45000,
      sha256: benignSha256,
    };

    const benignImg: ParsedAttachment = {
      filename: 'company_logo.png',
      contentType: 'image/png',
      sizeBytes: 12000,
      sha256: benignSha256,
    };

    const findingsPdf = analyzeAttachment(benignPdf);
    expect(findingsPdf).toHaveLength(0);

    const result = await analyzeAttachments([benignPdf, benignImg]);
    expect(result.hasMaliciousAttachment).toBe(false);
    expect(result.threatLabels).toHaveLength(0);
    expect(result.findings).toHaveLength(0);
    expect(result.maxRiskScore).toBe(0);
  });

  it('2. Detects deceptive double extension attacks masking executables (e.g. .pdf.exe)', async () => {
    const doubleExtAttachment: ParsedAttachment = {
      filename: 'Invoice_Overdue_March2026.pdf.exe',
      contentType: 'application/octet-stream',
      sizeBytes: 120000,
      sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
    };

    const findings = analyzeAttachment(doubleExtAttachment);
    expect(findings.some((f) => f.type === 'MALWARE_DOUBLE_EXTENSION' && f.severity === 'HIGH')).toBe(true);
    expect(findings.some((f) => f.type === 'MALWARE_DANGEROUS_EXTENSION')).toBe(true);

    const result = await analyzeAttachments([doubleExtAttachment]);
    expect(result.hasMaliciousAttachment).toBe(true);
    expect(result.threatLabels).toContain('MALWARE_PAYLOAD');
    expect(result.maxRiskScore).toBeGreaterThanOrEqual(90);
  });

  it('3. Detects Unicode Right-to-Left Override (RLO) extension spoofing', async () => {
    // Unicode \u202E flips characters so "invoice_\u202Efdp.exe" visually renders as "invoice_exe.pdf"
    const rloAttachment: ParsedAttachment = {
      filename: 'invoice_\u202Efdp.exe',
      contentType: 'application/octet-stream',
      sizeBytes: 85000,
      sha256: 'c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ff',
    };

    const findings = analyzeAttachment(rloAttachment);
    const rloFinding = findings.find((f) => f.type === 'MALWARE_UNICODE_RLO_EVASION');
    expect(rloFinding).toBeDefined();
    expect(rloFinding?.severity).toBe('HIGH');
  });

  it('4. Detects dangerous executable and script loader attachments (.bat, .ps1, .vbs, .scr, .iso)', async () => {
    const scripts: ParsedAttachment[] = [
      { filename: 'urgent_update.bat', contentType: 'text/plain', sizeBytes: 500, sha256: '1111111111111111111111111111111111111111111111111111111111111111' },
      { filename: 'install.ps1', contentType: 'text/plain', sizeBytes: 800, sha256: '2222222222222222222222222222222222222222222222222222222222222222' },
      { filename: 'document.vbs', contentType: 'text/vbscript', sizeBytes: 1200, sha256: '3333333333333333333333333333333333333333333333333333333333333333' },
      { filename: 'disk_image.iso', contentType: 'application/x-iso9660-image', sizeBytes: 5000000, sha256: '4444444444444444444444444444444444444444444444444444444444444444' },
    ];

    for (const script of scripts) {
      const findings = analyzeAttachment(script);
      expect(findings.some((f) => f.type === 'MALWARE_DANGEROUS_EXTENSION' && f.severity === 'HIGH')).toBe(true);
    }
  });

  it('5. Flags macro-enabled Office documents (.xlsm, .docm)', () => {
    const macroDoc: ParsedAttachment = {
      filename: 'Q1_Financial_Forecast.xlsm',
      contentType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
      sizeBytes: 150000,
      sha256: '5555555555555555555555555555555555555555555555555555555555555555',
    };

    const findings = analyzeAttachment(macroDoc);
    expect(findings.some((f) => f.type === 'MALWARE_MACRO_CARRIER' && f.severity === 'MEDIUM')).toBe(true);
  });

  it('6. Matches known high-profile malware SHA-256 signatures (EICAR & WannaCry)', async () => {
    const eicarHash = '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';
    expect(KNOWN_MALICIOUS_HASHES.has(eicarHash)).toBe(true);

    const eicarAttachment: ParsedAttachment = {
      filename: 'eicar.com.txt',
      contentType: 'text/plain',
      sizeBytes: 68,
      sha256: eicarHash,
    };

    const findings = analyzeAttachment(eicarAttachment);
    const hashMatch = findings.find((f) => f.type === 'MALWARE_KNOWN_HASH_MATCH');
    expect(hashMatch).toBeDefined();
    expect(hashMatch?.severity).toBe('HIGH');
  });

  it('7. Detects MIME vs extension conflicts (e.g. PDF claiming binary PE or executable claiming PDF MIME)', () => {
    // Case A: Innocent extension (.pdf) claiming Windows PE binary
    const peDisguisedAsPdf: ParsedAttachment = {
      filename: 'statement.pdf',
      contentType: 'application/x-msdownload',
      sizeBytes: 50000,
      sha256: '6666666666666666666666666666666666666666666666666666666666666666',
    };
    const findingsA = analyzeAttachment(peDisguisedAsPdf);
    expect(findingsA.some((f) => f.type === 'MALWARE_MIME_MISMATCH' && f.severity === 'HIGH')).toBe(true);

    // Case B: Executable (.exe) claiming application/pdf MIME type
    const exeClaimingPdfMime: ParsedAttachment = {
      filename: 'update.exe',
      contentType: 'application/pdf',
      sizeBytes: 60000,
      sha256: '7777777777777777777777777777777777777777777777777777777777777777',
    };
    const findingsB = analyzeAttachment(exeClaimingPdfMime);
    expect(findingsB.some((f) => f.type === 'MALWARE_MIME_MISMATCH' && f.severity === 'HIGH')).toBe(true);
  });

  it('8. Flags zero-byte anomaly attachment payloads', () => {
    const zeroByteAttachment: ParsedAttachment = {
      filename: 'corrupted_payload.bin',
      contentType: 'application/octet-stream',
      sizeBytes: 0,
      sha256: benignSha256,
    };

    const findings = analyzeAttachment(zeroByteAttachment);
    expect(findings.some((f) => f.type === 'MALWARE_ZERO_BYTE_PAYLOAD' && f.severity === 'MEDIUM')).toBe(true);
  });

  it('9. End-to-end scoreIntent elevates NLP score and attaches MALWARE_PAYLOAD label', async () => {
    const maliciousAttachment: ParsedAttachment = {
      filename: 'Confidential_Contract.pdf.exe',
      contentType: 'application/octet-stream',
      sizeBytes: 95000,
      sha256: '8888888888888888888888888888888888888888888888888888888888888888',
    };

    const result = await scoreIntent({
      text: 'Please review the attached contract for your signatures.',
      subject: 'Review Contract',
      sender: 'hr@example.com',
      attachments: [maliciousAttachment],
    });

    expect(result.intentLabels).toContain('MALWARE_PAYLOAD');
    expect(result.nlpScore).toBeGreaterThanOrEqual(95);
    expect(result.findings.some((f) => f.type === 'MALWARE_DOUBLE_EXTENSION')).toBe(true);
    expect(result.findings.some((f) => f.type === 'MALWARE_DANGEROUS_EXTENSION')).toBe(true);
  });

  it('10. Empty body text with malicious attachment does not return safe 0 score', async () => {
    const maliciousAttachment: ParsedAttachment = {
      filename: 'wire_transfer_form.vbs',
      contentType: 'text/vbscript',
      sizeBytes: 1500,
      sha256: '9999999999999999999999999999999999999999999999999999999999999999',
    };

    const result = await scoreIntent({
      text: '',
      subject: '',
      attachments: [maliciousAttachment],
    });

    expect(result.intentLabels).toContain('MALWARE_PAYLOAD');
    expect(result.nlpScore).toBeGreaterThanOrEqual(95);
    expect(result.findings.some((f) => f.severity === 'HIGH')).toBe(true);
  });
});
