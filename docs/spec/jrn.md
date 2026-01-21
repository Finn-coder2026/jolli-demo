# JRN (Jolli Resource Name) Specification

## Motivation

JRNs provide a uniform way to identify and reference resources across the Jolli platform. Similar to AWS ARNs, JRNs enable:

- **Consistent addressing**: Every resource (articles, sources, jobs, agents, assets) has a unique, parseable identifier
- **Access control**: Pattern matching with wildcards enables flexible permission policies
- **Cross-service references**: Resources can reference each other using stable identifiers
- **Auditability**: All resource operations can be logged with unambiguous identifiers

## Format

```
jrn:<controllingPath?>:path:<unix-path>[:qualifier]
```

| Component | Description | Example |
|-----------|-------------|---------|
| `jrn` | Fixed prefix | `jrn` |
| `controllingPath` | Optional opaque string (can be empty) | `ctrl` or empty |
| `path` | Type marker (currently only "path") | `path` |
| `unix-path` | Resource location: `/home/{orgId}/{service}/{type}/{id}` | `/home/org_01/docs/article/art_01X` |
| `qualifier` | Optional version or metadata | `v/12` |

### Services

| Service | Resource Types | Example Path |
|---------|---------------|--------------|
| `docs` | `article`, `file` | `/home/org_01/docs/article/art_01JXYZ` |
| `sources` | `github`, `web` | `/home/org_01/sources/github/owner/repo/main` |
| `jobs` | `job` | `/home/org_01/jobs/job/job_01JXYZ` |
| `agents` | `agent` | `/home/org_01/agents/agent/agt_01JXYZ` |
| `assets` | `image` | `/home/org_01/assets/image/img_01JXYZ` |

## Examples

```
# Article (no controlling path)
jrn::path:/home/org_01/docs/article/art_01JXYZ

# Article with version qualifier
jrn::path:/home/org_01/docs/article/art_01JXYZ:v/12

# GitHub source
jrn::path:/home/org_01/sources/github/anthropics/claude-code/main

# Web source
jrn::path:/home/org_01/sources/web/https://example.com

# With controlling path
jrn:ctrl:path:/home/org_01/docs/article/art_01JXYZ
```

## Pattern Matching

JRNs support wildcard patterns for access control and filtering:

| Pattern | Matches |
|---------|---------|
| `*` | Any single path segment |
| `**` | Zero or more path segments |

```
# Match any GitHub source in org_01
jrn::path:/home/org_01/sources/github/**

# Match any article across all orgs
jrn::path:/home/*/docs/article/*

# Match specific repo, any branch
jrn::path:/home/org_01/sources/github/owner/repo/*
```

## Usage

```typescript
import { jrnParserV3 } from "common/src/util/JrnParser";

// Build JRNs
const articleJrn = jrnParserV3.article("art_01X", { orgId: "org_01" });
const sourceJrn = jrnParserV3.githubSource({
  orgId: "org_01",
  org: "anthropics",
  repo: "claude-code",
  branch: "main"
});

// Parse JRNs
const result = jrnParserV3.parse(articleJrn);
if (result.success) {
  console.log(result.value.orgId);      // "org_01"
  console.log(result.value.service);    // "docs"
  console.log(result.value.resourceId); // "art_01X"
}

// Pattern matching
import { matchesJrnV3Pattern } from "common/src/util/JrnMatcher";
matchesJrnV3Pattern(sourceJrn, "jrn::path:/home/org_01/sources/github/**"); // true
```
