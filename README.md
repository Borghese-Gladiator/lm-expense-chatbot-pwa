
# Personal Expenditure RAG
Personal Expenditure RAG is an LLM app to understand my personal finance expenses. Default report functionality is also included for a base understanding of spending

How It Works
- React chat interface via CSS Modules + ReCharts
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
- UI - React
- default report 
- LLM
- RAG
- Docker Compose 
- Kubernetes 
- monthly reports

**Default Report**

(Feature: rent applicable expenses ONLY toggle)

- Rent Rules
- Summary Table
- Transactions List Table
- Total Expenditure vs Restaurant Expenditure per Month
- Top Categories
  - TABLE for top categories
  - BAR CHART for top category expenditure per month
- Top Merchants
  - TABLE for top merchants
  - BAR CHART for top merchant expenditure per month

Rent Rules (when Rent Applicable ON)
- meal expenses are half applicable
- Amazon expenses are fully expensed (eg: furniture, home improvement)

Summary
- Rent Applicable ON
  - Summary Table
    - column 0 - month name + "total"
    - column 1 - amount
    - column 2 - amount +/- from 1500
  - banner of rent met or not w/ deficit
- Rent Applicable ON
  - Summary Table
    - column 0 - month name + "total"
    - column 1 - amount
