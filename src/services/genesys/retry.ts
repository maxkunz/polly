export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getErrorStatus(err: any): number | undefined {
  const rawStatus =
    err?.status
    ?? err?.statusCode
    ?? err?.body?.status
    ?? err?.response?.status
    ?? err?.response?.body?.status;

  const status = Number(rawStatus);
  return Number.isFinite(status) ? status : undefined;
}

export function getErrorMessage(err: any): string {
  return String(
    err?.body?.message
    || err?.message
    || err?.response?.body?.message
    || err?.response?.text
    || "Unknown error"
  );
}

export function isRateLimitError(err: any): boolean {
  return getErrorStatus(err) === 429 && !err?.__oraRateLimitRetryExhausted;
}

export async function runWithRetry<T>(options: {
  action: () => Promise<T>;
  isRetryable?: (err: any) => boolean;
  maxAttempts?: number;
  retryDelayMs?: number;
  onRetry?: (args: { err: any; attempt: number; delayMs: number }) => void;
}): Promise<T> {
  const {
    action,
    isRetryable = isRateLimitError,
    maxAttempts = 3,
    retryDelayMs = 3000,
    onRetry
  } = options;

  let attempt = 0;

  while (true) {
    try {
      return await action();
    } catch (err: any) {
      if (!isRetryable(err) || attempt >= maxAttempts - 1) {
        throw err;
      }

      attempt += 1;
      onRetry?.({ err, attempt, delayMs: retryDelayMs });
      await sleep(retryDelayMs);
    }
  }
}

export function enableGenesysRequestRetry(client: any): void {
  if (!client || typeof client.callApi !== "function" || client.__oraRateLimitRetryInstalled) {
    return;
  }

  const originalCallApi = client.callApi.bind(client);
  client.callApi = async (...args: any[]) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await originalCallApi(...args);
      } catch (err: any) {
        if (getErrorStatus(err) !== 429 || attempt === 2) {
          if (getErrorStatus(err) === 429 && err && typeof err === "object") err.__oraRateLimitRetryExhausted = true;
          throw err;
        }
        const seconds = Number(getErrorMessage(err).match(/Retry the request in \[(\d+)\] seconds/)?.[1] ?? 60);
        console.warn(`[Genesys] Rate limit. Retrying in ${seconds}s (${attempt + 1}/2).`);
        await sleep(seconds * 1000);
      }
    }
  };
  client.__oraRateLimitRetryInstalled = true;
}

export async function processItemsWithRetry<T>(options: {
  items: T[];
  label: string;
  getItemKey: (item: T) => string;
  processItem: (item: T) => Promise<any>;
  chunkSize?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  perItemDelayMs?: number;
  betweenChunkDelayMs?: number;
  isRetryable?: (err: any) => boolean;
  onProgress?: (message: string) => void;
  onItemAlreadyHandled?: (item: T, err: any) => boolean;
}): Promise<void> {
  const {
    items,
    label,
    getItemKey,
    processItem,
    chunkSize = 1,
    maxAttempts = 3,
    retryDelayMs = 3000,
    perItemDelayMs = 0,
    betweenChunkDelayMs = 0,
    isRetryable = isRateLimitError,
    onProgress,
    onItemAlreadyHandled
  } = options;

  onProgress?.(`Starting cleanup of ${items.length} ${label}...`);

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    await Promise.all(chunk.map(async (item) => {
      const itemKey = getItemKey(item);
      const shortKey = itemKey.slice(0, 8);

      try {
        await runWithRetry({
          action: async () => {
            const result = await processItem(item);
            if (perItemDelayMs > 0) {
              await sleep(perItemDelayMs);
            }
            return result;
          },
          isRetryable,
          maxAttempts,
          retryDelayMs,
          onRetry: ({ delayMs }) => {
            onProgress?.(` !! Rate Limit for ${label} ${shortKey}. Retrying in ${delayMs / 1000}s...`);
          }
        });
      } catch (err: any) {
        if (onItemAlreadyHandled?.(item, err)) {
          onProgress?.(` ${label} ${shortKey} already deleted. Continuing...`);
          return;
        }

        const detail = getErrorMessage(err);
        onProgress?.(` !!! Could not process ${label} ${itemKey} after retries: ${detail}`);
        throw err;
      }
    }));

    onProgress?.(`Processed ${Math.min(i + chunkSize, items.length)} / ${items.length} ${label}...`);

    if (betweenChunkDelayMs > 0 && (i + chunkSize) < items.length) {
      await sleep(betweenChunkDelayMs);
    }
  }

  onProgress?.(`${label} cleanup finished.`);
}
