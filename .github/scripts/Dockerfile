FROM ubuntu:noble

# Install dependencies
RUN apt-get -y update && \
    apt-get -y install curl git-lfs jq unzip sudo \
    libicu74 liblttng-ust1 libkrb5-3 zlib1g libssl3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install AWS CLI
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "arm64" ]; then \
        AWS_ARCH="aarch64"; \
    else \
        AWS_ARCH="x86_64"; \
    fi && \
    AWS_CLI_URL="https://awscli.amazonaws.com/awscli-exe-linux-${AWS_ARCH}.zip" && \
    curl -sL -o awscliv2.zip "$AWS_CLI_URL" && \
    unzip awscliv2.zip && \
    ./aws/install && \
    rm -rf awscliv2.zip aws

# Create runner user
RUN useradd -m runner && \
    usermod -aG sudo runner && \
    echo "runner ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Install GitHub Actions runner
ARG TARGETARCH
ARG RUNNER_VERSION=2.328.0
RUN if [ "$TARGETARCH" = "arm64" ]; then \
        RUNNER_ARCH="arm64"; \
    else \
        RUNNER_ARCH="x64"; \
    fi && \
    RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz" && \
    sudo -u runner bash -c " \
        cd /home/runner && \
        mkdir -p actions-runner && \
        cd actions-runner && \
        curl -sL -o actions-runner.tar.gz '$RUNNER_URL' && \
        tar xzf actions-runner.tar.gz && \
        rm actions-runner.tar.gz \
    "

WORKDIR /home/runner/actions-runner
USER runner

# Default command - will be overridden in create script
CMD ["./run.sh"]
