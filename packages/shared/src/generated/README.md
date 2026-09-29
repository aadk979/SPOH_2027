# Generated artefacts

Written by tools, never edited by hand (engineering-standards §5). Empty until:

- **P10** generates the settings registry types from the server's setting definitions.
- **P11** generates the Cedar action catalogue that replaces `access/capabilities.ts`.

Each generator documents its command in the file header it writes, and CI fails when a committed
file differs from a fresh generation.
