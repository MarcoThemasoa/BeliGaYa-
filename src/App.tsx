import { useState, useRef, useEffect } from 'react';
import { Search, Info, TrendingUp, AlertTriangle, CheckCircle, Calculator, Building, Banknote, BrainCircuit, Loader2 } from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';

// BACKEND PROXY INTEGRATION (Pengganti FMP)
// ============================================
interface StockData {
  symbol: string;
  name: string;
  price: number;
  bookValuePerShare: number;
  sector: string;
}

const fetchStockData = async (searchTicker: string): Promise<StockData | null> => {
  try {
    const res = await fetch(`/api/stock?ticker=${searchTicker}`);
    if (!res.ok) {
      console.warn("Backend mengembalikan error:", res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("Gagal terhubung ke Backend Proxy:", err);
    return null;
  }
};
// ============================================
// CACHING SYSTEM
// ============================================
const CACHE_KEY_PREFIX = "bgy_analysis_";
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_SIZE = 5 * 1024 * 1024; // 5MB limit

const calculateCacheSize = (): number => {
  let size = 0;
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(CACHE_KEY_PREFIX)) {
      const item = localStorage.getItem(key);
      if (item) size += item.length * 2; // 2 bytes per character
    }
  });
  return size;
};

const pruneOldestCache = (): void => {
  const entries = Object.keys(localStorage)
    .filter(key => key.startsWith(CACHE_KEY_PREFIX))
    .map(key => ({ key, timestamp: JSON.parse(localStorage.getItem(key) || '{}').timestamp || 0 }))
    .sort((a, b) => a.timestamp - b.timestamp);
  
  if (entries.length > 0) {
    localStorage.removeItem(entries[0].key);
  }
};

interface CachedAnalysis {
  data: AnalysisResult;
  timestamp: number;
}

const getCacheKey = (ticker: string) => `${CACHE_KEY_PREFIX}${ticker.toUpperCase()}`;

const getCachedAnalysis = (ticker: string): AnalysisResult | null => {
  try {
    const cached = localStorage.getItem(getCacheKey(ticker));
    if (!cached) return null;
    
    const parsed: CachedAnalysis = JSON.parse(cached);
    const isExpired = Date.now() - parsed.timestamp > CACHE_EXPIRY_MS;
    
    if (isExpired) {
      localStorage.removeItem(getCacheKey(ticker));
      return null;
    }
    
    return parsed.data;
  } catch (e) {
    console.error("Cache read error:", e);
    return null;
  }
};

const cacheAnalysis = (ticker: string, data: AnalysisResult) => {
  try {
    const cached: CachedAnalysis = {
      data,
      timestamp: Date.now()
    };
    
    // Check cache size before writing
    let currentSize = calculateCacheSize();
    const itemSize = JSON.stringify(cached).length * 2;
    
    // Prune oldest entries if cache exceeds limit
    while (currentSize + itemSize > MAX_CACHE_SIZE && Object.keys(localStorage).some(k => k.startsWith(CACHE_KEY_PREFIX))) {
      pruneOldestCache();
      currentSize = calculateCacheSize();
    }
    
    localStorage.setItem(getCacheKey(ticker), JSON.stringify(cached));
  } catch (e) {
    console.error("Cache write error:", e);
  }
};

const clearCache = (ticker?: string) => {
  try {
    if (ticker) {
      localStorage.removeItem(getCacheKey(ticker));
    } else {
      // Clear all cache
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(CACHE_KEY_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    }
  } catch (e) {
    console.error("Cache clear error:", e);
  }
};

// ============================================
// ERROR HANDLING UTILITIES
// ============================================
interface ErrorDetail {
  message: string;
  suggestion: string;
  icon: string;
  retryable: boolean;
}

const parseGeminiError = (error: any): ErrorDetail => {
  const errorStr = JSON.stringify(error);
  
  // Quota/Rate Limit Errors
  if (error?.status === 429 || errorStr.includes("RESOURCE_EXHAUSTED")) {
    return {
      message: "API Quota Habis\n\nAnda sudah mencapai limit gratis Gemini API (20 request/hari).",
      suggestion: "Solusi:\n- Tunggu reset di jam 00:00 UTC (atau timezone lokal Anda)\n- Atau upgrade ke Paid Plan: https://ai.google.dev/gemini-api/docs/rate-limits\n- Data cache tersimpan & bisa diakses ulang tanpa quota.",
      icon: "LIMIT",
      retryable: false
    };
  }
  
  if (errorStr.includes("429") || errorStr.includes("TOO_MANY_REQUESTS")) {
    return {
      message: "Request Terlalu Banyak\n\nAPI rate limit tercapai. Silakan tunggu beberapa saat.",
      suggestion: "Coba lagi dalam 30-60 detik. Sistem akan retry otomatis.",
      icon: "RATE_LIMIT",
      retryable: true
    };
  }
  
  // Network/Connection Errors
  if (error?.message?.includes("NetworkError") || error?.message?.includes("fetch")) {
    return {
      message: "Koneksi Internet Gagal\n\nGagal terhubung ke server AI.",
      suggestion: "Cek koneksi internet Anda, pastikan stabil. Coba lagi dalam beberapa detik.",
      icon: "NETWORK",
      retryable: true
    };
  }
  
  // Timeout Errors
  if (error?.message?.includes("timeout") || error?.message?.includes("Timeout")) {
    return {
      message: "Request Timeout\n\nServer AI tidak merespons dalam waktu yang ditentukan.",
      suggestion: "Coba lagi. Jika masalah berlanjut, mungkin server AI sedang down.",
      icon: "TIMEOUT",
      retryable: true
    };
  }
  
  // Data Not Found
  if (error?.message?.includes("tidak ditemukan") || error?.message?.includes("data tidak tersedia")) {
    return {
      message: error.message,
      suggestion: "Cek di https://www.idx.co.id atau Stockbit untuk ticker yang benar.",
      icon: "NOT_FOUND",
      retryable: false
    };
  }
  
  // JSON Parse Error
  if (error?.message?.includes("JSON")) {
    return {
      message: "Format Response Error\n\nSistem AI mengembalikan format yang tidak valid.",
      suggestion: "Ini jarang terjadi. Coba lagi atau gunakan ticker lain.",
      icon: "PARSE_ERROR",
      retryable: true
    };
  }
  
  // Default Error
  return {
    message: `Terjadi Kesalahan\n\n${error?.message || "Error tidak diketahui"}`,
    suggestion: "Silakan coba lagi. Jika masalah berlanjut, hubungi support.",
    icon: "ERROR",
    retryable: true
  };
};

const TOP_STOCKS = [
  { ticker: 'BBCA', name: 'PT Bank Central Asia Tbk' },
  { ticker: 'BBRI', name: 'PT Bank Rakyat Indonesia (Persero) Tbk' },
  { ticker: 'BMRI', name: 'PT Bank Mandiri (Persero) Tbk' },
  { ticker: 'BBNI', name: 'PT Bank Negara Indonesia (Persero) Tbk' },
  { ticker: 'TLKM', name: 'PT Telkom Indonesia (Persero) Tbk' },
  { ticker: 'ASII', name: 'PT Astra International Tbk' },
  { ticker: 'GOTO', name: 'PT GoTo Gojek Tokopedia Tbk' },
  { ticker: 'ICBP', name: 'PT Indofood CBP Sukses Makmur Tbk' },
  { ticker: 'UNVR', name: 'PT Unilever Indonesia Tbk' },
  { ticker: 'AMMN', name: 'PT Amman Mineral Internasional Tbk' },
  { ticker: 'BRPT', name: 'PT Barito Pacific Tbk' },
  { ticker: 'SIDO', name: 'PT Industri Jamu dan Farmasi Sido Muncul Tbk' },
  { ticker: 'ADRO', name: 'PT Adaro Energy Indonesia Tbk' },
  { ticker: 'PGAS', name: 'PT Perusahaan Gas Negara Tbk' },
  { ticker: 'ANTM', name: 'PT Aneka Tambang Tbk' }
];

interface AnalysisResult {
  ticker: string;
  companyName: string;
  price: number;
  bvps: number;
  pbv: number;
  sector: string;
  analysis: string;
}

interface SentimentResult {
  label: string;
  score: number;
}

export default function App() {
  const [ticker, setTicker] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<ErrorDetail | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [sentimentState, setSentimentState] = useState<'idle' | 'loading' | 'warming_up' | 'success' | 'error'>('idle');
  const [sentimentData, setSentimentData] = useState<SentimentResult | null>(null);
  
  const [elapsedTime, setElapsedTime] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');

  const suggestionRef = useRef<HTMLDivElement>(null);
  const loadingMessageRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimeRef = useRef<NodeJS.Timeout | null>(null);
  const [showDelayedMessages, setShowDelayedMessages] = useState(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    function handleClickOutside(event: any) {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset when loading starts
  useEffect(() => {
  if (loading) {
    setElapsedTime(0);
    setLoadingMessage('');
    setShowDelayedMessages(false); // Reset this too
    
    elapsedTimeRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => {
      if (elapsedTimeRef.current) clearInterval(elapsedTimeRef.current);
    };
  }
}, [loading]);

  useEffect(() => {
  if (loading && elapsedTime === 5 && !showDelayedMessages) {
    setShowDelayedMessages(true);
  }
}, [loading, elapsedTime, showDelayedMessages]);

// Set up message cycling when showDelayedMessages becomes true
useEffect(() => {
  if (showDelayedMessages) {
    const messages = [
      'Sorry this takes quite a while...',
      'Just wait a little bit more...',
      'Almost there...',
      'This is Awkward...'
    ];
    
    setLoadingMessage(messages[0]);
    
    let messageIndex = 0;
    const interval = setInterval(() => {
      messageIndex = (messageIndex + 1) % messages.length;
      setLoadingMessage(messages[messageIndex]);
    }, 5000);

    return () => clearInterval(interval);
  }
}, [showDelayedMessages]);

  const filteredStocks = TOP_STOCKS.filter(stock => 
    stock.ticker.toLowerCase().includes(ticker.toLowerCase()) || 
    stock.name.toLowerCase().includes(ticker.toLowerCase())
  );

  const handleSelectSuggestion = (selectedTicker: string) => {
    setTicker(selectedTicker);
    setShowSuggestions(false);
  };

  const fetchSentiment = async (textToAnalyze: string) => {
    setSentimentState('loading');
    try {
      let isSuccess = false;
      let attempts = 0;
      let finalResult = null;
      let errorReason = '';

      // Clean the text and keep it under ~400 chars to avoid model limits
      const cleanedInput = textToAnalyze.replace(/[*#]/g, '').substring(0, 480);

      while (attempts < 3 && !isSuccess) {
        attempts++;
        const response = await fetch("/api/sentiment", {
          headers: { "Content-Type": "application/json" },
          method: "POST",
          body: JSON.stringify({ text: cleanedInput }),
        });
        
        if (response.status === 503) {
           setSentimentState('warming_up');
           // Wait 5 seconds and retry (HuggingFace needs time to spin up the container)
           await new Promise(resolve => setTimeout(resolve, 5000));
        } else if (response.ok) {
           finalResult = await response.json();
           isSuccess = true;
        } else {
           const errData = await response.json().catch(() => null);
           if (response.status === 401) {
             errorReason = 'missing_token';
           }
           break; // Other error, e.g., 429 rate limit or 401 missing token
        }
      }

      if (isSuccess && finalResult) {
        if (Array.isArray(finalResult) && finalResult[0] && Array.isArray(finalResult[0])) {
           // Find highest score sentiment
           const highest = finalResult[0].reduce((prev: any, current: any) => (prev.score > current.score) ? prev : current);
           setSentimentData(highest);
           setSentimentState('success');
        } else {
           setSentimentState('error');
        }
      } else {
        if (errorReason === 'missing_token') {
          setSentimentState('missing_token' as any);
        } else {
          setSentimentState('error');
        }
      }
    } catch (e) {
      console.error("HF Inference Error:", e);
      setSentimentState('error');
    }
  };

  const analyzeStock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedTicker = ticker.trim().toUpperCase();
    
    // Validasi input
    if (!trimmedTicker) {
      setError('Masukkan kode saham terlebih dahulu (misal: BBCA, TLKM, GOTO)');
      return;
    }
    
    if (trimmedTicker.length > 5) {
      setError('Kode saham terlalu panjang. Format ticker Indonesia maksimal 4 karakter (misal: BBCA, TLKM).');
      return;
    }
    
    if (!/^[A-Z0-9.]+$/.test(trimmedTicker)) {
      setError('Kode saham hanya boleh menggunakan huruf A-Z, angka, atau titik. Contoh: BBCA atau BBCA.JK');
      return;
    }
    
    setShowSuggestions(false);
    setLoading(true);
    setError(null);
    setErrorDetail(null);
    setResult(null);
    setSentimentState('idle');
    setSentimentData(null);

    try {
      const rawTicker = trimmedTicker;
      const searchTicker = rawTicker.includes(".") ? rawTicker : `${rawTicker}.JK`;

      // 1. CACHE CHECK (Returns early if found)
      const cachedData = getCachedAnalysis(rawTicker);
      if (cachedData) {
        setResult(cachedData);
        fetchSentiment(cachedData.analysis || cachedData.companyName);
        setLoading(false);
        return;
      }

      // 2. FETCH HARD DATA FROM BACKEND PROXY
      const stockData = await fetchStockData(searchTicker);
      
      if (!stockData || !stockData.price) {
        setLoading(false);
        setError(`Saham dengan ticker "${rawTicker}" tidak ditemukan di IDX atau data tidak tersedia.\n\nSaran:\n- Pastikan ticker benar (cek di www.idx.co.id)\n- Ticker harus format seperti: BBCA, TLKM, GOTO`);
        return;
      }

      // Hitung P/BV secara dinamis (Backend sudah menjamin datanya dalam IDR)
      let calculatedPbv = 0;
      if (stockData.bookValuePerShare && stockData.bookValuePerShare > 0) {
        calculatedPbv = stockData.price / stockData.bookValuePerShare;
      }

      // 3. CALL BACKEND ANALYSIS API
      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: rawTicker,
          sector: stockData.sector,
          price: stockData.price,
          bvps: stockData.bookValuePerShare,
          pbv: calculatedPbv
        })
      });

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Analysis API failed with status ${analyzeResponse.status}`);
      }

      const aiData = await analyzeResponse.json();

      const finalResult = {
        ticker: rawTicker,
        companyName: stockData.name || rawTicker,
        price: stockData.price || 0,
        bvps: stockData.bookValuePerShare || 0,
        pbv: calculatedPbv || 0,
        sector: stockData.sector || "Umum",
        analysis: aiData.analysis || "Analisis tidak tersedia."
      };

      // === SAVE TO CACHE UPON SUCCESS ===
      cacheAnalysis(rawTicker, finalResult);
      setResult(finalResult);

      // Call HuggingFace RoBERTa API
      fetchSentiment(finalResult.analysis || finalResult.companyName);

    } catch (err: any) {
      console.error("Analysis Exception:", err);
      const errorDetail = parseGeminiError(err);
      setErrorDetail(errorDetail);
      setError(errorDetail.message);
    } finally {
      setLoading(false);
    }
  };

  const getPbvStatus = (pbv: number) => {
    if (pbv === 0) return { label: 'N/A (Anomali)', color: 'text-text-dim', icon: Info };
    if (pbv < 1.0) return { label: 'Undervalued', color: 'text-emerald-500', icon: CheckCircle };
    if (pbv <= 3.0) return { label: 'Fair Value', color: 'text-accent', icon: Info };
    return { label: 'Overvalued', color: 'text-rose-500', icon: AlertTriangle };
  };

  return (
    <div className="min-h-screen bg-background text-text-main font-sans selection:bg-accent/30 selection:text-accent flex flex-col">
      {/* Header */}
      <header className="h-[72px] border-b border-border-subtle bg-surface px-6 md:px-10 flex items-center justify-between sticky top-0 z-10 shrink-0">
        <div className="font-serif text-xl md:text-2xl italic tracking-[-0.5px] text-accent font-bold">
          BGY <span className="text-white text-lg font-normal ml-1">(Beli Ga Ya?)</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="hidden md:inline-flex items-center px-3 py-1 bg-surface-light border border-border-subtle rounded-full text-[11px] text-accent tracking-[0.5px]">
            AI Engine: Active
          </span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-10 flex flex-col gap-6">
        
        {/* Search / Hero Section */}
        <div className={cn("bg-surface border border-border-subtle rounded p-6 md:p-10 flex flex-col transition-all duration-300", !result && "items-center text-center mt-4 md:mt-12 max-w-3xl mx-auto w-full")}>
          {!result && (
            <>
              <h2 className="font-serif text-[28px] md:text-[36px] text-white mb-4">Stock Valuation Engine</h2>
              <p className="text-[15px] leading-[1.6] text-text-dim mb-8">
                Enter an Indonesian stock ticker to parse fundamental P/BV data and generate logical AI insights.
              </p>
            </>
          )}
          
          <form onSubmit={analyzeStock} className={cn("relative flex flex-col md:flex-row gap-4 w-full", !result && "max-w-xl")}>
            <div className="relative flex-1" ref={suggestionRef}>
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-text-dim" />
              </div>
              <input
                type="text"
                value={ticker}
                onChange={(e) => {
                  setTicker(e.target.value.toUpperCase());
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Enter ticker (e.g., BBCA, TLKM)"
                className="w-full bg-surface-light border border-border-subtle text-text-main pl-12 pr-4 py-4 text-[15px] rounded focus:outline-none focus:border-accent uppercase placeholder:normal-case transition-colors"
                disabled={loading}
              />
              {/* Dropdown Suggestions */}
              {showSuggestions && ticker.length > 0 && filteredStocks.length > 0 && (
                 <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border-subtle rounded shadow-2xl z-50 max-h-64 overflow-y-auto w-full">
                    {filteredStocks.map((stock) => (
                       <button 
                         key={stock.ticker}
                         type="button"
                         className="w-full text-left px-4 py-3 hover:bg-surface-light border-b border-border-subtle last:border-b-0 cursor-pointer flex flex-col transition-colors"
                         onClick={() => handleSelectSuggestion(stock.ticker)}
                       >
                          <span className="font-bold text-accent text-[13px]">{stock.ticker}</span>
                          <span className="text-[11px] text-text-dim">{stock.name}</span>
                       </button>
                    ))}
                 </div>
              )}
            </div>
            
            <button
              type="submit"
              disabled={loading || !ticker.trim()}
              className="bg-accent text-black uppercase tracking-[1px] text-[13px] font-semibold px-6 md:px-8 py-4 border-none cursor-pointer rounded transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  {elapsedTime >= 5 ? loadingMessage : 'Please wait, currently analyzing...'}
                </span>
              ) : (
                'Analyze'
              )}
            </button>
          </form>

          {error && (
            <div className="mt-6 w-full text-left bg-surface-light border border-rose-900/50 text-rose-400 p-5 rounded text-[13px] flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="whitespace-pre-wrap leading-relaxed font-semibold">{error}</p>
                {errorDetail && errorDetail.suggestion && (
                  <p className="whitespace-pre-wrap leading-relaxed mt-3 opacity-90">{errorDetail.suggestion}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Results Section */}
        {result && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            
            {/* Header Information Card */}
            <div className="bg-surface border border-border-subtle rounded p-6 md:p-8 relative">
              <div className="text-[10px] uppercase tracking-[2px] text-text-dim mb-4">Target Entity</div>
              <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6">
                <div>
                  <h2 className="font-serif text-[28px] md:text-[32px] text-white mb-3">{result.companyName}</h2>
                  <div className="flex gap-3">
                    <span className="inline-flex items-center px-3 py-1 bg-surface-light border border-border-subtle rounded-full text-[11px] text-text-main font-mono">
                      {result.ticker}
                    </span>
                    <span className="inline-flex items-center px-3 py-1 bg-surface-light border border-border-subtle rounded-full text-[11px] text-text-dim uppercase tracking-[1px]">
                      {result.sector}
                    </span>
                  </div>
                </div>
                <div className="text-left md:text-right">
                  <div className="text-[11px] uppercase tracking-[1px] text-text-dim mb-1">Market Price</div>
                  <div className="font-serif text-[24px] md:text-[28px] text-accent flex items-baseline gap-1.5 md:justify-end">
                    <span className="text-[16px] md:text-[18px] text-accent/80">Rp</span>
                    <span>{result.price.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Pipeline / Grids */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* P/BV Card */}
              {(() => {
                const status = getPbvStatus(result.pbv);
                return (
                  <div className="bg-surface-light border border-border-subtle p-6 rounded flex flex-col justify-between min-h-[140px]">
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-[12px] font-semibold text-text-main flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-text-dim" /> P/BV Ratio
                      </div>
                    </div>
                    <div>
                      <div className="text-[32px] md:text-[40px] font-serif text-white mb-2 leading-none">
                        {result.pbv.toFixed(2)}<span className="text-text-dim text-[20px] md:text-[24px]">x</span>
                      </div>
                      <div className={cn("text-[10px] uppercase tracking-[2px] px-2 py-1 inline-block rounded bg-surface border border-border-subtle", status.color)}>
                        {status.label}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* BVPS Card */}
              <div className="bg-surface-light border border-border-subtle p-6 rounded flex flex-col justify-between min-h-[140px]">
                <div className="text-[12px] font-semibold text-text-main flex items-center gap-2 mb-4">
                  <Banknote className="w-4 h-4 text-text-dim" /> Book Value / Share
                </div>
                <div>
                  <div className="text-[24px] md:text-[28px] font-serif text-white leading-tight mb-2">
                    {/* Render angka desimal jika di bawah 1, sebaliknya bulatkan normal */}
                    Rp {result.bvps > 0 && result.bvps < 1 
                        ? result.bvps.toFixed(3) 
                        : Math.round(result.bvps).toLocaleString('id-ID')}
                  </div>
                  <div className="text-[10px] uppercase tracking-[2px] text-text-dim">BVPS</div>
                </div>
              </div>

              {/* Sector Card */}
              <div className="bg-surface-light border border-border-subtle p-6 rounded flex flex-col justify-between min-h-[140px]">
                <div className="text-[12px] font-semibold text-text-main flex items-center gap-2 mb-4">
                  <Building className="w-4 h-4 text-text-dim" /> Industry Check
                </div>
                <div>
                  <div className="text-[20px] font-serif text-white leading-tight">
                    {result.sector}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Analysis Block */}
            <div className="bg-surface border border-border-subtle rounded p-6 md:p-8">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4 border-b border-border-subtle pb-4">
                <div className="text-[10px] uppercase tracking-[2px] text-text-dim flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Logic Synthesis
                </div>
                
                {/* Sentiment Pill Group */}
                <div className="flex flex-col gap-3 w-full lg:w-auto">
                  <div className="flex items-center gap-2 flex-wrap">
                    {sentimentState === 'loading' && (
                      <span className="flex items-center gap-2 text-[11px] text-text-dim px-3 py-1 bg-surface-light border border-border-subtle rounded-full">
                        <Loader2 className="w-3 h-3 animate-spin" /> NLP Sentiment...
                      </span>
                    )}
                    {sentimentState === 'warming_up' && (
                      <span className="flex items-center gap-2 text-[11px] text-amber-500 px-3 py-1 bg-surface-light border border-border-subtle rounded-full">
                        <Loader2 className="w-3 h-3 animate-spin" /> Warming up HuggingFace Model...
                      </span>
                    )}
                    {sentimentState === 'error' && (
                      <span className="text-[11px] text-text-dim px-3 py-1 bg-surface-light border border-border-subtle rounded-full" title="Rate limit or endpoint error from HuggingFace Free Tier">
                        Sentiment HF: Failed
                      </span>
                    )}
                    {sentimentState === 'missing_token' as any && (
                      <span className="text-[11px] text-amber-500 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full" title="Requires HF_TOKEN token">
                        HF_TOKEN required for Sentiment AI
                      </span>
                    )}
                    {sentimentState === 'success' && sentimentData && (
                      <span className={cn(
                        "text-[11px] uppercase tracking-[0.5px] px-3 py-1 rounded-full border shadow-sm font-bold flex items-center gap-1",
                        sentimentData.label?.includes('POSITIVE') || sentimentData.label === 'LABEL_2' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                        sentimentData.label?.includes('NEGATIVE') || sentimentData.label === 'LABEL_0' ? "bg-rose-500/10 text-rose-400 border-rose-500/30" :
                        "bg-blue-500/10 text-blue-400 border-blue-500/30"
                      )}>
                        <BrainCircuit className="w-3 h-3" />
                        Sentiment: {
                          sentimentData.label?.includes('POSITIVE') || sentimentData.label === 'LABEL_2' ? 'Positive' : 
                          sentimentData.label?.includes('NEGATIVE') || sentimentData.label === 'LABEL_0' ? 'Negative' : 
                          'Neutral'
                        } ({Math.round(sentimentData.score * 100)}%)
                      </span>
                    )}

                    <span className="hidden md:inline-flex items-center px-3 py-1 bg-accent/[0.05] border border-accent/30 rounded-full text-[11px] text-accent tracking-[0.5px]">
                      Gemini Search AI
                    </span>
                  </div>

                  {/* Sentiment Explanation Tooltip */}
                  {sentimentState === 'success' && sentimentData && (
                    <div className={cn(
                      "text-[12px] leading-[1.5] px-3 py-2 rounded border",
                      sentimentData.label?.includes('POSITIVE') || sentimentData.label === 'LABEL_2' 
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" :
                      sentimentData.label?.includes('NEGATIVE') || sentimentData.label === 'LABEL_0' 
                        ? "bg-rose-500/10 text-rose-300 border-rose-500/30" :
                        "bg-blue-500/10 text-blue-300 border-blue-500/30"
                    )}>
                      {sentimentData.label?.includes('POSITIVE') || sentimentData.label === 'LABEL_2' ? (
                        <div>
                          <strong className="block mb-1">Sentiment Positif (Bullish)</strong>
                          <p>Analisis menunjukkan prospek menguntungkan, potensi pertumbuhan, atau faktor-faktor positif dominan. Namun tetap lakukan riset lebih lanjut sebelum berinvestasi.</p>
                        </div>
                      ) : sentimentData.label?.includes('NEGATIVE') || sentimentData.label === 'LABEL_0' ? (
                        <div>
                          <strong className="block mb-1">Sentiment Negatif (Bearish)</strong>
                          <p>Analisis menunjukkan risiko tinggi, potensi penurunan, atau faktor-faktor negatif dominan. Pertimbangkan dengan hati-hati sebelum membeli.</p>
                        </div>
                      ) : (
                        <div>
                          <strong className="block mb-1">Sentiment Netral (Hold)</strong>
                          <p>Analisis menunjukkan prospek seimbang dengan faktor positif dan negatif yang setara. Tunggu sinyal yang lebih jelas atau cari informasi tambahan.</p>
                        </div>
                      )}
                      <p className="text-[11px] mt-2 opacity-80">Persentase disebelah Sentimen adalah Confidence Score, dimana semakin tinggi persentase = model AI semakin yakin dengan penilaiannya.</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="markdown-body">
                <Markdown>{result.analysis}</Markdown>
              </div>
            </div>

          </div>
        )}
      </main>
      
      {/* Footer */}
      <footer className="border-t border-border-subtle bg-surface mt-auto py-5 relative shrink-0">
        <div className="max-w-5xl mx-auto px-6 text-center md:text-left">
          <p className="text-[11px] uppercase tracking-[1px] text-text-dim leading-[1.6]">
            <strong className="text-text-main font-semibold">Disclaimer:</strong> 
            {" "}Educative analysis only. Not financial advice. Data may experience latency.
          </p>
        </div>
      </footer>
    </div>
  );
}
