import unittest
from unittest.mock import Mock

import arrow
import pandas as pd
from expense_tracker.et_types.lunch_money_datasource_types import LunchMoneyFilterColumn, LunchMoneyGroupColumn, LunchMoneySortColumn, LunchMoneyTag
from expense_tracker.et_types.statistic_service_types import StatisticServiceSort
from faker import Faker

from expense_tracker.datasources import BaseDatasource
from expense_tracker.et_types import (
    StatisticServiceFilter,
    StatisticServiceGroup, 
    StatisticServiceAggregationInterval
)
from expense_tracker.services import StatisticService

class TestStatisticService(unittest.TestCase):
    def setUp(self):
        self.mock_datasource = Mock(spec=BaseDatasource)
        self.service = StatisticService(self.mock_datasource)

        fake = Faker()
        data = {
            'date_arrow': [
                arrow.get('2023-01-01', "YYYY-MM-DD"),
                arrow.get('2023-02-15', "YYYY-MM-DD"),
                arrow.get('2023-03-10', "YYYY-MM-DD"),
                arrow.get('2023-03-30', "YYYY-MM-DD"),
                arrow.get('2023-03-10', "YYYY-MM-DD"),
            ],
            "merchant": [
                "Stop & Shop",
                "Chipotle",
                "CVS",
                "Stop & Shop",
                "Stop & Shop",
            ],
            "description": [fake.sentence(), fake.sentence(), fake.sentence(), fake.sentence(), fake.sentence()],
            'amount': [100.0, 200.0, 300.0, 400.0, 250.0],
            'category': ['Restaurants', 'Groceries', 'Gas', 'Gas', 'Groceries'],
            "location": [fake.address(), fake.address(), fake.address(), fake.address(), fake.address()],
            "source": ["capital_one", "capital_one", "capital_one", "fidelity", "fidelity"],
            "tags": [{LunchMoneyTag.BROTHER_RENT.value}, None, None, None, {LunchMoneyTag.BROTHER_RENT.value}]
        }
        self.df = pd.DataFrame(data)
        self.mock_datasource.get_transactions.return_value = pd.DataFrame(data)

    def test_calculate(self):
        timeframe_start = arrow.get('2023-01-01')
        timeframe_end = arrow.get('2023-12-31')
        monthly_interval = StatisticServiceAggregationInterval.MONTHLY

        # Validate TIMEFRAME respected
        self.assertEqual(self.service.calculate(
            arrow.get('2023-03-10'),
            arrow.get('2023-03-30'),
            None,
            None,
            None,
            monthly_interval
        ).to_dict('records'), [
            {'date': '2023-03', 'amount': 950.0},
        ])
        
        # Validate FILTER respected and non rent-applicable transactions are filtered out
        self.assertEqual(self.service.calculate(
            timeframe_start,
            timeframe_end,
            set([StatisticServiceFilter(column=LunchMoneyFilterColumn.TAGS, column_value=LunchMoneyTag.BROTHER_RENT.value)]),
            None,
            None,
            monthly_interval
        ).to_dict('records'), [
            {'date': '2023-01', 'amount': 100.0},
            {'date': '2023-03', 'amount': 250.0},
        ])

        # Validate CATEGORY groups as expected and amounts are grouped by interval + category
        self.assertEqual(self.service.calculate(
            timeframe_start,
            timeframe_end,
            None,
            set([StatisticServiceGroup(column=LunchMoneyGroupColumn.CATEGORY)]),
            None,
            monthly_interval
        ).to_dict('records'), [
            {'date': '2023-01', 'category': 'Restaurants', 'amount': 100.0},
            {'date': '2023-02', 'category': 'Groceries', 'amount': 200.0},
            {'date': '2023-03', 'category': 'Groceries', 'amount': 250.0},
            {'date': '2023-03', 'category': 'Gas', 'amount': 700.0},
        ])
        
        # Validate YEARLY aggregation interval
        self.assertEqual(self.service.calculate(
            timeframe_start,
            timeframe_end,
            None,
            set([StatisticServiceGroup(column=LunchMoneyGroupColumn.CATEGORY)]),
            None,
            StatisticServiceAggregationInterval.YEARLY
        ).to_dict('records'), [
            {'amount': 100.0, 'category': 'Restaurants', 'date': '2023'},
            {'amount': 450.0, 'category': 'Groceries', 'date': '2023'},
            {'amount': 700.0, 'category': 'Gas', 'date': '2023'},
        ])

        # Validate SORT by amount
        self.assertEqual(self.service.calculate(
            timeframe_start,
            timeframe_end,
            None,
            None,
            set([StatisticServiceSort(column=LunchMoneySortColumn.AMOUNT, ascending=True)]),
            monthly_interval,
        ).to_dict('records'), [
            {'date': '2023-01', 'amount': 100.0},
            {'date': '2023-02', 'amount': 200},
            {'date': '2023-03', 'amount': 950.0},  # sum of amounts in March
        ])

    def test_get(self):
        timeframe_start = arrow.get('2023-01-01')
        timeframe_end = arrow.get('2023-12-31')

        # Validate TIMEFRAME respected
        self.assertEqual(self.service.get(
            arrow.get('2023-03-10'),
            arrow.get('2023-03-30'),
            None,
            None,
        ).to_dict('records'), self.service._format_transactions_df(self.df.iloc[[2, 4, 3]]).to_dict(orient='records'))
        
        # Validate FILTER respected and non rent-applicable transactions are filtered out
        self.assertEqual(self.service.get(
            timeframe_start,
            timeframe_end,
            set([StatisticServiceFilter(column=LunchMoneyFilterColumn.TAGS, column_value=LunchMoneyTag.BROTHER_RENT.value)]),
            None,
        ).to_dict('records'), self.service._format_transactions_df(self.df.iloc[[0, 4]]).to_dict(orient='records'))
        
        # Validate with empty list of transactions
        self.mock_datasource.get_transactions.return_value = pd.DataFrame({
            'date_arrow': [],
            "merchant": [],
            "description": [],
            'amount': [],
            'category': [],
            "location": [],
            "source": [],
            "tags": []
        })
        self.assertEqual(self.service.get(
            timeframe_start,
            timeframe_end,
            set([StatisticServiceFilter(column=LunchMoneyFilterColumn.TAGS, column_value=LunchMoneyTag.BROTHER_RENT.value)]),
            None,
        ).to_dict('records'), [])

if __name__ == '__main__':
    unittest.main()
