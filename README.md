# WorkOS Command Center

UX-first Electron prototype for a machine setup command center.

## What is in v1

- A one-time onboarding wizard
- A post-onboarding command center
- A `Settings` surface for packages, languages, services, shell, and logs
- A local state model using browser storage for the prototype
- Bootstrap categories derived from `/Users/pierro/Documents/Development/bootstrap.sh`

## What is intentionally deferred

- Real execution of install steps
- Machine detection against `brew`, `pyenv`, `nvm`, and `brew services`
- SQLite persistence
- Keychain integration
- Auto-updates

## Suggested next implementation pass

1. Replace the static catalog with a manifest file.
2. Add backend commands for read-only machine audit.
3. Persist state under `Application Support`.
4. Add SQLite only when the execution layer exists.
5. Keep secrets out of SQLite and in Keychain.

## Development

```bash
npm install
npm run dev
```

## Changelog Workflow

Every commit should have a validated changelog entry in [CHANGELOG.md](./CHANGELOG.md).

```bash
npm run changelog:new -- "short summary"
```

Then fill in:

- `Changes`
- `Validation`

The repository also has a local pre-commit hook that blocks commits if `CHANGELOG.md` is not staged alongside the rest of the change set.
