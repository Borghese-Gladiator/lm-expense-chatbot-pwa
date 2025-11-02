import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../transactions/route';

// Mock the Lunch Money client
vi.mock('@/lib/lunchMoney', () => ({
  createLunchMoneyClient: vi.fn((token) => ({
    getTransactions: vi.fn(async (params) => {
      if (token === 'valid-token') {
        return [
          { id: 1, amount: '-50.00', date: '2024-01-15' },
          { id: 2, amount: '-30.00', date: '2024-01-14' },
        ];
      }
      throw new Error('Invalid API token');
    }),
  })),
}));

describe('GET /api/lunch-money/transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LUNCH_MONEY_API_TOKEN;
  });

  it('should return 401 if no API token provided', async () => {
    const mockRequest = {
      url: 'http://localhost:3000/api/lunch-money/transactions',
      headers: new Map(),
    };

    mockRequest.headers.get = vi.fn(() => null);

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Lunch Money API token is required');
  });

  it('should fetch transactions with valid token from headers', async () => {
    const mockRequest = {
      url: 'http://localhost:3000/api/lunch-money/transactions',
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
    expect(data.data).toHaveLength(2);
    expect(data.count).toBe(2);
  });

  it('should fetch transactions with valid token from environment', async () => {
    process.env.LUNCH_MONEY_API_TOKEN = 'valid-token';

    const mockRequest = {
      url: 'http://localhost:3000/api/lunch-money/transactions',
      headers: new Map(),
    };

    mockRequest.headers.get = vi.fn(() => null);

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);
  });

  it('should handle query parameters', async () => {
    process.env.LUNCH_MONEY_API_TOKEN = 'valid-token';

    const mockRequest = {
      url: 'http://localhost:3000/api/lunch-money/transactions?start_date=2024-01-01&end_date=2024-01-31&limit=10',
      headers: new Map(),
    };

    mockRequest.headers.get = vi.fn(() => null);

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should handle API errors', async () => {
    const mockRequest = {
      url: 'http://localhost:3000/api/lunch-money/transactions',
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
    expect(data.error).toContain('Invalid API token');
  });
});
