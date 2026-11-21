"""
MANUAL TEST SCRIPT
This script loads actual data from Lunch Money API and calculates statistics using the StatisticService class.
"""
import time
import os

import arrow
import pandas as pd
from dotenv import load_dotenv

from expense_tracker.et_types import StatisticServiceAggregationInterval, StatisticServiceGroup
from expense_tracker.datasources.lunch_money_datasource import LunchMoneyDatasource, LunchMoneyDatasourceSettings
from expense_tracker.et_types.lunch_money_datasource_types import LunchMoneyCategory, LunchMoneyFilterColumn, LunchMoneyGroupColumn, LunchMoneyTag
from expense_tracker.et_types.statistic_service_types import StatisticServiceFilter
from expense_tracker.services import StatisticService


#==================
#  CONSTANTS
#==================
load_dotenv()
LUNCH_MONEY_ACCESS_TOKEN = os.getenv('LUNCH_MONEY_API_KEY')
settings = LunchMoneyDatasourceSettings(access_token=LUNCH_MONEY_ACCESS_TOKEN)

datasource = LunchMoneyDatasource(settings)
service = StatisticService(datasource)

#==================
#  UTILS
#==================
"""
How To Do YTD => aggregate on month
category = calculate(timeframe_start, timeframe_end, group_by_set=category, aggregate_by=MONTHLY)
top_five_merchants = calculate(timeframe_start, timeframe_end, group_by_set=merchant, sort_by=amount, aggregate_by=MONTHLY)
aggregate_by=MONTHLY

How To Do YTD (rent applicable) => aggregate on month, filter on rent_applicable StatisticServiceFilter
category = calculate(timeframe_start, timeframe_end, group_by_set=category, filter_by_set=StatisticServiceFilter(column=LunchMoneyFilterColumn.TAGS, column_value=LunchMoneyTag.BROTHER_RENT.value), aggregate_by=MONTHLY)
top_five_merchants = calculate(timeframe_start, timeframe_end, group_by_set=merchant, sort_by=amount, filter_by_set=StatisticServiceFilter(column=LunchMoneyFilterColumn.TAGS, column_value=LunchMoneyTag.BROTHER_RENT.value), aggregate_by=MONTHLY)
top_five_locations = calculate(timeframe_start, timeframe_end, group_by_set=location, filter_by_set=StatisticServiceFilter(column=LunchMoneyFilterColumn.TAGS, column_value=LunchMoneyTag.BROTHER_RENT.value), sort_by=(amount, DESC))

How to Do Last Month
category = calculate(timeframe_start, timeframe_end, group_by_set=category)
top_five_merchants = calculate(timeframe_start, timeframe_end, group_by_set=merchant, sort_by=(amount, DESC))
top_five_locations = calculate(timeframe_start, timeframe_end, group_by_set=location, sort_by=(amount, DESC))

How to Do Last Month (rent applicable)
category = calculate(timeframe_start, timeframe_end, group_by_set=category, filter_by_set=StatisticServiceFilter(column=LunchMoneyFilterColumn.TAGS, column_value=LunchMoneyTag.BROTHER_RENT.value),)
top_five_merchants = calculate(timeframe_start, timeframe_end, group_by_set=merchant, sort_by=(amount, DESC), filter_by_set=StatisticServiceFilter(column=LunchMoneyFilterColumn.TAGS, column_value=LunchMoneyTag.BROTHER_RENT.value),)
top_five_locations = calculate(timeframe_start, timeframe_end, group_by_set=location,  sort_by=(amount, DESC), filter_by_set=StatisticServiceFilter(column=LunchMoneyFilterColumn.TAGS, column_value=LunchMoneyTag.BROTHER_RENT.value),)

How to Do YTD Expenditure
spending = get(timeframe_start, timeframe_end)
rent_applicable_spending = get(timeframe_start, timeframe_end, filter_by_set=StatisticServiceFilter(column=LunchMoneyFilterColumn.TAGS, column_value=LunchMoneyTag.BROTHER_RENT.value))
"""
import time
import os

import arrow
import pandas as pd
from dotenv import load_dotenv

from expense_tracker.et_types import StatisticServiceAggregationInterval, StatisticServiceGroup
from expense_tracker.datasources.lunch_money_datasource import LunchMoneyDatasource, LunchMoneyDatasourceSettings
from expense_tracker.et_types.lunch_money_datasource_types import LunchMoneyCategory, LunchMoneyFilterColumn, LunchMoneyGroupColumn, LunchMoneyTag
from expense_tracker.et_types.statistic_service_types import StatisticServiceFilter
from expense_tracker.services import StatisticService


#==================
#  CONSTANTS
#==================
load_dotenv()
LUNCH_MONEY_ACCESS_TOKEN = os.getenv('LUNCH_MONEY_API_KEY')
settings = LunchMoneyDatasourceSettings(access_token=LUNCH_MONEY_ACCESS_TOKEN)

datasource = LunchMoneyDatasource(settings)
service = StatisticService(datasource)


#==================
#  UTILS
#==================
def get_brother_rent_info() -> tuple[
    pd.DataFrame, # Last Month transactions table
    pd.DataFrame, # Last Month top categories
    pd.DataFrame, # Last Month top merchants
    pd.DataFrame, # YTD totals per month
    pd.DataFrame, # YTD groceries vs restaurants per month
    pd.DataFrame, # YTD top categories per month
    pd.DataFrame, # YTD top merchants per month
    float, # Avg per month
]:
    filter_by_set = set(
        [
            StatisticServiceFilter(
                column=LunchMoneyFilterColumn.TAGS, column_value=LunchMoneyTag.BROTHER_RENT.value
            )
        ]
    )
    (
        df_last_month_txn,
        df_last_month_top_categories,
        df_last_month_top_merchants,
    ) = get_last_month_info(filter_by_set)
    (
        df_ytd_totals_per_month,
        df_ytd_groceries_vs_restaurants_per_month,
        df_ytd_top_categories_per_month,
        ytd_top_merchants_per_month,
    ) = get_ytd_info(filter_by_set)
    avg_per_month = df_ytd_totals_per_month['amount'].mean()
    return (
        df_last_month_txn,
        df_last_month_top_categories,
        df_last_month_top_merchants,
        df_ytd_totals_per_month,
        df_ytd_groceries_vs_restaurants_per_month,
        df_ytd_top_categories_per_month,
        ytd_top_merchants_per_month,
        avg_per_month,
    )

def get_total_rent_info() -> tuple[
    pd.DataFrame, # Last Month transactions table
    pd.DataFrame, # Last Month top categories
    pd.DataFrame, # Last Month top merchants
    pd.DataFrame, # YTD totals per month
    pd.DataFrame, # YTD groceries vs restaurants per month
    pd.DataFrame, # YTD top categories per month
    pd.DataFrame, # YTD top merchants per month
    float, # Avg per month
]:
    (
        df_last_month_txn,
        df_last_month_top_categories,
        df_last_month_top_merchants,
    ) = get_last_month_info()
    (
        df_ytd_totals_per_month,
        df_ytd_groceries_vs_restaurants_per_month,
        df_ytd_top_categories_per_month,
        ytd_top_merchants_per_month,
    ) = get_ytd_info()
    avg_per_month = df_ytd_totals_per_month['amount'].mean()
    return (
        df_last_month_txn,
        df_last_month_top_categories,
        df_last_month_top_merchants,
        df_ytd_totals_per_month,
        df_ytd_groceries_vs_restaurants_per_month,
        df_ytd_top_categories_per_month,
        ytd_top_merchants_per_month,
        avg_per_month,
    )

def get_last_month_info(filter_by_set: set[StatisticServiceFilter] | None = None) -> tuple[
    pd.DataFrame, # Last Month transactions table
    pd.DataFrame, # Last Month top categories
    pd.DataFrame, # Last Month top merchants
]:
    # CONSTANTS
    today = arrow.now()
    curr_month_first_day = today.floor('month')
    last_month_first_day = curr_month_first_day.shift(months=-1)
    last_month_last_day = curr_month_first_day.shift(days=-1)
    start_date = last_month_first_day
    end_date = last_month_last_day

    # MAIN
    df_txn = service.get(
        start_date,
        end_date,
        filter_by_set=filter_by_set,
    )
    time.sleep(1)
    df_top_categories = service.calculate(
        start_date,
        end_date,
        group_by_set={StatisticServiceGroup(column=LunchMoneyGroupColumn.CATEGORY)},
        filter_by_set=filter_by_set,
        sort_by_set=None,
        interval=StatisticServiceAggregationInterval.MONTHLY
    )[:5]
    time.sleep(1)
    df_top_merchants = service.calculate(
        start_date,
        end_date,
        group_by_set={StatisticServiceGroup(column=LunchMoneyGroupColumn.MERCHANT)},
        filter_by_set=filter_by_set,
        sort_by_set=None,
        interval=StatisticServiceAggregationInterval.MONTHLY
    )[:5]
    return (
        df_txn,
        df_top_categories,
        df_top_merchants
    )

def get_ytd_info(filter_by_set: set[StatisticServiceFilter] | None = None) -> tuple[
    pd.DataFrame, # YTD totals per month
    pd.DataFrame, # YTD groceries vs restaurants per month
    pd.DataFrame, # YTD top categories per month
    pd.DataFrame, # YTD top merchants per month
]:
    # CONSTANTS
    today = arrow.now()
    curr_year_first_day = today.floor('year')
    curr_day_floored = today.floor('day')
    start_date = curr_year_first_day
    end_date = curr_day_floored

    # MAIN
    df_totals_per_month = service.calculate(
        start_date,
        end_date,
        filter_by_set=filter_by_set,
        group_by_set=None,
        sort_by_set=None,
        interval=StatisticServiceAggregationInterval.MONTHLY
    )
    time.sleep(1)
    grocery_filter = {StatisticServiceFilter(column=LunchMoneyFilterColumn.CATEGORY, column_value=LunchMoneyCategory.GROCERIES)}
    df_groceries_per_month = service.calculate(
        start_date,
        end_date,
        filter_by_set=grocery_filter if filter_by_set is None else grocery_filter | filter_by_set,
        group_by_set={StatisticServiceGroup(column=LunchMoneyGroupColumn.CATEGORY)},
        sort_by_set=None,
        interval=StatisticServiceAggregationInterval.MONTHLY
    )
    restaurant_filter = {StatisticServiceFilter(column=LunchMoneyFilterColumn.CATEGORY, column_value=LunchMoneyCategory.RESTAURANTS)}
    df_restaurants_per_month = service.calculate(
        start_date,
        end_date,
        filter_by_set=restaurant_filter if filter_by_set is None else restaurant_filter | filter_by_set,
        group_by_set={StatisticServiceGroup(column=LunchMoneyGroupColumn.CATEGORY)},
        sort_by_set=None,
        interval=StatisticServiceAggregationInterval.MONTHLY
    )
    df_groceries_vs_restaurants_per_month = pd.DataFrame.merge(
        df_groceries_per_month[['date', 'amount']],
        df_restaurants_per_month[['date', 'amount']],
        on=['date'],
        how='outer',
        suffixes=('_groceries', '_restaurants')
    )
    time.sleep(1)
    df_top_merchants = service.calculate(
        start_date,
        end_date,
        filter_by_set=filter_by_set,
        group_by_set={StatisticServiceGroup(column=LunchMoneyGroupColumn.MERCHANT)},
        sort_by_set=None,
        interval=StatisticServiceAggregationInterval.YEARLY
    )
    df_top_merchants = df_top_merchants[:5]
    time.sleep(1)
    df_top_categories = service.calculate(
        start_date,
        end_date,
        filter_by_set=filter_by_set,
        group_by_set={StatisticServiceGroup(column=LunchMoneyGroupColumn.CATEGORY)},
        sort_by_set=None,
        interval=StatisticServiceAggregationInterval.YEARLY
    )
    df_top_categories = df_top_categories[:5]
    return (
        df_totals_per_month,
        df_groceries_vs_restaurants_per_month,
        df_top_categories,
        df_top_merchants
    )


#==================
#  MAIN
#==================
(
    df_last_month_txn,
    df_last_month_top_categories,
    df_last_month_top_merchants,
    df_ytd_totals_per_month,
    df_ytd_groceries_vs_restaurants_per_month,
    df_ytd_top_categories_per_month,
    ytd_top_merchants_per_month,
    ytd_average_per_month,
) = get_brother_rent_info()

print(df_last_month_txn.head())
print()
print(df_last_month_top_categories.head())
print()
print(df_last_month_top_merchants.head())
print()
print(df_ytd_totals_per_month.head())
print()
print(df_ytd_groceries_vs_restaurants_per_month.head())
print()
print(df_ytd_top_categories_per_month.head())
print()
print(ytd_top_merchants_per_month.head())
print()