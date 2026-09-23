#!/bin/sh
set -eu
cd "$(dirname "$0")"
npm install
npm run dev
