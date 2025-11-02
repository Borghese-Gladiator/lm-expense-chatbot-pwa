import { NextResponse } from 'next/server';
import { createLunchMoneyClient, calculateTotalSpending, calculateTotalIncome, getTopSpendingCategories } from '@/lib/lunchMoney';

/**
 * GET /api/lunch-money/summary
 * Get spending summary with analytics
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
    const start_date = searchParams.get('start_date');
    const end_date = searchParams.get('end_date');

    // Create client and fetch data
    const client = createLunchMoneyClient(apiToken);
    const [transactions, categories] = await Promise.all([
      client.getTransactions({ start_date, end_date }),
      client.getCategories(),
    ]);

    // Calculate analytics
    const totalSpending = calculateTotalSpending(transactions);
    const totalIncome = calculateTotalIncome(transactions);
    const topCategories = getTopSpendingCategories(transactions, categories, 10);
    const netAmount = totalIncome - totalSpending;

    return NextResponse.json({
      success: true,
      data: {
        period: {
          start_date: start_date || transactions[transactions.length - 1]?.date,
          end_date: end_date || transactions[0]?.date,
        },
        totals: {
          spending: totalSpending,
          income: totalIncome,
          net: netAmount,
        },
        topCategories,
        transactionCount: transactions.length,
      },
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate summary',
      },
      { status: 500 }
    );
  }
}
