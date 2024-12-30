
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


---

`npm create vite@latest my-app --template react`

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```
