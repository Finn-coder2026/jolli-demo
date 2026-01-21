# Test Data

This directory contains test data files used across the monorepo for testing.

## Structure

```
testdata/
├── mdx/
│   └── invalid/     # Invalid MDX files for testing MDX parsing
├── openapi/
│   ├── valid/       # Valid OpenAPI specifications
│   │   ├── minimal.json
│   │   ├── minimal.yaml
│   │   └── petstore.json
│   └── invalid/     # Invalid OpenAPI specifications or non-OpenAPI files
│       ├── not-openapi.json         # Plain JSON, not OpenAPI
│       ├── not-openapi.yaml         # Plain YAML, not OpenAPI
│       ├── missing-info.json        # OpenAPI missing required 'info' field
│       ├── missing-title.json       # OpenAPI missing required 'info.title' field
│       └── invalid-json-syntax.json # JSON with syntax error (missing comma)
└── README.md
```

## Usage

These files can be used for:
- Unit tests in `common/`, `backend/`, and `frontend/`
- Integration tests
- Manual testing via the UI
