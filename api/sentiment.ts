import { VercelRequest, VercelResponse } from '@vercel/node';
import { HfInference } from '@huggingface/inference';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Get HF token from environment
    const hfToken = process.env.VITE_HF_TOKEN || process.env.HF_TOKEN;

    if (!hfToken) {
      console.warn('HF_TOKEN is not set. Inference API is not authorized.');
      return res.status(401).json({ error: 'HF_TOKEN missing' });
    }

    const hf = new HfInference(hfToken);

    try {
      const response = await hf.textClassification({
        model: 'mdhugol/indonesia-bert-sentiment-classification',
        inputs: text.substring(0, 480)
      });
      return res.json([response]);
    } catch (hfError: any) {
      console.error('HF Inference Provider Error:', hfError.message);

      if (
        hfError.message?.includes('503') ||
        hfError.message?.toLowerCase().includes('loading')
      ) {
        return res.status(503).json({ error: 'Model is warming up' });
      }

      if (
        hfError.message?.includes('401') ||
        hfError.message?.includes('Unauthorized')
      ) {
        return res.status(401).json({ error: 'Hugging Face requires a valid API token.' });
      }

      return res.status(500).json({
        error: 'Hugging Face API failed',
        details: hfError.message
      });
    }
  } catch (error: any) {
    console.error('Sentiment proxy error:', error);
    return res.status(500).json({ error: 'Internal server error connecting to sentiment model.' });
  }
}
