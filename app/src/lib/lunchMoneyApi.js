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
 * Get transactions with caching support
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {Object} options - Additional query parameters
 * @returns {Promise<Array>} Array of transactions
 */
export async function getTransactions(startDate, endDate, options = {}) {
  const cacheKey = getCacheKey(startDate, endDate);

  // Check cache
  if (transactionCache[cacheKey]) {
    console.log(`[Transaction Cache] Cache hit for ${startDate} to ${endDate}`);
    return transactionCache[cacheKey];
  }

  // Cache miss - fetch from API
  console.log(`[Transaction Cache] Cache miss for ${startDate} to ${endDate}`);
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
