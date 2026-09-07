# TravPlanner

TravPlanner is a Firebase-backed group trip planner. The Next.js app reads authoritative trip state from Firestore and sends domain mutations through callable Cloud Functions.

See [docs/integration.md](docs/integration.md) for the architecture, setup, workflow, emulator, build, and deployment notes.

## Quick start

```bash
npm install
copy .env.example .env.local
npm run dev
```

Fill the Firebase and optional Google Maps values in `.env.local` before using external services. Never commit `.env.local` or provider credentials.
