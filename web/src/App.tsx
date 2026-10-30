import { useState } from "react";

import { ChatPanel } from "./components/ChatPanel";
import { SettingsGear } from "./components/SettingsGear";
import { getApiBaseUrl } from "./lib/storage";

export default function App() {
  const [apiBase, setApiBase] = useState(() => getApiBaseUrl());
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  return (
    <div
      className="app-shell"
      {...(theme === "system" ? {} : { "data-theme": theme })}
    >
      <header className="topbar">
        <div>
          <p className="caption">OpsPilot</p>
          <h1>War room</h1>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              setTheme((t) =>
                t === "system" ? "dark" : t === "dark" ? "light" : "system",
              )
            }
          >
            Tema: {theme}
          </button>
          <SettingsGear onSaved={setApiBase} />
        </div>
      </header>
      <main>
        <p className="caption api-hint">API: {apiBase}/opspilot</p>
        <ChatPanel apiBase={apiBase} />
      </main>
    </div>
  );
}
