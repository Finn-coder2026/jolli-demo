#!/bin/bash

useradd "${USER}"
chsh -s /bin/bash "${USER}"

mkdir -p "/home/${USER}/.ssh"
mv /dev/shm/authorized_keys "/home/${USER}/.ssh"
chmod 700 "/home/${USER}/.ssh"
chmod 600 "/home/${USER}/.ssh"/*

cat << EOF > "/etc/sudoers.d/${USER}"
${USER} ALL=(ALL) NOPASSWD:ALL
EOF

chown -R "${USER}:${USER}" "/home/${USER}"
