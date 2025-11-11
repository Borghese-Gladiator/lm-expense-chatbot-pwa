# LM Expense Tracker

An AI-powered personal finance assistant that analyzes spending patterns from Lunch Money. Built with privacy-first principles - all AI processing happens entirely in your browser using WebGPU.

## Features

- **On-Device AI**: WebLLM-powered chatbot with WebGPU acceleration - no data leaves your device
- **Function Calling**: LLM automatically retrieves and analyzes financial data through tools
- **Lunch Money Integration**: Connect to your Lunch Money account for real transaction analysis
- **Transaction Caching**: Smart caching minimizes API calls and improves performance
- **Progressive Web App**: Install on any device, works offline after initial load
- **Chat History**: Persistent conversation history across sessions
- **Responsive Design**: Works seamlessly on web and mobile

## Project Structure

This repository contains two implementations:

### 📱 [`app/`](./app) - Production MVP (JavaScript)
**Status:** ✅ Complete and production-ready

Modern web app built with:
- **Next.js 16** - React framework with App Router
- **WebLLM** - In-browser LLM inference using WebGPU
- **shadcn/ui** - High-quality React components
- **Serwist** - PWA functionality with service workers
- **Hermes Models** - Support for function calling (Mistral 7B, Llama 3 8B)

**Key Features:**
- 9 financial analysis tools (transactions, categories, trends, merchants, budgets)
- Real-time API integration with Lunch Money
- Date-range based transaction caching
- Smart fallback to mock data
- Model selection UI with progress tracking
- Toast notifications and loading states

[See full documentation →](./app/README.md)

**Screenshots:**

Web
<screenshot>

Mobile
<screenshot>

---

### 🐍 [`poc/`](./poc) - Proof of Concept (Python)
**Status:** Initial prototype

Python prototype using:
- **Streamlit** - Interactive web framework for chat UI
- **Ollama** - Local LLM inference (Llama 3.1 8B)
- **Python 3.10+** - Backend logic and API integration
- **Poetry** - Dependency management

**Directory Structure:**
```
poc/
├── src/
│   ├── app.py          # Streamlit chat application
│   ├── tools.py        # Financial analysis tools (9 functions)
│   ├── lunchmoney.py   # Lunch Money API client
│   ├── lm.py           # LLM wrapper for Ollama
│   └── prompts.py      # System prompts
├── bootstrap.ps1       # Windows setup script
├── pyproject.toml      # Poetry dependencies
└── README.md          # POC documentation
```

**Quick Start:**
```bash
cd poc

# Install Ollama and pull model
ollama pull llama3.1:8b

# Setup Python environment
poetry install
poetry shell

# Configure API key
cp .env.sample .env
# Add LUNCHMONEY_TOKEN to .env

# Run application
streamlit run src/app.py
```

This POC proved the concept and tool definitions that were later implemented in the JavaScript MVP.

---

## Quick Start

These instructions are for running the **app/** MVP. For the Python POC, see the [POC section](#-poc---proof-of-concept-python) above.

### Prerequisites
- Node.js 18+ and Yarn
- A modern browser with WebGPU support (Chrome 113+, Edge 113+)
- (Optional) Lunch Money API key from [my.lunchmoney.app/developers](https://my.lunchmoney.app/developers)

### Running the MVP (app/)

```bash
# Navigate to app directory
cd app

# Install dependencies
yarn install

# (Optional) Configure Lunch Money API
cp .env.example .env.local
# Add your API key to .env.local

# Start development server
yarn dev
```

Open [http://localhost:3000](http://localhost:3000)

**First run:**
- The AI model (~4.5GB) will download automatically
- This only happens once - cached in your browser
- Download time: 5-15 minutes depending on connection

Without an API key, the app uses mock data for demonstration.

See [app/README.md](./app/README.md) for detailed documentation.

---

## Tech Stack

### MVP (app/)
- **Frontend**: Next.js 16, React, Tailwind CSS v4
- **AI**: WebLLM, Hermes models with function calling
- **UI**: shadcn/ui, Radix UI primitives
- **PWA**: Serwist service worker
- **API**: Lunch Money REST API with caching

### POC (poc/)
- **Framework**: Streamlit
- **AI**: Ollama
- **Language**: Python

---

## Available Models

The MVP supports Hermes models with function calling:

| Model | Size | Performance |
|-------|------|-------------|
| **Hermes 2 Pro Mistral 7B** (default) | ~4.5GB | Best balance |
| Hermes 2 Pro Llama 3 8B | ~5GB | Better accuracy |
| Hermes 3 Llama 3.1 8B | ~5GB | Latest, best results |

> **Note:** Only Hermes models support function calling in WebLLM

---

## Function Calling Tools

The assistant has access to 9 financial analysis tools:

| Tool | Description |
|------|-------------|
| `get_transactions` | Fetch transactions by date range |
| `sum_by_category` | Spending breakdown by category |
| `month_over_month` | Monthly spending trends |
| `top_merchants` | Highest spending merchants |
| `monthly_cashflow` | Income vs expenses analysis |
| `compare_yoy` | Year-over-year comparison |
| `category_health` | Budget vs actual spending |
| `get_categories` | List all expense categories |
| `get_tags` | List all transaction tags |

---

## Architecture

### On-Device Processing
```
User Query
    ↓
WebLLM (in browser)
    ↓
Function Calling Decision
    ↓
Tool Execution (cached)
    ↓
Final Response
```

### Transaction Caching
```javascript
// First call: API request
await getTransactions('2025-01-01', '2025-01-31');

// Subsequent calls: Cache hit
await getTransactions('2025-01-01', '2025-01-31');
```

Cache key: `{startDate}_{endDate}`

---

## Development Timeline

### Phase 1: Foundation
- Next.js setup with App Router
- PWA configuration with Serwist
- Tailwind CSS v4 with custom theme

### Phase 2: UI & Chat
- shadcn/ui component integration
- Collapsible sidebar with chat history
- localStorage persistence
- Responsive layout

### Phase 3: WebLLM
- Model loading with progress tracking
- Streaming chat completions
- Model selection UI
- Toast notifications

### Phase 4: Function Calling
- Tool definitions from Python POC
- Lunch Money API client
- Transaction caching system
- Smart mock data fallback

### Phase 5: Polish
- System prompt optimization
- README documentation
- Semantic versioning commits
- Production deployment

See [How It Was Built](./app/README.md#how-it-was-built) for detailed steps.

---

## Environment Variables

Create `app/.env.local`:

```bash
# Lunch Money API Key (optional)
# Get from: https://my.lunchmoney.app/developers
NEXT_PUBLIC_LUNCH_MONEY_API_KEY=your_api_key_here
```

Without an API key, the app uses mock data automatically.

---

## Future Enhancements

### Backend Service Integration
- [ ] **Python API with MCP Server Integration**
  - Build FastAPI/Flask backend service
  - Integrate official Lunch Money MCP server for standardized tool access
  - OR implement custom tool calling layer for more control
  - Evaluate trade-offs: MCP standard compliance vs custom flexibility
  - Consider WebSocket for real-time updates
  - Add server-side caching and rate limiting

### Cost Analysis for Cloud LLMs
- [ ] **OpenAI API Viability Study**
  - Calculate estimated API costs based on usage patterns
  - Compare OpenAI GPT-4/GPT-3.5 vs on-device WebLLM
  - Analyze trade-offs:
    - Cost per user per month
    - Response quality and accuracy
    - Latency improvements
    - Privacy implications (data leaving device)
  - Consider hybrid approach: on-device for basic queries, cloud for complex analysis
  - Evaluate alternative providers (Anthropic Claude, Google Gemini, Mistral API)

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with semantic commits
4. Test thoroughly (especially function calling)
5. Submit a pull request

---

## Troubleshooting

### WebGPU Not Available
- Use Chrome 113+ or Edge 113+
- Enable: `chrome://flags/#enable-unsafe-webgpu`

### Model Download Issues
- Check browser console for errors
- Ensure stable internet connection
- Clear cache: DevTools → Application → Storage → Clear site data

### API Connection Failed
- Verify API key in `.env.local`
- Check Lunch Money API status
- App auto-falls back to mock data

See [full troubleshooting guide](./app/README.md#troubleshooting) for more.

---

## License

[Your License Here]

## Acknowledgments

- Python POC implementation in `poc/src/tools.py`
- [shadcn/ui](https://ui.shadcn.com) for excellent component library
- [WebLLM](https://webllm.mlc.ai/) team for browser-based LLM inference
- [Lunch Money](https://lunchmoney.app) for comprehensive financial API
- [Serwist](https://serwist.pages.dev/) for PWA service worker solution
