import { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ticker } = req.query;

    if (!ticker || typeof ticker !== 'string') {
      return res.status(400).json({ error: 'Ticker parameter is required' });
    }

    const quote = (await yahooFinance.quote(ticker)) as any;
    let price = quote.regularMarketPrice || 0;
    let bvps = 0;
    let sector = 'Umum';

    try {
      const quoteSummary = (await yahooFinance.quoteSummary(ticker, {
        modules: ['defaultKeyStatistics', 'summaryProfile']
      })) as any;

      bvps = quoteSummary?.defaultKeyStatistics?.bookValue || 0;
      sector = quoteSummary?.summaryProfile?.sector || 'Umum';
    } catch (summaryError: any) {
      console.warn(`[Peringatan] Data fundamental tidak lengkap untuk ${ticker}.`);
    }

    // ==========================================
    // AUTO-NORMALISASI MATA UANG (USD -> IDR)
    // ==========================================
    if (price > 0 && bvps > 0 && price / bvps > 1000) {
      try {
        const forex = (await yahooFinance.quote('USDIDR=X')) as any;
        const usdToIdr = forex.regularMarketPrice || 16000;

        const oldBvps = bvps;
        bvps = bvps * usdToIdr;

        console.log(
          `[Kurs] Anomali Kurs Terdeteksi: BVPS USD ${oldBvps} dikonversi menjadi IDR ${bvps}`
        );
      } catch (forexErr) {
        console.warn('Gagal menarik kurs, menggunakan fallback Rp 16.000');
        bvps = bvps * 16000;
      }
    }

    // Add cache headers for 5 minutes
    res.setHeader('Cache-Control', 'public, max-age=300');

    return res.json({
      symbol: ticker,
      name: quote.longName || quote.shortName || ticker,
      price: price,
      bookValuePerShare: bvps,
      sector: sector
    });
  } catch (error: any) {
    console.error('Yahoo Finance Proxy Error:', error);
    return res.status(404).json({ error: 'Gagal menarik data dari database global.' });
  }
}
