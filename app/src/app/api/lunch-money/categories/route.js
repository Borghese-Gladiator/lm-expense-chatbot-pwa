import { NextResponse } from 'next/server';
import { createLunchMoneyClient } from '@/lib/lunchMoney';

/**
 * GET /api/lunch-money/categories
 * Fetch categories from Lunch Money API
 */
export async function GET(request) {
  try {
    // Get API token from environment or request headers
    const apiToken = process.env.LUNCH_MONEY_API_TOKEN || request.headers.get('x-lunch-money-token');

    if (!apiToken) {
      return NextResponse.json(
        { error: 'Lunch Money API token is required' },
        { status: 401 }
      );
    }

    // Create client and fetch categories
    const client = createLunchMoneyClient(apiToken);
    const categories = await client.getCategories();

    return NextResponse.json({
      success: true,
      data: categories,
      count: categories.length,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch categories',
      },
      { status: 500 }
    );
  }
}
