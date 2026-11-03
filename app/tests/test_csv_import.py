import pytest

from app.csv_import import CsvImportRequest, import_csv
from app.db import rows, scalar

LUNCH_MONEY = """date,payee,amount,currency,category,category group,tags,notes,account,is_income
2026-10-01,Whole Foods,-54.20,usd,Groceries,Food,"home,weekly",,Chase Checking,false
2026-10-02,Coffee,-4.50,usd,Coffee,Food,,,Chase Checking,false
2026-10-02,Coffee,-4.50,usd,Coffee,Food,,,Chase Checking,false
2026-10-15,Employer,3000.00,usd,Paycheck,Income,,,Chase Checking,true
"""

BANK = """Posted Date,Description,Debit,Credit
10/03/2026,NETFLIX,15.99,
10/04/2026,REFUND,,"$1,005.00"
bad,OOPS,1,
"""


def run(db, text, **kw):
    return import_csv(db, CsvImportRequest(csv_text=text, **kw), "USD")


def test_lunch_money_export_and_reimport(db):
    first = run(db, LUNCH_MONEY)
    assert (first.added, first.skipped_duplicates, first.accounts_created) == (4, 0, ["Chase Checking"])
    again = run(db, LUNCH_MONEY)
    assert (again.added, again.skipped_duplicates) == (0, 4)

    txns = rows(db, "SELECT * FROM reportable ORDER BY date, id")
    assert [t["category_group"] for t in txns] == ["Food", "Food", "Food", "Income"]
    assert txns[0]["tags"] == ["home", "weekly"]
    assert txns[-1]["txn_type"] == "income"
    assert scalar(db, "SELECT COUNT(*) FROM sync_runs WHERE source = 'csv'") == 2


def test_bank_debit_credit_columns(db):
    account = scalar(db, "INSERT INTO accounts (name) VALUES ('Visa') RETURNING id")
    result = run(db, BANK, account_id=account)
    assert result.added == 2
    assert result.errors == ["line 4: cannot read date 'bad'"]
    amounts = [float(r["amount"]) for r in rows(db, "SELECT amount FROM transactions ORDER BY date")]
    assert amounts == [-15.99, 1005.0]


@pytest.mark.parametrize(
    "text, message",
    [
        ("payee,amount\nx,1\n", "no date column"),
        ("date,payee\n2026-01-01,x\n", "no amount"),
        ("date,amount\n2026-01-01,1\n", "choose an account"),
    ],
)
def test_rejects_unusable_files(db, text, message):
    with pytest.raises(ValueError, match=message):
        run(db, text)


def test_positive_is_expense(db):
    account = scalar(db, "INSERT INTO accounts (name) VALUES ('Amex') RETURNING id")
    run(
        db, "date,description,amount\n2026-10-01,Shop,25.00\n", account_id=account, sign="positive_is_expense"
    )
    assert float(scalar(db, "SELECT amount FROM transactions")) == -25.0
