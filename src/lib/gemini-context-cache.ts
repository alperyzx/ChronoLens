import fs from 'fs/promises';
import path from 'path';
import os from 'os';

type GeminiCacheRegistryEntry = {
  name: string;
  model: string;
  displayName: string;
  expireTime?: string;
  updatedAt: string;
};

type GeminiCacheRegistry = {
  entries: Record<string, GeminiCacheRegistryEntry>;
};

type GeminiCacheMetadata = {
  name?: string;
  model?: string;
  displayName?: string;
  expireTime?: string;
};

type ResolveGeminiContextCacheOptions = {
  cacheId: string;
  displayName: string;
  model: string;
  instructions: string;
  ttlSeconds?: number;
};

type CachedGeminiContext = GeminiCacheRegistryEntry & {
  cachedAt: number;
};

const DEFAULT_CACHE_TTL_SECONDS = 24 * 60 * 60;
export const GEMINI_CACHE_MODEL = 'models/gemini-3-flash-preview';
const INSTANCE_CACHE_TTL_BUFFER_MS = 30 * 1000;

const instanceCache = new Map<string, CachedGeminiContext>();

function getCacheDir(): string {
  return process.env.CACHE_DIR || path.join(os.tmpdir(), 'chronolens-cache');
}

function getRegistryFilePath(): string {
  return path.join(getCacheDir(), 'gemini-context-cache-registry.json');
}

function getGeminiApiKey(): string | undefined {
  return process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
}

function getGeminiBaseUrl(): string {
  return 'https://generativelanguage.googleapis.com/v1beta';
}

function buildCacheContents(instructions: string): Array<{ role: 'user'; parts: Array<{ text: string }> }> {
  return Array.from({ length: 5 }, () => ({
    role: 'user' as const,
    parts: [{ text: instructions }],
  }));
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(getCacheDir(), { recursive: true });
}

async function readRegistry(): Promise<GeminiCacheRegistry> {
  try {
    const raw = await fs.readFile(getRegistryFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as GeminiCacheRegistry;

    if (!parsed.entries || typeof parsed.entries !== 'object') {
      return { entries: {} };
    }

    return parsed;
  } catch {
    return { entries: {} };
  }
}

async function writeRegistry(registry: GeminiCacheRegistry): Promise<void> {
  await ensureCacheDir();
  await fs.writeFile(getRegistryFilePath(), JSON.stringify(registry, null, 2), 'utf8');
}

function parseExpireTime(expireTime?: string): number | undefined {
  if (!expireTime) {
    return undefined;
  }

  const parsed = Date.parse(expireTime);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function isCacheExpired(cache: GeminiCacheMetadata): boolean {
  const expireTime = parseExpireTime(cache.expireTime);

  if (!expireTime) {
    return false;
  }

  return Date.now() >= expireTime;
}

function isInstanceCacheValid(entry: CachedGeminiContext, options: ResolveGeminiContextCacheOptions): boolean {
  if (entry.model !== options.model || entry.displayName !== options.displayName) {
    return false;
  }

  const expireTime = parseExpireTime(entry.expireTime);
  if (!expireTime) {
    return false;
  }

  return Date.now() < expireTime - INSTANCE_CACHE_TTL_BUFFER_MS;
}

function rememberCache(cacheId: string, entry: GeminiCacheRegistryEntry): void {
  instanceCache.set(cacheId, {
    ...entry,
    cachedAt: Date.now(),
  });
}

async function requestGeminiCache(pathname: string, init?: RequestInit): Promise<Response | undefined> {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    return undefined;
  }

  const url = new URL(`${getGeminiBaseUrl()}${pathname}`);
  url.searchParams.set('key', apiKey);

  try {
    return await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    console.error('Error calling Gemini cache API:', error);
    return undefined;
  }
}

async function getCacheByName(name: string): Promise<GeminiCacheMetadata | undefined> {
  const response = await requestGeminiCache(`/${name}`);

  if (!response || !response.ok) {
    return undefined;
  }

  return (await response.json()) as GeminiCacheMetadata;
}

async function listCaches(): Promise<GeminiCacheMetadata[]> {
  const response = await requestGeminiCache('/cachedContents');

  if (!response || !response.ok) {
    return [];
  }

  const payload = await response.json() as {
    cachedContents?: GeminiCacheMetadata[];
    caches?: GeminiCacheMetadata[];
    items?: GeminiCacheMetadata[];
  };

  return payload.cachedContents || payload.caches || payload.items || [];
}

async function createCache(options: ResolveGeminiContextCacheOptions): Promise<GeminiCacheMetadata | undefined> {
  const response = await requestGeminiCache('/cachedContents', {
    method: 'POST',
    body: JSON.stringify({
      model: options.model,
      displayName: options.displayName,
      contents: buildCacheContents(options.instructions),
      ttl: `${options.ttlSeconds ?? DEFAULT_CACHE_TTL_SECONDS}s`,
    }),
  });

  if (!response || !response.ok) {
    const errorText = response ? await response.text().catch(() => '') : 'Gemini API unavailable';
    console.error('Failed to create Gemini context cache:', errorText);
    return undefined;
  }

  return (await response.json()) as GeminiCacheMetadata;
}

export async function resolveGeminiContextCache(options: ResolveGeminiContextCacheOptions): Promise<string | undefined> {
  if (!getGeminiApiKey()) {
    return undefined;
  }

  const inMemoryCache = instanceCache.get(options.cacheId);
  if (inMemoryCache && isInstanceCacheValid(inMemoryCache, options)) {
    return inMemoryCache.name;
  }

  const registry = await readRegistry();
  const registryEntry = registry.entries[options.cacheId];

  if (registryEntry?.name && registryEntry.model === options.model && registryEntry.displayName === options.displayName && !isCacheExpired(registryEntry)) {
    rememberCache(options.cacheId, registryEntry);
    return registryEntry.name;
  }

  const caches = await listCaches();
  const matchingCache = caches.find(cache =>
    cache.model === options.model &&
    cache.displayName === options.displayName &&
    !isCacheExpired(cache)
  );

  if (matchingCache?.name) {
    const registryEntry = {
      name: matchingCache.name,
      model: options.model,
      displayName: options.displayName,
      expireTime: matchingCache.expireTime,
      updatedAt: new Date().toISOString(),
    };

    registry.entries = { ...registry.entries, [options.cacheId]: registryEntry };

    await writeRegistry(registry);
    rememberCache(options.cacheId, registryEntry);
    return matchingCache.name;
  }

  const createdCache = await createCache(options);

  if (!createdCache?.name) {
    return undefined;
  }

  const createdEntry = {
    name: createdCache.name,
    model: options.model,
    displayName: options.displayName,
    expireTime: createdCache.expireTime,
    updatedAt: new Date().toISOString(),
  };

  registry.entries = { ...registry.entries, [options.cacheId]: createdEntry };

  await writeRegistry(registry);
  rememberCache(options.cacheId, createdEntry);
  return createdCache.name;
}