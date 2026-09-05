import type { Finding, ParsedAttachment } from '@mailiac/shared-types';

/**
 * Built-in blocklist of known high-profile malware SHA-256 signatures.
 * Includes industry-standard EICAR antivirus test file and notorious dropper/ransomware samples.
 */
export const KNOWN_MALICIOUS_HASHES: ReadonlySet<string> = new Set([
  // EICAR standard antivirus test file
  '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f',
  // WannaCry Ransomware dropper
  '24d004a104d4d54034dbcffc2a4b19a11f39008a575aa614ea04703480b1022c',
  // Emotet banking trojan / loader
  '42244955b2533c39ee30a3f9e9cf2ec2dcf15671607ef3a31c5b8b9393e98fc6',
  // Locky ransomware payload
  '584dc7eb4ec3e64883907e819b9195b058c4083ca8636b06dbbfd7abdf51e737',
  // Trickbot credential stealer
  '31346399992f447d6e87fcf309b6261c16260ab51119b48b9487c53d51f22312',
  // Ryuk ransomware
  '8b0b970e4436b808d9e4a8f280f86f37a0fa3adc8c7b41427d14249cb0f7787f',
]);

/**
 * High-risk executable, script, and container extensions commonly used in email phishing & malware delivery.
 */
export const DANGEROUS_EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe',
  'dll',
  'com',
  'cpl',
  'scr',
  'sys',
  'pif',
  'application',
  'gadget',
  'msc',
  'bat',
  'cmd',
  'ps1',
  'psm1',
  'psd1',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'hta',
  'jar',
  'reg',
  'lnk',
  'iso',
  'img',
  'vhd',
  'vhdx',
]);

/**
 * Macro-enabled Office document extensions frequently leveraged for malicious VBA code delivery.
 */
export const MACRO_ENABLED_EXTENSIONS: ReadonlySet<string> = new Set([
  'docm',
  'xlsm',
  'pptm',
  'dotm',
  'xltm',
  'xlam',
]);

/**
 * Benign appearance extensions that attackers attempt to mimic before an executable payload.
 */
const INNOCENT_EXTENSIONS = '(?:pdf|docx?|xlsx?|pptx?|txt|rtf|csv|jpg|jpeg|png|gif|svg)';
const DANGEROUS_EXT_REGEX_PART = Array.from(DANGEROUS_EXECUTABLE_EXTENSIONS).join('|');

/**
 * Double extension deception regex (e.g. "Invoice_March.pdf.exe", "Payroll.xlsx.scr").
 */
const DOUBLE_EXTENSION_REGEX = new RegExp(
  `\\.${INNOCENT_EXTENSIONS}\\.(${DANGEROUS_EXT_REGEX_PART})$`,
  'i'
);

/**
 * Unicode Right-to-Left Override and directional control characters used for extension spoofing.
 * U+202E (RLO), U+202B (RLE), U+202D (LRO), U+2067 (RLI).
 */
const UNICODE_RLO_REGEX = /[\u202E\u202B\u202D\u2067]/;

/**
 * Executable / binary MIME types that should not be associated with innocent document names.
 */
export const EXECUTABLE_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/x-msdownload',
  'application/x-dosexec',
  'application/x-executable',
  'application/x-msdos-program',
  'application/x-sharedlib',
  'application/octet-stream',
]);

export interface AttachmentAnalyzerOptions {
  customHashBlocklist?: Set<string>;
  checkVirusTotal?: boolean;
  virusTotalApiKey?: string;
  timeoutMs?: number;
}

export interface AttachmentAnalysisResult {
  hasMaliciousAttachment: boolean;
  findings: Finding[];
  threatLabels: string[];
  maxRiskScore: number;
}

/**
 * Analyzes an individual ParsedAttachment for deception, dangerous extensions, and known malicious hashes.
 */
export function analyzeAttachment(
  attachment: ParsedAttachment,
  options?: AttachmentAnalyzerOptions
): Finding[] {
  const findings: Finding[] = [];
  const filename = attachment.filename?.trim() || '';
  const contentType = attachment.contentType?.toLowerCase().trim() || '';
  const sha256 = attachment.sha256?.toLowerCase().trim() || '';
  const sizeBytes = attachment.sizeBytes ?? 0;

  // 1. Threat Intelligence Hash Blocklist Check (SHA-256)
  const isBlocked =
    KNOWN_MALICIOUS_HASHES.has(sha256) ||
    Boolean(options?.customHashBlocklist?.has(sha256));

  if (isBlocked) {
    findings.push({
      type: 'MALWARE_KNOWN_HASH_MATCH',
      severity: 'HIGH',
      description: `Attachment "${filename || 'unnamed'}" matches a known malware signature (SHA-256: ${sha256.slice(0, 16)}...).`,
      source: 'heuristic',
    });
  }

  // 2. Right-to-Left Override (RLO) Unicode Deception
  if (UNICODE_RLO_REGEX.test(filename)) {
    findings.push({
      type: 'MALWARE_UNICODE_RLO_EVASION',
      severity: 'HIGH',
      description: `Attachment filename "${filename}" contains Unicode Right-to-Left Override characters designed to disguise executable extensions.`,
      source: 'heuristic',
    });
  }

  // 3. Double Extension Detection (e.g., Invoice.pdf.exe)
  if (DOUBLE_EXTENSION_REGEX.test(filename)) {
    findings.push({
      type: 'MALWARE_DOUBLE_EXTENSION',
      severity: 'HIGH',
      description: `Attachment "${filename}" employs a deceptive double extension masking an executable payload.`,
      source: 'heuristic',
    });
  }

  // Extract trailing extension for single extension analysis
  const extMatch = filename.match(/\.([a-z0-9]+)$/i);
  const ext = extMatch ? extMatch[1]!.toLowerCase() : '';

  // 4. Dangerous Script / Executable Extension
  if (DANGEROUS_EXECUTABLE_EXTENSIONS.has(ext)) {
    findings.push({
      type: 'MALWARE_DANGEROUS_EXTENSION',
      severity: 'HIGH',
      description: `High-risk executable or script attachment detected: "${filename}" (.${ext}).`,
      source: 'heuristic',
    });
  }

  // 5. Macro-enabled Office Document Extension
  if (MACRO_ENABLED_EXTENSIONS.has(ext)) {
    findings.push({
      type: 'MALWARE_MACRO_CARRIER',
      severity: 'MEDIUM',
      description: `Macro-enabled office document detected: "${filename}" (.${ext}). Frequently used for malicious VBA macro execution.`,
      source: 'heuristic',
    });
  }

  // 6. Declared MIME vs Extension Mismatch
  // Case A: Innocent extension (.pdf, .png, .jpg) declared with executable binary MIME type
  const isInnocentExtension = /^(?:pdf|docx?|xlsx?|pptx?|jpg|jpeg|png|txt)$/i.test(ext);
  if (isInnocentExtension && (contentType === 'application/x-msdownload' || contentType === 'application/x-dosexec')) {
    findings.push({
      type: 'MALWARE_MIME_MISMATCH',
      severity: 'HIGH',
      description: `Attachment "${filename}" claims document extension .${ext} but declares binary executable MIME type "${contentType}".`,
      source: 'heuristic',
    });
  }

  // Case B: Dangerous extension (.exe, .scr, .vbs) masked under benign MIME type (e.g. application/pdf)
  if (DANGEROUS_EXECUTABLE_EXTENSIONS.has(ext) && (contentType.startsWith('image/') || contentType === 'application/pdf')) {
    findings.push({
      type: 'MALWARE_MIME_MISMATCH',
      severity: 'HIGH',
      description: `Executable attachment "${filename}" (.${ext}) is disguised with misleading MIME type "${contentType}".`,
      source: 'heuristic',
    });
  }

  // 7. Zero-Byte Anomaly Payload
  if (sizeBytes === 0 && filename.length > 0) {
    findings.push({
      type: 'MALWARE_ZERO_BYTE_PAYLOAD',
      severity: 'MEDIUM',
      description: `Attachment "${filename}" contains 0 bytes (potential parser crash or evasion anomaly).`,
      source: 'heuristic',
    });
  }

  return findings;
}

/**
 * Analyzes a collection of ParsedAttachment items and produces consolidated threat metrics.
 */
export async function analyzeAttachments(
  attachments: ParsedAttachment[] | undefined,
  options?: AttachmentAnalyzerOptions
): Promise<AttachmentAnalysisResult> {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return {
      hasMaliciousAttachment: false,
      findings: [],
      threatLabels: [],
      maxRiskScore: 0,
    };
  }

  const allFindings: Finding[] = [];
  let hasHighRisk = false;
  let hasMediumRisk = false;

  for (const attachment of attachments) {
    const findings = analyzeAttachment(attachment, options);
    for (const f of findings) {
      allFindings.push(f);
      if (f.severity === 'HIGH') {
        hasHighRisk = true;
      } else if (f.severity === 'MEDIUM') {
        hasMediumRisk = true;
      }
    }
  }

  // Optional External Threat Intelligence Lookup (VirusTotal API)
  const vtApiKey = options?.virusTotalApiKey || process.env['VIRUSTOTAL_API_KEY'];
  if (options?.checkVirusTotal && vtApiKey) {
    const timeoutMs = options.timeoutMs ?? 2000;
    for (const att of attachments) {
      const sha256 = att.sha256?.toLowerCase().trim();
      if (!sha256 || sha256.length !== 64) continue;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, {
          method: 'GET',
          headers: {
            'x-apikey': vtApiKey,
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.ok) {
          const data = (await response.json()) as {
            data?: {
              attributes?: {
                last_analysis_stats?: {
                  malicious?: number;
                  suspicious?: number;
                };
              };
            };
          };

          const maliciousCount = data.data?.attributes?.last_analysis_stats?.malicious ?? 0;
          if (maliciousCount > 0) {
            hasHighRisk = true;
            allFindings.push({
              type: 'VIRUSTOTAL_MALWARE_DETECTION',
              severity: 'HIGH',
              description: `VirusTotal threat intelligence flagged attachment "${att.filename || sha256.slice(0, 8)}" with ${maliciousCount} malicious detection(s).`,
              source: 'heuristic',
            });
          }
        }
      } catch {
        // Safe failover: network timeout or external API errors must never crash forensic pipeline
      }
    }
  }

  const threatLabels: string[] = [];
  if (hasHighRisk) {
    threatLabels.push('MALWARE_PAYLOAD');
  }

  let maxRiskScore = 0;
  if (hasHighRisk) {
    maxRiskScore = 95;
  } else if (hasMediumRisk) {
    maxRiskScore = 45;
  }

  return {
    hasMaliciousAttachment: hasHighRisk,
    findings: allFindings,
    threatLabels,
    maxRiskScore,
  };
}
