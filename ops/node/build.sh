#!/bin/bash

cd param || exit
env GOOS=linux GOARCH=arm64 go build -o /tmp/param
cd ..

packer build node.pkr.hcl

rm /tmp/param
