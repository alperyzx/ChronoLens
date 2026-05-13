import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Get cache directory for auth tracking
function getAuthCacheDir(): string {
  const baseDir = process.env.CACHE_DIR || path.join(os.tmpdir(), 'chronolens-cache');
  return baseDir;
}

// Get failed attempts file path for a given day
function getFailedAttemptsPath(date: string): string {
  const cacheDir = getAuthCacheDir();
  return path.join(cacheDir, `_cache_admin_attempts_${date}.json`);
}

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Ensure cache directory exists
async function ensureAuthCacheDir(): Promise<void> {
  const cacheDir = getAuthCacheDir();
  try {
    await fs.mkdir(cacheDir, { recursive: true });
  } catch (error) {
    console.error('Error creating auth cache directory:', error);
  }
}

// Get the number of failed attempts today
export async function getFailedAttempts(): Promise<number> {
  try {
    await ensureAuthCacheDir();
    const today = getTodayDate();
    const filePath = getFailedAttemptsPath(today);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      return data.count || 0;
    } catch {
      // File doesn't exist or can't be read, return 0
      return 0;
    }
  } catch (error) {
    console.error('Error reading failed attempts:', error);
    return 0;
  }
}

// Increment failed attempts
export async function incrementFailedAttempts(): Promise<number> {
  try {
    await ensureAuthCacheDir();
    const today = getTodayDate();
    const filePath = getFailedAttemptsPath(today);

    let count = 0;
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      count = (data.count || 0) + 1;
    } catch {
      count = 1;
    }

    // Save updated count
    await fs.writeFile(
      filePath,
      JSON.stringify({ count, timestamp: Date.now() }),
      'utf8'
    );

    return count;
  } catch (error) {
    console.error('Error incrementing failed attempts:', error);
    return 0;
  }
}

// Verify password
export async function verifyPassword(inputPassword: string): Promise<{ valid: boolean; message: string; attemptsLeft: number }> {
  const correctPassword = process.env.CACHE_ADMIN_PASSWORD;

  if (!correctPassword) {
    return {
      valid: false,
      message: 'Password not configured',
      attemptsLeft: 2,
    };
  }

  // Check failed attempts first
  const failedAttempts = await getFailedAttempts();
  const maxAttempts = 2;

  if (failedAttempts >= maxAttempts) {
    return {
      valid: false,
      message: `Too many failed attempts. Try again tomorrow.`,
      attemptsLeft: 0,
    };
  }

  // Verify password
  if (inputPassword === correctPassword) {
    return {
      valid: true,
      message: 'Password correct',
      attemptsLeft: maxAttempts,
    };
  }

  // Wrong password, increment attempts
  const newCount = await incrementFailedAttempts();
  const attemptsLeft = maxAttempts - newCount;

  return {
    valid: false,
    message: `Incorrect password.${attemptsLeft > 0 ? ` ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining today.` : ''}`,
    attemptsLeft,
  };
}

// Reset failed attempts (can be called manually if needed)
export async function resetFailedAttempts(): Promise<void> {
  try {
    const today = getTodayDate();
    const filePath = getFailedAttemptsPath(today);
    await fs.unlink(filePath).catch(() => {
      // File might not exist, that's fine
    });
  } catch (error) {
    console.error('Error resetting failed attempts:', error);
  }
}
