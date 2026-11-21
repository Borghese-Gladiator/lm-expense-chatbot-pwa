from dataclasses import dataclass
from enum import Enum
from typing import TypedDict

import pandera as pa
from arrow import Arrow
from pandera.typing import Series

from expense_tracker.et_types.lunch_money_datasource_types import LunchMoneyFilterColumn, LunchMoneyGroupColumn, LunchMoneySortColumn


@dataclass
class Timeframe:
    start: Arrow
    end: Arrow

    def format(self, format_str: str) -> tuple[str, str]:
        return self.start.format(format_str), self.end.format(format_str)

    def __hash__(self):
        """
        Compute hash based on attributes (required to use @cache)
        """
        return hash((self.start, self.end))

class FormattedTransactionsSchema(pa.DataFrameModel):
    amount: Series[int] = pa.Field()
    category: Series[str] = pa.Field()
    date: Series[str] = pa.Field()
    description: Series[str] = pa.Field()
    location: Series[str] = pa.Field()
    merchant: Series[str] = pa.Field()
    source: Series[str] = pa.Field()
    tags: Series[set[str]] = pa.Field()

class FormattedTransactionDict(TypedDict):
    amount: int
    category: str
    date: str
    description: str | None
    location: str
    merchant: str
    source: str
    tags: set[str] | None


#========================
#  Filter, Group, Sort
#========================
@dataclass
class StatisticServiceFilter():
    column: LunchMoneyFilterColumn
    column_value: str
    
    """exclude means remove transactions with specific filter, include means only include transactions with specific filter"""
    exclude: bool = False

    def __hash__(self):
        """
        Compute hash based on attributes (required to use set)
        """
        return hash((self.column, self.column_value, self.exclude))

@dataclass
class StatisticServiceGroup():
    column: LunchMoneyGroupColumn
    
    def __hash__(self):
        """
        Compute hash based on attributes (required to use set)
        """
        return hash(self.column)

@dataclass
class StatisticServiceSort():
    column: LunchMoneySortColumn
    ascending: bool = False

    def __hash__(self):
        """
        Compute hash based on attributes (required to use set)
        """
        return hash((self.column, self.ascending))

class StatisticServiceAggregationInterval(Enum):
    # WEEKLY = "weekly"  # TODO: add support for weekly
    MONTHLY = "monthly"
    YEARLY = "yearly"
