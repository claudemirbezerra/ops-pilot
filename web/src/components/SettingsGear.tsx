import { useState, type FormEvent } from "react";

import {
  getApiBaseUrl,
  setApiBaseUrl,
} from "../lib/storage";

type Props = {
  onSaved: (baseUrl: string) => void;
};

export function SettingsGear({ onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => getApiBaseUrl());
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = setApiBaseUrl(value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onSaved(result.value);
    setOpen(false);
  }

  return (
    <div className="settings">
      <button
        type="button"
        className="icon-btn"
        aria-label="Configurações da API"
        aria-expanded={open}
        onClick={() => {
          setValue(getApiBaseUrl());
          setError(null);
          setOpen((v) => !v);
        }}
      >
        ⚙
      </button>
      {open ? (
        <form className="settings-panel" onSubmit={onSubmit}>
          <h2>URL da API</h2>
          <label htmlFor="api-base">Base OpsPilot</label>
          <input
            id="api-base"
            name="apiBase"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? "api-base-error" : undefined}
            autoComplete="off"
          />
          {error ? (
            <p id="api-base-error" className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="row">
            <button type="submit" className="btn-primary">
              Salvar
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setOpen(false)}
            >
              Fechar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
