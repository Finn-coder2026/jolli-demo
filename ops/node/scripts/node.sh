#!/bin/bash

sudo -H -u node bash -c 'curl -so- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash'

mv /dev/shm/*.sh /dev/shm/param /usr/local/bin/
chmod +x /usr/local/bin/*.sh
echo "@reboot /usr/local/bin/boot.sh" | crontab -
echo "@reboot /usr/local/bin/sync.sh" | crontab -u node -
