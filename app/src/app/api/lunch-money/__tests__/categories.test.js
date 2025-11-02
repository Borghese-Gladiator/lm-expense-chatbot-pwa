import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../categories/route';

// Mock the Lunch Money client
vi.mock('@/lib/lunchMoney', () => ({
  createLunchMoneyClient: vi.fn((token) => ({
    getCategories: vi.fn(async () => {
      if (token === 'valid-token') {
        return [
          { id: 1, name: 'Food' },
          { id: 2, name: 'Transport' },
        ];
      }
      throw new Error('Invalid API token');
    }),
  })),
}));

describe('GET /api/lunch-money/categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LUNCH_MONEY_API_TOKEN;
  });

  it('should return 401 if no API token provided', async () => {
    const mockRequest = {
      url: 'http://localhost:3000/api/lunch-money/categories',
      headers: new Map(),
    };

    mockRequest.headers.get = vi.fn(() => null);

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Lunch Money API token is required');
  });

  it('should fetch categories with valid token', async () => {
    const mockRequest = {
      url: 'http://localhost:3000/api/lunch-money/categories',
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

  it('should handle API errors', async () => {
    const mockRequest = {
      url: 'http://localhost:3000/api/lunch-money/categories',
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
