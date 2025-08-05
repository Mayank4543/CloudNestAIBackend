# CI/CD Pipeline Documentation

## Overview

This project uses GitHub Actions for continuous integration and deployment. The pipeline automatically runs tests, builds the TypeScript code, and can deploy to production.

## Pipeline Workflow

### Triggers

- **Push to main branch**: Runs full CI/CD including deployment
- **Pull requests to main**: Runs CI only (no deployment)

### Jobs

#### 1. Build and Test Job

- ✅ Installs Node.js 18
- ✅ Caches npm dependencies for faster builds
- ✅ Installs dependencies with `npm ci`
- ✅ Runs unit tests with `npm test`
- ✅ Builds TypeScript with `npm run build`
- ✅ Uploads build artifacts

#### 2. Deploy Job (main branch only)

- ✅ Downloads build artifacts
- ✅ Runs deployment (currently placeholder)

## Setup Instructions

### 1. Install Test Dependencies

```bash
npm install --save-dev jest @types/jest ts-jest supertest @types/supertest
```

### 2. Configure Secrets (for deployment)

Add these secrets in GitHub repository settings → Security → Secrets:

**For Render:**

- `RENDER_API_KEY`
- `RENDER_SERVICE_ID`

**For Heroku:**

- `HEROKU_API_KEY`

**For VPS:**

- `HOST`
- `USERNAME`
- `SSH_PRIVATE_KEY`

**For Docker:**

- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`

### 3. Environment Variables

Create `.env` file for local development:

```
NODE_ENV=development
PORT=3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d
```

## Pipeline Files

- `.github/workflows/main.yml` - Main CI/CD pipeline
- `.github/workflows/ci-cd.yml` - Alternative comprehensive pipeline

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Deployment

### Current Status

- ✅ CI pipeline configured
- ⏳ Deployment configured (uncomment desired method)

### Deployment Options

1. **Render** - Recommended for Node.js apps
2. **Heroku** - Popular platform
3. **VPS/Server** - Via SSH deployment
4. **Docker** - Containerized deployment

### To Enable Deployment:

1. Choose your deployment method in `.github/workflows/main.yml`
2. Uncomment the relevant deployment section
3. Add required secrets to GitHub repository
4. Push to main branch

## Monitoring

- View pipeline status in GitHub Actions tab
- Build artifacts stored for 30 days
- Failed builds prevent deployment

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```
