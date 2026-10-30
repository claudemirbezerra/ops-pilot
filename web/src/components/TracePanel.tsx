import { useEffect, useRef } from "react";

import { formatTraceEvent, type TraceEvent } from "../lib/trace";

type Props = {
  trace: TraceEvent[];
  onClose: () => void;
};

export function TracePanel({ trace, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="trace-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="trace-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trace-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="trace-header">
          <h2 id="trace-title">Raciocínio</h2>
          <button
            ref={closeRef}
            type="button"
            className="btn-ghost"
            onClick={onClose}
          >
            Fechar
          </button>
        </header>
        {trace.length === 0 ? (
          <p className="empty-inline">Sem eventos neste turno.</p>
        ) : (
          <ol className="trace-list">
            {trace.map((event, index) => (
              <li key={`${event.type}-${index}`}>
                <span className="trace-type">{event.type}</span>
                <pre>{formatTraceEvent(event)}</pre>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
