# Loom

Loom is a problem visualization toolkit for exploring systems as graphs, traces, and simulations from a docked workspace UI.

See `docs/loom-design-v3.md` for the architecture and product direction.

## Installation

1. Clone the repository
2. Install mise:

```bash
brew install mise
```

If you haven't set up Mise before:

```bash
# set up shell
echo 'eval "$(mise activate bash)"' >> ~/.bashrc

# trust config file in this project
mise trust
mise activate
```

Mise will set up the Bun/prek/etc environment, and Bun will handle its dependencies automatically.

## Quick Start

1. Copy `.env.example` to `.env` and fill in values
2. Run migrations:

```bash
bun run migrate.ts up
```

3. Start the server:

```bash
mise run dev
```
