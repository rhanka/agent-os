# Handover Prompt For Claude

Tu reprends le travail dans `/home/antoinefa/src/agent-os`.

Objectif: terminer proprement la Wave 1A `Tool Inventory` du projet `agent-os`, puis produire un état de sortie clair. Le workspace n'est pas un repo Git valide aujourd'hui, donc ne propose pas de commit et n'utilise pas d'operations Git destructrices.

## Contexte Projet

Le projet vise a concevoir un OS minimal pour agents CLI (`Claude`, `Codex`, `Gemini`) avec une etude initiale en vagues:

- Wave 1A: inventaire des outils et binaires reellement utilises par les agents.
- Wave 1B: comparatif images/base OS.
- Wave 1C: spike V8 snapshot.

La Wave 1A a deja ete largement implementee. Elle remplace les anciens scripts ad hoc par un pipeline Node.js testable qui:

- lit les transcripts Claude depuis `~/.claude/projects/**/*.jsonl`
- lit les sessions Codex depuis `~/.codex/sessions/**/*.jsonl`
- lit les sessions Gemini depuis `~/.gemini/tmp/*/chats/session-*.jsonl`
- agrege les outils natifs et les binaires shell par agent et par mois
- genere un JSON complet et un Markdown resume

Plan de reference:

- `docs/superpowers/plans/2026-05-18-wave-1a-tool-inventory.md`

Fichiers principaux:

- `study/inventory/extract_binaries.mjs`
- `study/inventory/inventory_core.mjs`
- `study/inventory/parse_transcripts.mjs`
- `study/inventory/format_report.mjs`
- `study/inventory/README.md`
- `study/inventory/tests/extract-binaries.test.mjs`
- `study/inventory/tests/inventory-core.test.mjs`
- `study/inventory/tests/format-report.test.mjs`
- `study/inventory/tools_inventory.json`
- `study/inventory/tools_inventory.md`

## Etat Actuel Verifie

Derniere verification locale connue:

```bash
node --test study/inventory/tests/extract-binaries.test.mjs study/inventory/tests/inventory-core.test.mjs study/inventory/tests/format-report.test.mjs
```

Resultat: vert, `3` fichiers de tests passent.

Artefact courant:

- `study/inventory/tools_inventory.json`
- `generatedAt`: `2026-05-18T22:22:22.445Z`
- sources: Claude `442`, Codex `1733`, Gemini `7`

Resume courant:

- Claude: `442` sessions, `30248` tool calls, `33431` binary calls, `258` items
- Codex: `1733` sessions, `273225` tool calls, `245483` binary calls, `661` items
- Gemini: `7` sessions, `191` tool calls, `127` binary calls, `37` items

Le parseur `node study/inventory/parse_transcripts.mjs` emet des warnings connus sur quelques lignes JSONL mal formees dans les historiques Claude/Codex. Ce n'est pas bloquant si le script termine et ecrit `tools_inventory.json`.

## Corrections Deja Faites

L'extracteur shell a deja ete durci contre plusieurs faux positifs:

- mots-cles shell (`if`, `then`, `do`, `done`, `for`, `fi`, etc.)
- fragments d'options (`-C`, `-sS`, `-ic`)
- substitutions `$(...)`
- `command -v` et `command -V`, qui inspectent sans executer
- `exec -a`, dont l'alias ne doit pas etre compte comme binaire
- corps heredoc dans les substitutions
- definitions de fonctions shell, ex. `run() { ... }`
- scripts passes a `bash -lc`, avec conservation de `bash` et extraction du vrai script interne
- heredocs dans `bash -lc`, y compris les delimiters quotes du type `'"'"'NODE'"'"'`
- substitutions echappees `\$(...)` dans les scripts `bash -lc`

Ces cas ont des regressions dans `study/inventory/tests/extract-binaries.test.mjs`.

## Probleme Restant A Traiter

Il reste un residuel d'integrite dans `tools_inventory.json`: des identifiants de code JavaScript/TypeScript sont encore comptes comme binaires dans certains scripts inline.

Exemples observes dans le JSON courant:

```bash
rg -n '"name": "(const|NODE)"' study/inventory/tools_inventory.json
```

Sorties observees:

- `const` reste present dans la section Codex
- `NODE` reste present dans la section Codex

Les anciens faux positifs `run`, `auth`, `tool_execute`, `tool_permission` ne ressortent plus dans ce controle cible apres les derniers correctifs.

### Reproductions Utiles

Cas heredoc mal termine ou delimiter suffixe:

```js
import { extractBinaries } from './study/inventory/extract_binaries.mjs';

const command = [
  "test -f .env && node - <<'NODE'",
  "const fs=require('fs');",
  "const names=[];",
  "NODE || true",
].join('\n');

console.log(extractBinaries(command));
```

Comportement actuel observe: `["node", "const", "NODE"]`

Comportement attendu pour l'inventaire: ne pas compter le code JS ni le delimiter comme binaires. Le minimum acceptable est `["node"]`. Ne compte pas `true` ici: dans ce shell mal forme, `NODE || true` n'est pas un terminator valide du heredoc et ne s'execute pas comme commande separee.

Cas scripts `node -e` / `tsx -e` imbriques dans `bash -lc` ou `docker exec`:

Des commandes historiques ressemblent a:

```bash
bash -lc "docker exec dev-api-1 npx tsx -e \"import { resolveConnectedCodexRuntimeCredential } from './src/services/provider-connections.ts'; (async () => { const userId='...'; const cred=await resolveConnectedCodexRuntimeCredential(userId); console.log(JSON.stringify(cred)); })();\""
```

Le bug a corriger n'est pas forcement de detecter parfaitement les commandes imbriquees dans `docker exec`; le point bloquant est de ne plus emettre des mots JS/TS (`async`, `const`, `console.log`, etc.) comme binaires.

Pour retrouver les commandes brutes qui declenchent encore `const`/`NODE`, tu peux utiliser ce script de diagnostic:

```bash
node - <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { extractBinaries } from './study/inventory/extract_binaries.mjs';

const root = path.join(os.homedir(), '.codex', 'sessions');
const matches = [];

function candidateCommands(obj) {
  const commands = [];
  if (obj?.payload?.type === 'function_call' && obj?.payload?.arguments) {
    try {
      const args = typeof obj.payload.arguments === 'string' ? JSON.parse(obj.payload.arguments) : obj.payload.arguments;
      if (typeof args?.cmd === 'string') commands.push(args.cmd);
      if (typeof args?.command === 'string') commands.push(args.command);
    } catch {}
  }
  return commands;
}

async function scanFile(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let lineNo = 0;
  try {
    for await (const line of rl) {
      lineNo += 1;
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      for (const command of candidateCommands(obj)) {
        const bins = extractBinaries(command);
        if (bins.includes('const') || bins.includes('NODE')) {
          matches.push({ file, line: lineNo, bins, command: command.slice(0, 1000) });
          if (matches.length >= 8) return true;
        }
      }
    }
  } finally {
    rl.close();
  }
  return false;
}

async function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (await walk(full)) return true;
    } else if (entry.isFile() && full.endsWith('.jsonl')) {
      if (await scanFile(full)) return true;
    }
  }
  return false;
}

await walk(root);
console.log(JSON.stringify(matches, null, 2));
NODE
```

## Travail Attendu

1. Lire l'etat courant de `study/inventory/extract_binaries.mjs` et `study/inventory/tests/extract-binaries.test.mjs`.
2. Ajouter d'abord des tests rouges, au minimum pour:
   - heredoc mal termine avec `NODE || true`, attendu `["node"]`
   - script inline JS/TS passe via `node -e` ou `npx tsx -e`, attendu: aucun identifiant JS/TS (`const`, `async`, `console.log`) dans la sortie
3. Corriger `extract_binaries.mjs` de facon etroite.
4. Relancer:

```bash
node --test study/inventory/tests/extract-binaries.test.mjs
node --test study/inventory/tests/extract-binaries.test.mjs study/inventory/tests/inventory-core.test.mjs study/inventory/tests/format-report.test.mjs
```

5. Regenerer les artefacts:

```bash
node study/inventory/parse_transcripts.mjs
node study/inventory/format_report.mjs
```

6. Verifier que les faux positifs residuels sont partis ou documenter exactement pourquoi ils restent:

```bash
rg -n '"name": "(const|NODE|async|console\\.log)"' study/inventory/tools_inventory.json
rg -n '\| (const|NODE|async|console\.log) \|' study/inventory/tools_inventory.md
```

7. Faire une revue finale de l'ensemble de la Wave 1A:
   - pas de faux binaires evidents dans le JSON
   - Markdown annonce bien qu'il est un resume top-N et que le JSON est exhaustif
   - README coherent avec les commandes reelles
   - tests verts

## Contraintes

- Ne pas reinitialiser ou convertir le dossier en repo Git sans demande utilisateur.
- Ne pas supprimer les anciens artefacts `inventory_first_run.json` et `report_first_run.txt`; ils servent de baseline historique.
- Ne pas elargir le scope a Wave 1B/1C.
- Ne pas masquer arbitrairement des noms dans `tools_inventory.json` apres generation; corriger l'extracteur ou documenter le residuel.
- Le Markdown est volontairement un resume top-N; le JSON est la source complete.

## Reporting Attendu En Sortie

Repondre en francais avec:

- `Fait`: fichiers modifies, corrections posees, artefacts regeneres
- `Verification`: commandes lancees et resultats
- `Residuel`: risques restants ou absence de risque bloquant
- `Suite`: prochaine action recommandee, probablement Wave 1B si Wave 1A est signee

