#!/bin/bash

set -e

echo "Installing Rust..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

source "$HOME/.cargo/env"

echo "Adding wasm target..."
rustup target add wasm32-unknown-unknown

echo "Installing wasm-pack..."
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

echo "Building project..."
wasm-pack build --target web

echo "Starting local server..."
python3 -m http.server 8080
