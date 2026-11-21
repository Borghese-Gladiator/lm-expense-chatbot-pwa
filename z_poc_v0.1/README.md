## Local Finance Chat (Ollama + Lunch Money + Streamlit)

Minimal PoC that lets a local LLM call tools to fetch and summarize your Lunch Money transactions, all inside a Streamlit chat UI.

Prereqs
- Ollama installed and running
- Python 3.10+
- Lunch Money personal access token

Setup
1) ollama pull llama3.1:8b
2) python -m venv .venv
3) Windows PowerShell: . .\.venv\Scripts\Activate.ps1
   macOS/Linux: . .venv/bin/activate
4) pip install -r requirements.txt
5) copy .env.sample .env  (then add LUNCHMONEY_TOKEN)
6) streamlit run app.py

How it works
- The assistant emits a tool_call XML block when it needs data, for example:
  <tool_call>{"tool":"sum_by_category","args":{"start_date":"2025-08-01","end_date":"2025-08-31"}}</tool_call>
- The app intercepts that JSON, runs the corresponding Python function, then feeds the JSON result back to the model.

Extending
- Add tools in tools.py and describe them in prompts.py so the model knows they exist.
- Swap models via the OLLAMA_MODEL environment variable.
- Add charts using Streamlit components.


### Local Setup
- `poetry install`
- `Invoke-Expression (poetry env activate)`
- `streamlit run src/app.py`

### Boostrap
- run `bootstrap.ps1` (ChatGPT generated scaffold script)
  - Generated in this [chat](https://chatgpt.com/c/68e6c168-aee4-832f-9a45-6331f4d6a992)
- `poetry add streamlit python-dotenv requests pydantic ollama mcp`
- `Invoke-Expression (poetry env activate)`
- `streamlit run src/app.py`
- generated MCP tools based on [Lunch Money API](https://lunchmoney.dev/#get-all-transactions)
  - ensured it was Read Only

### Notes
- These MCP servers don't have the tools I need and I'd prefer not to run a separate MCP server since it makes deployment more difficult. Furthermore, I do NOT want CRUD operations available. I want read only access!
  - https://github.com/leafeye/lunchmoney-mcp-server
  - https://github.com/akutishevsky/lunchmoney-mcp
- Tools I need
  - get_transactions
  - search_transactions (same endpoint, friendlier args)
  - get_single_transaction
  - get_transaction_group (best-effort: resolve siblings around the parent)
  - get_categories, get_category
  - get_tags, get_assets, get_plaid_accounts
  - derived
    - sum_by_category
    - top_merchants
    - month_over_month
    - category_health
    - monthly_cashflow