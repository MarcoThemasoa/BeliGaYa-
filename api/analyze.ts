import { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-3-flash-preview';

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
    const { ticker, sector, price, bvps, pbv } = req.body;

    if (!ticker || price === undefined || bvps === undefined || pbv === undefined) {
      return res.status(400).json({ error: 'Missing required fields: ticker, price, bvps, pbv' });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.error('GEMINI_API_KEY is not set');
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const prompt = `Lakukan analisis teknikal dan fundamental pragmatis untuk emiten ${ticker} (Sektor: ${sector}). 
    Harga saat ini: Rp${price}, BVPS: Rp${bvps.toFixed(2)}, PBV: ${pbv.toFixed(2)}x.
    Berikan respons dalam format JSON dengan kunci: 'interpretasi', 'perbandingan_sektor', 'faktor_positif' (gunakan bullet points markdown), 'risiko' (gunakan bullet points markdown), dan 'kesimpulan'.`;
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            analysis: {
              type: 'STRING',
              description: 'Markdown formatted analysis string containing Interpretasi, Perbandingan Sektor, Faktor Positif, Risiko, and Kesimpulan.'
            }
          },
          required: ['analysis']
        }
      }
    } as any);

    const responseText = response.text || '{}';
    const aiData = JSON.parse(responseText);

    // Add cache headers for 1 hour
    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.json({
      analysis: aiData.analysis || 'Analisis tidak tersedia.'
    });
  } catch (error: any) {
    console.error('Gemini API Error:', error);

    // Handle specific Gemini errors
    if (error?.status === 429) {
      return res.status(429).json({
        error: 'API Quota Habis',
        message: 'Anda sudah mencapai limit gratis Gemini API (20 request/hari).',
        retryable: false
      });
    }

    if (error?.message?.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({
        error: 'Resource Exhausted',
        message: 'API quota limit tercapai. Silakan coba lagi nanti.',
        retryable: false
      });
    }

    return res.status(500).json({
      error: 'AI analysis failed',
      details: error?.message || 'Unknown error'
    });
  }
}
