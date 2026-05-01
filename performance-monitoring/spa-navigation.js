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

  const rows = new Map();

  const n = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

  const getRow = (navigationId) => {
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

    return rows.get(navigationId);
  };

  const applyLICP = (row, entry) => {
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
        .map((r, i) => ({
          "#": i + 1,
          URL: r.url,
          entryType: r.entryType,
          navigationId: r.navigationId,
          interactionId: r.interactionId,

          "startTime ms": n(r.startTime),
          "duration ms": n(r.duration),
          "detectedAt ms": n(r.detectedAt),
          "detectionDelay ms": n(r.detectionDelay),

          "paintTime ms": n(r.paintTime),
          "presentationTime ms": n(r.presentationTime),
          "FCP from nav start ms": n(r.fcpFromSoftNavStart),
          "presentation from nav start ms": n(r.presentationFromSoftNavStart),
          "LCP from nav start ms": n(r.lcpFromSoftNavStart),

          "LICP startTime ms": n(r.licpStartTime),
          "LICP duration ms": n(r.licpDuration),
          "LICP renderTime ms": n(r.licpRenderTime),
          "LICP loadTime ms": n(r.licpLoadTime),
          "LICP size": r.licpSize,
          "LICP id": r.licpId,
          "LICP url": r.licpUrl,
          "LICP navigationId": r.licpNavigationId,
          "LICP interactionId": r.licpInteractionId,
          "LICP element": r.licpElement,
        }))
    );
  };

  const softNavObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const row = getRow(entry.navigationId);

      row.url = entry.name;
      row.entryType = entry.entryType;
      row.startTime = entry.startTime;
      row.duration = entry.duration;
      row.navigationId = entry.navigationId;
      row.interactionId = entry.interactionId;
      row.paintTime = entry.paintTime;
      row.presentationTime = entry.presentationTime;
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
    for (const entry of list.getEntries()) {
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
