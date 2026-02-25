# Future Enhancements

This document captures planned features and enhancements for the DCIA system.

## Phase 2: Pull + Push Enhancements

### Additional Attention Operations

Currently, `attention` only supports `file` operations. The following operations are planned:

#### `symbol` - Watch a Symbol/Function

Triggers when a specific symbol (function, class, method) is modified.

```yaml
attention:
  - op: symbol
    name: AuthService.refresh
```

**Fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Fully qualified symbol name |
| `file` | No | Limit to specific file (for disambiguation) |
| `keywords` | No | Additional keywords |

**Examples:**
```yaml
# Function name
- op: symbol
  name: handleOAuthCallback

# Method on class
- op: symbol
  name: AuthService.refresh

# With file scope
- op: symbol
  name: refresh
  file: src/auth/AuthService.ts
```

**Requirements:**
- AST-based or improved regex extraction from diffs
- Symbol resolution across files

---

#### `config` - Watch a Config Key

Triggers when a configuration key is modified.

```yaml
attention:
  - op: config
    key: auth.token_ttl
```

**Fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `key` | Yes | Dotted config key path |
| `file` | No | Config file to watch (default: common config locations) |
| `keywords` | No | Additional keywords |

**Examples:**
```yaml
# Config key
- op: config
  key: auth.token_ttl

# In specific file
- op: config
  key: database.pool_size
  file: config/production.yaml
```

**Requirements:**
- Config file parsing (JSON, YAML, TOML, .env)
- Key path extraction from diffs

---

#### `endpoint` - Watch an API Endpoint

Triggers when an API endpoint handler is modified.

```yaml
attention:
  - op: endpoint
    method: POST
    path: /v1/auth/refresh
```

**Fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `method` | No | HTTP method (GET, POST, PUT, DELETE, PATCH) |
| `path` | Yes | URL path pattern |
| `keywords` | No | Additional keywords |

**Examples:**
```yaml
# Specific endpoint
- op: endpoint
  method: POST
  path: /v1/auth/refresh

# Any method on path
- op: endpoint
  path: /v1/users/*

# Path pattern
- op: endpoint
  path: /v1/auth/**
```

**Requirements:**
- Router/framework-aware parsing
- OpenAPI spec integration

---

#### `flag` - Watch a CLI Flag

Triggers when a CLI flag is added, removed, or modified.

```yaml
attention:
  - op: flag
    name: --dry-run
```

**Fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Flag name (with -- prefix) |
| `command` | No | Limit to specific command |
| `keywords` | No | Additional keywords |

**Examples:**
```yaml
# Flag name
- op: flag
  name: --dry-run

# On specific command
- op: flag
  name: --verbose
  command: deploy
```

**Requirements:**
- CLI framework detection (commander, yargs, clap, etc.)
- Flag definition extraction

---

#### `schema` - Watch a Schema Field

Triggers when a database schema or data model field changes.

```yaml
attention:
  - op: schema
    table: users
    field: email
```

**Fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `table` | No | Table/model name |
| `field` | No | Field/column name |
| `file` | No | Schema file to watch |
| `keywords` | No | Additional keywords |

**Examples:**
```yaml
# Table field
- op: schema
  table: users
  field: created_at

# Entire table
- op: schema
  table: audit_logs

# Schema file
- op: schema
  file: prisma/schema.prisma
  keywords: [User, email]
```

**Requirements:**
- Schema file parsing (Prisma, SQL migrations, TypeORM, etc.)
- Model/field extraction

---

### Section-Level Granularity

Current matching operates at **doc-file granularity**. Future work will add section-level indexing and matching:

- Split docs by heading into stable section IDs (e.g., `path#heading_hash`)
- Allow `attention` rules to target sections (optional)
- Return section-level evidence and results
- Add CLI flags to toggle doc-level vs section-level output

### Pull Channel (Semantic Search)

See [phase2-pull.md](./phase2-pull.md) for the complete specification.

Key components:
- Doc normalization (whole file; section-level planned)
- BM25 lexical index
- Vector/embedding index
- Change atom generation
- Score fusion and bucketing
- Optional LLM triage

---

## Phase 3: Scale & Automation

### CI/CD Integration
- GitHub Action for PR checks
- Block merges when Must Update docs are not addressed
- Auto-create tickets for doc owners

### Persistence & Performance
- Save index to disk
- Incremental index updates
- Watch mode for local development

### Ownership & Routing
- CODEOWNERS-style doc ownership
- Slack/email notifications
- Ticket creation (Jira, Linear, GitHub Issues)

### Co-change Priors
- Analyze git history for doc-code coupling
- Boost scores based on historical correlation
- Detect "usually changed together" patterns

### LLM Triage
- Bounded LLM adjudication for Review bucket
- Generate edit suggestions
- Confidence scoring
