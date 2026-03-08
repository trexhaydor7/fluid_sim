A flood simulator using Navier-Stokes implementation in Rust
Credit 3JS for engine: https://threejs.org/manual/#en/installation
Thank you to Claude.ai for debugging and reworking purposes.

Run the following commands in terminal:
bashcurl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs/ | sh

bashsource "$HOME/.cargo/env"

bashrustup target add wasm32-unknown-unknown

bashcurl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

bashwasm-pack build --target web

bashsudo npm install -g wasm-pack

wasm-pack build --target web

cd ..

python3 -m http.server 8080