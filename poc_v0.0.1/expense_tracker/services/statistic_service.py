from typing import Any, TypedDict
import arrow
from arrow import Arrow
import pandas as pd
from pandera.typing import DataFrame

from expense_tracker.datasources import BaseDatasource
from expense_tracker.et_types import (
    TransactionsSchema,
    StatisticServiceFilter,
    StatisticServiceGroup, 
    StatisticServiceAggregationInterval
)
from expense_tracker.et_types.lunch_money_datasource_types import LunchMoneyFilterColumn, LunchMoneySortColumn
from expense_tracker.et_types.statistic_service_types import FormattedTransactionDict, FormattedTransactionsSchema, StatisticServiceSort, Timeframe

class StatisticService:
    datasource: BaseDatasource
    interval_format_mapping = {
        StatisticServiceAggregationInterval.MONTHLY: "YYYY-MM",
        StatisticServiceAggregationInterval.YEARLY: "YYYY"
    }

    def __init__(self, datasource):
        self.datasource = datasource

    def calculate(
        self,
        timeframe_start: Arrow,
        timeframe_end: Arrow,
        filter_by_set: set[StatisticServiceFilter] | None = None,
        group_by_set: set[StatisticServiceGroup] | None = None,
        sort_by_set: set[StatisticServiceSort] | None = None,
        interval: StatisticServiceAggregationInterval | None = None,
    ) -> DataFrame[Any]:
        """
        Calculate statistics within a specified timeframe, optionally filtered and grouped by certain criteria.

        This method computes and returns a list of dictionaries representing the calculated statistics over the 
        specified timeframe. The results can be filtered, grouped, and aggregated based on the provided parameters.

        Args:
            timeframe_start (Arrow): The start of the timeframe for which to calculate statistics.
            timeframe_end (Arrow): The end of the timeframe for which to calculate statistics.
            filter_by_set (set[StatisticServiceFilter] | None, optional): A set of filters to apply when calculating 
                statistics. If None, no filtering is applied. Default is None.
            group_by_set (set[StatisticServiceGroup] | None, optional): A set of grouping criteria to apply when 
                calculating statistics. If None, no grouping is applied. Default is None.
            sort_by_set (set[StatisticServiceSort] | None, optional): A set of sorting criteria to apply when
            interval (StatisticServiceAggregationInterval | None, optional): The interval at which to aggregate 
                the statistics (e.g., daily, weekly, monthly). If None, no aggregation is applied. Default is None.

        Returns:
            list[Any]: a DataFrame containing the calculated statistics. Each row represents a single statistic with formatted values.
                This includes group_by columns and aggregated statistics. Therefore, there is no typing as the columns are dynamic

            Required values present in all types are:
            - amount: Series[int]
            - date: Series[str]
            
            Optional aggregated values are:
            - category: Series[str]
            - description: Series[str]
            - location: Series[str]
            - merchant: Series[str]

        Example:
            calculate(
                timeframe_start=arrow.get("2021-01-01"),
                timeframe_end=arrow.get("2021-12-31"),
                filter_by_set={StatisticServiceFilter(column=LunchMoneyFilterColumn.TAGS.value, column_value="groceries")},
                group_by_set={StatisticServiceGroup(column=LunchMoneyGroupColumn.CATEGORY)},
                sort_by_set={StatisticServiceSort(column=LunchMoneySortColumn.DATE, ascending=True)},
                interval=StatisticServiceAggregationInterval.MONTHLY
            )

        Notes:
            - The Arrow type is used for datetime manipulation and representation.
            - The StatisticServiceFilter, StatisticServiceGroup, and StatisticServiceSort classes are used to define
                filter, group, and sort criteria, respectively.
            - StatisticServiceGroup sums amounts (no other implementation currently)
            - The StatisticServiceAggregationInterval enum is used to define the interval at which to aggregate statistics.

        Raises:
            ValueError: If the timeframe_start is after timeframe_end.
            TypeError: If the filter_by_set or group_by_set contain invalid types.
        """
        if timeframe_start > timeframe_end:
            raise ValueError("timeframe_start must be before timeframe_end")
        if filter_by_set is not None and not all(isinstance(filter_by, StatisticServiceFilter) for filter_by in filter_by_set):
            raise TypeError("filter_by_set must contain only StatisticServiceFilter objects")
        if group_by_set is not None and not all(isinstance(group_by, StatisticServiceGroup) for group_by in group_by_set):
            raise TypeError("group_by_set must contain only StatisticServiceGroup objects")
        if sort_by_set is not None and not all(isinstance(sort_by, StatisticServiceSort) for sort_by in sort_by_set):
            raise TypeError("sort_by_set must contain only StatisticServiceSort objects")

        if filter_by_set is None:
            filter_by_set = set()
        if group_by_set is None:
            group_by_set = set()
        if sort_by_set is None:
            sort_by_set = {
                StatisticServiceSort(column=LunchMoneySortColumn.DATE, ascending=True),
                StatisticServiceSort(column=LunchMoneySortColumn.AMOUNT, ascending=True)
            }
        if interval is None:
            interval = StatisticServiceAggregationInterval.MONTHLY

        # Discard timezone to avoid confusing results as Lunch Money API returns in UTC and requested has local timezone
        timeframe_start = arrow.get(timeframe_start.format('YYYY-MM-DD'), tzinfo='UTC')
        timeframe_end = arrow.get(timeframe_end.format('YYYY-MM-DD'), tzinfo='UTC')
        # NOTE: The following code respects the timezone of the passed timeframe_start and timeframe_end, BUT the timezone should be discarded instead
        ## timeframe_start = timeframe_start.to('UTC')
        ## timeframe_end = timeframe_end.to('UTC')

        # FETCH from Lunch Money API
        df: DataFrame[TransactionsSchema] = self.datasource.get_transactions(Timeframe(timeframe_start, timeframe_end))
        
        # Filter by time
        df = df[(df['date_arrow'] >= timeframe_start) & (df['date_arrow'] <= timeframe_end)]
        
        # Filter by filter criteria (eg: tags)
        df = self._filter_transactions_df(df, filter_by_set)
        
        # Aggregate by interval (eg: monthly, yearly) and group_by (eg: category, merchant)
        # NOTE: grouping by columns means ALL other columns will be lost (besides "date" which is overrided to group_by value and group_by_list)
        df = df\
            .assign(date=lambda df: df["date_arrow"].apply(lambda x: x.format(self.interval_format_mapping[interval])))\
            .groupby(['date'] + [group_by.column.value for group_by in group_by_set])[['amount']]\
            .sum()\
            .reset_index()

        # Sort by passed sort columns (grouping removes date_arrow, enabling sorting by date)
        df = df.sort_values(by=[sort_by.column.value for sort_by in sort_by_set], ascending=[sort_by.ascending for sort_by in sort_by_set])

        df: DataFrame[FormattedTransactionsSchema] = self._format_transactions_df(df)
        return df.reset_index(drop=True)

    def get(
        self,
        timeframe_start: Arrow,
        timeframe_end: Arrow,
        filter_by_set: set[StatisticServiceFilter] | None = None,
        sort_by_set: set[StatisticServiceSort] | None = None,
    ) -> DataFrame[FormattedTransactionsSchema]:
        """
        Get transactions within a specified timeframe, optionally filtered by certain criteria.

        This method retrieves and returns a list of dictionaries representing the transactions within the specified
        timeframe. The results can be filtered based on the provided parameters.

        Args:
            timeframe_start (Arrow): The start of the timeframe for which to retrieve transactions.
            timeframe_end (Arrow): The end of the timeframe for which to retrieve transactions.
            filter_by_set (set[StatisticServiceFilter] | None, optional): A set of filters to apply when retrieving
                transactions. If None, no filtering is applied. Default is None.
        
        Returns:
            DataFrame[FormattedTransactionsSchema]: the human readable rows of transactions within the timeframe
        """
        if timeframe_start > timeframe_end:
            raise ValueError("timeframe_start must be before timeframe_end")
        if filter_by_set is not None and not all(isinstance(filter_by, StatisticServiceFilter) for filter_by in filter_by_set):
            raise TypeError("filter_by_set must contain only StatisticServiceFilter objects")
        if sort_by_set is not None and not all(isinstance(sort_by, StatisticServiceSort) for sort_by in sort_by_set):
            raise TypeError("sort_by_set must contain only StatisticServiceSort objects")

        if filter_by_set is None:
            filter_by_set = set()
        if sort_by_set is None:
            sort_by_set = {StatisticServiceSort(column=LunchMoneySortColumn.DATE, ascending=True)}
        
        # Discard timezone to avoid confusing results as Lunch Money API returns in UTC and requested has local timezone
        timeframe_start = arrow.get(timeframe_start.format('YYYY-MM-DD'), tzinfo='UTC')
        timeframe_end = arrow.get(timeframe_end.format('YYYY-MM-DD'), tzinfo='UTC')
        # NOTE: The following code respects the timezone of the passed timeframe_start and timeframe_end, BUT the timezone should be discarded instead
        ## timeframe_start = timeframe_start.to('UTC')
        ## timeframe_end = timeframe_end.to('UTC')
        
        # FETCH from Lunch Money API
        df: DataFrame[TransactionsSchema] = self.datasource.get_transactions(Timeframe(timeframe_start, timeframe_end))

        # Filter by time
        df = df[(df['date_arrow'] >= timeframe_start) & (df['date_arrow'] <= timeframe_end)]
        
        # Filter by filter criteria (eg: tags)
        df = self._filter_transactions_df(df, filter_by_set)

        # Sort by passed sort columns (support date sorting via temporary variable)
        df.loc[:, 'date'] = df['date_arrow'].apply(lambda date: date.format('YYYY-MM-DD'))
        df = df.sort_values(by=[sort_by.column.value for sort_by in sort_by_set], ascending=[sort_by.ascending for sort_by in sort_by_set])
        df = df.drop('date', axis=1)
        
        df: DataFrame[FormattedTransactionsSchema] = self._format_transactions_df(df)
        return df.reset_index(drop=True)

    def _filter_transactions_df(self, df: DataFrame[TransactionsSchema], filter_by_set: set[StatisticServiceFilter]) -> DataFrame[TransactionsSchema]:
        """
        Filter the transactions DataFrame by building combined mask using provided filter criteria

        Args:
            df (DataFrame[TransactionsSchema]): The transactions DataFrame to filter.
            filter_by_set (set[StatisticServiceFilter]): The set of filter criteria to apply.
        
        Returns:
            DataFrame[TransactionsSchema]: The filtered transactions DataFrame.
        """
        if not filter_by_set:
            return df

        # start all values with mask of True
        combined_mask = pd.Series([True] * len(df), index=df.index)
        for filter_by in filter_by_set:
            if filter_by.column == LunchMoneyFilterColumn.TAGS:
                # NOTE: tags is a list of enums, therefore "column_value" checks correctly
                mask = df['tags'].apply(lambda tags: filter_by.column_value in tags if tags is not None else False)
            else:
                # NOTE: column_value is an Enum, therefore "column_value.value" is needed
                mask = df[filter_by.column.value] == filter_by.column_value.value
            if filter_by.exclude:
                mask = ~mask
            # combine the mask with the combined mask using logical AND
            combined_mask &= mask
        return df[combined_mask]

    def _format_transactions_df(self, df: DataFrame[TransactionsSchema]) -> DataFrame[FormattedTransactionsSchema]:
        """
        Format the transactions DataFrame to have human-readable str values for tables.

        This method formats the transactions DataFrame to have human-readable values for the date and tags columns.
        The date column is formatted as a string in the 'YYYY-MM-DD' format, and the tags column is formatted as a set
        of tag values.

        Args:
            df (DataFrame[TransactionsSchema]): The transactions DataFrame to format.
        
        Returns:
            DataFrame[FormattedTransactionsSchema]: The formatted transactions DataFrame with human-readable values.
        """
        if 'date_arrow' in df:
            df.insert(0, 'date', df['date_arrow'].apply(lambda date_arrow: date_arrow.format('YYYY-MM-DD')))
            df = df.drop('date_arrow', axis=1)
        if 'tags' in df:
            df.loc[:, 'tags'] = df['tags'].apply(lambda tags: None if tags is None else set([tag for tag in tags]))
        if 'amount' in df:
            df.loc[:, 'amount'] = df['amount'].astype(float).round(2)
        return df