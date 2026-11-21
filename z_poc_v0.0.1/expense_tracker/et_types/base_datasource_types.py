from typing import TypedDict

import pandera as pa
from arrow import Arrow
from pandera.typing import Series


class TransactionsSchema(pa.DataFrameModel):
    amount: Series[float] = pa.Field()
    category: Series[str] = pa.Field()
    date_arrow: Series[Arrow] = pa.Field()
    description: Series[str] = pa.Field()
    location: Series[str] = pa.Field()
    merchant: Series[str] = pa.Field()
    source: Series[str] = pa.Field()
    tags: Series[set[str]] = pa.Field()

class TransactionDict(TypedDict):
    amount: float
    category: str
    date_arrow: Arrow
    description: str | None
    location: str
    merchant: str
    source: str
    tags: set[str] | None
