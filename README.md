# My Whiteboard

A whiteboard application built on top of the [**@excalidraw/excalidraw**](https://www.npmjs.com/package/@excalidraw/excalidraw) library.

## Features

All features are provided by the Excalidraw library:

- 🎨 Infinite canvas whiteboard
- ✍️ Hand-drawn style elements (powered by RoughJS)
- 🌓 Dark mode support
- 📷 Image support
- 🖼️ Export to PNG, SVG, JSON
- ⚒️ 15+ drawing tools
- ⌨️ 50+ keyboard shortcuts
- 🔙 Undo/Redo
- 🔍 Zoom and panning
- 🌍 58 languages (i18n)
- 📱 Mobile support
- 🔗 Element bindings & arrows

## Quick Start

```bash
# Install dependencies
yarn install

# Start development server
yarn start
```

Open http://localhost:3000

## Architecture

```
my-whiteboard/
├── whiteboard-app/          # Main application
│   ├── src/
│   │   ├── App.tsx          # Uses <Excalidraw /> component
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.ts
└── package.json             # Root workspace
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@excalidraw/excalidraw` | 0.18.0 | Core whiteboard component |
| `react` | 18.2.0 | UI framework |
| `vite` | 5.2.0 | Build tool |

## Scripts

```bash
yarn start      # Start development server
yarn build      # Build for production
yarn typecheck  # TypeScript checking
yarn lint       # Run ESLint
yarn fix        # Auto-fix issues
```

## Customization

The `<Excalidraw />` component accepts many props for customization:

```tsx
<Excalidraw
  theme="dark"
  UIOptions={{ canvasActions: { toggleTheme: true } }}
  onChange={(elements) => console.log(elements)}
>
  <MainMenu>...</MainMenu>
  <WelcomeScreen>...</WelcomeScreen>
</Excalidraw>
```

See [Excalidraw docs](https://docs.excalidraw.com/) for all options.

## License

MIT
