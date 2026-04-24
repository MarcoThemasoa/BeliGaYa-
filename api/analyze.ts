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

    // 1. UPDATE PROMPT
    const prompt = `Lakukan analisis teknikal dan fundamental pragmatis untuk emiten ${ticker} (Sektor: ${sector}). 
      Harga saat ini: Rp${price}, BVPS: Rp${bvps.toFixed(2)}, PBV: ${pbv.toFixed(2)}x.
      Berikan respons dengan gaya profesional. Gunakan bullet points markdown untuk bagian faktor positif dan risiko.`;

    // 2. UPDATE RESPONSE SCHEMA
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            interpretasi: { type: 'STRING', description: 'Analisis mengenai metrik harga, BVPS, dan PBV dalam format markdown.' },
            perbandingan_sektor: { type: 'STRING', description: 'Perbandingan emiten dengan kompetitor di sektornya dalam format markdown.' },
            faktor_positif: { type: 'STRING', description: 'Poin-poin faktor positif, format HANYA sebagai bullet points markdown.' },
            risiko: { type: 'STRING', description: 'Poin-poin risiko, format HANYA sebagai bullet points markdown.' },
            kesimpulan: { type: 'STRING', description: 'Kesimpulan pragmatis dalam format markdown.' }
          },
          required: ['interpretasi', 'perbandingan_sektor', 'faktor_positif', 'risiko', 'kesimpulan']
        }
      }
    } as any);

    const responseText = response.text || '{}';
    const aiData = JSON.parse(responseText);

    res.setHeader('Cache-Control', 'public, max-age=3600');

    // 3. LANGSUNG RETURN SELURUH OBJECT AIDATA
    return res.json({
      interpretasi: aiData.interpretasi,
      perbandingan_sektor: aiData.perbandingan_sektor,
      faktor_positif: aiData.faktor_positif,
      risiko: aiData.risiko,
      kesimpulan: aiData.kesimpulan
    });
    
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