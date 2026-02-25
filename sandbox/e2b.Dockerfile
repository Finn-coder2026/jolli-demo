# You can use most Debian-based base images
FROM ubuntu:22.04

# Install base dependencies
RUN apt-get update && apt-get install -y curl git ca-certificates build-essential python3 && update-ca-certificates

# Install Node.js 24.x (matching ../.nvmrc version)
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    npm i -g npm@11.6.1

# Make npm less chatty and tolerant for peer deps
ENV npm_config_fund=false \
    npm_config_audit=false \
    npm_config_update_notifier=false \
    npm_config_legacy_peer_deps=true

WORKDIR /opt/jolli

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y gh

# Copy CLI dist files to /opt/jolli/bin
COPY dist /opt/jolli/bin

# Install runtime deps for tools (Linux/amd64) into their local node_modules
RUN set -eux; \
  cd /opt/jolli/bin/tools/code2docusaurus && npm install --omit=dev; \
  cd /opt/jolli/bin/tools/docusaurus2vercel && npm install --omit=dev; \
  cd /opt/jolli/bin/tools/code2openapi && npm install --omit=dev; \
  chmod +x /opt/jolli/bin/tools/code2docusaurus/dist/index.js; \
  chmod +x /opt/jolli/bin/tools/docusaurus2vercel/dist/index.js; \
  chmod +x /opt/jolli/bin/tools/code2openapi/dist/index.js; \
  ln -sf /opt/jolli/bin/tools/code2docusaurus/dist/index.js /usr/local/bin/code2docusaurus; \
  ln -sf /opt/jolli/bin/tools/docusaurus2vercel/dist/index.js /usr/local/bin/docusaurus2vercel; \
  ln -sf /opt/jolli/bin/tools/code2openapi/dist/index.js /usr/local/bin/code2openapi

# Install Jolli CLI binary
COPY dist/bin/jolli /opt/jolli/bin/jolli
RUN chmod +x /opt/jolli/bin/jolli && \
    ln -sf /opt/jolli/bin/jolli /usr/local/bin/jolli
