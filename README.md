# Personal Expenditure RAG
Personal Expenditure RAG is an LLM app to understand my personal finance expenses. Default report functionality is also included for a base understanding of spending

How It Works
- Chat Interface
- Python service to build text summary + graph response
  - Ollama for LLM (Meta Llama3.2)
  - Transactions from Lunch Money (Plaid)

Transactions from Lunch Money (Plaid)
- Info
  - Plaid exposes bank transaction information
  - Lunch Money is a wrapper on Plaid for Expense Tracking where I add categories and labels
- I load transactions from Lunch Money and postprocess based on the tags

## Functionality
Default Report
- screenshot

Custom Report
- screenshot




## To Do
Default Report

(Rent Applicable vs Non Rent Applicable via toggle?)

Report for Personal Transactions separate from Rent Applicable ones

Report includes:
- Last Month
    - Transactions table (w/ Total Expenses)
    - Top Categories BAR CHART
    - Top Merchants BAR CHART
- YTD
    - Totals per Month BAR CHART - Rent Applicable + Non-Rent Applicable
    - Top Categories per Month BAR CHART
    - Top Merchants per Month BAR CHART
    - Total Expenses per Category TABLE
    - Total Expenses per Merchant TABLE

- Trip Cost feature by tags


