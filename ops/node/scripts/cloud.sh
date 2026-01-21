#!/bin/bash

export DEBIAN_FRONTEND=noninteractive

wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/debian/arm64/latest/amazon-cloudwatch-agent.deb
dpkg -i amazon-cloudwatch-agent.deb
rm -f amazon-cloudwatch-agent.deb

mkdir -p /opt/aws/amazon-cloudwatch-agent/etc
cp /dev/shm/amazon-cloudwatch-agent.json /opt/aws/amazon-cloudwatch-agent/etc

systemctl enable amazon-cloudwatch-agent
