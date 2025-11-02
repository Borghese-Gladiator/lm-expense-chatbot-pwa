import { NextResponse } from 'next/server';
import { createLunchMoneyClient } from '@/lib/lunchMoney';

/**
 * GET /api/lunch-money/transactions
 * Fetch transactions from Lunch Money API
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

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const params = {
      start_date: searchParams.get('start_date'),
      end_date: searchParams.get('end_date'),
      tag_id: searchParams.get('tag_id'),
      category_id: searchParams.get('category_id'),
      limit: searchParams.get('limit'),
    };

    // Remove undefined params
    Object.keys(params).forEach(key => {
      if (params[key] === null) {
        delete params[key];
      }
    });

    // Create client and fetch transactions
    const client = createLunchMoneyClient(apiToken);
    const transactions = await client.getTransactions(params);

    return NextResponse.json({
      success: true,
      data: transactions,
      count: transactions.length,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch transactions',
      },
      { status: 500 }
    );
  }
}
