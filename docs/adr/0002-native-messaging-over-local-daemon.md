# Native messaging over a local HTTP daemon

The Extension talks to the Companion via native messaging: the browser spawns the Companion on demand and communicates over stdio.
The alternative was a resident localhost HTTP server, which would have given a single-writer guarantee across browsers and easier debugging, at the cost of an always-running daemon plus port and token management.

We chose native messaging because the user runs browsers serially (Zen or Helium, not both at once), so the single-writer guarantee is not worth a resident process.
Each browser spawning its own Companion instance means concurrent Archive writes are theoretically possible, so the Companion takes a lockfile on the Archive for every mutating operation and fails loudly if the lock is held.

## Considered Options

- Native messaging (chosen): zero resident processes, per-browser manifest installation, lockfile guard against concurrent writes.
- Localhost HTTP daemon: single writer, one instance shared by all browsers, but requires the daemon to be alive for Clean to work.
