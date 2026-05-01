import { Codex } from "@openai/codex-sdk";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanPorts } from "./scan-ports.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4173);
const codex = new Codex({
  config: {
    approval_policy: "never",
  },
});

const readJson = async (req) => {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const sendJson = (res, status, payload) => {
  const body = `${JSON.stringify(payload, null, 2)}\n`;

  res.writeHead(status, {
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
};

const askCodex = async (question) => {
  const prompt = [
    "You are answering a question from a tiny local port-monitoring dashboard.",
    "Give a concise, helpful answer.",
    "Do not modify files or start/stop processes.",
    "",
    question,
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 45000);

  try {
    const thread = codex.startThread({
      approvalPolicy: "never",
      sandboxMode: "read-only",
      skipGitRepoCheck: true,
      workingDirectory: root,
    });
    const turn = await thread.run(prompt, {
      signal: controller.signal,
    });

    return turn.finalResponse.trim();
  } finally {
    clearTimeout(timeout);
  }
};

const stopDashboard = async () => {
  const targets = await getDashboardTargets();

  for (const target of targets) {
    if (target.pid !== process.pid) {
      process.kill(target.pid, "SIGTERM");
    }
  }

  return targets;
};

const getDashboardTargets = async () => {
  const snapshot = await scanPorts();
  const dashboardPorts = new Set([4173, port]);

  return snapshot.ports
    .filter((item) => dashboardPorts.has(item.port) && item.command === "node")
    .filter((item, index, items) => items.findIndex((candidate) => candidate.pid === item.pid) === index);
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/ports.json") {
    const payload = await scanPorts();
    sendJson(res, 200, payload);
    return;
  }

  if (url.pathname === "/stop-port" && req.method === "POST") {
    try {
      const { pid, port } = await readJson(req);
      const numericPid = Number(pid);
      const numericPort = Number(port);
      const snapshot = await scanPorts();
      const target = snapshot.ports.find((item) => item.pid === numericPid && item.port === numericPort);

      if (!target) {
        sendJson(res, 404, { ok: false, error: "That process is no longer listening on that port." });
        return;
      }

      if (numericPid === process.pid) {
        sendJson(res, 200, { ok: true, message: "Stopping the dashboard server." });
        setTimeout(() => process.exit(0), 100);
        return;
      }

      process.kill(numericPid, "SIGTERM");
      sendJson(res, 200, { ok: true, stopped: target });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }

    return;
  }

  if (url.pathname === "/stop-dashboard" && req.method === "POST") {
    try {
      const body = await readJson(req);

      if (body.dryRun) {
        const stopped = await getDashboardTargets();
        sendJson(res, 200, { ok: true, dryRun: true, stopped });
        return;
      }

      const stopped = await stopDashboard();
      sendJson(res, 200, { ok: true, stopped });
      setTimeout(() => process.exit(0), 100);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }

    return;
  }

  if (url.pathname === "/ask-codex" && req.method === "POST") {
    try {
      const { question } = await readJson(req);
      const trimmed = String(question ?? "").trim();

      if (!trimmed) {
        sendJson(res, 400, { ok: false, error: "Ask a question first." });
        return;
      }

      if (trimmed.length > 1200) {
        sendJson(res, 400, { ok: false, error: "Keep questions under 1200 characters." });
        return;
      }

      const answer = await askCodex(trimmed);
      sendJson(res, 200, { ok: true, answer });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }

    return;
  }

  sendJson(res, 404, { ok: false, error: "Unknown API route." });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Port Monitor API running at http://127.0.0.1:${port}`);
});
