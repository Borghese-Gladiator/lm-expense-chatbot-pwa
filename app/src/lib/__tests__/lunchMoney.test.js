import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLunchMoneyClient,
  formatCurrency,
  calculateTotalSpending,
  calculateTotalIncome,
  groupTransactionsByDate,
  getTopSpendingCategories,
} from '../lunchMoney';

describe('Lunch Money Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('createLunchMoneyClient', () => {
    it('should throw error if no API token provided', () => {
      expect(() => createLunchMoneyClient()).toThrow('Lunch Money API token is required');
    });

    it('should create client with API token', () => {
      const client = createLunchMoneyClient('test-token');
      expect(client).toHaveProperty('getTransactions');
      expect(client).toHaveProperty('getCategories');
      expect(client).toHaveProperty('getTags');
      expect(client).toHaveProperty('getUser');
      expect(client).toHaveProperty('getBudgets');
      expect(client).toHaveProperty('getSpendingSummary');
    });
  });

  describe('getTransactions', () => {
    it('should fetch transactions with default date range', async () => {
      const mockTransactions = [
        { id: 1, amount: -50.00, date: '2024-01-15' },
        { id: 2, amount: -30.00, date: '2024-01-14' },
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactions: mockTransactions }),
      });

      const client = createLunchMoneyClient('test-token');
      const transactions = await client.getTransactions();

      expect(global.fetch).toHaveBeenCalled();
      expect(transactions).toEqual(mockTransactions);
    });

    it('should fetch transactions with custom date range', async () => {
      const mockTransactions = [
        { id: 1, amount: -50.00, date: '2024-01-15' },
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactions: mockTransactions }),
      });

      const client = createLunchMoneyClient('test-token');
      const transactions = await client.getTransactions({
        start_date: '2024-01-01',
        end_date: '2024-01-31',
      });

      const callUrl = global.fetch.mock.calls[0][0];
      expect(callUrl).toContain('start_date=2024-01-01');
      expect(callUrl).toContain('end_date=2024-01-31');
      expect(transactions).toEqual(mockTransactions);
    });

    it('should handle API errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Invalid API token' }),
      });

      const client = createLunchMoneyClient('test-token');

      await expect(client.getTransactions()).rejects.toThrow('Invalid API token');
    });
  });

  describe('getCategories', () => {
    it('should fetch categories', async () => {
      const mockCategories = [
        { id: 1, name: 'Food' },
        { id: 2, name: 'Transport' },
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ categories: mockCategories }),
      });

      const client = createLunchMoneyClient('test-token');
      const categories = await client.getCategories();

      expect(categories).toEqual(mockCategories);
    });
  });

  describe('getSpendingSummary', () => {
    it('should calculate spending summary by category', async () => {
      const mockTransactions = [
        { id: 1, amount: '-50.00', category_id: 1, date: '2024-01-15' },
        { id: 2, amount: '-30.00', category_id: 1, date: '2024-01-14' },
        { id: 3, amount: '-20.00', category_id: 2, date: '2024-01-13' },
      ];

      const mockCategories = [
        { id: 1, name: 'Food' },
        { id: 2, name: 'Transport' },
      ];

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transactions: mockTransactions }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ categories: mockCategories }),
        });

      const client = createLunchMoneyClient('test-token');
      const summary = await client.getSpendingSummary('2024-01-01', '2024-01-31');

      expect(summary).toHaveLength(2);
      expect(summary[0]).toEqual({ category: 'Food', amount: 80 });
      expect(summary[1]).toEqual({ category: 'Transport', amount: 20 });
    });
  });
});

describe('Utility Functions', () => {
  describe('formatCurrency', () => {
    it('should format USD currency by default', () => {
      expect(formatCurrency(100)).toBe('$100.00');
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    it('should format other currencies', () => {
      expect(formatCurrency(100, 'EUR')).toBe('€100.00');
    });
  });

  describe('calculateTotalSpending', () => {
    it('should calculate total spending (negative amounts)', () => {
      const transactions = [
        { amount: '-50.00' },
        { amount: '-30.00' },
        { amount: '100.00' }, // Income, should not be counted
        { amount: '-20.00' },
      ];

      const total = calculateTotalSpending(transactions);
      expect(total).toBe(100);
    });

    it('should return 0 for empty transactions', () => {
      expect(calculateTotalSpending([])).toBe(0);
    });
  });

  describe('calculateTotalIncome', () => {
    it('should calculate total income (positive amounts)', () => {
      const transactions = [
        { amount: '500.00' },
        { amount: '-30.00' }, // Expense, should not be counted
        { amount: '200.00' },
      ];

      const total = calculateTotalIncome(transactions);
      expect(total).toBe(700);
    });

    it('should return 0 for empty transactions', () => {
      expect(calculateTotalIncome([])).toBe(0);
    });
  });

  describe('groupTransactionsByDate', () => {
    it('should group transactions by date', () => {
      const transactions = [
        { id: 1, date: '2024-01-15', amount: '-50.00' },
        { id: 2, date: '2024-01-15', amount: '-30.00' },
        { id: 3, date: '2024-01-14', amount: '-20.00' },
      ];

      const grouped = groupTransactionsByDate(transactions);

      expect(grouped['2024-01-15']).toHaveLength(2);
      expect(grouped['2024-01-14']).toHaveLength(1);
    });

    it('should return empty object for empty transactions', () => {
      expect(groupTransactionsByDate([])).toEqual({});
    });
  });

  describe('getTopSpendingCategories', () => {
    it('should return top spending categories', () => {
      const transactions = [
        { amount: '-100.00', category_id: 1 },
        { amount: '-50.00', category_id: 1 },
        { amount: '-80.00', category_id: 2 },
        { amount: '-30.00', category_id: 3 },
        { amount: '200.00', category_id: 1 }, // Income, should not be counted
      ];

      const categories = [
        { id: 1, name: 'Food' },
        { id: 2, name: 'Transport' },
        { id: 3, name: 'Entertainment' },
      ];

      const topCategories = getTopSpendingCategories(transactions, categories, 2);

      expect(topCategories).toHaveLength(2);
      expect(topCategories[0].category).toBe('Food');
      expect(topCategories[0].amount).toBe(150);
      expect(topCategories[1].category).toBe('Transport');
      expect(topCategories[1].amount).toBe(80);
    });

    it('should handle uncategorized transactions', () => {
      const transactions = [
        { amount: '-50.00', category_id: 999 }, // Non-existent category
      ];

      const categories = [
        { id: 1, name: 'Food' },
      ];

      const topCategories = getTopSpendingCategories(transactions, categories, 5);

      expect(topCategories[0].category).toBe('Uncategorized');
      expect(topCategories[0].amount).toBe(50);
    });

    it('should return empty array for empty transactions', () => {
      const topCategories = getTopSpendingCategories([], [], 5);
      expect(topCategories).toEqual([]);
    });
  });
});
