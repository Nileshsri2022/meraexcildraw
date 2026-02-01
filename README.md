# My Whiteboard

An open-source collaborative whiteboard application built with React and TypeScript.

## Features

- 🎨 Infinite canvas-based whiteboard
- ✍️ Hand-drawn style elements
- 🌓 Dark mode support
- 📷 Image support
- 🖼️ Export to PNG, SVG
- 💾 Open JSON format
- ⚒️ Multiple drawing tools
- 🔙 Undo/Redo
- 🔍 Zoom and panning
- 🤼 Real-time collaboration

## Quick Start

```bash
# Install dependencies
yarn install

# Start development server
yarn start
```

## Architecture

This is a monorepo with the following structure:

- `packages/whiteboard/` - Core React component library
- `packages/common/` - Shared utilities
- `packages/element/` - Element-related logic
- `packages/math/` - Mathematical utilities
- `packages/utils/` - General utilities
- `whiteboard-app/` - Full-featured web application

## Scripts

```bash
yarn start          # Start development server
yarn build          # Build the app
yarn build:packages # Build all packages
yarn test           # Run tests
yarn typecheck      # TypeScript checking
yarn lint           # Run ESLint
yarn fix            # Auto-fix issues
```

## License

MIT
