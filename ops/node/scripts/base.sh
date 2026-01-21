#!/bin/bash

export DEBIAN_FRONTEND=noninteractive

apt-get -y update
apt-get -y upgrade
apt-get -y autoremove --purge
apt-get -y install \
	binutils \
	cron \
	dnsutils \
	dstat \
	emacs-nox \
	gnupg \
	htop \
	jq \
	locales-all \
	lsb-release \
	lsof \
	nfs-common \
	rsync \
	software-properties-common \
	telnet \
	tree \

sed -i 's/types.ListType/list/g' /usr/bin/dstat
sed -i 's/types.StringType/str/g' /usr/bin/dstat
sed -i 's/types.TupleType/tuple/g' /usr/bin/dstat

reboot
