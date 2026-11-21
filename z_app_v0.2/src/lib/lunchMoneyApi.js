/**
 * Lunch Money API client with transaction caching
 * API Documentation: https://lunchmoney.dev/#get-all-transactions
 */

const LUNCH_MONEY_API_BASE = 'https://dev.lunchmoney.app/v1';

// Transaction cache organized by date range keys
const transactionCache = {};

/**
 * Generate cache key from start and end dates
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {string} Cache key
 */
function getCacheKey(startDate, endDate) {
  return `${startDate}_${endDate}`;
}

/**
 * Fetch transactions from Lunch Money API
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {Object} options - Additional query parameters
 * @returns {Promise<Array>} Array of transactions
 */
async function fetchTransactionsFromApi(startDate, endDate, options = {}) {
  const apiKey = process.env.NEXT_PUBLIC_LUNCH_MONEY_API_KEY;

  if (!apiKey) {
    throw new Error('LUNCH_MONEY_API_KEY environment variable is not set');
  }

  // Build query parameters
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    debit_as_negative: 'true', // Render expenses as negative values
    ...options,
  });

  const url = `${LUNCH_MONEY_API_BASE}/transactions?${params}`;

  console.log(`[Lunch Money API] Fetching transactions for ${startDate} to ${endDate}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Lunch Money API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // API returns { transactions: [...], has_more: boolean }
    return data.transactions || [];
  } catch (error) {
    console.error('[Lunch Money API] Error fetching transactions:', error);
    throw error;
  }
}

/**
 * Check if requested date range is fully contained within any cached range
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Array|null} Filtered transactions or null if not found
 */
function findInCachedRange(startDate, endDate) {
  for (const [key, transactions] of Object.entries(transactionCache)) {
    const [cachedStart, cachedEnd] = key.split('_');

    // Check if requested range is fully within cached range
    if (cachedStart <= startDate && cachedEnd >= endDate) {
      console.log(`[Transaction Cache] Range ${startDate} to ${endDate} found within cached ${cachedStart} to ${cachedEnd}`);

      // Filter cached transactions to requested range
      const filtered = transactions.filter(tx => {
        const txDate = tx.date;
        return txDate >= startDate && txDate <= endDate;
      });

      return filtered;
    }
  }

  return null;
}

/**
 * Find all cached ranges that overlap with requested range
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Array} Array of overlapping range keys
 */
function findOverlappingRanges(startDate, endDate) {
  const overlapping = [];

  for (const key of Object.keys(transactionCache)) {
    const [cachedStart, cachedEnd] = key.split('_');

    // Check if ranges overlap
    if (cachedStart <= endDate && cachedEnd >= startDate) {
      overlapping.push({ key, start: cachedStart, end: cachedEnd });
    }
  }

  return overlapping;
}

/**
 * Calculate missing date ranges that need to be fetched
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {Array} overlapping - Array of overlapping cached ranges
 * @returns {Array} Array of {start, end} objects for missing ranges
 */
function calculateMissingRanges(startDate, endDate, overlapping) {
  if (overlapping.length === 0) {
    return [{ start: startDate, end: endDate }];
  }

  // Sort overlapping ranges by start date
  overlapping.sort((a, b) => a.start.localeCompare(b.start));

  const missing = [];
  let currentStart = startDate;

  for (const range of overlapping) {
    // If there's a gap before this cached range
    if (currentStart < range.start) {
      missing.push({ start: currentStart, end: range.start });
    }

    // Move current start to end of this cached range
    if (range.end > currentStart) {
      currentStart = range.end > endDate ? endDate : range.end;
    }
  }

  // Check if there's a gap after all cached ranges
  if (currentStart < endDate) {
    missing.push({ start: currentStart, end: endDate });
  }

  return missing;
}

/**
 * Get transactions with smart caching support
 * Handles exact matches, subset ranges, and overlapping ranges
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {Object} options - Additional query parameters
 * @returns {Promise<Array>} Array of transactions
 */
export async function getTransactions(startDate, endDate, options = {}) {
  const cacheKey = getCacheKey(startDate, endDate);

  // 1. Check for exact match
  if (transactionCache[cacheKey]) {
    console.log(`[Transaction Cache] Exact cache hit for ${startDate} to ${endDate}`);
    return transactionCache[cacheKey];
  }

  // 2. Check if requested range is within any cached range
  const cachedSubset = findInCachedRange(startDate, endDate);
  if (cachedSubset) {
    console.log(`[Transaction Cache] Subset cache hit for ${startDate} to ${endDate}`);
    // Store this specific range for future exact matches
    transactionCache[cacheKey] = cachedSubset;
    return cachedSubset;
  }

  // 3. Check for overlapping ranges
  const overlapping = findOverlappingRanges(startDate, endDate);

  if (overlapping.length > 0) {
    console.log(`[Transaction Cache] Partial cache hit - found ${overlapping.length} overlapping range(s)`);

    // Calculate which date ranges we still need to fetch
    const missingRanges = calculateMissingRanges(startDate, endDate, overlapping);

    if (missingRanges.length === 0) {
      // All data is cached, just need to merge and filter
      console.log(`[Transaction Cache] All data available in overlapping caches`);
      const allTransactions = overlapping.flatMap(range => transactionCache[range.key]);

      // Filter to requested range and deduplicate
      const filtered = Array.from(
        new Map(
          allTransactions
            .filter(tx => tx.date >= startDate && tx.date <= endDate)
            .map(tx => [tx.id, tx])
        ).values()
      );

      // Store this specific range
      transactionCache[cacheKey] = filtered;
      return filtered;
    }

    // Fetch missing ranges and merge with cached data
    console.log(`[Transaction Cache] Fetching ${missingRanges.length} missing range(s)`);
    const missingTransactions = [];

    for (const range of missingRanges) {
      const fetched = await fetchTransactionsFromApi(range.start, range.end, options);
      missingTransactions.push(...fetched);
    }

    // Merge cached and newly fetched transactions
    const cachedTransactions = overlapping.flatMap(range => transactionCache[range.key]);
    const allTransactions = [...cachedTransactions, ...missingTransactions];

    // Filter to requested range and deduplicate
    const filtered = Array.from(
      new Map(
        allTransactions
          .filter(tx => tx.date >= startDate && tx.date <= endDate)
          .map(tx => [tx.id, tx])
      ).values()
    );

    // Store in cache
    transactionCache[cacheKey] = filtered;
    return filtered;
  }

  // 4. Complete cache miss - fetch from API
  console.log(`[Transaction Cache] Complete cache miss for ${startDate} to ${endDate}`);
  const transactions = await fetchTransactionsFromApi(startDate, endDate, options);

  // Store in cache
  transactionCache[cacheKey] = transactions;

  return transactions;
}

/**
 * Clear transaction cache for a specific date range or all cache
 * @param {string} startDate - Optional start date
 * @param {string} endDate - Optional end date
 */
export function clearTransactionCache(startDate = null, endDate = null) {
  if (startDate && endDate) {
    const cacheKey = getCacheKey(startDate, endDate);
    delete transactionCache[cacheKey];
    console.log(`[Transaction Cache] Cleared cache for ${startDate} to ${endDate}`);
  } else {
    // Clear all cache
    Object.keys(transactionCache).forEach(key => delete transactionCache[key]);
    console.log('[Transaction Cache] Cleared all cache');
  }
}

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  const keys = Object.keys(transactionCache);
  return {
    size: keys.length,
    keys: keys,
    totalTransactions: keys.reduce((sum, key) => sum + transactionCache[key].length, 0),
  };
}

/**
 * Helper function to get current month date range
 * @returns {Object} { startDate, endDate }
 */
export function getCurrentMonthRange() {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  return { startDate, endDate };
}

/**
 * Helper function to get last N days date range
 * @param {number} days - Number of days
 * @returns {Object} { startDate, endDate }
 */
export function getLastNDaysRange(days) {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  return { startDate, endDate };
}
