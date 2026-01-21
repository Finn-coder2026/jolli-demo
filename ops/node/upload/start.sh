#!/bin/bash

cd "$1/current" || exit 1
export NVM_DIR="$HOME/.nvm"
source "$HOME/.nvm/nvm.sh"
nvm install
npm install

pid=$(lsof -u node | grep "$1" | grep ^Main | awk '{ print $2 }' | head -1)
if [[ -n "$pid" ]]; then
	kill "$pid"

	while kill -0 "$pid" 2>/dev/null; do
		sleep 0.2
	done
fi

eval "$(cat $1/.config)"
cp "$ENV" .

npm run start >> "$1/node.log" 2>&1 &
