# Contributing

## Setup

```bash
git clone <repo>
cd scanpart-astana
cp .env.example .env       # fill in values from password manager
npm install
npm run dev                # http://localhost:3000/ru
```

## Pre-commit hooks

```bash
pip install pre-commit     # or `brew install pre-commit`
pre-commit install
```

The hooks run `gitleaks` (secret scan), ESLint (zero warnings), and
TypeScript typecheck. Do **not** bypass them.

## Branch flow

- `main` is protected; merges require a green CI run on a PR.
- Feature branches: `feat/<short-name>`.
- Fixes: `fix/<short-name>`.
- Chores/docs: `chore/<short-name>` or `docs/<short-name>`.
- One PR per logical change. Keep PRs small and reviewable.

## Commits

Conventional Commits encouraged:

```
feat(admin): add image-slot uploader
fix(vin): accept European VINs ignored by NHTSA
docs(security): add Cloudinary rotation playbook
```

## Definition of Done

A PR is mergeable when:

- CI green (gitleaks + lint + typecheck + build)
- New env variables added to `.env.example` and to GitHub Secrets if needed
- Admin-visible changes documented in `docs/admin-guide.md`
- Manual smoke test: `npm run build && npm run start`, hit affected pages
