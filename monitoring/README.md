# Port Monitor

Tiny React 19 + TypeScript dashboard for local listening TCP ports.

## Run

```bash
npm install
npm run api
npm run dev
```

Run `npm run api` and `npm run dev` in separate terminals. The API listens on `127.0.0.1:4174`, and Vite serves the React app on `127.0.0.1:4173` with API proxying.

`npm run scan` refreshes `public/ports.json` from:

```bash
lsof -nP -iTCP -sTCP:LISTEN
```

The refresh button scans live while the API server is running. Each row also includes a stop button that confirms in the browser, verifies the PID still owns that port, then sends `SIGTERM` to that process.

Use the `Stop dashboard` button to shut down both the Vite frontend and the API server together.
