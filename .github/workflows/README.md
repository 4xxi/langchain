# GitHub Actions Workflows

This directory contains GitHub Actions workflows for automating the development and release process of `@4xxi/langchain`.

## Available Workflows

### 1. Test Workflow (`test.yml`)

This workflow runs automatically on:
- Every push to the `main` branch
- Every pull request targeting the `main` branch

It performs:
- Dependency installation
- Linting
- Running tests
- Checking the build process

The workflow runs on multiple Node.js versions (18.x and 20.x) to ensure compatibility.

### 2. Publish Workflow (`publish.yml`)

This workflow publishes the package to npm. It must be triggered manually from the GitHub Actions tab.

**Required Setup:**

1. Create an NPM access token:
   - Go to your npm account settings: https://www.npmjs.com/settings/[your-username]/tokens
   - Create a new token with "Automation" type
   - Copy the token

2. Add the token to your repository secrets:
   - Go to your GitHub repository
   - Navigate to Settings > Secrets and variables > Actions
   - Create a new repository secret named `NPM_TOKEN`
   - Paste your npm token as the value

**Usage:**

1. Go to the Actions tab in your repository
2. Select the "Publish Package" workflow
3. Click "Run workflow"
4. Choose:
   - The version bump type (major, minor, patch)
   - Whether to do a dry run (no actual publishing)
5. Click "Run workflow"

The workflow will:
- Run tests
- Build the package
- Bump the version according to your selection
- Create a git commit and tag
- Publish to npm (unless dry run is selected)
- Push changes back to the repository 