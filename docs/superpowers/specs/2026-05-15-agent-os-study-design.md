# Agent OS — Phase d'étude (design)

**Date** : 2026-05-15
**Statut** : design validé en brainstorming complet (intentions + 15 décisions de design en Q/R explicite), prêt à transition vers plan d'implémentation
**Auteur** : Claude (sous direction de fabien.antoine@gmail.com)

## 1. Contexte

L'utilisateur veut un OS pour exécuter ses agents IA (Claude Code, Codex, Gemini CLI) qui soit **minimal** au sens multi-objectif (peu de composants embarqués, faible taille image, faible compte de CVEs, faible empreinte runtime) et boote vite (ordre de grandeur 2-3s warm-cached, pas un contrat dur).

Il est prêt à recoder du shell ou des coreutils si ça permet de gagner, mais ne forkera pas les CLIs agent eux-mêmes. NixOS a été cité comme exemple parmi d'autres, pas comme préférence stricte.

Une analyse préliminaire de **231 sessions Claude Code + 1506 sessions Codex** (12 mars → 15 mai 2026) a déjà été effectuée pour informer ce design. Voir `study/inventory/` à la racine du repo.

## 2. Objectifs & non-objectifs

### Objectifs
- Produire les artefacts permettant de **construire ensuite** 3 images OCI distinctes (claude / codex / gemini) qui :
  - bootent en ~2-3s warm-cached sur K8s (ordre de grandeur, négociable)
  - exposent une surface minimale au sens multi-objectif
  - n'embarquent que les outils utilisés par leur CLI cible
- Investiguer **V8 snapshot / mksnapshot dès la phase d'étude** comme axe d'optimisation startup (pas seulement contingence)
- Valider l'atteignabilité fonctionnelle par une tâche agent end-to-end exécutée

### Non-objectifs
- MicroVM Firecracker (autre projet)
- Multi-architecture (amd64 only ; arm64 explicitement reporté)
- Build de l'image de prod (cette phase produit étude + POC, pas l'image finale)
- Fork des CLIs agent (Claude/Codex/Gemini pris tels quels via npm/release officielle)

## 3. Décisions verrouillées en brainstorming

| # | Décision | Choix |
|---|---|---|
| 1 | Modèle d'exécution | Conteneur sur kernel hôte (K8s), pas microVM |
| 2 | Nombre d'images | 3 séparées (claude, codex, gemini) |
| 3 | Stratégie d'outillage | Taillé par CLI selon transcripts |
| 4 | Python | Inclus (3k invocations Codex documentées) |
| 5 | Code projet de l'agent | Volume monté, pas dans l'image |
| 6 | Critère de fin de phase | Document décision + POC + tâche e2e exécutée |
| 7 | Architecture | amd64 |
| 8 | Sens de "minimal" | Multi-objectif : surface + taille + CVE + RSS |
| 9 | Arbitrage si conflit | **Sécurité (CVE) prime sur tout** |
| 10 | Boot 2-3s | Ordre de grandeur cible, pas contrat dur |
| 11 | Recoder ciblé | OK pour shell/coreutils, **pas** pour CLIs agent |
| 12 | Shell stack | **BusyBox** (coreutils) + **bash standard** en parallèle |
| 13 | V8 snapshot | Investigué **dès la phase d'étude**, pas seulement contingence |
| 14 | Outils trace | strace + bpftrace + ltrace |
| 15 | Scanner CVE | **Trivy + Semgrep** (alignement stack sentropic) |
| 16 | Pré-cache K8s | DaemonSet image-puller |
| 17 | Repo test e2e | Mini projet Node.js synthétique |
| 18 | Sessions Gemini | 10-20 sessions synthétiques (refactor/debug/doc/test) |
| 19 | Runs benchmark boot | 10 runs, médiane + p95 |
| 20 | Auth API LLM | K8s Secret + env vars (`ANTHROPIC_API_KEY`, etc.) |
| 21 | Granularité parser | Par mois |
| 22 | Tâche e2e | "Lit src/index.js, écrit docs/api.md, fait un git commit" |

## 4. Approche : vagues séquentielles avec parallélisation interne et 2 checkpoints

```
   ┌──── Vague 1 (parallèle) ─────────┐
   │  1A: Inventaire transcripts      │
   │  1B: Étude comparative images    │
   │  1C: Spike V8 snapshot           │
   └──────────────┬───────────────────┘
                  ▼
            CHECKPOINT 1
       (shortlist outils par CLI,
        2-3 bases d'image candidates,
        verdict spike V8)
                  │
   ┌──── Vague 2 (parallèle) ─────────┐
   │  2A: Trace syscall/files/net     │
   │  2B: Benchmark boot              │
   └──────────────┬───────────────────┘
                  ▼
            CHECKPOINT 2
       (base retenue par CLI,
        liste outils gelée,
        stratégie boot finale)
                  │
   ┌──── Vague 3 ──────────────────────┐
   │  POC 3 images + tâche e2e         │
   └───────────────────────────────────┘
```

## 5. Vague 1 — Inventaire + Comparatif images + Spike V8 (parallèle)

### 5.1 Volet 1A — Inventaire des outils via transcripts

**Statut** : exécuté en pré-étude pour Claude + Codex (voir `study/inventory/`). À nettoyer et compléter par Gemini.

**Sources** :
- Claude : `~/.claude/projects/**/*.jsonl` (231 fichiers)
- Codex : `~/.codex/sessions/**/*.jsonl` (1506 fichiers) + `~/.codex/history.jsonl`
- Gemini : 10-20 sessions synthétiques couvrant : refactor, debug, doc, test (à exécuter manuellement ou via script automatisé)

**Méthode** : parser Node.js (`study/inventory/parse_transcripts.mjs`) qui extrait :
- Tools natifs invoqués
- Pour chaque commande shell : binaire racine via parsing structurel (split sur `|`, `&&`, `;`, `$()`, ` ` ; strip env assignments + sudo/time/exec)
- Comptage par CLI, par binaire, **agrégation par mois** (pour identifier évolutions d'usage)
- Filtres anti-bruit conservateurs (mots-clés shell, JS embedded)

**Sortie** :
- `study/inventory/tools_inventory.json` (machine-readable, par CLI : `[{name, type, count, pct, by_month, examples}]`)
- `study/inventory/tools_inventory.md` (human-readable : top 50 par CLI, tableau d'union, évolutions mensuelles)

### 5.2 Volet 1B — Étude comparative bases d'image

**Bases candidates** (priorisées CVE-first vu décision §3-9) :
1. `cgr.dev/chainguard/node` (Wolfi, glibc, **0-CVE policy**, signed, SBOM auto)
2. `gcr.io/distroless/nodejs22-debian12` (Google Distroless, glibc, surface mini, updates lents)
3. NixOS minimal layered (`pkgs.dockerTools.buildLayeredImage`, reproductibilité bit-à-bit)
4. `node:22-alpine` (musl, plus petit mais risque modules natifs npm)

**Référence baseline** : `node:22-slim` (Debian slim) pour comparaison.

**Critères évalués** (alignés sur "minimal multi-objectif") :
- **CVE actifs** au scan Trivy (base + après ajout outils Tier 1) — critère prioritaire
- Nombre de composants embarqués (binaires, libs, paquets)
- Taille extraite + compressée
- Présence/absence shell, package manager, libc (musl vs glibc)
- Reproductibilité du build (digest stable d'un run à l'autre)
- Compatibilité modules natifs npm (test sur node-pty, embarqué par les 3 CLIs)
- Maintenabilité (cadence releases, fournisseur, signed releases, SBOM)

**Sortie** : `study/comparison/image_bases_compare.md` avec tableau récapitulatif + recommandation préliminaire de 2-3 bases pour Vague 2.

### 5.3 Volet 1C — Spike V8 snapshot (en parallèle)

**Statut** : nouveau, vu décision §3-13.

**But** : évaluer la faisabilité et le gain potentiel de `V8 snapshot` (`mksnapshot`, `--snapshot-blob`) pour réduire le cold start des CLIs.

**Méthode** :
- Lire la doc Node.js + V8 sur les snapshots utilisateur (`v8.startupSnapshot` API, expérimental Node 18+)
- Mesurer cold start `node --snapshot-blob=path.blob ...` vs vanilla `node ...` sur un script représentatif
- Tester si on peut snapshotter directement le bundle Claude/Codex/Gemini (probablement non sans patch, mais à vérifier)
- Alternatives à investiguer : **Single Executable Applications** (Node SEA, stable depuis 21), **bytenode** (compilation bytecode)

**Sortie** : `study/v8_snapshot/spike_report.md` avec :
- Faisabilité par CLI (snapshot direct possible ? patch requis ? bundling à refaire ?)
- Gain mesuré sur cas de test
- Verdict : intégrer dans Vague 3 ? Reporter ? Abandonner ?

## 6. Checkpoint 1

**Inputs** : sorties de 1A, 1B, 1C.

**Décisions à trancher** :
1. Liste **must-have** d'outils par CLI (seuils : "fréquence absolue" + "criticité même rare comme git")
2. Liste **nice-to-have** mise dans variante optionnelle ou ignorée
3. **2-3 bases d'image** candidates retenues pour Vague 2 — **Chainguard candidat probable** vu décision CVE-first
4. **musl vs glibc** tranché
5. **V8 snapshot intégré au POC** ou pas, selon verdict 1C
6. **BusyBox** confirmé comme source coreutils, **bash standard** en parallèle (cf §3-12)

**Format** : `study/checkpoint_1.md`, court, signé en validation par utilisateur avant Vague 2.

## 7. Vague 2 — Trace système + Benchmark boot (parallèle)

### 7.1 Volet 2A — Trace de surface système (live)

**Outils** (décision §3-14) :
- `strace -f -e trace=all -o trace.log <cli> <task>` pour syscalls exhaustifs
- `bpftrace` pour `openat()` (paths touchés), `connect/sendto` (réseau), `execve` (fork/exec)
- `ltrace -f` pour libs dynamiques chargées (utile pour évaluer static linking)

**Scénarios** (3 par CLI) :
1. `cli --version` (cold start pur)
2. Prompt simple `cli "list files in cwd"` (warm-up tool surface)
3. Tâche e2e (cf §9.2) — réutilise le scénario final

**Sortie** :
- `study/syscall/syscall_surface_<cli>.md` par CLI (synthèse)
- `study/syscall/traces/` raw traces
- Inventaire **paths fichiers touchés** (utile pour minimiser le rootfs)
- Inventaire **endpoints réseau** (utile pour NetworkPolicy K8s)

### 7.2 Volet 2B — Benchmark baseline boot

**Matrice** : 3 CLIs × N bases retenues au checkpoint 1 (typiquement 3) = ~9 combinaisons. Pour chaque, on construit l'image avec outils taillés (sortie checkpoint 1) et on mesure :

| Métrique | Méthode |
|---|---|
| Boot cold uncached | `time docker create + start` après `docker rmi && docker pull` |
| Boot warm cached | `time docker create + start` (image déjà pull) — **KPI principal** |
| `cli --version` à l'intérieur | Mesuré séparément, isole startup CLI |
| Mémoire RSS au démarrage | `docker stats` ou `cgroup memory.current` |
| Taille extraite + compressée | `docker image inspect` + `docker save \| wc -c` |
| CVE count (Trivy + Semgrep) | Scan post-build |

**10 runs par mesure** (décision §3-19), on rapporte **médiane + p95**.

**Sortie** : `study/benchmark/boot_baseline.md` + raw_data CSV.

## 8. Checkpoint 2

**Inputs** : sorties 2A + 2B.

**Décisions à trancher** :
1. **Base d'image retenue par CLI** (peut être différente entre les 3 si justifié — arbitrage **CVE-first** selon §3-9)
2. **Boot wall-clock observé** vs cible 2-3s warm-cached. Si écart significatif (>5s) : enclencher plan B (V8 snapshot si pas déjà actif, pre-warmed pod pool, ou révision du KPI — souvenir : c'est un ordre de grandeur, pas un contrat dur)
3. **Liste finale des outils** par image (gel)
4. **Stratégie de pré-cache K8s** : DaemonSet image-puller confirmé (§3-16), mais ajustements possibles (nodeAffinity etc.)

**Format** : `study/checkpoint_2.md`, signé en validation par utilisateur avant Vague 3.

## 9. Vague 3 — POC + tâche end-to-end

### 9.1 Structure

```
study/poc/
├── claude/
│   ├── Dockerfile
│   └── README.md
├── codex/
│   ├── Dockerfile
│   └── README.md
├── gemini/
│   ├── Dockerfile
│   └── README.md
├── e2e/
│   ├── workspace/             # repo de test mini, monté en volume
│   │   ├── README.md
│   │   ├── package.json
│   │   ├── src/index.js       # 3-5 fonctions à documenter
│   │   └── .git/
│   ├── task-claude.sh         # wrapper qui lance Claude avec le prompt
│   ├── task-codex.sh
│   ├── task-gemini.sh
│   └── assertions.sh          # vérif post-tâche (commit existe, docs/api.md créé, etc.)
├── bench/
│   └── measure.sh             # script de chronométrage reproductible
└── k8s/
    ├── pod-template.yaml
    └── image-prepull-ds.yaml  # DaemonSet pour pré-cacher
```

### 9.2 Tâche e2e (identique pour les 3 CLIs, décision §3-22)

**Repo de test** : mini projet Node.js synthétique (README + 3-5 fonctions exportées dans `src/index.js` + `package.json` + `.git` initialisé). Décision §3-17.

**Prompt** :
> *Lis `src/index.js`, écris un fichier `docs/api.md` avec la documentation des fonctions exportées (signature, brève description, exemple d'appel), puis fais un git commit avec un message clair décrivant ce qui a été ajouté.*

**Pourquoi ce prompt** :
- Exerce Read, Write, Bash (`git add` + `git commit`), navigation arborescence
- Mesurable objectivement : commit existe ou pas, fichier `docs/api.md` créé ou pas, contenu raisonnable
- Ne demande pas de réseau externe sauf appel API LLM

**Authentification API LLM dans le pod** (décision §3-20) : clés API montées via `Secret` Kubernetes en variables d'environnement (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`). Pas de secret dans l'image. Pas d'auth interactive.

### 9.3 Mesures e2e

Pour chaque CLI :
1. Temps wall-clock entre `kubectl run agent-pod` et CLI ready (prompt accepté)
2. Temps CLI ready → commit fait
3. RSS pic du process pendant la tâche
4. Liste des binaires effectivement invoqués pendant la tâche (validation a posteriori du tailoring outils)
5. **Couverture CVE** : Trivy (container scan, format JSON) + Semgrep (SAST sur les Dockerfile et scripts shell) — alignement stack sentropic

**Sortie** : `study/poc/results.md` avec tableau récapitulatif + verdict (objectif atteint / partiel / non).

## 10. Livrables finaux de la phase d'étude

| Livrable | Chemin | Format |
|---|---|---|
| Inventaire outils par CLI | `study/inventory/tools_inventory.{json,md}` | Doc + JSON |
| Comparatif bases d'image | `study/comparison/image_bases_compare.md` | Doc |
| Spike V8 snapshot | `study/v8_snapshot/spike_report.md` | Doc |
| Surface syscall par CLI | `study/syscall/syscall_surface_<cli>.md` + `traces/` | Doc + raw |
| Benchmark baseline boot | `study/benchmark/boot_baseline.md` + `raw_data/*.csv` | Doc + CSV |
| Checkpoint 1 | `study/checkpoint_1.md` | Doc |
| Checkpoint 2 | `study/checkpoint_2.md` | Doc |
| Document de décision final | `study/decision.md` | Doc |
| POC 3 images | `study/poc/{claude,codex,gemini}/Dockerfile` | Code |
| POC tâche e2e | `study/poc/e2e/` | Code |
| Résultats POC | `study/poc/results.md` | Doc |

## 11. Risques & hypothèses

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Boot >5s même warm-cached après V8 snapshot | Moyenne | Modéré (c'est un ordre de grandeur) | Pre-warmed pod pool, ou acceptation du compromis |
| Bundle CLI change à chaque release et casse l'image | Élevée | Moyen | CI quotidien rebuild + smoke test e2e |
| Codex évolue et utilise un binaire absent | Moyenne | Moyen | Tests d'intégration sur top-50 binaires + monitoring K8s sur `command not found` |
| Modules natifs npm cassent sur Alpine (musl) | Élevée si Alpine retenu | Moyen | Privilégier glibc (Chainguard, Distroless) ; Alpine seulement si tests OK |
| Surface CVE explose via dep transitive d'un CLI | Moyenne | Moyen | Trivy continu + alerting ; SBOM Chainguard auto |
| Sessions Gemini synthétiques non représentatives | Moyenne | Moyen | Itération : compléter avec sessions réelles dès que disponibles ; cross-check avec strace en Vague 2 |
| V8 snapshot infaisable sans patcher les bundles | Élevée | Faible (fallback SEA / bytenode / status quo) | Spike 1C tranche tôt |
| Parser transcripts mal-classe certains binaires (JS embedded) | Confirmée | Faible | Filtres conservateurs + revue manuelle top-50 |
| BusyBox ash incompatible avec script bash explicite | Faible (bash en parallèle) | Faible | bash standard installé en parallèle (§3-12) |

**Hypothèses** :
- Les 3 CLIs continuent d'être distribuées comme bundles npm (ou équivalent installable hors-OS)
- L'API LLM reste accessible depuis K8s avec auth standard
- Les nodes K8s cibles ont accès à un registry image performant
- L'utilisateur garde la main sur les versions des CLIs (pas d'auto-update silencieux)
- La stack sécurité sentropic (Trivy + Semgrep) est stable et réutilisable telle quelle

## 12. Annexe — Données préliminaires (extrait de `study/inventory/`)

### 12.1 Volume analysé
- Claude : 231 sessions (12 mars → 15 mai 2026), 15 298 tool calls, 23 222 invocations shell (101/session)
- Codex : 1506 sessions (7 fév → 15 mai 2026), 253 255 tool calls, 360 516 invocations shell (239/session)
- Gemini : 0 (à compléter en Vague 1 via 10-20 sessions synthétiques)

### 12.2 Top tools natifs

**Claude** : Bash 51% · Read 18% · Edit 13% · Write 4% · Task* 6% · WebFetch 1.4% · Agent 1.2% · Grep 0.5%
**Codex** : exec_command 74% · write_stdin 21% · update_plan 1% · spawn_agent 0.7% · browser_* 0.4%

### 12.3 Top binaires (extrait UNION, données brutes)

| Binaire | Total | Claude | Codex | Note |
|---|---|---|---|---|
| sed | 71 161 | 77 | 71 084 | Codex lit code via sed |
| git | 42 868 | 1 747 | 41 121 | Universel |
| rg | 27 295 | 96 | 27 199 | Codex préfère ripgrep |
| make | 17 508 | 699 | 16 809 | Build systems |
| nl | 9 607 | 0 | 9 607 | Codex (numérotation lignes) |
| bash | 8 809 | 91 | 8 718 | Pas juste sh — justifie §3-12 |
| gh | 6 587 | 419 | 6 168 | GitHub CLI |
| head | 5 810 | 2 592 | 3 218 | coreutils |
| npm | 4 152 | 351 | 3 801 | Node.js |
| grep | 3 687 | 2 148 | 1 539 | coreutils |
| ls | 3 441 | 849 | 2 592 | coreutils |
| node | 3 283 | 111 | 3 172 | Runtime |
| python | 2 709 | 2 | 2 707 | Codex only — justifie §3-4 |
| cargo | 2 503 | 502 | 2 001 | Rust |
| curl | 2 274 | 93 | 2 181 | HTTP |
| jq | 1 483 | 75 | 1 408 | JSON |
| docker | 1 400 | 277 | 1 123 | Containers |
| ssh | 469 | 0 | 469 | Codex only |
| kubectl | 58 | 58 | 0 | Claude only |

### 12.4 Tailles mesurées (composants principaux)

| Composant | Taille extraite |
|---|---|
| `/usr/bin/node` | 119 MB |
| Claude Code 2.1.142 | 222 MB |
| Codex 0.130.0 | 215 MB |
| Gemini CLI 0.41.2 | 181 MB |
| Tous outils Tier 1+2 (git, rg, jq, gh, curl, bash, coreutils, sed, awk, find, make, ssh, docker CLI) | ~105 MB |
| Python3 + stdlib | ~50 MB |

→ Ordre de grandeur réaliste image complète : **~500-900 MB extrait / 200-360 MB compressé** par CLI.

→ La taille n'est pas le levier principal pour l'objectif boot 2-3s : c'est le **caching warm sur les nodes K8s** (§3-16) qui le rend atteignable. Stratégie de pré-cache obligatoire.
