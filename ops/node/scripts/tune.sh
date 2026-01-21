#!/bin/bash

cat << EOF >> /etc/sysctl.conf
net.ipv6.conf.all.disable_ipv6 = 1
vm.swappiness = 34
EOF

cat << EOF > /etc/default/locale
LANG=en_US.UTF-8
EOF

localedef -i en_US -f UTF-8 en_US.UTF-8

sed -ie '/# End of file/i\* soft nofile 8192\n* hard nofile 8192\n' /etc/security/limits.conf

cat << EOF >> /etc/systemd/resolved.conf
Domains=us-west-2.compute.internal
EOF

sed -i '/^hosts:/c\hosts: files dns' /etc/nsswitch.conf
