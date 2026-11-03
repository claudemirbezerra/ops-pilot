export type Blackboard = {
  request: string;
  findings: string;
  plan: string[];
  incident: string;
};

export type TeamRoleName = "analista" | "planejador" | "executor";

export type RoleBoardUpdate = {
  role: TeamRoleName;
  findings?: string;
  plan?: string[];
  incident?: string;
};

export function emptyBoard(request: string): Blackboard {
  return {
    request,
    findings: "",
    plan: [],
    incident: "",
  };
}

function withFindings(board: Blackboard, findings: string): Blackboard {
  if (findings.length === 0) {
    return board;
  }
  const next =
    board.findings.length > 0 ? `${board.findings}\n${findings}` : findings;
  return { ...board, findings: next };
}

function withIncident(board: Blackboard, incident: string): Blackboard {
  if (incident.length === 0) {
    return board;
  }
  const next =
    board.incident.length > 0 ? `${board.incident}\n${incident}` : incident;
  return { ...board, incident: next };
}

export function applyRoleUpdate(
  board: Blackboard,
  update: RoleBoardUpdate,
): Blackboard {
  if (update.role === "analista") {
    return withFindings(board, update.findings ?? "");
  }
  if (update.role === "planejador") {
    if (update.plan === undefined) {
      return board;
    }
    return { ...board, plan: [...update.plan] };
  }
  return withIncident(board, update.incident ?? "");
}

export function renderBoard(board: Blackboard): string {
  return JSON.stringify({
    request: board.request,
    findings: board.findings,
    plan: board.plan,
    incident: board.incident,
  });
}
