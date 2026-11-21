from enum import Enum

# TODO: dynamic columns based on datasource
class LunchMoneyTag(Enum):
    BROTHER_RENT = "Brother Rent"

class LunchMoneyCategory(Enum):
    GROCERIES = "Groceries"
    RESTAURANTS = "Restaurants"

class LunchMoneyFilterColumn(Enum):
    CATEGORY = "category"
    # LOCATION = "location"
    MERCHANT = "merchant"
    TAGS = "tags"

class LunchMoneyGroupColumn(Enum):
    CATEGORY = "category"
    # LOCATION = "location"
    MERCHANT = "merchant"

class LunchMoneySortColumn(Enum):
    AMOUNT = "amount"
    DATE = "date"  # date are arrow types and need to be sorted separately OR at the end with string interpretation
    CATEGORY = "category"
    # LOCATION = "location"
    MERCHANT = "merchant"