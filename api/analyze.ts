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
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });

    // Prompt diperbarui agar fokus ke isi, bukan format Markdown
    const prompt = `Lakukan analisis teknikal dan fundamental pragmatis untuk emiten ${ticker} (Sektor: ${sector}). 
      Harga saat ini: Rp${price}, BVPS: Rp${bvps.toFixed(2)}, PBV: ${pbv.toFixed(2)}x.
      Berikan hasil analisis yang terstruktur dan padat. Untuk faktor positif dan risiko, berikan dalam bentuk poin-poin yang jelas.`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        // Skema JSON dirombak total menjadi terstruktur
        responseSchema: {
          type: 'OBJECT',
          properties: {
            interpretasi: { type: 'STRING' },
            perbandingan_sektor: { type: 'STRING' },
            faktor_positif: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'Daftar poin-poin faktor positif, keunggulan, atau katalis pendorong saham'
            },
            risiko: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'Daftar poin-poin risiko investasi, ancaman, atau kelemahan saham'
            },
            kesimpulan: { type: 'STRING' }
          },
          required: ['interpretasi', 'perbandingan_sektor', 'faktor_positif', 'risiko', 'kesimpulan']
        }
      }
    } as any);

    const responseText = response.text || '{}';
    const aiData = JSON.parse(responseText);

    // Kirim seluruh objek JSON ke frontend
    return res.json(aiData);
    
  } catch (error: any) {
    console.error('Gemini API Error:', error);

    // Error handling lama kamu biarkan sama...
    if (error?.status === 429) {
      return res.status(429).json({ error: 'API Quota Habis', message: 'Anda sudah mencapai limit gratis Gemini API (20 request/hari).', retryable: false });
    }
    if (error?.message?.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({ error: 'Resource Exhausted', message: 'API quota limit tercapai. Silakan coba lagi nanti.', retryable: false });
    }
    return res.status(500).json({ error: 'AI analysis failed (Try again later)', details: error?.message || 'Unknown error' });
  }
}