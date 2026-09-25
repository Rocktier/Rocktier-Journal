# Rocktier Journal

Private encrypted diary. Part of the Rocktier family of tools.

## Build

```bash
npm install
npm run tauri:dev      # development
npm run tauri:build    # production bundle
```

## Architecture

- Frontend: React 18 + TypeScript + Vite
- Backend: Tauri 2 (Rust)
- Encryption: AES-256-GCM + PBKDF2 (200,000 iterations)
- Storage: Encrypted `.rkd` binary files (one per day)
- Editor: Milkdown (WYSIWYG, plugin-driven, lightweight)
- Search: file-stem + date + title filter (full-text decrypts all entries locally)
- Export: ZIP archive of `.rkd` files
- Zero network: no HTTP capability, no servers, no cloud

## Features

- One encrypted diary entry per day
- 5 fixed moods + 1 custom mood
- Milkdown rich text editor (WYSIWYG)
- Calendar view with entry density markers
- Timeline / throwback view
- Full-text search with date/mood filters
- Encrypted ZIP export (Settings → Backup)
- English / Chinese (en-US / zh-CN) locale toggle
- Rocktier family design system: Nothing-OS-style dark/light themes

## License

MIT
