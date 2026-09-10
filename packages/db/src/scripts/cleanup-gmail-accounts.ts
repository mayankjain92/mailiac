declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit: (code?: number) => void;
};
import { connectDb, cleanupStaleGmailAccounts } from '../index.js';

async function run(): Promise<void> {
  const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
  console.info(`[cleanup] Connecting to MongoDB: ${mongoUri.replace(/\/\/.*@/, '//***@')}`);
  await connectDb(mongoUri);

  const olderThanHours = process.env['OLDER_THAN_HOURS']
    ? parseInt(process.env['OLDER_THAN_HOURS'], 10)
    : undefined;
  const wipeAll = process.env['WIPE_ALL'] === 'true' || process.argv.includes('--all');

  const result = await cleanupStaleGmailAccounts({ olderThanHours, wipeAll });
  console.info(`[cleanup] Successfully removed ${result.deletedCount} stale Gmail account record(s).`);
  process.exit(0);
}

run().catch((err) => {
  console.error('[cleanup] Failed to run Gmail account cleanup:', err);
  process.exit(1);
});
