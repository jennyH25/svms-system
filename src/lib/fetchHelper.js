import { getAuditHeaders } from "./auditHeaders";

const responseCache = new Map();
const inFlightRequests = new Map();
const DEFAULT_TTL_MS = 15000;
const MAX_CACHE_ENTRIES = 300;

function stableSerialize(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, Object.keys(value).sort());
  } catch (_error) {
    return String(value);
  }
}

function buildCacheKey(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = options.headers || {};
  const actorId =
    headers["x-actor-user-id"] || headers["X-Actor-User-Id"] || "";
  const actorRole = headers["x-actor-role"] || headers["X-Actor-Role"] || "";
  return [method, url, actorId, actorRole, stableSerialize(options.body)].join(
    "|",
  );
}

function enforceCacheLimit() {
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = responseCache.keys().next();
  if (!oldest.done) {
    responseCache.delete(oldest.value);
  }
}

/**
 * Optimized fetch with timeout, retry, and error handling
 * @param {string} url - API endpoint
 * @param {Object} options - Fetch options (method, body, etc.)
 * @param {number} timeoutMs - Request timeout in milliseconds (default 10000)
 * @param {number} maxRetries - Maximum retry attempts (default 2)
 * @returns {Promise<{status: string, data: any, error?: string}>}
 */
export const fetchWithTimeout = async (
  url,
  options = {},
  timeoutMs = 10000,
  maxRetries = 2,
) => {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const fetchOptions = {
        ...options,
        signal: controller.signal,
        headers: {
          ...(options.headers || {}),
          ...getAuditHeaders(),
        },
      };

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // Try to parse JSON, with fallback
      let data = {};
      try {
        data = await response.json();
      } catch (e) {
        // If JSON parsing fails, try to continue with empty data
        console.warn(`Failed to parse JSON from ${url}:`, e.message);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }

      if (!response.ok) {
        const errorMsg =
          data?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }

      return {
        status: "ok",
        data,
      };
    } catch (error) {
      lastError = error;

      // Check if it's a timeout error
      if (error.name === "AbortError") {
        lastError = new Error(
          "Request timeout - server is taking too long to respond",
        );
      }

      // Don't retry on network errors beyond retries
      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 500),
        );
        continue;
      }
    }
  }

  return {
    status: "error",
    data: null,
    error: lastError?.message || "Failed to fetch data",
  };
};

/**
 * Cached GET fetch with in-flight dedupe and stale-while-revalidate behavior.
 * Use this for list/detail endpoints that are frequently revisited between tabs.
 */
export const cachedFetchJSON = async (
  url,
  options = {},
  {
    ttlMs = DEFAULT_TTL_MS,
    staleWhileRevalidate = true,
    timeoutMs = 10000,
    maxRetries = 1,
    forceRefresh = false,
  } = {},
) => {
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET") {
    return fetchWithTimeout(url, options, timeoutMs, maxRetries);
  }

  const mergedOptions = {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...getAuditHeaders(),
    },
  };

  const cacheKey = buildCacheKey(url, mergedOptions);
  const now = Date.now();
  const cached = responseCache.get(cacheKey);

  if (!forceRefresh && cached && cached.expiresAt > now) {
    return {
      status: "ok",
      data: cached.data,
      fromCache: true,
      stale: false,
    };
  }

  if (!forceRefresh && cached && staleWhileRevalidate) {
    if (!inFlightRequests.has(cacheKey)) {
      const backgroundRefresh = fetchWithTimeout(
        url,
        mergedOptions,
        timeoutMs,
        maxRetries,
      )
        .then((result) => {
          if (result.status === "ok") {
            responseCache.set(cacheKey, {
              data: result.data,
              expiresAt: Date.now() + ttlMs,
            });
            enforceCacheLimit();
          }
          return result;
        })
        .finally(() => {
          inFlightRequests.delete(cacheKey);
        });
      inFlightRequests.set(cacheKey, backgroundRefresh);
    }

    return {
      status: "ok",
      data: cached.data,
      fromCache: true,
      stale: true,
    };
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const requestPromise = fetchWithTimeout(
    url,
    mergedOptions,
    timeoutMs,
    maxRetries,
  )
    .then((result) => {
      if (result.status === "ok") {
        responseCache.set(cacheKey, {
          data: result.data,
          expiresAt: Date.now() + ttlMs,
        });
        enforceCacheLimit();
      }
      return result;
    })
    .finally(() => {
      inFlightRequests.delete(cacheKey);
    });

  inFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

export const invalidateFetchCache = (matcher) => {
  if (!matcher) {
    responseCache.clear();
    return;
  }

  const isFn = typeof matcher === "function";
  for (const key of responseCache.keys()) {
    const shouldDelete = isFn ? matcher(key) : key.includes(String(matcher));
    if (shouldDelete) {
      responseCache.delete(key);
    }
  }
};

export const getFetchCacheStats = () => ({
  entries: responseCache.size,
  inFlight: inFlightRequests.size,
});

/**
 * Fetch multiple endpoints in parallel with individual error handling
 * @param {Array<{url: string, key: string, options?: Object}>} requests
 * @returns {Promise<Object>} Results keyed by request key
 */
export const fetchMultiple = async (requests) => {
  const promises = requests.map((req) =>
    cachedFetchJSON(req.url, req.options || {}, req.cacheOptions || {}).then(
      (result) => ({
        key: req.key,
        ...result,
      }),
    ),
  );

  const results = await Promise.all(promises);
  const output = {};

  results.forEach((result) => {
    output[result.key] = {
      status: result.status,
      data: result.data,
      error: result.error,
    };
  });

  return output;
};
