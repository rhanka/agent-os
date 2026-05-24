# Tools Inventory Report

Generated: 2026-05-24T03:45:42.720Z

| Source | Files |
| --- | ---: |
| Claude | 576 |
| Codex | 1832 |
| Antigravity (agy) | 1 |

This Markdown report is a summary view. Per-CLI tables show the top 50 items by count, and the binary union table shows the top 60 binaries by total calls. See `tools_inventory.json` for the complete structured dataset.

## CLAUDE

- Sessions: 576
- Tool calls: 42460
- Binary calls: 47649
- First session: 2026-03-12T19:09:58.089Z
- Last session: 2026-05-24T03:40:44.164Z

| Name | Type | Count | % | Example |
| --- | --- | ---: | ---: | --- |
| Bash | native_tool | 23275 | 54.8 | ls /home/antoinefa/src/a2a-cli/ && ls /home/antoinefa/.claude/projects/-home-antoinefa-src-a2a-cli/memory/ |
| head | binary | 8868 | 18.6 | npm_config_cache=/tmp/h2a-npm-cache npm deprecate "@sentropic/h2a-cli@0.1.0" "Use 0.1.1; 0.1.0 was published without ... |
| Read | native_tool | 7185 | 16.9 | /home/antoinefa/src/a2a-cli/handover.md |
| grep | binary | 6895 | 14.5 | grep -n "^## DEC-" /home/antoinefa/src/a2a-cli/DECISIONS.md \| tail -20 |
| tail | binary | 6806 | 14.3 | grep -n "^## DEC-" /home/antoinefa/src/a2a-cli/DECISIONS.md \| tail -20 |
| git | binary | 5680 | 11.9 | git status --short --branch && echo "---" && git log --oneline -5 |
| Edit | native_tool | 5447 | 12.8 | /home/antoinefa/src/a2a-cli/packages/h2a/package.json |
| ls | binary | 2605 | 5.5 | ls /home/antoinefa/src/a2a-cli/ && ls /home/antoinefa/.claude/projects/-home-antoinefa-src-a2a-cli/memory/ |
| Write | native_tool | 1748 | 4.1 | /home/antoinefa/src/a2a-cli/LICENSE |
| cat | binary | 1735 | 3.6 | ls /home/antoinefa/src/a2a-cli/packages/h2a/ /home/antoinefa/src/a2a-cli/packages/h2a-cli/ && echo "---" && cat /home... |
| gh | binary | 1724 | 3.6 | gh run list --workflow=release.yml --limit 3 2>&1 \| head -10 |
| make | binary | 1653 | 3.5 | make commit MSG="docs: finalize llm mesh sdk branch" |
| npm | binary | 1472 | 3.1 | npm run typecheck 2>&1 \| tail -30 |
| TaskUpdate | native_tool | 1397 | 3.3 | - |
| cargo | binary | 1172 | 2.5 | cargo build -p opendb-operator 2>&1 \| tail -40 |
| TaskCreate | native_tool | 873 | 2.1 | - |
| wc | binary | 786 | 1.6 | wc -l /tmp/claude-1000/-home-antoinefa-src-a2a-cli/72e96932-dab1-4be3-8282-91d5d105ee29/tasks/bxv6k2r1u.output && cat... |
| find | binary | 728 | 1.5 | find /home/antoinefa/src/a2a-cli/packages/h2a-cli -name "cli.js" -o -name "bin*" |
| sleep | binary | 639 | 1.3 | sleep 2 && cat /tmp/claude-1000/-home-antoinefa-src-a2a-cli/72e96932-dab1-4be3-8282-91d5d105ee29/tasks/bxv6k2r1u.outp... |
| python3 | binary | 607 | 1.3 | curl -s "https://registry.npmjs.org/@sentropic%2Fh2a-cli" \| python3 -c "import sys,json; v=json.load(sys.stdin)['vers... |
| curl | binary | 546 | 1.1 | TOKEN=$(grep "_authToken" ~/.npmrc \| sed 's/.*_authToken=//') && curl -s -X POST https://registry.npmjs.org/-/v1/logi... |
| Agent | native_tool | 484 | 1.1 | - |
| docker | binary | 417 | 0.9 | cd /home/antoinefa/src/entropiq && git fetch origin main && git checkout main 2>/dev/null && git log --oneline -1 && ... |
| sed | binary | 361 | 0.8 | sed -n '264,310p' /home/antoinefa/src/a2a-cli/DECISIONS.md |
| awk | binary | 317 | 0.7 | echo "=== MEMORY STATE NOW ===" <br> free -h <br> echo <br> echo "=== TOP 15 RAM CONSUMERS NOW (by RSS) ===" <br> ps -eo pid,user,rss,vsz... |
| AskUserQuestion | native_tool | 310 | 0.7 | - |
| sort | binary | 303 | 0.6 | echo "=== Total npm-global ===" <br> du -sh /home/antoinefa/.npm-global/ 2>/dev/null <br> du -sh /home/antoinefa/.npm-global/li... |
| node | binary | 300 | 0.6 | node /tmp/h2a-deprecate-direct.mjs probe |
| WebFetch | native_tool | 294 | 0.7 | - |
| npx | binary | 275 | 0.6 | cd ~/src/agent-stats && npx vitest run packages/core 2>&1 \| tail -25 |
| ToolSearch | native_tool | 244 | 0.6 | - |
| jq | binary | 231 | 0.5 | make test-api-security-sca ENV=test-audit-check API_PORT=9900 UI_PORT=5900 MAILDEV_UI_PORT=1900 2>&1 \| tail -5 && ech... |
| mkdir | binary | 224 | 0.5 | TOKEN=$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' /tmp/h2a-done.json); mkdir -p /tmp/h2a-npmrc-dir; printf "//registry.... |
| WebSearch | native_tool | 211 | 0.5 | - |
| rm | binary | 198 | 0.4 | cd /tmp && rm -rf h2a-mcp-smoke && mkdir h2a-mcp-smoke && cd h2a-mcp-smoke && printf '%s\n%s\n' '{"jsonrpc":"2.0","id... |
| mcp__playwright__browser_evaluate | native_tool | 197 | 0.5 | - |
| date | binary | 178 | 0.4 | cp ~/.codex/config.toml ~/.codex/config.toml.bak.$(date +%Y%m%d-%H%M%S) && ls -la ~/.codex/config.toml* |
| kubectl | binary | 176 | 0.4 | command -v k3d kubectl kustomize 2>&1; echo "---"; kubectl version --client 2>&1 \| head -2; echo "---"; kustomize ver... |
| pgrep | binary | 173 | 0.4 | pgrep -af cli-proxy-api <br> echo "---" <br> if ! pgrep -f cli-proxy-api >/dev/null; then <br>   cd ~/src/codex-claude/cliproxy && n... |
| bash | binary | 161 | 0.3 | chmod +x /tmp/h2a-deprecate-poll.sh && bash /tmp/h2a-deprecate-poll.sh |
| corepack | binary | 145 | 0.3 | corepack pnpm --version 2>&1 \|\| npx --yes pnpm --version 2>&1 \| tail -3 |
| ps | binary | 127 | 0.3 | ls -la /home/antoinefa/src/a2a-cli/.superpowers/brainstorm/2820761-1778937051/state/ 2>&1 && echo "---server-info---"... |
| mcp__playwright__browser_navigate | native_tool | 117 | 0.3 | - |
| mcp__playwright__browser_snapshot | native_tool | 112 | 0.3 | - |
| Skill | native_tool | 105 | 0.2 | - |
| rg | binary | 102 | 0.2 | rg -n "labels" /home/antoinefa/src/graphify/src/cli-runtime.ts /home/antoinefa/src/graphify/src/cli.ts 2>/dev/null \| ... |
| scw | binary | 102 | 0.2 | command -v rclone && rclone version \| head -3 <br> command -v scw && scw config get access-key >/dev/null 2>&1 && echo "sc... |
| xargs | binary | 99 | 0.2 | find ~/src/sent-tech/ui/src -type f \( -name "*.svelte" -o -name "*.ts" -o -name "*.tsx" -o -name "*.css" -o -name "*... |
| gcloud | binary | 98 | 0.2 | which gcloud kubectl helm terraform 2>&1; echo "---"; gcloud config list 2>&1 \| head -20 |
| mcp__playwright__browser_click | native_tool | 88 | 0.2 | - |

| Month | Native Tools | Binaries | Total |
| --- | ---: | ---: | ---: |
| 2026-03 | 92 | 74 | 166 |
| 2026-04 | 401 | 311 | 712 |
| 2026-05 | 41967 | 47264 | 89231 |

## CODEX

- Sessions: 1832
- Tool calls: 294701
- Binary calls: 261900
- First session: 2026-02-07T19:20:38.661Z
- Last session: 2026-05-24T03:45:41.278Z

| Name | Type | Count | % | Example |
| --- | --- | ---: | ---: | --- |
| exec_command | native_tool | 217185 | 73.7 | {"cmd":"gh run list --limit 10","workdir":"/home/antoinefa/src/matchID/deces-ui/deces-dataprep","yield_time_ms":120000} |
| sed | binary | 81163 | 31.0 | ls -la ../artefact* && echo '--- artifacts file ---' && sed -n '1,220p' ../artifacts |
| write_stdin | native_tool | 62133 | 21.1 | {"session_id":34856,"chars":"","yield_time_ms":120000,"max_output_tokens":12000} |
| git | binary | 49946 | 19.1 | git clone https://github.com/matchid-project/backend /tmp/matchid-backend && cd /tmp/matchid-backend && git describe ... |
| rg | binary | 31132 | 11.9 | gh run view 21667707885 --log-failed \| rg -n "IntCastingNaNError\|Cannot convert non-finite\|Traceback\|Error" |
| make | binary | 18460 | 7.0 | make config |
| nl | binary | 11311 | 4.3 | nl -ba Makefile \| sed -n '1,240p' |
| bash | binary | 8982 | 3.4 | bash -lc 'set -a; source ../artifacts; set +a; make data-tag FILES_TO_PROCESS="deces-1998.txt.gz"' |
| gh | binary | 8416 | 3.2 | gh run list --limit 10 |
| npm | binary | 4573 | 1.7 | cd /home/antoinefa/src/top-ai-ideas-fullstack/api && npm exec tsx ../tmp/check-annex.ts |
| node | binary | 3877 | 1.5 | node -e "const {marked}=require('marked'); marked.setOptions({gfm:true,breaks:true}); const src='1. un\n2. deux\n3. t... |
| find | binary | 3584 | 1.4 | LOG=$(find backend/log -type f -iname '*deces_dataprep*' \| sort \| tail -1); echo "$LOG"; rg -n "IntCastingNaNError\|Ca... |
| head | binary | 3341 | 1.3 | wc -l ../deces-backend/Makefile && rg -n "recipe\|dataprep\|job\|run" ../deces-backend/Makefile \| head -n 80 && nl -ba .... |
| ls | binary | 3055 | 1.2 | pwd && ls -la |
| update_plan | native_tool | 2956 | 1.0 | {"explanation":"Implementing Lot 4B end-to-end on tmp/feat-chrome-plugin only: API token issuance + extension secure ... |
| python | binary | 2894 | 1.1 | python - <<'PY' |
| curl | binary | 2803 | 1.1 | curl -s --fail https://www.data.gouv.fr/api/1/datasets/fichier-des-personnes-decedees/ \| jq -r '.resources[] \| .url' ... |
| cat | binary | 2598 | 1.0 | echo -n 'data-tag='; cat data-tag; echo -n 'dataprep-version='; make -s dataprep-version |
| sort | binary | 2447 | 0.9 | LOG=$(find backend/log -type f -iname '*deces_dataprep*' \| sort \| tail -1); echo "$LOG"; rg -n "IntCastingNaNError\|Ca... |
| cargo | binary | 2254 | 0.9 | cargo fmt --all |
| spawn_agent | native_tool | 1850 | 0.6 | {"agent_type":"explorer","message":"Run the scoping task for branch feat/vscode-checkpoint-tools-subagents by followi... |
| jq | binary | 1706 | 0.7 | curl -s --fail https://www.data.gouv.fr/api/1/datasets/fichier-des-personnes-decedees/ \| jq -r '.resources[] \| .url' ... |
| wait | native_tool | 1510 | 0.5 | {"ids":["019c7dc2-02ce-7d92-92b4-bd433a7f9853","019c7dc2-02d6-73e1-9ebf-2d33c6b58f84","019c7dc2-02dd-72c3-a434-e0ebce... |
| grep | binary | 1431 | 0.5 | cd /home/antoinefa/src/matchID/deces-ui/deces-dataprep && LOG=$(find backend/log -type f -iname '*deces_dataprep*' \| ... |
| wait_agent | native_tool | 1357 | 0.5 | {"targets":["019d3f80-e033-7991-8b17-0e4ed12eae97"],"timeout_ms":60000} |
| close_agent | native_tool | 1330 | 0.5 | {"id":"019c7dc2-02ce-7d92-92b4-bd433a7f9853"} |
| send_input | native_tool | 1318 | 0.4 | {"id":"019c7dcb-f990-7142-a788-bfc7da8ac565","interrupt":false,"message":"Provide a concise status update: current lo... |
| tail | binary | 1313 | 0.5 | LOG=$(find backend/log -type f -iname '*deces_dataprep*' \| sort \| tail -1); echo "$LOG"; rg -n "IntCastingNaNError\|Ca... |
| awk | binary | 1199 | 0.5 | bash -lc 'touch config backend/config; export STORAGE_ACCESS_KEY=$(awk -F= "/^export STORAGE_ACCESS_KEY=/{print \$2;e... |
| scw | binary | 1161 | 0.4 | scw version |
| wc | binary | 1153 | 0.4 | wc -l ../deces-backend/Makefile && rg -n "recipe\|dataprep\|job\|run" ../deces-backend/Makefile \| head -n 80 && nl -ba .... |
| docker | binary | 1019 | 0.4 | docker --version && docker compose version \|\| docker-compose --version |
| sleep | binary | 973 | 0.4 | sleep 3 && make exec-api CMD="cd /app && node --import tsx/esm tmp/docx_api_check.mjs" |
| ps | binary | 725 | 0.3 | ps -ef \| rg "make watch-run\|make recipe-run\|deces_dataprep" \| rg -v rg \|\| true |
| browser_snapshot | native_tool | 628 | 0.2 | {"depth":3} |
| view_image | native_tool | 621 | 0.2 | {"path":"/home/antoinefa/src/top-ai-ideas-fullstack/e2e/test-results/05-i18n-Internationalizati-7268c-glish-persists-... |
| ssh | binary | 559 | 0.2 | bash -lc 'set -a; . ./artifacts; set +a; ssh -i /home/antoinefa/.ssh/id_rsa_travis-matchid-tools -J ubuntu@bastion -o... |
| rm | binary | 545 | 0.2 | bash -lc 'set -e; rm -f recipe-run watch-run data-tag s3-pull; rm -f backend/log/*deces_dataprep*; export STORAGE_ACC... |
| npx | binary | 525 | 0.2 | cd api && npx drizzle-kit generate --help \| sed -n '1,200p' |
| mkdir | binary | 502 | 0.2 | bash -lc 'mkdir -p backend/esdata/node1 && make -C backend elasticsearch vm_max_count=true' |
| graphify | binary | 497 | 0.2 | bash -lc 'command -v graphify && graphify --help \| sed -n "1,80p"' |
| corepack | binary | 455 | 0.2 | corepack --version |
| date | binary | 431 | 0.2 | set -e <br> cd /home/antoinefa/src/matchID/deces-ui/deces-dataprep <br> TS=$(date +%Y%m%d-%H%M%S) <br> TRASH=.reset-trash-$TS <br> mkdir ... |
| kubectl | binary | 389 | 0.1 | kubectl cluster-info |
| browser_tabs | native_tool | 372 | 0.1 | {"action":"new"} |
| browser_evaluate | native_tool | 345 | 0.1 | {"function":"() => { const input = document.querySelector('input'); return { hasInput: !!input, inputName: input?.get... |
| cp | binary | 338 | 0.1 | set -e <br> cd /home/antoinefa/src/top-ai-ideas-fullstack/api/templates <br> rm -rf /tmp/docx_patch && mkdir -p /tmp/docx_patch... |
| browser_click | native_tool | 317 | 0.1 | {"ref":"e25","element":"Entities navigation button"} |
| mktemp | binary | 304 | 0.1 | tmp1=$(mktemp); tmp2=$(mktemp); git -C /home/antoinefa/src/top-ai-ideas-fullstack show feat/i18-print:api/src/service... |
| resume_agent | native_tool | 275 | 0.1 | {"id":"019c7dcb-f990-7142-a788-bfc7da8ac565"} |

| Month | Native Tools | Binaries | Total |
| --- | ---: | ---: | ---: |
| 2026-02 | 41234 | 38737 | 79971 |
| 2026-03 | 30962 | 33885 | 64847 |
| 2026-04 | 107090 | 95020 | 202110 |
| 2026-05 | 115415 | 94258 | 209673 |

## AGY

- Sessions: 2
- Tool calls: 0
- Binary calls: 0
- Prompts: 74
- First session: 2026-05-23T16:01:38.791Z
- Last session: 2026-05-24T03:19:03.230Z

> Antigravity transcripts are stored as encrypted .pb files; only session and prompt counts are extracted from `history.jsonl`. Tool calls and shell binaries are not extractable.

| Name | Type | Count | % | Example |
| --- | --- | ---: | ---: | --- |
| - | - | 0 | 0.0 | - |

| Month | Native Tools | Binaries | Total |
| --- | ---: | ---: | ---: |
| - | 0 | 0 | 0 |

## Binary Union

| Binary | Claude | Codex | Agy | Total |
| --- | ---: | ---: | ---: | ---: |
| sed | 361 | 81163 | 0 | 81524 |
| git | 5680 | 49946 | 0 | 55626 |
| rg | 102 | 31132 | 0 | 31234 |
| make | 1653 | 18460 | 0 | 20113 |
| head | 8868 | 3341 | 0 | 12209 |
| nl | 0 | 11311 | 0 | 11311 |
| gh | 1724 | 8416 | 0 | 10140 |
| bash | 161 | 8982 | 0 | 9143 |
| grep | 6895 | 1431 | 0 | 8326 |
| tail | 6806 | 1313 | 0 | 8119 |
| npm | 1472 | 4573 | 0 | 6045 |
| ls | 2605 | 3055 | 0 | 5660 |
| cat | 1735 | 2598 | 0 | 4333 |
| find | 728 | 3584 | 0 | 4312 |
| node | 300 | 3877 | 0 | 4177 |
| cargo | 1172 | 2254 | 0 | 3426 |
| curl | 546 | 2803 | 0 | 3349 |
| python | 4 | 2894 | 0 | 2898 |
| sort | 303 | 2447 | 0 | 2750 |
| wc | 786 | 1153 | 0 | 1939 |
| jq | 231 | 1706 | 0 | 1937 |
| sleep | 639 | 973 | 0 | 1612 |
| awk | 317 | 1199 | 0 | 1516 |
| docker | 417 | 1019 | 0 | 1436 |
| scw | 102 | 1161 | 0 | 1263 |
| ps | 127 | 725 | 0 | 852 |
| npx | 275 | 525 | 0 | 800 |
| rm | 198 | 545 | 0 | 743 |
| mkdir | 224 | 502 | 0 | 726 |
| python3 | 607 | 114 | 0 | 721 |
| date | 178 | 431 | 0 | 609 |
| corepack | 145 | 455 | 0 | 600 |
| ssh | 10 | 559 | 0 | 569 |
| kubectl | 176 | 389 | 0 | 565 |
| graphify | 5 | 497 | 0 | 502 |
| cp | 77 | 338 | 0 | 415 |
| gcloud | 98 | 256 | 0 | 354 |
| mktemp | 12 | 304 | 0 | 316 |
| pgrep | 173 | 129 | 0 | 302 |
| timeout | 75 | 204 | 0 | 279 |
| perl | 0 | 269 | 0 | 269 |
| sh | 0 | 226 | 0 | 226 |
| kill | 75 | 146 | 0 | 221 |
| diff | 22 | 192 | 0 | 214 |
| which | 76 | 126 | 0 | 202 |
| du | 30 | 153 | 0 | 183 |
| base64 | 71 | 107 | 0 | 178 |
| xargs | 99 | 65 | 0 | 164 |
| pkill | 44 | 109 | 0 | 153 |
| apply_patch | 0 | 145 | 0 | 145 |
| stat | 27 | 113 | 0 | 140 |
| tr | 27 | 109 | 0 | 136 |
| basename | 27 | 104 | 0 | 131 |
| codex | 26 | 98 | 0 | 124 |
| mv | 18 | 105 | 0 | 123 |
| tofu | 25 | 89 | 0 | 114 |
| chmod | 59 | 54 | 0 | 113 |
| rclone | 2 | 110 | 0 | 112 |
| uniq | 62 | 48 | 0 | 110 |
| cut | 49 | 56 | 0 | 105 |
