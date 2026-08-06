import assert from 'node:assert/strict';
import { hasMinimumEvents, mergeValidatedSelections } from '../src/lib/historical-event-selection.ts';

const event = (title, source, rank) => ({
  title,
  source,
  significanceRank: rank,
  date: '2026-08-06',
  category: 'Science',
  description: title,
});

const merged = mergeValidatedSelections(
  { count: 2, events: [event('One', 'https://example.com/1', 1), event('Two', 'https://example.com/2', 2)] },
  { count: 3, events: [event('Two', 'https://example.com/duplicate', 1), event('Three', 'https://example.com/3', 2), event('Four', 'https://example.com/4', 3)] }
);

assert.equal(merged.count, 3);
assert.deepEqual(merged.events.map(item => item.title), ['One', 'Two', 'Three', 'Four']);
assert.equal(hasMinimumEvents(merged), true);
assert.equal(hasMinimumEvents({ count: 2, events: merged.events.slice(0, 2) }), false);

const dynamic = mergeValidatedSelections(
  { count: 5, events: [1, 2, 3, 4, 5].map(index => event(`Dynamic ${index}`, `https://example.com/dynamic-${index}`, index)) },
  { count: 0, events: [] }
);

assert.equal(dynamic.count, 5);

console.log('Content refill selection check passed');
