---
jrn: TEST_QUICKSTART_001
attention:
  - op: file
    path: docs/test-propagation/api-reference.md
---

# Quick Start Guide

Get started with the impact agent in 5 minutes.

## Prerequisites

- Node.js 18+
- Jolli CLI installed

## Basic Usage

The impact agent has 11 configuration options. Run with:

```bash
jolli impact agent -d docs -y
```

## Common Options

- `--dry-run` - Preview changes
- `--no-propagate` - Skip Phase 2
- `--limit N` - Process only N articles

See the [API Reference](./api-reference.md) for the complete list of 11 options.
