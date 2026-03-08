# SubFlow

A real-time fluid simulator for flood situations for civil engineers and emergency response personnel. Using a Euler/Semi-Lagranian avection to model water efficiently in Rust, coupled with a frontend using Three.js, we provide a "behind-the-scenes" application for government and private sector personnel for flooding mitigation and response.

<img width="1914" height="945" alt="image" src="https://github.com/user-attachments/assets/7897a3c5-f9fb-47aa-9895-24a0bce9092c" />


## How to run ⚙️


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



## Acknowledgements ♥️
Thank you to Claude.ai for debugging and reworking purposes. Additionally, credit for 3JS for engine: https://threejs.org/manual/#en/installation.
