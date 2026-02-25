# Future Queue Optimization (Client → Server)

This spec outlines a future optimization to replace large single-batch push requests with a queued, resumable ops workflow. The goal is higher reliability, better retry behavior, and reduced memory/timeout risk.

---

## Motivation
- Large payloads can time out or exceed server limits.
- A single failed request forces a full re-scan and re-build of ops.
- Without durable queues, crashes/interruptions can lose in-flight ops.

---

## High-Level Approach
1. **Queue ops locally** in small batches (e.g., 25–200 ops per batch).
2. Assign a **batchId** and **requestId** to each batch.
3. Send batches sequentially.
4. Persist batch state so retries are idempotent and resumable.

---

## Client-Side Design

### Data Model (file-backed)
`~/.jolli/ops/` contains one JSON file per batch:
```
REQ-<requestId>.json
```

Example payload:
```json
{
  "requestId": "REQ123",
  "createdAt": 1700000000000,
  "batchIndex": 1,
  "totalBatches": 5,
  "ops": [
    {
      "opId": "OP001",
      "type": "upsert",
      "fileId": "FILE1",
      "serverPath": "notes/a.md",
      "baseVersion": 3,
      "content": "...",
      "contentHash": "abcd"
    }
  ]
}
```

### Queue Flow
- Build full ops list.
- Chunk into batches.
- Write each batch to disk.
- Push batches in order:
  - On success: mark batch as completed (delete file or move to `completed/`).
  - On failure: stop, leave remaining batch files on disk.
- On restart: resume from the first pending batch file.

---

## Server-Side Design

### Push Request Shape
```json
{
  "requestId": "REQ123",
  "batchIndex": 1,
  "totalBatches": 5,
  "ops": [ ... ]
}
```

### Idempotency
- `requestId + batchIndex` is the idempotency key.
- The server caches responses for each batch.

---

## Retry & Resume Rules
- Retry only the failed batch.
- Do not re-send completed batches.
- A fully completed request is a no-op on retry.

---

## Benefits
- Reduces large payload failures.
- Safe resumption after crash or network failure.
- Smaller, predictable memory usage.

---

## Suggested Tests
- Batch retry returns identical response.
- Crash mid-queue resumes at correct batch.
- Mixed success/failure preserves remaining batch files.
