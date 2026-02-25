---
jrn: MKKIR4UTMQOF3EHH
---
# SSL Certificates

Place your SSL certificate files in this directory.

## Required Files

- `domain.cert.pem` - Your SSL certificate (PEM format)
- `private.key.pem` - Your private key (PEM format)

## Obtaining Certificates

If you registered a domain through a provider like Porkbun, you can download SSL certificates from their dashboard. Make sure to download the PEM format versions.

## File Permissions

For security, set appropriate permissions:
```bash
chmod 644 domain.cert.pem
chmod 600 private.key.pem
```

## Note

Certificate files are git-ignored and should not be committed to the repository.
