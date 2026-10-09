# New wortwerk CLI Version

### 1\. Push current changes

### 2\. Bump the CLI version

From the repository root:

```
cd apps/cli
npm version minor --no-git-tag-version
cd ../..
```

This changes `0.1.0` to `0.2.0` without creating a Git tag yet.

### 3\. Build and verify

```
pnpm lint
pnpm typecheck
pnpm test
pnpm --dir apps/cli build

node apps/cli/dist/index.mjs --version
node apps/cli/dist/index.mjs init --help

cd apps/cli
npm pack --dry-run
cd ../..
```

`npm pack --dry-run` shows exactly which files npm will publish. It should primarily contain:

- `dist/index.mjs`
- `package.json`
- `README.md`
- License metadata

### 4\. Commit and deploy the release version

```
git add apps/cli/package.json
git commit -m "chore(cli): release 0.2.0"
git push
```

Deploy this commit and confirm the migration and setup pages are live.

### 5\. Authenticate with npm

```
npm login
npm whoami
```

The expected npm account is currently listed as `stefannn`. Interactive publishing requires npm 2FA or an appropriate granular token. [npm’s current publishing documentation (https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/)](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/) describes those requirements.

### 6\. Publish from the CLI directory

```
cd apps/cli
npm publish --access public
cd ../..
```

Run this inside `apps/cli`, since the repository root is a private workspace package. The `prepublishOnly` script automatically rebuilds the CLI before publication.

### 7\. Verify the published release

```
npm view wortwerk version
npx --yes wortwerk@0.2.0 --version
npx --yes wortwerk@0.2.0 init --help
```

Then test `npx wortwerk@0.2.0 init` in a disposable Git repository against production.

### 8\. Tag the successful release

```
git tag cli-v0.2.0
git push origin cli-v0.2.0
```
