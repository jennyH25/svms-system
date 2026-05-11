import net from "node:net";

const port = Number(process.env.API_PORT || process.env.PORT || 3001);
const host = process.env.API_HOST || "127.0.0.1";
const timeoutMs = Number(process.env.API_WAIT_TIMEOUT_MS || 30000);
const intervalMs = 500;

const startedAt = Date.now();

function canConnect() {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForApi() {
  while (Date.now() - startedAt < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const ready = await canConnect();
    if (ready) {
      process.stdout.write(`API ready on http://${host}:${port}\n`);
      return;
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  process.stderr.write(
    `Timed out waiting for API on http://${host}:${port}. Start the backend and try again.\n`,
  );
  process.exit(1);
}

await waitForApi();
