---
jrn: TEST_TUTORIAL_001
attention:
  - op: file
    path: docs/test-propagation/api-reference.md
  - op: file
    path: docs/test-propagation/quick-start.md
---

# Impact Agent Tutorial

This tutorial walks through using the impact agent.

## Overview

The impact agent supports 11 configuration options as documented in the API Reference.

The agent uses a two-phase approach:

1. **Phase 1**: Code changes trigger article updates
2. **Phase 2**: Article changes propagate to dependent articles

## Running the Agent

```bash
jolli impact agent -d docs -y
```

This runs both phases with all 11 options at their defaults.

## Next Steps

- See [Quick Start](./quick-start.md) for common options
- See [API Reference](./api-reference.md) for all 11 options
