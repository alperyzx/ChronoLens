import { MongoClient, type Db } from 'mongodb';
import { getReportCacheSnapshot, type ReportCacheSnapshot, type ReportedContent } from './report-cache';

type ReportDocument = ReportedContent & {
  _id: string;
  contentHash: string;
  updatedAt: Date;
};

type ReportMetaDocument = {
  _id: 'report-cache-meta';
  lastClearWeek: number;
  lastClearYear: number;
  updatedAt: Date;
};

const REPORTS_COLLECTION = 'reported_content';
const REPORT_META_COLLECTION = 'reported_content_meta';
const REPORT_META_DOC_ID: ReportMetaDocument['_id'] = 'report-cache-meta';
const REPORT_THRESHOLD = 5;

declare global {
  // eslint-disable-next-line no-var
  var __chronolensReportMongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __chronolensReportHydrationPromise: Promise<void> | undefined;
}

function getMongoCredentials(): string | undefined {
  return process.env.MONGO_CREDENTIALS;
}

function shouldUseMongoReports(): boolean {
  return Boolean(getMongoCredentials());
}

function getMongoDatabaseName(uri: string): string {
  try {
    const parsed = new URL(uri);
    const pathname = parsed.pathname.replace(/^\//, '');
    return pathname || 'chronolens';
  } catch {
    return 'chronolens';
  }
}

function generateContentHash(title: string, category: string, date: string): string {
  const content = `${title}|${category}|${date}`;
  let hash = 0;
  for (let index = 0; index < content.length; index++) {
    const char = content.charCodeAt(index);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function getISOWeek(date: Date): { week: number; year: number } {
  const tempDate = new Date(date.getTime());
  tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
  const week1 = new Date(tempDate.getFullYear(), 0, 4);
  const weekNumber = Math.ceil((((tempDate.getTime() - week1.getTime()) / 86400000) + 1) / 7);
  return { week: weekNumber, year: tempDate.getFullYear() };
}

async function getMongoClient(): Promise<MongoClient | undefined> {
  if (!shouldUseMongoReports()) {
    return undefined;
  }

  const uri = getMongoCredentials();
  if (!uri) {
    return undefined;
  }

  if (!globalThis.__chronolensReportMongoClientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      retryWrites: false,
    });

    globalThis.__chronolensReportMongoClientPromise = client.connect();
  }

  return globalThis.__chronolensReportMongoClientPromise;
}

async function getDatabase(): Promise<Db | undefined> {
  const client = await getMongoClient();
  if (!client) {
    return undefined;
  }

  const uri = getMongoCredentials();
  if (!uri) {
    return undefined;
  }

  return client.db(getMongoDatabaseName(uri));
}

async function loadMeta(database: Db): Promise<{ lastClearWeek: number; lastClearYear: number }> {
  const meta = await database.collection<ReportMetaDocument>(REPORT_META_COLLECTION).findOne({ _id: REPORT_META_DOC_ID });
  if (meta) {
    return {
      lastClearWeek: meta.lastClearWeek,
      lastClearYear: meta.lastClearYear,
    };
  }

  const now = new Date();
  const { week, year } = getISOWeek(now);
  return { lastClearWeek: week, lastClearYear: year };
}

async function saveMeta(database: Db, meta: { lastClearWeek: number; lastClearYear: number }): Promise<void> {
  await database.collection<ReportMetaDocument>(REPORT_META_COLLECTION).updateOne(
    { _id: REPORT_META_DOC_ID },
    {
      $set: {
        lastClearWeek: meta.lastClearWeek,
        lastClearYear: meta.lastClearYear,
        updatedAt: new Date(),
      },
    },
    {
      upsert: true,
    }
  );
}

async function clearWeeklyIfNeeded(database: Db): Promise<{ lastClearWeek: number; lastClearYear: number }> {
  const meta = await loadMeta(database);
  const now = new Date();
  const { week, year } = getISOWeek(now);

  if (year > meta.lastClearYear || (year === meta.lastClearYear && week > meta.lastClearWeek)) {
    await database.collection(REPORTS_COLLECTION).deleteMany({});
    await saveMeta(database, { lastClearWeek: week, lastClearYear: year });
    return { lastClearWeek: week, lastClearYear: year };
  }

  return meta;
}

async function hydrateFromLegacyFileCache(): Promise<void> {
  if (!shouldUseMongoReports()) {
    return;
  }

  if (!globalThis.__chronolensReportHydrationPromise) {
    globalThis.__chronolensReportHydrationPromise = (async () => {
      const database = await getDatabase();
      if (!database) {
        return;
      }

      const snapshot: ReportCacheSnapshot = await getReportCacheSnapshot();
      const meta = await clearWeeklyIfNeeded(database);

      if (snapshot.lastClearWeek !== meta.lastClearWeek || snapshot.lastClearYear !== meta.lastClearYear) {
        await saveMeta(database, meta);
      }

      const documents = Object.entries(snapshot.reportedContent).map(([contentHash, content]) => ({
        _id: contentHash,
        contentHash,
        ...content,
        updatedAt: new Date(content.reportedAt),
      }));

      if (documents.length > 0) {
        await database.collection<ReportDocument>(REPORTS_COLLECTION).bulkWrite(
          documents.map(document => ({
            updateOne: {
              filter: { _id: document._id },
              update: {
                $set: document,
              },
              upsert: true,
            },
          }))
        );
      }
    })();
  }

  await globalThis.__chronolensReportHydrationPromise;
}

async function upsertReportDocument(title: string, category: string, date: string): Promise<ReportDocument | undefined> {
  const database = await getDatabase();
  if (!database) {
    return undefined;
  }

  const meta = await clearWeeklyIfNeeded(database);
  const contentHash = generateContentHash(title, category, date);
  const existing = await database.collection<ReportDocument>(REPORTS_COLLECTION).findOne({ _id: contentHash });
  const now = Date.now();
  const { week, year } = getISOWeek(new Date());

  const nextDocument: ReportDocument = existing
    ? {
        ...existing,
        reportCount: existing.reportCount + 1,
        reportedAt: now,
        updatedAt: new Date(),
      }
    : {
        _id: contentHash,
        contentHash,
        title,
        category,
        date,
        reportCount: 1,
        reportedAt: now,
        weekNumber: week,
        year,
        updatedAt: new Date(),
      };

  await database.collection<ReportDocument>(REPORTS_COLLECTION).updateOne(
    { _id: contentHash },
    {
      $set: nextDocument,
    },
    { upsert: true }
  );

  await saveMeta(database, meta);
  return nextDocument;
}

async function readAllReports(): Promise<ReportedContent[]> {
  const database = await getDatabase();
  if (!database) {
    return [];
  }

  await clearWeeklyIfNeeded(database);
  const documents = await database.collection<ReportDocument>(REPORTS_COLLECTION).find({}).toArray();
  return documents.map(({ _id, contentHash, updatedAt, ...content }) => content);
}

async function isContentHiddenFromMongo(title: string, category: string, date: string): Promise<boolean | undefined> {
  const database = await getDatabase();
  if (!database) {
    return undefined;
  }

  await clearWeeklyIfNeeded(database);
  const contentHash = generateContentHash(title, category, date);
  const document = await database.collection<ReportDocument>(REPORTS_COLLECTION).findOne({ _id: contentHash });
  if (!document) {
    return false;
  }

  return document.reportCount >= REPORT_THRESHOLD;
}

export async function reportContent(title: string, category: string, date: string): Promise<{ success: boolean; reportCount: number; isHidden: boolean }> {
  try {
    await hydrateFromLegacyFileCache();
    const mongoDocument = await upsertReportDocument(title, category, date);
    if (mongoDocument) {
      return {
        success: true,
        reportCount: mongoDocument.reportCount,
        isHidden: mongoDocument.reportCount >= REPORT_THRESHOLD,
      };
    }

    return {
      success: false,
      reportCount: 0,
      isHidden: false,
    };
  } catch (error) {
    console.error('Error reporting content in Firestore cache:', error);
    return {
      success: false,
      reportCount: 0,
      isHidden: false,
    };
  }
}

export async function isContentHidden(title: string, category: string, date: string): Promise<boolean> {
  try {
    await hydrateFromLegacyFileCache();
    const hidden = await isContentHiddenFromMongo(title, category, date);
    return hidden ?? false;
  } catch (error) {
    console.error('Error checking if content is hidden in Firestore cache:', error);
    return false;
  }
}

export async function filterHiddenContent<T extends { title: string; category: string; date: string }>(content: T[]): Promise<T[]> {
  try {
    await hydrateFromLegacyFileCache();
    const database = await getDatabase();
    if (!database) {
      return content;
    }

    await clearWeeklyIfNeeded(database);
    const contentHashes = content.map(item => generateContentHash(item.title, item.category, item.date));
    const hiddenDocuments = await database.collection<ReportDocument>(REPORTS_COLLECTION).find({ _id: { $in: contentHashes } }).toArray();
    const hiddenHashSet = new Set(hiddenDocuments.filter(document => document.reportCount >= REPORT_THRESHOLD).map(document => document._id));

    return content.filter(item => !hiddenHashSet.has(generateContentHash(item.title, item.category, item.date)));
  } catch (error) {
    console.error('Error filtering hidden content from Firestore cache:', error);
    return content;
  }
}

export async function getReportStats(): Promise<{
  totalReported: number;
  hiddenContent: number;
  currentWeek: number;
  currentYear: number;
  lastClearWeek: number;
  lastClearYear: number;
}> {
  try {
    await hydrateFromLegacyFileCache();
    const database = await getDatabase();
    if (!database) {
      const now = new Date();
      const { week, year } = getISOWeek(now);
      return {
        totalReported: 0,
        hiddenContent: 0,
        currentWeek: week,
        currentYear: year,
        lastClearWeek: week,
        lastClearYear: year,
      };
    }

    const now = new Date();
    const { week, year } = getISOWeek(now);
    const meta = await clearWeeklyIfNeeded(database);
    const reported = await database.collection<ReportDocument>(REPORTS_COLLECTION).find({}).toArray();

    return {
      totalReported: reported.length,
      hiddenContent: reported.filter(item => item.reportCount >= REPORT_THRESHOLD).length,
      currentWeek: week,
      currentYear: year,
      lastClearWeek: meta.lastClearWeek,
      lastClearYear: meta.lastClearYear,
    };
  } catch (error) {
    console.error('Error getting Firestore report stats:', error);
    const now = new Date();
    const { week, year } = getISOWeek(now);
    return {
      totalReported: 0,
      hiddenContent: 0,
      currentWeek: week,
      currentYear: year,
      lastClearWeek: week,
      lastClearYear: year,
    };
  }
}

export async function getAllReportedContent(): Promise<ReportedContent[]> {
  try {
    return await readAllReports();
  } catch (error) {
    console.error('Error getting all reported content from Firestore cache:', error);
    return [];
  }
}

export async function clearAllReports(): Promise<void> {
  try {
    const database = await getDatabase();
    if (!database) {
      return;
    }

    const now = new Date();
    const { week, year } = getISOWeek(now);
    await database.collection(REPORTS_COLLECTION).deleteMany({});
    await saveMeta(database, { lastClearWeek: week, lastClearYear: year });
  } catch (error) {
    console.error('Error clearing Firestore report cache:', error);
  }
}

export async function recoverReportedContent(title: string, category: string, date: string): Promise<boolean> {
  try {
    await hydrateFromLegacyFileCache();
    const database = await getDatabase();
    if (!database) {
      return false;
    }

    await clearWeeklyIfNeeded(database);
    const contentHash = generateContentHash(title, category, date);
    const result = await database.collection<ReportDocument>(REPORTS_COLLECTION).deleteOne({ _id: contentHash });

    return result.deletedCount > 0;
  } catch (error) {
    console.error('Error recovering reported content in Firestore cache:', error);
    return false;
  }
}
