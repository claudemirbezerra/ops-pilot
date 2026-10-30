import { useState, type FormEvent } from "react";

import { postChat } from "../lib/api";
import { hasTraceEvents, type TraceEvent } from "../lib/trace";
import { ApprovalCard } from "./ApprovalCard";
import { TracePanel } from "./TracePanel";

type Turn = {
  id: string;
  user: string;
  assistant?: string;
  trace: TraceEvent[];
};

type Pending = {
  approvalId: string;
  description: string;
};

type Props = {
  apiBase: string;
};

export function ChatPanel({ apiBase }: Props) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [traceView, setTraceView] = useState<TraceEvent[] | null>(null);
  const [live, setLive] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) {
      setError("Há uma decisão pendente. Aprove ou negue antes de enviar outra mensagem.");
      return;
    }
    const text = message.trim();
    if (text.length === 0) {
      return;
    }
    setLoading(true);
    setError(null);
    setMessage("");
    const turnId = crypto.randomUUID();
    setTurns((prev) => [...prev, { id: turnId, user: text, trace: [] }]);

    const result = await postChat(text, apiBase);
    setLoading(false);

    if (result.kind === "error") {
      setError(result.message);
      return;
    }

    if (result.kind === "pending") {
      setPending({
        approvalId: result.approvalId,
        description: result.pending.description,
      });
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                assistant: "Aguardando aprovação humana.",
                trace: result.trace,
              }
            : turn,
        ),
      );
      setLive("Pendência de aprovação recebida.");
      return;
    }

    setTurns((prev) =>
      prev.map((turn) =>
        turn.id === turnId
          ? { ...turn, assistant: result.answer, trace: result.trace }
          : turn,
      ),
    );
    setLive("Resposta do copiloto recebida.");
  }

  return (
    <section className="chat" aria-label="Chat OpsPilot">
      {turns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden>
            ⌘
          </div>
          <h2>War room pronta</h2>
          <p className="caption">
            Envie o primeiro pedido operacional ao copiloto.
          </p>
        </div>
      ) : (
        <ul className="timeline">
          {turns.map((turn) => (
            <li key={turn.id}>
              <article className="bubble user">
                <h2 className="visually-hidden">Plantonista</h2>
                <p>{turn.user}</p>
              </article>
              {turn.assistant ? (
                <article className="bubble assistant">
                  <h2 className="visually-hidden">OpsPilot</h2>
                  <p>{turn.assistant}</p>
                  {hasTraceEvents(turn.trace) ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setTraceView(turn.trace)}
                    >
                      Ver raciocínio
                    </button>
                  ) : (
                    <span className="caption">Sem eventos neste turno</span>
                  )}
                </article>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {pending ? (
        <ApprovalCard
          approvalId={pending.approvalId}
          description={pending.description}
          apiBase={apiBase}
          onResolved={(answer) => {
            setPending(null);
            setTurns((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last) {
                copy[copy.length - 1] = { ...last, assistant: answer };
              }
              return copy;
            });
            setLive("Decisão aplicada.");
          }}
        />
      ) : null}

      {error ? (
        <div className="banner-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setError(null)}
          >
            Dispensar
          </button>
        </div>
      ) : null}

      <form className="composer" onSubmit={(e) => void onSubmit(e)}>
        <label htmlFor="chat-input" className="visually-hidden">
          Mensagem
        </label>
        <textarea
          id="chat-input"
          rows={3}
          value={message}
          disabled={loading || pending !== null}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ex.: listar alertas em disparo"
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Enviando…" : "Enviar"}
        </button>
      </form>

      <div className="visually-hidden" aria-live="polite">
        {live}
      </div>

      {traceView ? (
        <TracePanel trace={traceView} onClose={() => setTraceView(null)} />
      ) : null}
    </section>
  );
}
