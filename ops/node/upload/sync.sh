#!/bin/bash

declare -A urls

while :
do
	for server in /home/node/servers/*; do
		if [ -d "$server" ] && [ -f "$server"/.config ]; then
			eval "$(cat "$server"/.config)"

			if [ "$BUILD" != "" ]; then
				url=$(/usr/local/bin/param us-west-2 "$BUILD")

				if [ "${urls[$server]}" != "$url" ]; then
					urls[$server]=$url
					filename="${url##*/}"
					install="installs/${filename%%.tgz}"
					dir="$server/$install"

					mkdir -p "$server/downloads"
					aws s3 cp "$url" "$server/downloads"
					rm -rf "$dir"
					mkdir -p "$dir"
					tar xfz "$server/downloads/$filename" -C "$dir"
					rm -rf "$server/current"
					ln -sf "$install" "$server/current"

					/usr/local/bin/start.sh "$server"
				fi
			fi

			BUILD=
		fi
	done

	sleep 1
done
