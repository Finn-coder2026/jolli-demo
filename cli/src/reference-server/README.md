# Reference Server

This is a minimal in-memory sync server for **reference and testing purposes only**.

## Purpose

- Provides a simple implementation of the sync protocol for E2E testing
- Serves as a reference for the expected API contract
- Used in the `simulate/` directory for local testing scenarios

## Not for Production

This server:
- Stores all data in memory (lost on restart)
- Has no authentication or authorization
- Has no persistence layer
- Is single-tenant only
- Does not scale

For production use, the sync endpoints should be implemented in the main `backend` application.
