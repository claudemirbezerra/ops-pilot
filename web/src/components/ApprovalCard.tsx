import { useState } from "react";

import { postApproval } from "../lib/api";

type Props = {
  approvalId: string;
  description: string;
  apiBase: string;
  onResolved: (answer: string) => void;
};

export function ApprovalCard({
  approvalId,
  description,
  apiBase,
  onResolved,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "deny") {
    setBusy(true);
    setError(null);
    const result = await postApproval(approvalId, decision, apiBase);
    setBusy(false);
    if (result.kind === "error") {
      setError(result.message);
      return;
    }
    onResolved(result.answer);
  }

  return (
    <section className="approval-card" aria-live="polite">
      <h2>Decisão necessária</h2>
      <p>{description}</p>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row">
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => void decide("approve")}
        >
          Aprovar
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={() => void decide("deny")}
        >
          Negar
        </button>
      </div>
    </section>
  );
}
