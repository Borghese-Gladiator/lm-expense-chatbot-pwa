/**
 * Lunch Money API Client
 * API Documentation: https://lunchmoney.dev/
 */

const LUNCH_MONEY_API_BASE = 'https://dev.lunchmoney.app/v1';

/**
 * Create a Lunch Money API client
 * @param {string} apiToken - Lunch Money API token
 * @returns {Object} API client with methods
 */
export function createLunchMoneyClient(apiToken) {
  if (!apiToken) {
    throw new Error('Lunch Money API token is required');
  }

  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  /**
   * Make a request to the Lunch Money API
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {Object} options - Fetch options
   */
  async function request(endpoint, options = {}) {
    const url = `${LUNCH_MONEY_API_BASE}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `API request failed: ${response.status} ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      console.error('Lunch Money API error:', error);
      throw error;
    }
  }

  return {
    /**
     * Get all transactions
     * @param {Object} params - Query parameters
     * @param {string} params.start_date - Start date (YYYY-MM-DD)
     * @param {string} params.end_date - End date (YYYY-MM-DD)
     * @param {string} params.tag_id - Filter by tag ID
     * @param {string} params.category_id - Filter by category ID
     * @param {number} params.limit - Limit results (default: 1000)
     * @returns {Promise<Array>} List of transactions
     */
    async getTransactions(params = {}) {
      const queryParams = new URLSearchParams();

      // Default to last 30 days if no dates provided
      if (!params.start_date && !params.end_date) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        params.start_date = startDate.toISOString().split('T')[0];
        params.end_date = endDate.toISOString().split('T')[0];
      }

      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value);
        }
      });

      const data = await request(`/transactions?${queryParams.toString()}`);
      return data.transactions || [];
    },

    /**
     * Get all categories
     * @returns {Promise<Array>} List of categories
     */
    async getCategories() {
      const data = await request('/categories');
      return data.categories || [];
    },

    /**
     * Get all tags
     * @returns {Promise<Array>} List of tags
     */
    async getTags() {
      const data = await request('/tags');
      return data || [];
    },

    /**
     * Get user info
     * @returns {Promise<Object>} User information
     */
    async getUser() {
      return await request('/me');
    },

    /**
     * Get budgets
     * @param {string} start_date - Start date (YYYY-MM-DD)
     * @param {string} end_date - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} Budget data
     */
    async getBudgets(start_date, end_date) {
      const queryParams = new URLSearchParams({
        start_date,
        end_date,
      });
      return await request(`/budgets?${queryParams.toString()}`);
    },

    /**
     * Get spending summary by category
     * @param {string} start_date - Start date (YYYY-MM-DD)
     * @param {string} end_date - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} Spending summary
     */
    async getSpendingSummary(start_date, end_date) {
      const transactions = await this.getTransactions({ start_date, end_date });
      const categories = await this.getCategories();

      // Create category map
      const categoryMap = {};
      categories.forEach(cat => {
        categoryMap[cat.id] = cat.name;
      });

      // Aggregate by category
      const summary = {};
      transactions.forEach(txn => {
        const categoryId = txn.category_id;
        const categoryName = categoryMap[categoryId] || 'Uncategorized';
        const amount = Math.abs(parseFloat(txn.amount));

        if (!summary[categoryName]) {
          summary[categoryName] = 0;
        }
        summary[categoryName] += amount;
      });

      // Convert to array and sort by amount
      return Object.entries(summary)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);
    },
  };
}

/**
 * Utility function to format currency
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: USD)
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Calculate total spending for a period
 * @param {Array} transactions - List of transactions
 * @returns {number} Total spending
 */
export function calculateTotalSpending(transactions) {
  return transactions.reduce((total, txn) => {
    const amount = parseFloat(txn.amount);
    // Only count negative amounts (expenses)
    return amount < 0 ? total + Math.abs(amount) : total;
  }, 0);
}

/**
 * Calculate total income for a period
 * @param {Array} transactions - List of transactions
 * @returns {number} Total income
 */
export function calculateTotalIncome(transactions) {
  return transactions.reduce((total, txn) => {
    const amount = parseFloat(txn.amount);
    // Only count positive amounts (income)
    return amount > 0 ? total + amount : total;
  }, 0);
}

/**
 * Group transactions by date
 * @param {Array} transactions - List of transactions
 * @returns {Object} Transactions grouped by date
 */
export function groupTransactionsByDate(transactions) {
  return transactions.reduce((groups, txn) => {
    const date = txn.date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(txn);
    return groups;
  }, {});
}

/**
 * Get top spending categories
 * @param {Array} transactions - List of transactions
 * @param {Array} categories - List of categories
 * @param {number} limit - Number of top categories to return
 * @returns {Array} Top spending categories
 */
export function getTopSpendingCategories(transactions, categories, limit = 5) {
  const categoryMap = {};
  categories.forEach(cat => {
    categoryMap[cat.id] = cat.name;
  });

  const spending = {};
  transactions.forEach(txn => {
    const amount = parseFloat(txn.amount);
    if (amount < 0) { // Only expenses
      const categoryId = txn.category_id;
      const categoryName = categoryMap[categoryId] || 'Uncategorized';

      if (!spending[categoryName]) {
        spending[categoryName] = 0;
      }
      spending[categoryName] += Math.abs(amount);
    }
  });

  return Object.entries(spending)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}
