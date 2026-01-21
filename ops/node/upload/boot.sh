#!/bin/bash

/usr/sbin/sysctl -p

until [[ $(curl -o /tmp/user-data -s -w %\{http_code\} http://instance-data/latest/user-data) == 200 ]]; do
	sleep 1;
done
eval "$(cat /tmp/user-data)"

sed -i '/efs/d' /etc/fstab
echo "${EFS}:/ /efs nfs nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport 0 0" >> /etc/fstab
mkdir -p /efs
mount /efs
chown node:node /efs
