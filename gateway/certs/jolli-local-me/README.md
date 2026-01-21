# jolli-local.me SSL Certificates

These are Let's Encrypt wildcard SSL certificates for `*.jolli-local.me`, used for local development.

## For Developers (Using the Certs)

Simply copy the certificate files to your `gateway/certs/` directory:

```bash
cp gateway/certs/jolli-local-me/domain.cert.pem gateway/certs/
cp gateway/certs/jolli-local-me/private.key.pem gateway/certs/
```

Since these are signed by Let's Encrypt (a trusted CA), your browser will trust them automatically - no additional setup required.

## Certificate Renewal (Every 90 Days)

Let's Encrypt certificates expire after 90 days. To renew:

### 1. Run certbot with manual DNS challenge

```bash
certbot certonly --manual --preferred-challenges dns \
  -d "jolli-local.me" \
  -d "*.jolli-local.me" \
  --config-dir ./gateway/certs/letsencrypt \
  --work-dir ./gateway/certs/letsencrypt/work \
  --logs-dir ./gateway/certs/letsencrypt/logs
```

### 2. Add DNS TXT record in GoDaddy

Certbot will display something like:

```
Please deploy a DNS TXT record under the name:
_acme-challenge.jolli-local.me.

with the following value:
yycb6m8zny_5p6Gx0khI1CRktQrqVsr2_iJ3wQJGNfg
```

Go to [GoDaddy DNS Management](https://dcc.godaddy.com/manage/jolli-local.me/dns):

1. Click "Add New Record"
2. Type: **TXT**
3. Name: **_acme-challenge**
4. Value: (paste the value from certbot)
5. TTL: 600 (or lowest available)
6. Save

### 3. Wait for DNS propagation

Check if the record is visible (may take 1-5 minutes):

```bash
dig TXT _acme-challenge.jolli-local.me +short
```

You should see your TXT record value in quotes.

### 4. Press Enter in certbot

Once DNS has propagated, press Enter. Certbot will verify and issue the certificate.

### 5. Copy the new certs

```bash
cp gateway/certs/letsencrypt/live/jolli-local.me/fullchain.pem gateway/certs/jolli-local-me/domain.cert.pem
cp gateway/certs/letsencrypt/live/jolli-local.me/privkey.pem gateway/certs/jolli-local-me/private.key.pem
```

### 6. Commit and push

```bash
git add gateway/certs/jolli-local-me/
git commit -m "Renew jolli-local.me SSL certs"
git push
```

### 7. Clean up DNS

Remove the `_acme-challenge` TXT record from GoDaddy (optional but tidy).

## Files

| File | Description |
|------|-------------|
| `domain.cert.pem` | The SSL certificate (fullchain) |
| `private.key.pem` | The private key |
| `README.md` | This file |

## Expiration Check

To check when the current cert expires:

```bash
openssl x509 -in gateway/certs/jolli-local-me/domain.cert.pem -noout -enddate
```

## Note

The `letsencrypt/` directory created during renewal contains account keys and should NOT be committed. Delete it after copying the certs:

```bash
rm -rf gateway/certs/letsencrypt
```
