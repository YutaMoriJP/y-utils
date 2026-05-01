type MetricNumber = number | null;

interface InteractionContentfulPaintEntry extends PerformanceEntry {
  renderTime?: number;
  loadTime?: number;
  size?: number;
  id?: string;
  url?: string;
  navigationId?: number;
  interactionId?: number;
  element?: Element;
}

interface SoftNavigationEntry extends PerformanceEntry {
  navigationId: number;
  interactionId?: number;
  paintTime?: number;
  presentationTime?: number;
  largestInteractionContentfulPaint?: InteractionContentfulPaintEntry;
}

interface SoftNavigationMetricRow {
  navigationId: number;
  url: string | null;
  entryType: string | null;
  startTime: MetricNumber;
  duration: MetricNumber;
  interactionId: number | null;
  paintTime: MetricNumber;
  presentationTime: MetricNumber;
  fcpFromSoftNavStart: MetricNumber;
  presentationFromSoftNavStart: MetricNumber;
  lcpFromSoftNavStart: MetricNumber;
  detectedAt: MetricNumber;
  detectionDelay: MetricNumber;

  licpStartTime: MetricNumber;
  licpDuration: MetricNumber;
  licpRenderTime: MetricNumber;
  licpLoadTime: MetricNumber;
  licpSize: number | null;
  licpId: string | null;
  licpUrl: string | null;
  licpNavigationId: number | null;
  licpInteractionId: number | null;
  licpElement: string | null;
}

interface SoftNavMetricsHandle {
  rows: Map<number, SoftNavigationMetricRow>;
  print: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SoftNavigationEntry?: unknown;
    __softNavMetrics?: SoftNavMetricsHandle;
  }
}

(() => {
  const supported =
    PerformanceObserver.supportedEntryTypes?.includes("soft-navigation") ||
    "SoftNavigationEntry" in window;

  if (!supported) {
    console.warn(
      "Soft Navigation API not available. Enable chrome://flags/#soft-navigation-heuristics and reload."
    );
    return;
  }

  const rows = new Map<number, SoftNavigationMetricRow>();

  const n = (value: unknown): MetricNumber =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.round(value * 10) / 10
      : null;

  const getRow = (navigationId: number): SoftNavigationMetricRow => {
    if (!rows.has(navigationId)) {
      rows.set(navigationId, {
        navigationId,
        url: null,
        entryType: null,
        startTime: null,
        duration: null,
        interactionId: null,
        paintTime: null,
        presentationTime: null,
        fcpFromSoftNavStart: null,
        presentationFromSoftNavStart: null,
        lcpFromSoftNavStart: null,
        detectedAt: null,
        detectionDelay: null,

        licpStartTime: null,
        licpDuration: null,
        licpRenderTime: null,
        licpLoadTime: null,
        licpSize: null,
        licpId: null,
        licpUrl: null,
        licpNavigationId: null,
        licpInteractionId: null,
        licpElement: null,
      });
    }

    return rows.get(navigationId)!;
  };

  const applyLICP = (
    row: SoftNavigationMetricRow,
    entry?: InteractionContentfulPaintEntry
  ) => {
    if (!entry || !Number.isFinite(row.startTime)) return;

    const lcpRelative = entry.startTime - row.startTime;

    row.lcpFromSoftNavStart = Math.max(row.lcpFromSoftNavStart ?? 0, lcpRelative);

    row.licpStartTime = n(entry.startTime);
    row.licpDuration = n(entry.duration);
    row.licpRenderTime = n(entry.renderTime);
    row.licpLoadTime = n(entry.loadTime);
    row.licpSize = entry.size ?? null;
    row.licpId = entry.id ?? null;
    row.licpUrl = entry.url ?? null;
    row.licpNavigationId = entry.navigationId ?? null;
    row.licpInteractionId = entry.interactionId ?? null;
    row.licpElement = entry.element
      ? `${entry.element.tagName.toLowerCase()}${entry.element.id ? "#" + entry.element.id : ""}`
      : null;
  };

  const print = () => {
    console.clear();

    console.table(
      [...rows.values()]
        .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
        .map((row, index) => ({
          "#": index + 1,
          URL: row.url,
          entryType: row.entryType,
          navigationId: row.navigationId,
          interactionId: row.interactionId,

          "startTime ms": n(row.startTime),
          "duration ms": n(row.duration),
          "detectedAt ms": n(row.detectedAt),
          "detectionDelay ms": n(row.detectionDelay),

          "paintTime ms": n(row.paintTime),
          "presentationTime ms": n(row.presentationTime),
          "FCP from nav start ms": n(row.fcpFromSoftNavStart),
          "presentation from nav start ms": n(row.presentationFromSoftNavStart),
          "LCP from nav start ms": n(row.lcpFromSoftNavStart),

          "LICP startTime ms": n(row.licpStartTime),
          "LICP duration ms": n(row.licpDuration),
          "LICP renderTime ms": n(row.licpRenderTime),
          "LICP loadTime ms": n(row.licpLoadTime),
          "LICP size": row.licpSize,
          "LICP id": row.licpId,
          "LICP url": row.licpUrl,
          "LICP navigationId": row.licpNavigationId,
          "LICP interactionId": row.licpInteractionId,
          "LICP element": row.licpElement,
        }))
    );
  };

  const softNavObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as SoftNavigationEntry[]) {
      const row = getRow(entry.navigationId);

      row.url = entry.name;
      row.entryType = entry.entryType;
      row.startTime = entry.startTime;
      row.duration = entry.duration;
      row.navigationId = entry.navigationId;
      row.interactionId = entry.interactionId ?? null;
      row.paintTime = entry.paintTime ?? null;
      row.presentationTime = entry.presentationTime ?? null;
      row.detectedAt = performance.now();
      row.detectionDelay = row.detectedAt - entry.startTime;

      if (typeof entry.paintTime === "number") {
        row.fcpFromSoftNavStart = entry.paintTime - entry.startTime;
      }

      if (typeof entry.presentationTime === "number") {
        row.presentationFromSoftNavStart = entry.presentationTime - entry.startTime;
      }

      applyLICP(row, entry.largestInteractionContentfulPaint);
    }

    print();
  });

  const icpObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as InteractionContentfulPaintEntry[]) {
      for (const row of rows.values()) {
        if (row.interactionId && entry.interactionId === row.interactionId) {
          applyLICP(row, entry);
        }
      }
    }

    print();
  });

  softNavObserver.observe({
    type: "soft-navigation",
    buffered: true,
  });

  icpObserver.observe({
    type: "interaction-contentful-paint",
    buffered: true,
  });

  window.__softNavMetrics?.stop?.();
  window.__softNavMetrics = {
    rows,
    print,
    stop() {
      softNavObserver.disconnect();
      icpObserver.disconnect();
      console.log("Stopped soft navigation monitoring.");
    },
  };

  console.log("Soft navigation monitoring started.");
})();

export {};
