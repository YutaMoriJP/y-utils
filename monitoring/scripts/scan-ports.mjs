import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "public", "ports.json");

const parseAddress = (name) => {
  const match = name.match(/^(.*):(\d+)\s+\(LISTEN\)$/);

  if (!match) {
    return { host: name, port: null };
  }

  return {
    host: match[1],
    port: Number(match[2]),
  };
};

const parseLsof = (stdout) => {
  const rows = stdout.trim().split(/\r?\n/).slice(1);
  const byKey = new Map();

  for (const row of rows) {
    const parts = row.trim().split(/\s+/);
    if (parts.length < 9) continue;

    const command = parts[0].replaceAll("\\x20", " ");
    const pid = Number(parts[1]);
    const user = parts[2];
    const fd = parts[3];
    const protocol = parts[4];
    const name = parts.slice(8).join(" ");
    const { host, port } = parseAddress(name);
    if (!port) continue;

    const key = `${pid}:${port}:${command}`;
    const current = byKey.get(key) ?? {
      id: key,
      command,
      pid,
      user,
      port,
      hosts: new Set(),
      protocols: new Set(),
      fds: new Set(),
    };

    current.hosts.add(host);
    current.protocols.add(protocol);
    current.fds.add(fd);
    byKey.set(key, current);
  }

  return [...byKey.values()]
    .map((item) => ({
      ...item,
      hosts: [...item.hosts].sort(),
      protocols: [...item.protocols].sort(),
      fds: [...item.fds].sort(),
    }))
    .sort((a, b) => a.port - b.port || a.command.localeCompare(b.command));
};

export const scanPorts = async () => {
  let ports = [];
  let error = null;

  try {
    const { stdout } = await execFileAsync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"]);
    ports = parseLsof(stdout);
  } catch (err) {
    error = err.message;
  }

  return {
    generatedAt: new Date().toISOString(),
    count: ports.length,
    ports,
    error,
  };
};

export const writeSnapshot = async () => {
  const payload = await scanPorts();

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
};

const main = async () => {
  const payload = await writeSnapshot();
  console.log(`Wrote ${payload.count} listening ports to ${outputPath}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
