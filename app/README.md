# LM Expense Tracker (MVP)
This directory contains an expense tracking chatbot app that analyzes spending history on-device

Web
<screenshot>

Mobile
<screenshot>

Technologies
- [Next.js](https://nextjs.org) App Router
- [AI SDK](https://ai-sdk.dev/docs/introduction)
  - Unified API for generating text, structured objects, and tool calls with LLMs
- [shadcn/ui](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - Component primitives from [Radix UI](https://radix-ui.com) for accessibility and flexibility
- [WebLLM](https://webllm.mlc.ai/)
  - In-Browser model inference engine that uses WebGPU for hardware acceleration

## Notes
Methodology
- [X] `npx create-next-app app`
- [X] set up PWA following [docs](https://serwist.pages.dev/)
  - `yarn add @serwist/next`
  - `yarn add -D @serwist/build`
- [X] generated favicons with [favicon generator](https://realfavicongenerator.net/)
  - generated first logo with ChatGPT
- [X] deployed to Vercel - validated PWA actually deploys!
  - ``
- [ ] implemented chat via ShadCN libraries for AI Tools

- implemented chat frontend by importing ShadCN blocks


PWA Info
- `next-pwa` - now deprecated
- `@ducanh2912/next-pwa` - now deprecated too  [reference](https://ducanh-next-pwa.vercel.app/docs/next-pwa/getting-started)
- `@serwist/next` - [reference](https://serwist.pages.dev/docs/next)

ShadCN libraries for AI Tools
- frontend controller
  - [Vercel - general AI SDK](https://ai-sdk.dev/docs/introduction)
  - [Vercel - Chat SDK](https://vercel.com/blog/introducing-chat-sdk) -> handle interaction with model providers
- frontend presentation
  - [ShadCN blocks](https://www.shadcn.io/blocks/ai-chatbot) => FAILED, package not available
  - [Shadcn UI Kit](https://shadcnuikit.com/pricing) => COSTS MONEY
  - [llamaindex/chat-ui](https://ui.llamaindex.ai/)
    - handles presentation
    - requires usage of AI SDK for handling chat logic

### Troubleshooting
- shadcn components
  - `npx shadcn@latest add https://www.shadcn.io/registry/ai-chatbot.json`
  - loading from this URL didn't work - https://www.shadcn.io/blocks/ai-chatbot
    ```
    {"error":"Failed to get package","details":{"errno":-2,"code":"ENOENT","syscall":"open","path":"/app/packages/ai-chatbot/package.json"}}
    ```
