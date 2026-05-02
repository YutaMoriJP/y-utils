import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type PortItem = {
  id: string;
  command: string;
  pid: number;
  user: string;
  port: number;
  hosts: string[];
  protocols: string[];
  fds: string[];
};

type PortsResponse = {
  generatedAt: string;
  count: number;
  ports: PortItem[];
  error: string | null;
};

const loadPorts = async (): Promise<PortsResponse> => {
  const response = await fetch(`/ports.json?t=${Date.now()}`);
  if (!response.ok) {
    throw new Error(`Could not load ports.json (${response.status})`);
  }
  return response.json();
};

const stopPort = async (item: PortItem) => {
  const response = await fetch("/stop-port", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ pid: item.pid, port: item.port })
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? `Could not stop port ${item.port}`);
  }

  return payload;
};

const askCodex = async (question: string, onStateUpdate: (result: string) => void) => {
  const response = await fetch("/ask-codex", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ question })
  });

  if (response.body) {
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";

    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }

      buffer += result.value;

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        const parsed = JSON.parse(line);
        if (parsed.type === "answer_delta") {
          onStateUpdate(parsed.delta);
        }

        if (parsed.type === "answer") {
          onStateUpdate(parsed.answer);
        }
      }
    }
  }
};

const stopDashboard = async () => {
  const response = await fetch("/stop-dashboard", {
    method: "POST"
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Could not stop the dashboard.");
  }

  return payload;
};

const getLocalUrl = (item: PortItem) => {
  const host = item.hosts.find((value) => value === "127.0.0.1" || value === "localhost") ?? "127.0.0.1";
  return `http://${host}:${item.port}`;
};

function App() {
  const [data, setData] = useState<PortsResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [stoppingId, setStoppingId] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [stoppingDashboard, setStoppingDashboard] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError("");

    try {
      setData(await loadPorts());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async (item: PortItem) => {
    const label = `${item.command} on port ${item.port} (PID ${item.pid})`;

    if (!window.confirm(`Stop ${label}?`)) {
      return;
    }

    setStoppingId(item.id);
    setError("");
    setMessage("");

    try {
      await stopPort(item);
      setMessage(`Stopped ${label}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStoppingId("");
    }
  };

  const handleAsk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const trimmed = String(formData.get("question") ?? "").trim();

    if (!trimmed) return;

    setAsking(true);
    setError("");
    setAnswer("");

    try {
      const setState = (result: string) => {
        setAnswer((answer) => answer + "\n" + result);
      };

      await askCodex(trimmed, setState);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAsking(false);
    }
  };

  const handleStopDashboard = async () => {
    if (!window.confirm("Stop both the dashboard frontend and backend servers?")) {
      return;
    }

    setStoppingDashboard(true);
    setError("");
    setMessage("");

    try {
      await stopDashboard();
      setMessage("Dashboard servers are stopping.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStoppingDashboard(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const appCount = useMemo(() => {
    if (!data?.ports) return 0;
    return new Set(data.ports.map((port) => `${port.command}:${port.pid}`)).size;
  }, [data]);

  return (
    <main className="shell">
      <section className="toolbar" aria-label="Port monitor controls">
        <div>
          <p className="eyebrow">Local monitor</p>
          <h1>Open Ports</h1>
        </div>
        <div className="toolbarActions">
          <button className="iconButton" type="button" onClick={refresh} aria-label="Refresh port data">
            R
          </button>
          <button
            className="shutdownButton"
            type="button"
            onClick={handleStopDashboard}
            disabled={stoppingDashboard}
            aria-label="Stop dashboard servers"
          >
            {stoppingDashboard ? "Stopping" : "Stop dashboard"}
          </button>
        </div>
      </section>

      <section className="stats" aria-label="Port summary">
        <Metric label="Open ports" value={data?.count ?? 0} icon="P" />
        <Metric label="Processes" value={appCount} icon="A" />
        <Metric label="Scanned" value={data ? new Date(data.generatedAt).toLocaleTimeString() : "..."} icon="T" />
      </section>

      {error || data?.error ? <p className="notice">{error || data?.error}</p> : null}
      {message ? <p className="success">{message}</p> : null}

      <section className="askPanel" aria-label="Ask Codex">
        <form className="askForm" onSubmit={handleAsk}>
          <label htmlFor="codex-question">Ask Codex</label>
          <div className="askControls">
            <input
              id="codex-question"
              name="question"
              type="text"
              placeholder="What is this port for?"
              maxLength={1200}
            />
            <button type="submit" disabled={asking}>
              {asking ? "Asking" : "Ask"}
            </button>
          </div>
        </form>
        {answer ? <p className="answer">{answer}</p> : null}
      </section>

      <section className="list" aria-label="Running listeners">
        <div className="listHeader">
          <span>Port</span>
          <span>Running</span>
          <span>Bind</span>
          <span>Action</span>
        </div>

        {loading && !data ? <p className="empty">Scanning...</p> : null}

        {data?.ports?.length ? (
          data.ports.map((item) => (
            <PortRow key={item.id} item={item} isStopping={stoppingId === item.id} onStop={() => handleStop(item)} />
          ))
        ) : !loading ? (
          <p className="empty">No listening TCP ports found.</p>
        ) : null}
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: string; label: string; value: number | string }) {
  return (
    <article className="metric">
      <span className="metricIcon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PortRow({ item, isStopping, onStop }: { item: PortItem; isStopping: boolean; onStop: () => void }) {
  const localUrl = getLocalUrl(item);

  return (
    <article className="row">
      <div className="port">
        <span className="dot" aria-hidden="true" />
        <strong>{item.port}</strong>
      </div>
      <div>
        <strong>{item.command}</strong>
        <span>
          PID {item.pid} | {item.user}
        </span>
      </div>
      <div className="bind">
        <strong>{item.hosts.join(", ")}</strong>
        <span>{item.protocols.join(" / ")}</span>
      </div>
      <div className="actions">
        <a
          className="openLink"
          href={localUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open localhost port ${item.port}`}
        >
          Open
        </a>
        <button
          className="stopButton"
          type="button"
          onClick={onStop}
          disabled={isStopping}
          aria-label={`Stop ${item.command} on port ${item.port}`}
        >
          {isStopping ? "Stopping" : "Stop"}
        </button>
      </div>
    </article>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
