#!/usr/bin/env bash
# Ensaio de conversa longa: N turnos na mesma conversa, imprime promptTokens por turno.
# Pré-requisito: servidor OpsPilot já no ar (ex.: npm run dev).
#
# Env:
#   BASE_URL  default http://127.0.0.1:3000
#   TURNS     default 5 (>= 2)
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
TURNS="${TURNS:-5}"

BASE_URL="${BASE_URL%/}"

if ! [[ "$TURNS" =~ ^[0-9]+$ ]] || [[ "$TURNS" -lt 2 ]]; then
  echo "TURNS must be an integer >= 2 (got: $TURNS)" >&2
  exit 1
fi

conversation_id=""

for ((i = 1; i <= TURNS; i++)); do
  if [[ -z "$conversation_id" ]]; then
    body=$(printf '{"message":"turno %s da conversa longa"}' "$i")
  else
    body=$(printf '{"message":"turno %s da conversa longa","conversationId":"%s"}' "$i" "$conversation_id")
  fi

  response=$(curl -sS -w "\n%{http_code}" -X POST "${BASE_URL}/chat" \
    -H "Content-Type: application/json" \
    -d "$body") || {
    echo "curl failed on turn=$i" >&2
    exit 1
  }

  http_code=$(printf '%s' "$response" | tail -n 1)
  json=$(printf '%s' "$response" | sed '$d')

  if [[ "$http_code" != "200" ]]; then
    echo "turn=$i non-200 status=$http_code body=$json" >&2
    exit 1
  fi

  if [[ -z "$conversation_id" ]]; then
    conversation_id=$(printf '%s' "$json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); if(!j.conversationId) process.exit(2); process.stdout.write(String(j.conversationId));})")
  fi

  prompt_tokens=$(printf '%s' "$json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); const n=j?.metrics?.promptTokens; if(typeof n!=='number') process.exit(3); process.stdout.write(String(n));})")

  echo "turn=${i} promptTokens=${prompt_tokens}"
done
