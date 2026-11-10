# Build from source

Use Node.js 24 and pnpm 10.7.0. Install the workspace dependencies with `pnpm install --frozen-lockfile`, then run `pnpm -C app build` to build the native helpers and app. `pnpm dev` opens the app from source. Set `YOGURT_USER_DATA` to a separate folder if you want a separate profile.

Install CMake on every platform. Mac builds need Xcode Command Line Tools. Windows builds need Rust, the Vulkan SDK and Visual Studio C++ Build Tools. Linux builds need Rust, the Vulkan SDK, PulseAudio development headers and pkg-config. Package the app with `pnpm -C app exec electron-builder --mac`, `--win` or `--linux` on the matching platform. Signing and notarization are configured in `app/scripts/release-mac.sh` and the release workflow.

The website is a separate Next.js project. From `site/`, run `pnpm install --ignore-workspace --frozen-lockfile` and `pnpm build`. Set the Vercel project’s root directory to `site`.
