# Lunch Money Expense Chatbot (MVP)

A Progressive Web App (PWA) that analyzes your Lunch Money spending history using on-device AI. All AI processing happens locally in your browser using WebLLM - no data leaves your device!

## ✨ Features

- 🤖 **On-Device AI** - Powered by WebLLM (Llama 3.2 1B model)
- 📱 **PWA** - Install on desktop & mobile, works offline
- 🔒 **Privacy First** - All AI inference happens locally
- ⚡ **Fast** - WebGPU acceleration for real-time responses
- 💰 **Lunch Money Integration** - Analyze your spending patterns
- 🎨 **Beautiful UI** - Clean, modern interface with shadcn/ui
- ✅ **Well Tested** - 35 unit tests, 100% pass rate

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Yarn 1.22.22+
- Modern browser with WebGPU support (Chrome 113+, Edge 113+, or Brave)
- Lunch Money API token (get it from [Lunch Money Developer Settings](https://my.lunchmoney.app/developers))

### Installation

1. **Install dependencies:**
```bash
yarn install
```

2. **Set up environment variables:**

Create `.env.local` in the `app` directory:
```env
LUNCH_MONEY_API_TOKEN=your_lunch_money_api_token_here
```

3. **Run development server:**
```bash
yarn dev
```

4. **Open your browser:**
Navigate to http://localhost:3000

### First Time Setup

⏱️ **First load takes 2-5 minutes** to download the AI model (~1GB). This only happens once!

Watch the progress bar as the model downloads. Once complete, the model is cached and loads instantly on subsequent visits.

## 📋 Available Scripts

```bash
yarn dev              # Start development server
yarn build            # Build for production
yarn start            # Start production server
yarn test             # Run tests in watch mode
yarn test:ui          # Run tests with UI
yarn test:coverage    # Run tests with coverage
```

## 🏗️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19, Tailwind CSS 4, shadcn/ui
- **AI:** WebLLM (@mlc-ai/web-llm), Vercel AI SDK
- **PWA:** Serwist
- **Testing:** Vitest, React Testing Library
- **API:** Lunch Money API

## 📚 Documentation

For detailed implementation information, see [IMPLEMENTATION_SUMMARY.md](../IMPLEMENTATION_SUMMARY.md)

## 🧪 Testing

All core functionality is tested:

```bash
yarn test
```

**Test Coverage:**
- ✅ Lunch Money API client (18 tests)
- ✅ Utility functions (6 tests)
- ✅ API routes (11 tests)
- ✅ Total: 35 tests passing

## 🌐 Browser Requirements

### Required Features
- WebGPU (for AI inference)
- Service Workers (for PWA)
- WebAssembly (for WebLLM)

### Supported Browsers
- ✅ Chrome 113+ (desktop & Android)
- ✅ Edge 113+
- ✅ Brave (recent versions)
- ❌ Firefox (WebGPU experimental)
- ❌ Safari (WebGPU not ready)

## 🔐 Security & Privacy

- **All AI processing is local** - No data sent to external servers
- **API tokens are secure** - Stored in environment variables
- **HTTPS required** - For PWA and WebGPU support
- **No tracking** - No analytics or telemetry

## 📱 PWA Installation

### Desktop (Chrome/Edge)
1. Click the install icon in the address bar
2. Or: Menu → Install [App Name]

### Mobile (Android)
1. Open in Chrome/Brave
2. Tap menu → "Install app" or "Add to Home screen"

### iOS/Safari
WebGPU not yet supported. Use Chrome or Edge on desktop/Android.

## 🎯 Usage

1. **Start the app** - Wait for model to load (first time only)
2. **Ask questions** about your spending:
   - "What are my top spending categories?"
   - "How much did I spend on food last month?"
   - "Show me my recent transactions"
3. **Get instant answers** powered by local AI
4. **Works offline** after initial setup

## 🚧 Known Limitations

- **Large initial download** (~1GB) for AI model
- **WebGPU required** - No CPU fallback yet
- **Memory intensive** - Requires ~4GB RAM
- **Limited to supported browsers** - Chrome/Edge/Brave only

## 🛠️ API Routes

The app provides serverless API endpoints:

### GET `/api/lunch-money/transactions`
Fetch transactions with optional filters.

Query params: `start_date`, `end_date`, `category_id`, `tag_id`, `limit`

### GET `/api/lunch-money/categories`
Fetch all expense categories.

### GET `/api/lunch-money/summary`
Get spending analytics and summaries.

Query params: `start_date`, `end_date`

**Authentication:** Send token via `x-lunch-money-token` header or set `LUNCH_MONEY_API_TOKEN` env var.

## 📦 Build & Deploy

### Build for Production
```bash
yarn build
```

### Deploy to Vercel
1. Connect your GitHub repo to Vercel
2. Set environment variable: `LUNCH_MONEY_API_TOKEN`
3. Deploy!

Vercel automatically configures the PWA for you.

## 🐛 Troubleshooting

### Model Won't Load
- Check browser compatibility (Chrome 113+)
- Ensure WebGPU is enabled in browser flags
- Clear cache and try again
- Check console for errors

### API Errors
- Verify `LUNCH_MONEY_API_TOKEN` is set correctly
- Check Lunch Money API is accessible
- Ensure token has necessary permissions

### PWA Won't Install
- Must be served over HTTPS (localhost is OK for dev)
- Check manifest.json is accessible
- Clear service worker and try again

## 📄 License

MIT

## 🙏 Credits

- UI components based on [shadcn/ui](https://ui.shadcn.com)
- AI powered by [MLC-AI WebLLM](https://webllm.mlc.ai/)
- Model: Meta's Llama 3.2
- Data from [Lunch Money API](https://lunchmoney.dev/)

---

Built with ❤️ using Next.js, React, and WebLLM
