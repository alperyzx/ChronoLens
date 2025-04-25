/**
 * Represents an RSS feed.
 */
export interface RssFeed {
  /**
   * The title of the RSS feed.
   */
  title: string;
  /**
   * The description of the RSS feed.
   */
  description: string;
  /**
   * The link to the RSS feed.
   */
  link: string;
  /**
   * The last build date of the RSS feed.
   */
  lastBuildDate: string;
  /**
   * The items in the RSS feed.
   */
  items: RssFeedItem[];
}

/**
 * Represents an item in an RSS feed.
 */
export interface RssFeedItem {
  /**
   * The title of the RSS feed item.
   */
  title: string;
  /**
   * The description of the RSS feed item.
   */
  description: string;
  /**
   * The link to the RSS feed item.
   */
  link: string;
  /**
   * The publication date of the RSS feed item.
   */
  pubDate: string;
  /**
   * The GUID of the RSS feed item.
   */
  guid: string;
}

import NodeCache from 'node-cache';

const cache = new NodeCache();

/**
 * Asynchronously retrieves an RSS feed.
 *
 * @returns A promise that resolves to an RssFeed object.
 */
export async function getRssFeed(): Promise<RssFeed> {
  const cacheKey = 'rssFeed';

  let rssFeed = cache.get(cacheKey) as RssFeed;
  if (rssFeed) {
    return rssFeed;
  }

  // TODO: Implement this by calling an API.
  rssFeed = {
    title: 'Today in History',
    description: 'Historical events from past years for the current day or ISO week.',
    link: 'https://example.com/rss',
    lastBuildDate: new Date().toISOString(),
    items: [
      {
        title: 'Event 1',
        description: 'Description of event 1.',
        link: 'https://example.com/event1',
        pubDate: new Date().toISOString(),
        guid: 'event1',
      },
      {
        title: 'Event 2',
        description: 'Description of event 2.',
        link: 'https://example.com/event2',
        pubDate: new Date().toISOString(),
        guid: 'event2',
      },
    ],
  };

  // Cache until midnight Turkey Time
  const now = new Date();
  const turkeyTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const midnightTurkey = new Date(turkeyTime);
  midnightTurkey.setDate(turkeyTime.getDate() + 1);
  midnightTurkey.setHours(0, 0, 0, 0);
  const ttl = midnightTurkey.getTime() - turkeyTime.getTime();

  cache.set(cacheKey, rssFeed, Math.round(ttl / 1000)); // TTL in seconds

  return rssFeed;
}
