# Configuration

This guide covers all the configuration options available.

## Environment Variables

You can configure the application using environment variables:

```bash
# Required
API_KEY=your-api-key

# Optional
DEBUG=true
LOG_LEVEL=info
TIMEOUT=30000
```

## Configuration File

Create a `config.json` file in your project root:

```json
{
  "apiKey": "your-api-key",
  "debug": false,
  "logLevel": "info",
  "timeout": 30000,
  "retries": 3,
  "endpoints": {
    "api": "https://api.example.com",
    "auth": "https://auth.example.com"
  }
}
```

## Programmatic Configuration

You can also configure options programmatically:

```typescript
import { configure } from 'my-package';

configure({
  apiKey: process.env.API_KEY,
  debug: process.env.NODE_ENV === 'development',
  timeout: 60000,
});
```

## Configuration Precedence

Configuration values are loaded in the following order (later values override earlier):

1. Default values
2. Configuration file (`config.json`)
3. Environment variables
4. Programmatic configuration

## Validation

All configuration is validated at startup. Invalid configuration will throw a `ConfigurationError`:

```typescript
try {
  configure({ timeout: -1 });
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error('Invalid configuration:', error.message);
  }
}
```
