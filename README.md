# personal-expenditure-rag

## Overview
Personal Expenditure RAG is an AI-powered Retrieval-Augmented Generation (RAG) system designed to allow users to explore their spending through natural language queries.
The system processes user questions, retrieves relevant financial insights using the [Lunch Money API](https://lunchmoney.app/) or an uploaded CSV, and generates insights using graphs and charts.

## Usage
**Conversational Interface**: Uses RAG to retrieve relevant financial data and respond in an easy-to-understand format.

Once running, users can input queries like:
- *"How much did I spend on groceries last month?"*
- *"Show me a breakdown of my spending by category in the last 3 months."*

`screenshot`

#### Features
- **LLM-Powered Queries**: Users can ask questions about their spending, and the app generates meaningful responses.
- **Lunch Money Integration**: Fetches transactions directly from Lunch Money.
- **Tremor React Graphs**: Generates graphs and tables when relevant.

Clicking the "Default Query" button generates a default report while typing in any query generates a custom report.

## Setup
### Prerequisites
- Python 3.9+
- Ollama (w/ local LLM)
- Lunch Money API key

### Installation
1. Clone the repository:
   ```sh
   git clone https://github.com/yourusername/personal-expenditure-rag.git
   ```
2. Navigate to the project directory:
   ```sh
   cd personal-expenditure-rag
   ```
3. Install dependencies:
   ```sh
   pip install -r requirements.txt
   ```
4. Run the app:
   ```sh
   python main.py
   ```

### Technologies
- React frontend
  - bootstrapped with [Vite](https://vite.dev/guide/)
  - displays chat interface
  - displays graphs via [Tremor](https://tremor.so/)
- Python service
  - exposed endpoints with [FastAPI](https://fastapi.tiangolo.com/)
  - built text summary + visualization (graph or table) [DeepSeek-R1](https://huggingface.co/collections/deepseek-ai/deepseek-r1-678e1e131c0169c0bc89728d) LLM via [Ollama](https://ollama.com/)
  - called Lunch Money API with `requests`

NOTE: Lunch Money is a wrapper on Plaid for Expense Tracking where I add categories and labels. Plaid has the raw bank transactions.
