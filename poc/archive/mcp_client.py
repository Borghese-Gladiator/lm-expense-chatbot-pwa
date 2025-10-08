"""
> https://github.com/leafeye/lunchmoney-mcp-server
# in your Streamlit action, replace "run_tool(tool_call)" with an MCP call
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import os, asyncio

async def call_lm_server(tool_name: str, args: dict):
    params = StdioServerParameters(
        command="npx",
        args=["-y", "lunchmoney-mcp-server"],
        env={"LUNCHMONEY_TOKEN": os.environ["LUNCHMONEY_TOKEN"]},
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            return await session.call_tool(tool_name, args)

# Example use in Streamlit:
# result = asyncio.run(call_lm_server("get-recent-transactions", {"days": 30}))
# then render result.content[0].text (or parse JSON if the server returns it)
"""

# mcp_lunchmoney_demo.py
# pip install mcp  (the official Python SDK)
import asyncio
import json
import os

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# 1) Configure your Lunch Money token
LUNCHMONEY_TOKEN = os.environ.get("LUNCHMONEY_TOKEN") or "lm_xxx_your_token"

# 2) Point the client at the leafeye MCP server via npx
params = StdioServerParameters(
    command="npx",
    args=["-y", "lunchmoney-mcp-server"],
    env={"LUNCHMONEY_TOKEN": LUNCHMONEY_TOKEN},
)

async def main():
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            # Handshake
            await session.initialize()

            # Discover tools the server exposes
            tools = await session.list_tools()
            print("Tools:", [t.name for t in tools])

            # Example 1: recent transactions (past N days)
            # The repo’s README lists tool names like:
            #   get-recent-transactions, search-transactions, get-category-spending, get-budget-summary
            # We'll call `get-recent-transactions` with {"days": 7}
            result = await session.call_tool("get-recent-transactions", {"days": 7})
            print("\nRecent (7d):")
            for part in result.content:
                if hasattr(part, "text") and part.text:
                    print(part.text)
                else:
                    print(part)

            # Example 2: category spending for last month
            # (Adjust arg shape to whatever the server expects—e.g., start_date/end_date or month)
            cat_result = await session.call_tool(
                "get-category-spending",
                {"start_date": "2025-09-01", "end_date": "2025-09-30", "category": "Groceries"},
            )
            print("\nGroceries (Sep 2025):")
            for part in cat_result.content:
                if hasattr(part, "text") and part.text:
                    print(part.text)
                else:
                    print(part)

if __name__ == "__main__":
    asyncio.run(main())
