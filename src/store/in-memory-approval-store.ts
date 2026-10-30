import {
  ApprovalAlreadyResolvedError,
  ApprovalNotFoundError,
} from "../domain/errors.js";
import type {
  ApprovalDecision,
  ApprovalStore,
  PendingApproval,
} from "../domain/types.js";

export class InMemoryApprovalStore implements ApprovalStore {
  readonly #byId = new Map<string, PendingApproval>();

  save(record: PendingApproval): void {
    if (record.status !== "pending") {
      throw new Error("ApprovalStore.save só aceita status pending.");
    }
    this.#byId.set(record.id, { ...record, args: { ...record.args } });
  }

  getById(id: string): PendingApproval | null {
    const found = this.#byId.get(id);
    return found === undefined ? null : { ...found, args: { ...found.args } };
  }

  resolve(id: string, decision: ApprovalDecision): PendingApproval {
    const current = this.#byId.get(id);
    if (current === undefined) {
      throw new ApprovalNotFoundError();
    }
    if (current.status !== "pending") {
      throw new ApprovalAlreadyResolvedError();
    }
    const resolved: PendingApproval = {
      ...current,
      status: decision === "approve" ? "approved" : "denied",
      resolvedAt: Date.now(),
    };
    this.#byId.set(id, resolved);
    return { ...resolved, args: { ...resolved.args } };
  }
}
