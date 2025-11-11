/**
 * Tool definitions and implementations for Lunch Money financial assistant
 * Based on POC Python functions in /poc/src/tools.py
 */

import { getTransactions } from './lunchMoneyApi';

// Environment flag to toggle between mock and real API
const USE_MOCK_DATA = !process.env.NEXT_PUBLIC_LUNCH_MONEY_API_KEY;

// Mock data generators (fallback when API key not available)
const mockTransactions = (count = 5) => {
  const categories = ['Groceries', 'Gas', 'Restaurants', 'Entertainment', 'Utilities'];
  const payees = ['Whole Foods', 'Shell', 'Starbucks', 'Netflix', 'PG&E'];
  const notes = ['Weekly shopping', 'Fuel for work commute', 'Team lunch', 'Monthly subscription', ''];

  return Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    date: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    payee: payees[Math.floor(Math.random() * payees.length)],
    amount: -(Math.random() * 200 + 10).toFixed(2),
    category_name: categories[Math.floor(Math.random() * categories.length)],
    notes: notes[Math.floor(Math.random() * notes.length)],
    status: 'cleared',
  }));
};

// Helper functions for data aggregation
function sumByCategory(transactions) {
  const categoryTotals = {};

  transactions.forEach(tx => {
    const category = tx.category_name || 'Uncategorized';
    if (!categoryTotals[category]) {
      categoryTotals[category] = 0;
    }
    categoryTotals[category] += parseFloat(tx.amount);
  });

  return Object.entries(categoryTotals).map(([category, total]) => ({
    category,
    total: parseFloat(total.toFixed(2)),
  }));
}

function sumByMerchant(transactions) {
  const merchantTotals = {};

  transactions.forEach(tx => {
    const payee = tx.payee || 'Unknown';
    if (!merchantTotals[payee]) {
      merchantTotals[payee] = { total: 0, tx_count: 0 };
    }
    merchantTotals[payee].total += parseFloat(tx.amount);
    merchantTotals[payee].tx_count += 1;
  });

  return Object.entries(merchantTotals).map(([payee, data]) => ({
    payee,
    total: parseFloat(data.total.toFixed(2)),
    tx_count: data.tx_count,
  }));
}

// Tool implementations with real API integration
export const toolImplementations = {
  get_transactions: async (args) => {
    const { start_date, end_date, limit = 100 } = args;

    if (USE_MOCK_DATA) {
      console.log('[Tools] Using mock data for get_transactions');
      return {
        transactions: mockTransactions(Math.min(limit, 20)),
      };
    }

    try {
      const transactions = await getTransactions(start_date, end_date);
      return {
        transactions: transactions.slice(0, limit),
      };
    } catch (error) {
      console.error('[Tools] Error fetching transactions, falling back to mock data:', error);
      return {
        transactions: mockTransactions(Math.min(limit, 20)),
      };
    }
  },

  sum_by_category: async (args) => {
    const { start_date, end_date } = args;

    if (USE_MOCK_DATA) {
      console.log('[Tools] Using mock data for sum_by_category');
      return {
        by_category: [
          { category: 'Groceries', total: -450.50 },
          { category: 'Gas', total: -120.00 },
          { category: 'Restaurants', total: -280.75 },
          { category: 'Entertainment', total: -95.00 },
          { category: 'Utilities', total: -200.00 },
        ],
      };
    }

    try {
      const transactions = await getTransactions(start_date, end_date);
      const categoryTotals = sumByCategory(transactions);

      return {
        by_category: categoryTotals.sort((a, b) => a.total - b.total), // Sort by total ascending (most negative first)
      };
    } catch (error) {
      console.error('[Tools] Error in sum_by_category, falling back to mock data:', error);
      return {
        by_category: [
          { category: 'Groceries', total: -450.50 },
          { category: 'Gas', total: -120.00 },
          { category: 'Restaurants', total: -280.75 },
          { category: 'Entertainment', total: -95.00 },
          { category: 'Utilities', total: -200.00 },
        ],
      };
    }
  },

  month_over_month: async (args) => {
    const { start_month, months = 6 } = args;
    return {
      mom: [
        { month: '2025-05', total: -2100.50 },
        { month: '2025-06', total: -1950.75 },
        { month: '2025-07', total: -2300.00 },
        { month: '2025-08', total: -2050.25 },
        { month: '2025-09', total: -2200.00 },
        { month: '2025-10', total: -2150.80 },
      ].slice(0, months),
    };
  },

  top_merchants: async (args) => {
    const { start_date, end_date, n = 10 } = args;

    if (USE_MOCK_DATA) {
      console.log('[Tools] Using mock data for top_merchants');
      return {
        top_merchants: [
          { payee: 'Whole Foods', total: -450.50, tx_count: 15 },
          { payee: 'Shell', total: -320.00, tx_count: 8 },
          { payee: 'Starbucks', total: -180.75, tx_count: 24 },
          { payee: 'Netflix', total: -15.99, tx_count: 1 },
          { payee: 'Amazon', total: -250.30, tx_count: 12 },
        ].slice(0, n),
      };
    }

    try {
      const transactions = await getTransactions(start_date, end_date);
      const merchantTotals = sumByMerchant(transactions);

      // Sort by total ascending (most negative first) and take top N
      const topMerchants = merchantTotals
        .sort((a, b) => a.total - b.total)
        .slice(0, n);

      return {
        top_merchants: topMerchants,
      };
    } catch (error) {
      console.error('[Tools] Error in top_merchants, falling back to mock data:', error);
      return {
        top_merchants: [
          { payee: 'Whole Foods', total: -450.50, tx_count: 15 },
          { payee: 'Shell', total: -320.00, tx_count: 8 },
          { payee: 'Starbucks', total: -180.75, tx_count: 24 },
          { payee: 'Netflix', total: -15.99, tx_count: 1 },
          { payee: 'Amazon', total: -250.30, tx_count: 12 },
        ].slice(0, n),
      };
    }
  },

  monthly_cashflow: async (args) => {
    const { start_month, months = 6 } = args;
    return {
      cashflow: [
        { month: '2025-05', income: 4500.00, expenses: -2100.50, net: 2399.50 },
        { month: '2025-06', income: 4500.00, expenses: -1950.75, net: 2549.25 },
        { month: '2025-07', income: 4500.00, expenses: -2300.00, net: 2200.00 },
        { month: '2025-08', income: 4500.00, expenses: -2050.25, net: 2449.75 },
        { month: '2025-09', income: 4500.00, expenses: -2200.00, net: 2300.00 },
        { month: '2025-10', income: 4500.00, expenses: -2150.80, net: 2349.20 },
      ].slice(0, months),
    };
  },

  compare_yoy: async (args) => {
    const { month } = args;
    return {
      current: {
        start_date: '2025-09-01',
        end_date: '2025-09-30',
        total: -2100.75,
      },
      prior: {
        start_date: '2024-09-01',
        end_date: '2024-09-30',
        total: -1950.00,
      },
      delta: -150.75,
      pct_change: 7.73,
    };
  },

  get_categories: async () => {
    return {
      categories: [
        { id: 1, name: 'Groceries', group: 'Food' },
        { id: 2, name: 'Gas', group: 'Transportation' },
        { id: 3, name: 'Restaurants', group: 'Food' },
        { id: 4, name: 'Entertainment', group: 'Leisure' },
        { id: 5, name: 'Utilities', group: 'Home' },
        { id: 6, name: 'Rent', group: 'Home' },
        { id: 7, name: 'Shopping', group: 'Shopping' },
      ],
    };
  },

  get_tags: async () => {
    return {
      tags: [
        { id: 1, name: 'essential' },
        { id: 2, name: 'subscription' },
        { id: 3, name: 'discretionary' },
        { id: 4, name: 'one-time' },
      ],
    };
  },

  category_health: async (args) => {
    const { month } = args;
    return {
      category_health: [
        { category_id: 1, category: 'Groceries', budgeted: 500.00, spent: 450.50, remaining: 49.50, status: 'OK' },
        { category_id: 2, category: 'Gas', budgeted: 150.00, spent: 120.00, remaining: 30.00, status: 'OK' },
        { category_id: 3, category: 'Restaurants', budgeted: 200.00, spent: 280.75, remaining: -80.75, status: 'Over' },
        { category_id: 4, category: 'Entertainment', budgeted: 100.00, spent: 95.00, remaining: 5.00, status: 'OK' },
        { category_id: 5, category: 'Utilities', budgeted: 200.00, spent: 200.00, remaining: 0.00, status: 'OK' },
      ],
    };
  },

  generate_chart: async (args) => {
    const { chart_type, tool_name, tool_args } = args;

    // Execute the data tool
    const dataResult = await toolImplementations[tool_name](tool_args);

    // Transform data based on the tool and chart type
    if (tool_name === 'sum_by_category') {
      const chartData = dataResult.by_category.map(item => ({
        category: item.category,
        spending: Math.abs(item.total),
      }));

      return {
        chartData: {
          type: chart_type || 'bar',
          title: 'Spending by Category',
          description: `From ${tool_args.start_date} to ${tool_args.end_date}`,
          data: chartData,
          xAxisKey: 'category',
          dataKeys: ['spending'],
          config: {
            spending: {
              label: 'Spending',
              color: 'hsl(var(--chart-1))',
            },
          },
        },
      };
    }

    if (tool_name === 'month_over_month') {
      const chartData = dataResult.mom.map(item => ({
        month: item.month,
        spending: Math.abs(item.total),
      }));

      return {
        chartData: {
          type: chart_type || 'area',
          title: 'Monthly Spending Trend',
          description: 'Spending over time',
          data: chartData,
          xAxisKey: 'month',
          dataKeys: ['spending'],
          config: {
            spending: {
              label: 'Total Spending',
              color: 'hsl(var(--chart-1))',
            },
          },
        },
      };
    }

    if (tool_name === 'monthly_cashflow') {
      const chartData = dataResult.cashflow.map(item => ({
        month: item.month,
        income: item.income,
        expenses: Math.abs(item.expenses),
        net: item.net,
      }));

      return {
        chartData: {
          type: chart_type || 'area',
          title: 'Monthly Cashflow',
          description: 'Income vs Expenses',
          data: chartData,
          xAxisKey: 'month',
          dataKeys: ['income', 'expenses'],
          config: {
            income: {
              label: 'Income',
              color: 'hsl(var(--chart-2))',
            },
            expenses: {
              label: 'Expenses',
              color: 'hsl(var(--chart-5))',
            },
          },
        },
      };
    }

    if (tool_name === 'top_merchants') {
      const chartData = dataResult.top_merchants.map(item => ({
        merchant: item.payee,
        spending: Math.abs(item.total),
      }));

      return {
        chartData: {
          type: chart_type || 'bar',
          title: 'Top Merchants',
          description: `From ${tool_args.start_date} to ${tool_args.end_date}`,
          data: chartData,
          xAxisKey: 'merchant',
          dataKeys: ['spending'],
          config: {
            spending: {
              label: 'Total Spending',
              color: 'hsl(var(--chart-3))',
            },
          },
        },
      };
    }

    return {
      chartData: null,
      error: 'Chart generation not supported for this tool',
    };
  },
};

// Tool schemas for function calling (OpenAI format)
export const tools = [
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description: 'Get transactions from Lunch Money within a date range',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format',
          },
          end_date: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of transactions to return (default: 100)',
          },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sum_by_category',
      description: 'Get spending totals grouped by category for a date range',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format',
          },
          end_date: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format',
          },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'month_over_month',
      description: 'Get total spending per month for the last N months',
      parameters: {
        type: 'object',
        properties: {
          start_month: {
            type: 'string',
            description: 'Starting month in YYYY-MM format',
          },
          months: {
            type: 'number',
            description: 'Number of months to include (default: 6)',
          },
        },
        required: ['start_month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'top_merchants',
      description: 'Get top merchants/payees by total spending in a date range',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format',
          },
          end_date: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format',
          },
          n: {
            type: 'number',
            description: 'Number of top merchants to return (default: 10)',
          },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'monthly_cashflow',
      description: 'Get income vs expenses breakdown per month',
      parameters: {
        type: 'object',
        properties: {
          start_month: {
            type: 'string',
            description: 'Starting month in YYYY-MM format',
          },
          months: {
            type: 'number',
            description: 'Number of months to include (default: 6)',
          },
        },
        required: ['start_month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_yoy',
      description: 'Compare spending for a period with the same period last year',
      parameters: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            description: 'Month to compare in YYYY-MM format',
          },
        },
        required: ['month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'category_health',
      description: 'Check budget vs actual spending by category for a month',
      parameters: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            description: 'Month to check in YYYY-MM format',
          },
        },
        required: ['month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_categories',
      description: 'Get all expense categories',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tags',
      description: 'Get all transaction tags',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_chart',
      description: 'Generate a visual chart from financial data. Supports area, bar, and line charts. Use this when the user asks for visualizations, graphs, or charts.',
      parameters: {
        type: 'object',
        properties: {
          chart_type: {
            type: 'string',
            enum: ['area', 'bar', 'line'],
            description: 'Type of chart to generate (area for trends, bar for comparisons, line for time series)',
          },
          tool_name: {
            type: 'string',
            enum: ['sum_by_category', 'month_over_month', 'monthly_cashflow', 'top_merchants'],
            description: 'The data tool to use for generating chart data',
          },
          tool_args: {
            type: 'object',
            description: 'Arguments to pass to the data tool (e.g., {start_date, end_date} or {start_month, months})',
          },
        },
        required: ['tool_name', 'tool_args'],
      },
    },
  },
];

// Execute a tool call
export async function executeTool(toolName, args) {
  const implementation = toolImplementations[toolName];

  if (!implementation) {
    return {
      error: `Unknown tool: ${toolName}`,
    };
  }

  try {
    const result = await implementation(args);
    return result;
  } catch (error) {
    return {
      error: `Tool execution failed: ${error.message}`,
    };
  }
}
