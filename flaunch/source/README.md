# RIFTERA — Flaunch Game Mode upload

This folder contains the original browser game and the bundled Flaunch Game Mode client.

## Upload

Upload `riftera-flaunch.zip` as the static game build in the Flaunch Game Mode dashboard. The
archive root contains `index.html`, `flaunch-sdk.js`, and `manifest.webmanifest`.

## SDK integration

- `@flayerlabs/gamemode-client@0.8.0` is bundled into `flaunch-sdk.js`; the SDK marker is embedded in
  that output and `connectHost()` reports its version to the trusted parent.
- Embedded launches use `connectHost()` and `joinRoom()`. The game only submits bounded movement
  inputs; it never submits a score, kill count, position, wallet transaction, or timestamp.
- A standalone preview uses `createMockRoom()` and the same rules for practice.
- The room awards points only when its server-side rules calculate enough movement during an
  active checkpoint. The game's existing local gems, kills, achievements, and saves remain local
  game progression and are not presented as Flaunch points.

## Important for a real launch

This ZIP is the static game build, not a deployed gate. A live coin launch also needs a gate running
the exact same `flaunch-rules.mjs` and configuration. The SDK mock is for practice only. Do not
enable live launches until the matching gate is deployed and configured in the dashboard.

The standalone rules test can be run from the workspace with:

```sh
cd source
npm install
npm test
npm run build
```
