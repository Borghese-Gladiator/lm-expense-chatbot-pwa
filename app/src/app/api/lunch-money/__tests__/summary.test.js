import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../summary/route';

// Mock the Lunch Money client and utilities
vi.mock('@/lib/lunchMoney', () => ({
  createLunchMoneyClient: vi.fn((token) => ({
    getTransactions: vi.fn(async (params) => {
      if (token === 'valid-token') {
        return [
          { id: 1, amount: '-50.00', date: '2024-01-15', category_id: 1 },
          { id: 2, amount: '-30.00', date: '2024-01-14', category_id: 1 },
          { id: 3, amount: '500.00', date: '2024-01-13', category_id: 2 },
        ];
      }
      throw new Error('Invalid API token');
    }),
    getCategories: vi.fn(async () => {
      if (token === 'valid-token') {
        return [
          { id: 1, name: 'Food' },
          { id: 2, name: 'Income' },
        ];
      }
      throw new Error('Invalid API token');
    }),
  })),
  calculateTotalSpending: vi.fn((transactions) => {
    return transactions.reduce((total, txn) => {
      const amount = parseFloat(txn.amount);
      return amount < 0 ? total + Math.abs(amount) : total;
    }, 0);
  }),
  calculateTotalIncome: vi.fn((transactions) => {
    return transactions.reduce((total, txn) => {
      const amount = parseFloat(txn.amount);
      return amount > 0 ? total + amount : total;
    }, 0);
  }),
  getTopSpendingCategories: vi.fn((transactions, categories, limit) => {
    return [
      { category: 'Food', amount: 80 },
    ];
  }),
}));

describe('GET /api/lunch-money/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LUNCH_MONEY_API_TOKEN;
  });

  it('should return 401 if no API token provided', async () => {
    const mockRequest = {
      url: 'http://localhost:3000/api/lunch-money/summary',
      headers: new Map(),
    };

    mockRequest.headers.get = vi.fn(() => null);

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Lunch Money API token is required');
  });

  it('should generate spending summary with valid token', async () => {
    const mockRequest = {
      url: 'http://localhost:3000/api/lunch-money/summary?start_date=2024-01-01&end_date=2024-01-31',
      headers: new Map([['x-lunch-money-token', 'valid-token']]),
    };

    mockRequest.headers.get = vi.fn((key) => {
      if (key === 'x-lunch-money-token') return 'valid-token';
      return null;
    });

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('period');
    expect(data.data).toHaveProperty('totals');
    expect(data.data).toHaveProperty('topCategories');
    expect(data.data).toHaveProperty('transactionCount');
    expect(data.data.totals).toHaveProperty('spending');
    expect(data.data.totals).toHaveProperty('income');
    expect(data.data.totals).toHaveProperty('net');
  });

  it('should handle API errors', async () => {
    const mockRequest = {
      url: 'http://localhost:3000/api/lunch-money/summary',
      headers: new Map([['x-lunch-money-token', 'invalid-token']]),
    };

    mockRequest.headers.get = vi.fn((key) => {
      if (key === 'x-lunch-money-token') return 'invalid-token';
      return null;
    });

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });
});
