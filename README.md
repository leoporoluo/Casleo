# Casleo

An [OpenChamber](https://openchamber.dev) extension that manages custom
OpenAI-compatible providers for OpenCode from a panel on the right-hand rail.

Casleo writes the `providers` block of `~/.config/opencode/opencode.json`
(or `opencode.jsonc`) directly, so OpenCode reloads it on its own and the
provider shows up in **Settings → Providers** — including its models, context
length and reasoning levels.

## Features

- Add, edit and delete custom providers (第三方中转站 / gateways / local runtimes)
- Provider name, provider ID, protocol, base URL and API key
- Models with display name, context length, max output and reasoning levels
- Writes plain provider config — no OAuth, no background service, no network calls
- Panel follows the OpenChamber theme and can also open full-screen

## Install

In OpenChamber: **Settings → Extensions → Folder, ZIP or URL**, paste:

```
https://github.com/leoporoluo/Casleo.git
```

then choose **Add** and approve the filesystem permission (it may read and
write `~/.config/opencode/opencode.json`). The Casleo icon appears on the rail.

Install from a local clone instead:

```
git clone https://github.com/leoporoluo/Casleo.git
```

and paste the absolute path of the cloned folder into the same field.

## Usage

1. Open the Casleo panel on the rail (or **Extension pages → Casleo** for full screen).
2. Choose **Add provider**.
3. Fill in the provider ID (e.g. `zero`), display name, protocol, base URL and API key.
4. Add at least one model: ID, display name, context length, max output, and
   reasoning levels such as `low, medium, high`.
5. Choose **Save**. The provider is written to `opencode.json` and appears under
   **Settings → Providers** in OpenChamber.

Editing and deleting work the same way; deleting removes the block from
`opencode.json` and disconnects the provider.

## Development

```bash
npm install
npm run build      # bundle panel/main.ts -> panel/main.js (IIFE)
npm run build:dev  # same, unminified
npm run typecheck
```

OpenChamber never builds an extension on install, so commit the built
`panel/main.js` together with the sources. To ship an update, bump `version` in
`package.json`, rebuild, commit and push; the Extensions page then offers
**Update**.

## Layout

```
package.json     extension manifest (openchamber block) + build scripts
icon.svg         rail icon, masked in the current text color
panel/index.html panel page
panel/main.ts    panel source
panel/main.js    built panel (committed)
```

## License

MIT
