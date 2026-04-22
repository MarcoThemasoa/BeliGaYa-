# Deployment Guide for Vercel

This project is configured for deployment on Vercel using serverless functions for the backend API endpoints.

## Pre-Deployment Checklist

- [ ] All environment variables configured in `.env` file locally
- [ ] `npm run build` runs successfully and generates `dist/` folder
- [ ] `npm run lint` passes with no errors
- [ ] Test locally: `npm run dev`
- [ ] Verify all API endpoints work (`/api/stock`, `/api/sentiment`, `/api/analyze`)

## Environment Variables Required

Set these in Vercel Project Settings > Environment Variables:

1. **GEMINI_API_KEY** - Get from https://ai.google.dev
   - This powers the stock analysis AI feature
   - Free tier: 20 requests per day

2. **HF_TOKEN** - Get from https://huggingface.co/settings/tokens
   - This powers the sentiment analysis feature
   - Make sure to enable API access in your token settings

3. **NODE_ENV** - Set to `production` (Vercel does this automatically)

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard

1. Push your code to GitHub (or GitLab/Bitbucket)
2. Go to https://vercel.com
3. Click "Add New Project" and select your repository
4. Configure environment variables in the dashboard:
   - Add `GEMINI_API_KEY`
   - Add `HF_TOKEN`
5. Click "Deploy"
6. Vercel will automatically:
   - Run `npm run build`
   - Build serverless functions from `/api` folder
   - Deploy frontend to CDN
   - Set up automatic deployments on git push

### Option 2: Deploy via Vercel CLI

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy from your project directory
vercel --prod

# Set environment variables when prompted or via dashboard later
```

## Project Structure for Vercel

```
project/
├── api/                    # Serverless functions (auto-deployed)
│   ├── stock.ts           # GET /api/stock?ticker=BBCA
│   ├── sentiment.ts       # POST /api/sentiment
│   └── analyze.ts         # POST /api/analyze
├── src/                    # React frontend
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── dist/                   # Built frontend (auto-generated)
├── vite.config.ts
├── vercel.json            # Vercel configuration
└── package.json
```

## Build Optimizations Included

✅ **Minification** - Terser with console drops  
✅ **Code Splitting** - Vendor bundles separated  
✅ **Asset Optimization** - Images and CSS organized  
✅ **Cache Headers** - Proper caching on CDN  
✅ **Security Headers** - X-Frame-Options, X-XSS-Protection, etc.

## Local Development

```bash
# Install dependencies
npm install

# Start development server with HMR
npm run dev

# Build for production (simulates Vercel build)
npm run build

# Preview production build locally
npm run preview

# Type check
npm run lint
```

## Frontend API Base URL

All API calls automatically use relative paths (`/api/...`) which work both locally and on Vercel:
- Local: `http://localhost:5173/api/stock`
- Production: `https://your-domain.vercel.app/api/stock`

## API Endpoints

### 1. Stock Data - GET `/api/stock?ticker=BBCA`
Returns price, BVPS, and sector data from Yahoo Finance.

**Query Parameters:**
- `ticker` (required) - Stock ticker code (e.g., `BBCA`, `TLKM`, `BBCA.JK`)

**Response:**
```json
{
  "symbol": "BBCA",
  "name": "PT Bank Central Asia Tbk",
  "price": 18750,
  "bookValuePerShare": 4567.89,
  "sector": "Financial Services"
}
```

### 2. Sentiment Analysis - POST `/api/sentiment`
Analyzes text sentiment using Hugging Face RoBERTa model.

**Body:**
```json
{
  "text": "This stock looks promising"
}
```

**Response:**
```json
[
  [
    {
      "label": "positive",
      "score": 0.87
    }
  ]
]
```

### 3. Stock Analysis - POST `/api/analyze`
Generates AI-powered stock analysis using Gemini API.

**Body:**
```json
{
  "ticker": "BBCA",
  "sector": "Financial Services",
  "price": 18750,
  "bvps": 4567.89,
  "pbv": 4.1
}
```

**Response:**
```json
{
  "analysis": "# Analisis BBCA\n\n## Interpretasi Metrik..."
}
```

## Troubleshooting

### "GEMINI_API_KEY missing" error
- Check that `GEMINI_API_KEY` is set in Vercel project settings
- Redeploy after setting the variable
- Verify the key is valid at https://ai.google.dev

### "HF_TOKEN missing" error
- Check that `HF_TOKEN` is set in Vercel project settings
- Verify token has API access enabled at https://huggingface.co/settings/tokens
- Redeploy after setting the variable

### "Function exceeded maximum duration"
- Gemini API calls can take 30-45 seconds
- Vercel's default timeout is 60 seconds (sufficient)
- If you see timeout errors, increase `maxDuration` in `vercel.json`

### Slow initial API response (cold start)
- First request to a serverless function can take 3-5 seconds
- Subsequent requests are much faster
- This is normal and expected on Vercel

### Build failing with "vite not found"
- Run `npm install` locally before pushing
- Ensure `vite` is in `devDependencies` (not `dependencies`)

## Performance Monitoring

Vercel provides built-in monitoring:
1. Go to Vercel Dashboard > Select your project
2. View "Analytics" tab for:
   - Response times
   - Error rates
   - Cold start durations
   - Bandwidth usage

## Cost Considerations

- **Vercel**: Free tier includes generous usage limits
- **Gemini API**: Free tier includes 20 requests/day
- **Hugging Face**: Free tier includes inference API access
- **Yahoo Finance**: Free data via yahoo-finance2 library

## Next Steps

1. Set environment variables in Vercel dashboard
2. Deploy via Vercel CLI or dashboard
3. Test the deployed app
4. Set up custom domain (optional)
5. Configure automatic deployments on git push
