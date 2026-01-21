# Jolli Frontend

React web application for the Jolli documentation automation platform.

> For setup instructions, see [DEVELOPERS.md](../DEVELOPERS.md).

## Overview

The frontend is built with React 19 and bundled with Preact via Vite for a smaller production bundle. It uses Tailwind CSS for styling, shadcn/ui for UI components, and intlayer for internationalization.

## Project Structure

```
frontend/
├── src/
│   ├── ui/                 # Main UI components and pages
│   ├── components/         # Shared components
│   │   └── ui/             # shadcn/ui primitives
│   ├── contexts/           # React context providers
│   ├── hooks/              # Custom React hooks
│   ├── common/             # Utility functions
│   ├── localization/       # i18n content files
│   ├── test/               # Test utilities
│   ├── types/              # TypeScript type definitions
│   └── Main.tsx            # Application entry point
├── scripts/                # Build scripts
├── components.json         # shadcn/ui configuration
├── intlayer.config.ts      # Intlayer i18n configuration
├── package.json
└── vite.config.ts
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/ui/` | Page-level components (Dashboard, Articles, Settings, etc.) |
| `src/components/` | Reusable shared components |
| `src/components/ui/` | shadcn/ui base components |
| `src/contexts/` | React context providers (ClientContext, OrgContext, ThemeContext, etc.) |
| `src/hooks/` | Custom hooks (useBuildStream, useMercureSubscription) |
| `src/localization/` | Intlayer content files for i18n |

## File Naming Conventions

| Pattern | Description |
|---------|-------------|
| `*.tsx` | React components |
| `*.test.tsx` | Tests (co-located with components) |
| `*.content.ts` | Intlayer localization content |
| `*.module.css` | CSS modules |

## Development

### Commands

```bash
# Start development server
npm run start

# Run tests with coverage
npm run test

# Lint code (Biome + Stylelint)
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Build TypeScript
npm run build

# Build production bundle
npm run package

# Preview production build
npm run preview

# Run full validation (clean, build, lint, test, package)
npm run all

# Build intlayer localization
npm run build:intlayer

# Generate intlayer mocks for testing
npm run generate:intlayer-mock
```

### Test Coverage

The frontend maintains 100% test coverage for functions, lines, and statements, with 98% branch coverage. This is enforced in `vite.config.ts`.

## Localization

The frontend uses [intlayer](https://intlayer.org) for internationalization. Localization content is defined in `*.content.ts` files alongside components.

See [LOCALIZATION.md](../LOCALIZATION.md) for detailed i18n documentation.
