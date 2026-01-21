#!/bin/bash

dd if=/dev/zero of=/swap count=1024 bs=1M status=none
chmod 600 /swap
mkswap /swap
swapon /swap
echo "/swap none swap sw 0 0" >> /etc/fstab
