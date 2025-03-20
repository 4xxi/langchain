# Integration Tests for MistralOcrLoader

This directory contains integration tests that verify the MistralOcrLoader functionality with real files and API calls.

## Setup

1. Create a `.env.test.local` file in the project root with your test API key:
   ```
   MISTRAL_API_KEY=your-test-api-key
   ```

2. Generate test image files:
   ```bash
   npm run test:setup
   ```
   This will create sample images in different formats (jpg, png, webp) in the `example_data` directory.

## Running Tests

Run integration tests:
```bash
npm run test:integration
```

Watch mode for development:
```bash
npm run test:integration:watch
```

## Test Coverage

The integration tests cover:

1. PDF Processing
   - Default settings (direct processing)
   - Forced image conversion
   - Page splitting options

2. Image Processing
   - Support for different image formats (jpg, png, webp)
   - Metadata extraction

3. Error Handling
   - Non-existent files
   - Unsupported file types
   - Invalid API key

## Sample Files

The tests use the following sample files:
- `example_data/file-sample_150kB.pdf` - Sample PDF file
- `example_data/sample.jpg` - Sample JPEG image
- `example_data/sample.png` - Sample PNG image
- `example_data/sample.webp` - Sample WebP image

These files are automatically generated from the sample PDF during test setup. 