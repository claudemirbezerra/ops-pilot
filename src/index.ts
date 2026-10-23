import { pathToFileURL } from "node:url";

import { createApp } from "./http/server.js";

async function main(): Promise<void> {
  const portRaw = process.env.PORT?.trim();
  const port = portRaw && portRaw.length > 0 ? Number(portRaw) : 3000;
  const app = createApp();

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => {
      console.log(`OpsPilot listening on http://127.0.0.1:${port}`);
      resolve();
    });
    server.on("error", reject);
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void main();
}
