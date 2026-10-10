import assert from 'node:assert/strict';
import { validateHistoricalEventsRequestDate } from '../src/lib/historical-events-request-validation.ts';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

// Every real UTC offset in use, in minutes, including the quarter-hour ones.
const UTC_OFFSET_MINUTES = [
  -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60,
  0,
  60, 120, 180, 210, 240, 270, 300, 330, 345, 360, 390, 420, 480, 525, 540, 570, 600, 630, 660, 720, 765, 780, 840,
];

// What a client actually sends: its own local calendar date. Mirrors
// getDateStringWithOffset in src/app/page.tsx, which pins to local noon so the
// ISO conversion cannot shift the day.
function localDateString(now, offsetMinutes, daysBack = 0) {
  const local = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  const pinned = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysBack, 12);
  return new Date(pinned).toISOString().slice(0, 10);
}

// --- Malformed input ------------------------------------------------------

for (const bad of ['', 'today', '2026-13-01', '2026-02-30', '2026-1-1', '20261011', '2026-10-11T00:00:00Z']) {
  assert.equal(
    validateHistoricalEventsRequestDate(bad, 'today'),
    'date must be a valid ISO calendar date in YYYY-MM-DD format',
    `expected "${bad}" to be rejected as malformed`
  );
}

// --- No legitimate caller is ever rejected --------------------------------
//
// The regression this guards: validating against the UTC day rejected every
// user east of UTC between local midnight and their offset with "future dates
// are not supported", and trimmed the oldest day for users west of UTC. The
// API validates before the cache and before generation, so a 400 here meant
// the app showed zero events and never tried to generate any.

let accepted = 0;

// A full year of hours, so DST shifts, month ends, year ends and ISO week
// boundaries are all covered.
for (let hoursFromEpoch = 0; hoursFromEpoch < 366 * 24; hoursFromEpoch += 1) {
  const now = new Date(Date.UTC(2026, 0, 1) + hoursFromEpoch * 60 * 60 * 1000);

  for (const offset of UTC_OFFSET_MINUTES) {
    // Day view: the UI clamps selectedDayOffset to 0..6 (src/app/page.tsx).
    for (let daysBack = 0; daysBack <= 6; daysBack += 1) {
      const date = localDateString(now, offset, daysBack);
      const error = validateHistoricalEventsRequestDate(date, 'today', now);
      assert.equal(
        error,
        undefined,
        `day view rejected a legitimate request: date=${date} offset=${offset}min now=${now.toISOString()} -> ${error}`
      );
      accepted += 1;
    }

    // Week view: the UI clamps selectedWeekOffset to 0..1.
    for (let weeksBack = 0; weeksBack <= 1; weeksBack += 1) {
      const date = localDateString(now, offset, weeksBack * 7);
      const error = validateHistoricalEventsRequestDate(date, 'week', now);
      assert.equal(
        error,
        undefined,
        `week view rejected a legitimate request: date=${date} offset=${offset}min now=${now.toISOString()} -> ${error}`
      );
      accepted += 1;
    }
  }
}

// --- Out-of-range input is still rejected ---------------------------------
//
// Widening the bounds by a day must not turn the validator into a no-op.

const now = new Date('2026-10-11T00:13:00Z');

// Two days ahead is beyond any real UTC offset.
assert.equal(
  validateHistoricalEventsRequestDate('2026-10-13', 'today', now),
  'future dates are not supported'
);
assert.equal(
  validateHistoricalEventsRequestDate('2026-12-25', 'today', now),
  'future dates are not supported'
);
// The future bound is checked before the view-type branch, so week requests
// get the future error too rather than the week-range one.
assert.equal(
  validateHistoricalEventsRequestDate('2026-10-13', 'week', now),
  'future dates are not supported'
);

// Older than the day window (now - 1 tolerance - 6 days = 2026-10-04).
assert.equal(
  validateHistoricalEventsRequestDate('2026-10-03', 'today', now),
  'day view supports only today and the previous 6 days'
);
assert.equal(
  validateHistoricalEventsRequestDate('2025-01-01', 'today', now),
  'day view supports only today and the previous 6 days'
);

// Older than the two-week window.
assert.equal(
  validateHistoricalEventsRequestDate('2026-09-20', 'week', now),
  'week view supports only the current and previous ISO weeks'
);

// The tolerance is exactly one day: the boundary is accepted, one past it is not.
assert.equal(validateHistoricalEventsRequestDate('2026-10-12', 'today', now), undefined);
assert.equal(validateHistoricalEventsRequestDate('2026-10-04', 'today', now), undefined);

console.log(`Request date validation check passed (${accepted.toLocaleString('en-US')} legitimate requests accepted)`);
