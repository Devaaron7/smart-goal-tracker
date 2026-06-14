# Goal Tracker

A flexible, local-first goal tracking dashboard built with React, Vite, Tailwind CSS, and Recharts.

## Run locally

```bash
npm install
npm run dev
```

Data is saved automatically in the browser's `localStorage`. Use the Export page to download a JSON backup or copy weekly and dashboard summaries.

## Production build

```bash
npm run build
```

## Selenium UI tests

The E2E suite starts Vite automatically and runs against Chrome.

```bash
npm run test:e2e
```

To watch the tests run in a visible Chrome window:

```bash
npm run test:e2e:headed
```

Pull requests targeting `main` automatically run the headless Selenium Chrome suite in GitHub Actions.
