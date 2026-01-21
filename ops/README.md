# Jolli Ops

Operational and infrastructure utilities for Jolli deployments.

## Overview

This directory contains infrastructure-as-code and operational utilities for deploying and managing Jolli in cloud environments.

## Structure

| Directory | Description |
|-----------|-------------|
| [`node/`](./node/) | Packer configuration for building Node.js AWS AMIs |

## Node AMI Builder

The `node/` directory contains Packer configuration for building AWS EC2 AMIs optimized for running Node.js applications.

### Prerequisites

- [Packer](https://www.packer.io/)
- Go (for building the param utility)
- AWS credentials

### Build

```bash
cd ops/node
./build.sh
```

### Contents

| File/Directory | Description |
|----------------|-------------|
| `node.pkr.hcl` | Packer HCL configuration |
| `build.sh` | Build script |
| `scripts/` | Provisioning scripts |
| `param/` | Go utility for parameter management |
| `upload/` | Files to upload to the AMI |
