# Performance Monitoring Utilities

Small browser-console utilities for inspecting performance and monitoring behavior during local development.

## SPA Navigation Monitor

`spa-navigation.ts` observes Chrome's experimental Soft Navigation API and prints a `console.table` of detected SPA navigations. It is intended for debugging single-page apps where client-side route changes update the URL and page content without a full document load.

Source reference: [Experimenting with measuring soft navigations](https://developer.chrome.com/docs/web-platform/soft-navigations-experiment), Chrome for Developers.

### Browser Support

Soft navigation measurement is experimental and is not enabled by default in stable browser behavior. Chrome's documentation says developers can experiment by enabling:

```text
chrome://flags/#soft-navigation-heuristics
```

Chrome also documents an origin trial beginning with Chrome 147. Because this API is experimental, expect behavior and field names to change.

### What It Measures

The script listens for:

- `soft-navigation` entries, which represent Chrome-detected SPA navigations.
- `interaction-contentful-paint` entries, which can be used to estimate LCP-like timing for the soft navigation that followed a user interaction.

The table includes:

- New URL and `navigationId`.
- Initiating `interactionId`.
- Soft navigation start time, duration, detection time, and detection delay.
- FCP-like timing from `paintTime`.
- Presentation timing from `presentationTime`.
- LCP-like timing from the largest interaction contentful paint.
- Diagnostic details for the LICP entry, including size, URL, element, and related IDs.

### Why `interactionId` Is Used

Chrome's documentation notes that `interaction-contentful-paint` entries can sometimes be emitted before the `soft-navigation` entry, and later interactions can also emit additional entries. For that reason, the script maps LICP entries back to a soft navigation by matching `interactionId`, then reports timing relative to the soft navigation's `startTime`.

### Usage

Open your SPA in Chrome with the Soft Navigation API enabled, then compile or transpile `spa-navigation.ts` and paste the output into DevTools Console.

Navigate around the app. The console table refreshes as Chrome detects soft navigations and matching interaction contentful paint entries.

Stop monitoring with:

```js
window.__softNavMetrics.stop();
```

Inspect the raw rows with:

```js
window.__softNavMetrics.rows;
```

### Notes

- The script is for local diagnostics and exploratory measurement, not production RUM collection.
- Some navigations that users perceive as route changes may not meet Chrome's soft navigation criteria.
- Some detected entries may be false positives while the API is still experimental.
- Report production metrics only after validating browser support and the impact of enabling the experiment for your users.
