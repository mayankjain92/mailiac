import dns from 'dns/promises';

/**
 * Resolves the reverse DNS (PTR) hostnames for a given IP address.
 * Has a configurable timeout to prevent hanging the pipeline.
 * Returns an empty array if the lookup fails, times out, or has no results.
 */
export async function resolvePtrWithTimeout(ip: string, timeoutMs: number = 2000): Promise<string[]> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('DNS PTR lookup timeout'));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      dns.reverse(ip),
      timeoutPromise,
    ]);
    return result;
  } catch (err) {
    // Graceful fallback for failures or timeouts: return empty array as per PRD/task card
    return [];
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
