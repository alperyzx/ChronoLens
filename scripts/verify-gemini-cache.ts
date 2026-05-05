import assert from 'node:assert/strict';
import {
  buildBatchEventPrompt,
  buildBatchEventWeekPrompt,
  buildSingleEventPrompt,
  buildSingleEventWeekPrompt,
} from '../src/lib/gemini-prompt-builders';
import {GEMINI_CACHE_MODEL} from '../src/lib/gemini-context-cache';
import {getTTLUntilEndOfWeek, getTTLUntilMidnight} from '../src/lib/cache-file';

function assertWithinRange(value: number, minInclusive: number, maxInclusive: number, label: string): void {
  assert.ok(Number.isFinite(value), `${label} must be a finite number`);
  assert.ok(value >= minInclusive, `${label} must be at least ${minInclusive}`);
  assert.ok(value <= maxInclusive, `${label} must be at most ${maxInclusive}`);
}

function main(): void {
  const midnightTtl = getTTLUntilMidnight();
  const weekTtl = getTTLUntilEndOfWeek();

  assertWithinRange(midnightTtl, 1, 24 * 60 * 60, 'Midnight TTL');
  assertWithinRange(weekTtl, 1, 7 * 24 * 60 * 60, 'Week TTL');

  const todayPrompt = buildSingleEventPrompt({
    date: '2026-05-05',
    category: 'Technology',
  });
  assert.match(todayPrompt, /Date: 2026-05-05/);
  assert.match(todayPrompt, /Category: Technology/);

  const weekPrompt = buildSingleEventWeekPrompt(
    {
      date: 'This Week',
      category: 'Science',
    },
    {
      monthDay: 'May 3-9',
      startDate: '05-03',
      endDate: '05-09',
    }
  );
  assert.match(weekPrompt, /Week range: May 3-9/);
  assert.match(weekPrompt, /Start MM-DD: 05-03/);
  assert.match(weekPrompt, /End MM-DD: 05-09/);

  const batchTodayPrompt = buildBatchEventPrompt('2026-05-05');
  assert.match(batchTodayPrompt, /Date: 2026-05-05/);
  assert.match(batchTodayPrompt, /exactly 3 distinct historical events/);

  const batchWeekPrompt = buildBatchEventWeekPrompt('This Week', {
    monthDay: 'May 3-9',
    startDate: '05-03',
    endDate: '05-09',
  });
  assert.match(batchWeekPrompt, /Week range: May 3-9/);
  assert.match(batchWeekPrompt, /Start MM-DD: 05-03/);
  assert.match(batchWeekPrompt, /End MM-DD: 05-09/);
  assert.match(batchWeekPrompt, /exactly 3 distinct historical events/);

  assert.equal(GEMINI_CACHE_MODEL, 'models/gemini-3-flash-preview');

  console.log('Gemini cache smoke test passed.');
  console.log(`Midnight TTL: ${midnightTtl}s`);
  console.log(`Week TTL: ${weekTtl}s`);
}

main();
