# Release Guide

This document outlines the process for creating and publishing new releases of `@4xxi/langchain`.

## Prerequisites

- Access to the GitHub repository
- npm account with publishing rights to the `@4xxi` organization
- Node.js 18+ installed locally (if doing manual releases)

## Release Methods

You can release the package using one of two methods:

### Method 1: Automated Release (Recommended)

This method uses GitHub Actions to automate the release process.

1. **Navigate to the Actions tab** in the GitHub repository
2. **Select the "Publish Package" workflow** from the list
3. **Click "Run workflow"** (dropdown on the right side)
4. **Configure the release:**
   - Select the version bump type (`major`, `minor`, or `patch`)
   - Optionally check "Dry run" to test the process without publishing
5. **Click "Run workflow"** to start the process

The GitHub Action will:
- Run tests to verify everything works
- Build the package
- Bump the version in package.json
- Create a git commit and tag for the new version
- Publish to npm registry
- Push the changes back to the repository

You can monitor the progress in the Actions tab.

### Method 2: Manual Release

If you prefer to release manually:

1. **Clone the repository** (if you haven't already)
   ```bash
   git clone https://github.com/4xxi/langchain.git
   cd langchain
   ```

2. **Install dependencies**
   ```bash
   npm ci
   ```

3. **Run tests** to ensure everything works
   ```bash
   npm test
   ```

4. **Bump the version**
   ```bash
   # For a patch release (0.0.1 -> 0.0.2)
   npm version patch

   # For a minor release (0.0.1 -> 0.1.0)
   npm version minor

   # For a major release (0.0.1 -> 1.0.0)
   npm version major
   ```

5. **Build the package**
   ```bash
   npm run build
   ```

6. **Publish to npm**
   ```bash
   npm publish --access public
   ```

7. **Push changes** to GitHub
   ```bash
   git push && git push --tags
   ```

## Post-Release Verification

After a release (whether automated or manual), verify that:

1. **The package is available on npm**
   - Visit `https://www.npmjs.com/package/@4xxi/langchain` and check that the new version is listed

2. **The package can be installed**
   ```bash
   npm install @4xxi/langchain@latest
   ```

3. **The git tag exists** in the repository
   - On GitHub, go to `Releases` or `Tags` to see the new tag

## Troubleshooting

### npm Authentication Issues

If you encounter authentication errors with npm:

1. Ensure you're logged in to npm:
   ```bash
   npm login
   ```

2. Verify you have access to the @4xxi organization:
   ```bash
   npm access ls-packages
   ```

### GitHub Actions Failures

If the GitHub Actions workflow fails:

1. Check the workflow run logs in the Actions tab
2. Common issues include:
   - Missing NPM_TOKEN secret
   - Test failures
   - Permission issues with git push

For the NPM_TOKEN, make sure it's set in the repository secrets:
- Go to Settings > Secrets and variables > Actions
- Verify that NPM_TOKEN exists and is valid 