import unittest
from unittest.mock import MagicMock, patch
from arrow import Arrow
import arrow
import pandas as pd
import requests
from expense_tracker.datasources.lunch_money_datasource import LunchMoneyDatasource, LunchMoneyDatasourceSettings
from expense_tracker.et_types.lunch_money_datasource_types import LunchMoneyFilterColumn, LunchMoneyTag
from expense_tracker.et_types.statistic_service_types import StatisticServiceFilter, Timeframe


class TestLunchMoneyDatasource(unittest.TestCase):
    @patch('requests.get')
    def test_get_transactions(self, mock_get):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'transactions': [
                {
                    'date': '2023-01-01',
                    'amount': '100.0',
                    'payee': 'Merchant A',
                    'category_name': 'Category A',
                    'notes': 'Description A',
                    'source': 'manual',
                    'tags': [{'name': 'Brother Rent'}]
                },
                {
                    'date': '2023-01-02',
                    'amount': '200.0',
                    'payee': 'Merchant B',
                    'category_name': 'Category B',
                    'notes': 'Description B',
                    'source': 'manual',
                    'tags': []
                },
                # get_transactions should filter this Credit Payment transaction
                {
                    'date': '2023-01-03',
                    'amount': '300.0',
                    'payee': 'Merchant C',
                    'category_name': 'Payment, Transfer',
                    'notes': 'Description C',
                    'source': 'manual',
                    'tags': []
                }
            ]
        }
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response
        expected_data = [
            {
                'date_arrow': arrow.get('2023-01-01'),
                'amount': 100.0,
                'merchant': 'Merchant A',
                'category': 'Category A',
                'description': 'Description A',
                'source': 'manual',
                'tags': {LunchMoneyTag.BROTHER_RENT.value}
            },
            {
                'date_arrow': arrow.get('2023-01-02'),
                'amount': 200.0,
                'merchant': 'Merchant B',
                'category': 'Category B',
                'description': 'Description B',
                'source': 'manual',
                'tags': set()
            }
        ]
        df_expected = pd.DataFrame(expected_data)

        # constants
        settings = LunchMoneyDatasourceSettings(access_token="dummy_token")
        datasource = LunchMoneyDatasource(settings)
        timeframe = Timeframe(arrow.get("2023-01-01"), arrow.get("2023-01-31"))

        # ACT
        result = datasource.get_transactions(timeframe)

        # ASSERT
        pd.testing.assert_frame_equal(result, df_expected)

    @patch('requests.get')
    def test_get_transactions_http_error(self, mock_get):
        mock_get.side_effect = requests.HTTPError("HTTP error")
        
        settings = LunchMoneyDatasourceSettings(access_token="dummy_token")
        datasource = LunchMoneyDatasource(settings)

        timeframe = Timeframe(arrow.get("2023-01-01"), arrow.get("2023-01-31"))

        with self.assertRaises(requests.HTTPError):
            datasource.get_transactions(timeframe)

    @patch('requests.get')
    def test_get_transactions_timeout_error(self, mock_get):
        mock_get.side_effect = requests.Timeout("Timeout error")
        
        settings = LunchMoneyDatasourceSettings(access_token="dummy_token")
        datasource = LunchMoneyDatasource(settings)
        timeframe = Timeframe(arrow.get("2023-01-01"), arrow.get("2023-01-31"))

        with self.assertRaises(requests.Timeout):
            datasource.get_transactions(timeframe)

if __name__ == '__main__':
    unittest.main()