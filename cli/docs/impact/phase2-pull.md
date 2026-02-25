# Phase 2: Pull (High Recall)

The PULL channel provides **high-recall** impact detection using semantic and lexical search to find docs that may be implicitly affected by code changes.

> **Prerequisite**: Phase 1 (Push) should be implemented first. Phase 2 augments Push with additional recall.
> **Current granularity**: Phase 2 indexes whole doc files. Section-level segmentation is planned later.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Phase 2: Pull Architecture                          │
└─────────────────────────────────────────────────────────────────────────────┘

OFFLINE (Index Build)                    ONLINE (Impact Analysis)
─────────────────────                    ────────────────────────

┌──────────────┐                         ┌──────────────┐
│  Docs Repo   │                         │   Git Diff   │
└──────┬───────┘                         └──────┬───────┘
       │                                        │
       ▼                                        ▼
┌──────────────┐                         ┌──────────────┐
│   Doc        │                         │   Extract    │
│  Parsing     │                         │ Change Atoms │
│ (whole file) │                         │              │
└──────┬───────┘                         └──────┬───────┘
       │                                        │
       ├─────────────┐                          │
       ▼             ▼                          ▼
┌──────────┐  ┌──────────┐               ┌──────────────┐
│  BM25    │  │  Vector  │               │ retrieval_   │
│  Index   │  │  Index   │               │ text + soft_ │
└────┬─────┘  └────┬─────┘               │ terms        │
     │             │                     └──────┬───────┘
     │             │                            │
     │             │        ┌───────────────────┤
     ▼             ▼        ▼                   ▼
┌─────────────────────────────────────────────────────┐
│                    Retrieval                         │
│  • BM25 search (lexical)                            │
│  • Vector search (semantic)                         │
│  • Union top-K results                              │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│                 Score Fusion                         │
│  S = w_exp*explicit + w_lex*bm25 + w_sem*vector     │
│      + w_co*cochange + w_risk*risk_boost            │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│                   Bucketing                          │
│  Must Update (≥0.85) │ Review (0.55-0.85) │ OK (<0.55) │
└─────────────────────────────────────────────────────┘
```

## Why Pull?

Phase 1 (Push) only finds docs that **explicitly** declare dependencies. Pull catches:

1. **Undocumented dependencies** - Doc mentions "the scheduler" but no `attention` rule
2. **Implicit coupling** - Conceptual relationships (auth flow mentions tokens)
3. **Historical patterns** - Files that historically change together

## Core Components

### Change Atoms

Transform diff hunks into doc-searchable units:

```typescript
interface ChangeAtom {
  atomId: string;              // Unique ID
  changeKind: ChangeKind;      // add | remove | rename | signature_change | etc.
  publicSurface: boolean;      // Is this user-facing?
  surfaceTypes: SurfaceType[]; // API | CLI | Config | Schema | Output | Behavior

  // For matching
  anchors: {
    symbols: string[];
    paths: string[];
    cliFlags: string[];
    configKeys: string[];
    endpoints: string[];
    schemaFields: string[];
  };

  retrievalText: string;       // 2-3 sentences for search (anchors verbatim)
  softTerms: string[];         // Split/normalized anchor terms

  // Evidence
  evidence: Array<{
    path: string;
    hunkHeader: string;
    notes?: string;
  }>;

  risk: 'high' | 'medium' | 'low';
}

type ChangeKind =
  | 'add' | 'remove' | 'rename'
  | 'signature_change' | 'default_change'
  | 'behavior_change' | 'output_change'
  | 'schema_change' | 'refactor';

type SurfaceType =
  | 'API' | 'CLI' | 'Config'
  | 'Schema' | 'Output' | 'Behavior' | 'Internal';
```

### Docs (File-Level for Now)

```typescript
interface DocDocument {
  docId: string;               // jrn from frontmatter
  path: string;                // docs/auth.md
  title: string;               // Doc title (H1 or filename)
  bodyText: string;            // Normalized text
  codeBlocks: string[];        // Extracted fenced blocks

  // From Phase 1
  attention?: AttentionRule[];

  // For retrieval
  embedding?: number[];        // Vector for semantic search
}
```

### Retrieval

```typescript
interface RetrievalResult {
  docId: string;
  score: number;
  source: 'bm25' | 'vector' | 'both';
}

interface Retriever {
  // Lexical search
  searchBM25(query: string, topK: number): RetrievalResult[];

  // Semantic search
  searchVector(embedding: number[], topK: number): RetrievalResult[];

  // Combined
  search(atom: ChangeAtom, topK: number): RetrievalResult[];
}
```

### Score Fusion

```typescript
interface ScoredMatch {
  docId: string;
  score: number;           // 0-1, fused score
  bucket: 'must_update' | 'review' | 'probably_ok';

  // Score breakdown
  components: {
    explicit: number;      // From Phase 1 attention match
    anchorOverlap: number; // Anchor term overlap
    bm25: number;          // Lexical similarity
    semantic: number;      // Vector similarity
    cochange: number;      // Historical co-change
    riskBoost: number;     // Risk-based boost
  };

  // Evidence from both channels
  evidence: MatchEvidence[];
}

function fuseScores(
  explicitMatches: AttentionMatch[],
  retrievalResults: RetrievalResult[],
  cochangePriors: Map<string, number>,
  atom: ChangeAtom
): ScoredMatch[];
```

## Implementation Plan

### Step 1: Doc Normalization (Whole File)

Normalize each doc file into a single index entry.

```typescript
function normalizeDoc(content: string, path: string): DocDocument;
```

### Step 2: BM25 Index

Build lexical index over docs.

```typescript
interface BM25Index {
  add(doc: DocDocument): void;
  search(query: string, topK: number): RetrievalResult[];
}

// Use existing library (e.g., minisearch, lunr)
function buildBM25Index(docs: DocDocument[]): BM25Index;
```

### Step 3: Vector Index (Optional)

Build embedding index for semantic search.

```typescript
interface VectorIndex {
  add(docId: string, embedding: number[]): void;
  search(query: number[], topK: number): RetrievalResult[];
}

// Options: in-memory (hnswlib), or external (Pinecone, pgvector)
function buildVectorIndex(docs: DocDocument[]): VectorIndex;
```

### Step 4: Change Atom Generator

Convert diff hunks to searchable Change Atoms.

```typescript
function generateChangeAtoms(report: ImpactReport): ChangeAtom[];

// Rule-based extraction
function extractAnchorsFromHunk(hunk: Hunk): ChangeAtom['anchors'];

// Generate retrieval text
function generateRetrievalText(atom: ChangeAtom): string;
```

### Step 5: Score Fusion

Combine signals from both channels.

```typescript
const WEIGHTS = {
  explicit: 1.0,      // Phase 1 match
  anchorOverlap: 0.3,
  bm25: 0.2,
  semantic: 0.2,
  cochange: 0.1,
  riskBoost: 0.2,
};

const THRESHOLDS = {
  mustUpdate: 0.85,
  review: 0.55,
};

function computeScore(
  doc: DocDocument,
  atom: ChangeAtom,
  signals: ScoreSignals
): number {
  return sigmoid(
    WEIGHTS.explicit * signals.explicit +
    WEIGHTS.anchorOverlap * signals.anchorOverlap +
    WEIGHTS.bm25 * signals.bm25 +
    WEIGHTS.semantic * signals.semantic +
    WEIGHTS.cochange * signals.cochange +
    WEIGHTS.riskBoost * (atom.risk === 'high' ? 1 : atom.risk === 'medium' ? 0.5 : 0)
  );
}
```

### Step 6: CLI Enhancement

Enhance `jolli impact search` with retrieval.

```bash
# Full search (Phase 1 + Phase 2)
jolli impact search

# Phase 1 only (explicit matches)
jolli impact search --explicit-only

# Adjust thresholds
jolli impact search --threshold-must=0.9 --threshold-review=0.6

# Include retrieval scores in output
jolli impact search --show-scores
```

## File Structure

```
cli/src/client/commands/impact/
├── ... (Phase 1 files)
├── DocLoader.ts               # NEW: Load whole docs (section-level planned)
├── DocLoader.test.ts
├── BM25Index.ts               # NEW: Lexical search
├── BM25Index.test.ts
├── VectorIndex.ts             # NEW: Semantic search (optional)
├── VectorIndex.test.ts
├── ChangeAtomGenerator.ts     # NEW: Diff → atoms
├── ChangeAtomGenerator.test.ts
├── ScoreFusion.ts             # NEW: Combine signals
├── ScoreFusion.test.ts
└── search.ts                  # ENHANCED: Full search
```

## Guardrails

To prevent false positives from semantic-only matches:

1. **Require minimal overlap**: At least one anchor term OR co-change prior
2. **Cap semantic-only scores**: Max 0.6 without lexical support
3. **Risk-based gating**: Low-risk changes need higher scores to flag

```typescript
function applyGuardrails(match: ScoredMatch, atom: ChangeAtom): ScoredMatch {
  // Semantic-only matches capped
  if (match.components.explicit === 0 &&
      match.components.anchorOverlap === 0 &&
      match.components.cochange === 0) {
    match.score = Math.min(match.score, 0.6);
  }

  // Re-bucket after adjustments
  match.bucket = computeBucket(match.score);
  return match;
}
```

## Optional: Co-change Priors

Build from git history for additional signal.

```typescript
interface CochangePrior {
  docPath: string;
  codePath: string;
  score: number;  // P(doc changed | code changed)
}

function buildCochangePriors(
  gitHistory: CommitHistory,
  docPaths: string[],
  codePaths: string[]
): Map<string, Map<string, number>>;
```

## Optional: LLM Triage

For "Review" bucket items, use LLM to reduce false positives.

```typescript
interface TriageResult {
  needsUpdate: 'yes' | 'no' | 'uncertain';
  updateType?: string;
  editSuggestions?: string[];
  confidence: number;
}

// LLM sees ONLY:
// - Doc text
// - Top-N matching change atoms
// - Exact diff hunks from evidence
// LLM does NOT search or discover new candidates
async function triageWithLLM(
  doc: DocDocument,
  atoms: ChangeAtom[],
  diffHunks: string[]
): Promise<TriageResult>;
```

## Success Criteria

- [ ] Doc normalization (whole file)
- [ ] BM25 index and search
- [ ] Change atom generation from diffs
- [ ] Score fusion with configurable weights
- [ ] Bucketing (Must Update / Review / OK)
- [ ] CLI outputs scored results
- [ ] (Optional) Vector index integration
- [ ] (Optional) Co-change prior computation
- [ ] (Optional) LLM triage for Review bucket
