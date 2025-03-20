# Mistral OCR Parser

A LangChain integration for parsing OCR documents using Mistral models.

## Installation

```bash
npm install @4xxi/langchain
```

## Usage

```typescript
import { MistralOcrPDFLoader } from '@4xxi/langchain';

const loader = new MistralOcrPDFLoader(
  'path/to/your/document.pdf', 
  { 
    apiKey: 'your-mistral-api-key',
    modelName: 'mistral-large-latest'
  }
);

const docs = await loader.load();
console.log(docs);
```

## Setup for Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

## Development

- `npm run build` - Build the project
- `npm run build:watch` - Watch and rebuild on changes
- `npm run test` - Run tests
- `npm run test:watch` - Watch and run tests on changes
- `npm run lint` - Run linting
- `npm run format` - Format code

## Releasing

We use GitHub Actions to automate the release process. For detailed instructions, see [RELEASE.md](RELEASE.md).

Quick steps for manual release:
```bash
# Bump version (patch, minor, or major)
npm version patch

# Build and publish to npm
npm publish --access public

# Push changes to GitHub
git push && git push --tags
```

## Contributing

Please follow the [LangChain contribution guidelines](https://github.com/langchain-ai/langchainjs/blob/main/CONTRIBUTING.md) when making changes to this project.

## License

MIT 