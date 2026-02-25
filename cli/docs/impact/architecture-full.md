---
jrn: MKYZPUMWUW2Q13QM
attention:
  - op: file
    path: cli/src/client/commands/impact/AuditTrail.ts
  - op: file
    path: cli/src/client/commands/impact/DiffUtils.ts
  - op: file
    path: backend/src/model/CollabConvo.ts
---
# DCIA Full Architecture

**Documentation Change Impact Analysis** - Complete technical specification.

> For a quick overview, see [README.md](./README.md).

---

## 1. Problem Statement

You have:
- A set of documentation articles (with **explicit** references: symbols, flags, config keys, endpoints, file paths; and **implicit** references: "the token refresh flow", "the scheduler semantics")
- A codebase that has changed since docs were last updated
- A full git diff (and optionally git history)

You want:
- A ranked, explainable list of **docs to update**
- Evidence for why each doc is flagged
- Optional CI integration (fail builds, create tickets, notify owners)

---

## 2. Design Principles

1. **Two channels, two strengths**
   - **Push (Percolation)** for **explicit anchors** ⇒ high precision, deterministic evidence
   - **Pull (Retrieval)** for **implicit coupling** ⇒ higher recall via lexical + semantic similarity

2. **Atomic change units**
   - Convert diffs/commits into **Change Atoms**: small, doc-relevant statements

3. **Docs as the unit of update (current)**
   - Treat each doc file as a single unit; section-level granularity is planned later

4. **Explainability is a feature**
   - Every flagged doc shows: which anchor matched, which diff hunk, score breakdown

5. **LLMs adjudicate; they don't search**
   - LLMs only triage/refine decisions within a bounded candidate set

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OFFLINE: Indexing                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌────────────────┐    ┌─────────────────────────────────┐ │
│  │   Docs   │───▶│   Doc Parsing  │───▶│  Anchor Extraction              │ │
│  │   Repo   │    │  (whole file)  │    │  (attention frontmatter)        │ │
│  └──────────┘    └────────────────┘    └─────────────┬───────────────────┘ │
│                                                      │                      │
│                         ┌────────────────────────────┼────────────────┐    │
│                         ▼                            ▼                ▼    │
│                  ┌────────────┐             ┌────────────┐    ┌──────────┐ │
│                  │  Attention │             │    BM25    │    │  Vector  │ │
│                  │   Index    │             │   Index    │    │  Index   │ │
│                  │  (Phase 1) │             │ (Phase 2)  │    │(Phase 2) │ │
│                  └────────────┘             └────────────┘    └──────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           ONLINE: Impact Analysis                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌────────────────┐    ┌─────────────────────────────────┐ │
│  │   Git    │───▶│ Diff Segment-  │───▶│   Change Atom Extraction        │ │
│  │   Diff   │    │ ation          │    │   (rule-based + optional LLM)   │ │
│  └──────────┘    └────────────────┘    └─────────────┬───────────────────┘ │
│                                                      │                      │
│                    ┌─────────────────────────────────┴─────────────────┐   │
│                    ▼                                                   ▼   │
│          ┌─────────────────┐                              ┌──────────────┐ │
│          │   PUSH Channel  │                              │ PULL Channel │ │
│          │ (Attention Match)│                              │ (Retrieval)  │ │
│          │    Phase 1      │                              │   Phase 2    │ │
│          └────────┬────────┘                              └──────┬───────┘ │
│                   │                                              │         │
│                   └──────────────────┬───────────────────────────┘         │
│                                      ▼                                     │
│                            ┌─────────────────┐                             │
│                            │  Score Fusion   │                             │
│                            │  + Bucketing    │                             │
│                            └────────┬────────┘                             │
│                                     ▼                                      │
│                  ┌──────────┬───────────────┬────────────┐                │
│                  ▼          ▼               ▼            ▼                │
│            ┌─────────┐ ┌─────────┐    ┌───────────┐ ┌─────────┐          │
│            │  Must   │ │ Review  │───▶│ LLM Triage│ │Probably │          │
│            │ Update  │ │         │    │ (optional)│ │   OK    │          │
│            └─────────┘ └─────────┘    └───────────┘ └─────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Core Entities & Schemas

### 4.1 DocDocument (index unit)

```typescript
interface DocDocument {
  docId: string;              // jrn from frontmatter
  path: string;               // docs/auth.md
  title: string;              // Doc title (H1 or filename)
  bodyText: string;           // Normalized text
  codeBlocks: string[];       // Extracted fenced blocks

  // Phase 1: Explicit dependencies
  attention?: AttentionRule[];

  // Phase 2: For retrieval
  embedding?: number[];       // Vector for semantic search

  // Metadata
  owners?: string[];          // CODEOWNERS mapping
  lastUpdated?: string;       // ISO timestamp
}
```

### 4.2 AttentionRule (Phase 1)

Currently only `file` operations are supported. See [future.md](./future.md) for planned operations.

```typescript
interface AttentionFileRule {
  op: 'file';
  path: string;               // File path or glob pattern
  keywords?: string[];        // Optional boost terms
}
```

### 4.3 ChangeAtom (analysis unit)

```typescript
interface ChangeAtom {
  atomId: string;             // commit+segment+ordinal
  changeKind: ChangeKind;
  publicSurface: boolean | 'unknown';
  surfaceTypes: SurfaceType[];

  anchors: {
    symbols: string[];
    paths: string[];
    cliFlags: string[];
    configKeys: string[];
    endpoints: string[];
    schemaFields: string[];
  };

  retrievalText: string;      // 2-3 sentences with anchors verbatim
  softTerms: string[];        // Split/normalized anchor terms

  evidence: Array<{
    path: string;
    hunkHeader: string;
    notes?: string;
  }>;

  risk: 'high' | 'medium' | 'low' | 'unknown';
}

type ChangeKind =
  | 'add' | 'remove' | 'rename'
  | 'signature_change' | 'default_change'
  | 'behavior_change' | 'output_change'
  | 'schema_change' | 'refactor' | 'unknown';

type SurfaceType =
  | 'API' | 'CLI' | 'Config'
  | 'Schema' | 'Output' | 'Behavior' | 'Internal';
```

---

## 5. Phase 1: Push (High Precision)

See [phase1-push.md](./phase1-push.md) for implementation details.

### 5.1 Attention Frontmatter

Docs declare explicit file dependencies:

```yaml
---
jrn: AUTH_GUIDE_001
attention:
  - op: file
    path: src/auth/**/*.ts
  - op: file
    path: backend/src/router/AuthRouter.ts
---
```

### 5.2 Inverted Index

Build mapping from file patterns → doc IDs:

```
exact:backend/src/router/AuthRouter.ts → [DOC_001]
glob:src/auth/**/*.ts                  → [DOC_001, DOC_042]
```

### 5.3 Matching

1. Extract changed file paths from git diff
2. Normalize paths (repo-relative, POSIX separators)
3. For renames, match both old and new paths
4. Look up in inverted index (exact + glob matching)
5. Return matched docs with evidence

---

## 6. Phase 2: Pull (High Recall)

See [phase2-pull.md](./phase2-pull.md) for implementation details.

### 6.1 Doc Indexing

- **Lexical (BM25)** over title + body_text + code_blocks
- **Vector (ANN)** over embedding of same fields

### 6.2 Retrieval

For each ChangeAtom:
1. BM25 search on retrieval_text + anchors + soft_terms
2. Vector search on embedding(retrieval_text)
3. Union top-K results, de-dup by doc_id

### 6.3 Score Boosters

- Anchor overlap between atom and doc
- Co-change prior (historical correlation)
- Title match boost

---

## 7. Score Fusion & Bucketing

### 7.1 Pair Scoring

For each (DocDocument, ChangeAtom) pair:

```
S(u,a) = sigmoid(
  w_exp * f_explicit +
  w_anch * f_anchor_overlap +
  w_lex * f_bm25 +
  w_sem * f_semantic +
  w_co * f_cochange +
  w_risk * f_risk_boost
)
```

Default weights:
- `w_exp = 1.0` (Phase 1 match)
- `w_anch = 0.3`
- `w_lex = 0.2`
- `w_sem = 0.2`
- `w_co = 0.1`
- `w_risk = 0.2`

### 7.2 Bucketing

| Bucket | Condition | Action |
|--------|-----------|--------|
| **Must Update** | Explicit high-risk match OR S >= 0.85 | Block PR / Create ticket |
| **Review** | 0.55 <= S < 0.85 | Human review |
| **Probably OK** | S < 0.55 | No action needed |

### 7.3 Evidence Payload

Each flagged doc includes:
- Matched anchors (exact strings)
- ChangeAtom title, change_kind, retrieval_text
- Diff hunk pointers (path, @@ ... @@)
- Score breakdown

---

## 8. Optional LLM Triage

Only for **Review** bucket items.

### Inputs (strictly bounded)
- Doc text
- Top-N matching change atoms (N ≤ 3)
- Exact diff hunks from evidence

### Outputs
- `needsUpdate: yes | no | uncertain`
- `updateType`: rename, signature, behavior, example, output
- `editSuggestions`: bullet list
- `confidence`: 0-1

**Important**: LLM does NOT discover new candidates.

---

## 9. CLI Commands

```bash
# Extract changesets from git diff
jolli impact extract
jolli impact extract --base=develop
jolli impact extract --uncommitted
jolli impact extract --json
jolli impact extract --prompt

# Search for impacted docs (Phase 1+2)
jolli impact search
jolli impact search --explicit-only    # Phase 1 only
jolli impact search --docs=./docs
jolli impact search --json

# Apply updates (future)
jolli impact update
```

---

## 10. File Structure

```
cli/src/client/commands/impact/
├── Types.ts                    # All type definitions
├── GitDiffParser.ts            # Git operations & diff parsing
├── GitDiffParser.test.ts
│
│ # Phase 1: Push
├── AttentionParser.ts          # Parse attention frontmatter
├── AttentionParser.test.ts
├── AttentionIndex.ts           # Build inverted index
├── AttentionIndex.test.ts
├── FileMatcher.ts              # Match files to index
├── FileMatcher.test.ts
│
│ # Phase 2: Pull
├── DocLoader.ts                # Load whole docs (section-level planned)
├── DocSegmenter.test.ts
├── BM25Index.ts                # Lexical search
├── BM25Index.test.ts
├── VectorIndex.ts              # Semantic search (optional)
├── VectorIndex.test.ts
├── ChangeAtomGenerator.ts      # Diff → atoms
├── ChangeAtomGenerator.test.ts
├── ScoreFusion.ts              # Combine signals
├── ScoreFusion.test.ts
│
│ # Commands
├── impact.ts                   # extract command
└── search.ts                   # search command
```

---

## 11. Implementation Phases

| Phase | Focus | Deliverables |
|-------|-------|--------------|
| **1. Push** | High precision | `attention` frontmatter, inverted index, file/symbol matching |
| **2. Pull** | High recall | BM25 + vector search, change atoms, score fusion |
| **3. Scale** | Automation | CI integration, co-change priors, LLM triage, ticket creation |

---

## 12. Failure Modes & Mitigations

1. **Too many false positives**
   - Tighten semantic-only guardrails
   - Require minimal lexical overlap OR co-change prior
   - Lower K for semantic retrieval

2. **Missed implicit references**
   - Improve retrieval_text from diff-adjacent comments
   - Increase semantic K
   - Add co-change priors

3. **Anchor drift / renames**
   - Detect renames in ChangeAtom extraction
   - Include both old+new anchors

4. **LLM hallucinations**
   - Require evidence pointers
   - Reject atoms lacking anchors
   - Keep LLM bounded to candidate set
