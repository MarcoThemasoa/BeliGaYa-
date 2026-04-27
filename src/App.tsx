import { useState, useRef, useEffect } from 'react';
import { Search, Info, TrendingUp, AlertTriangle, CheckCircle, Calculator, Building, Banknote, BrainCircuit, Loader2, ArrowRight } from 'lucide-react';
import { cn } from './lib/utils';

// ============================================
// BACKEND PROXY INTEGRATION (Pengganti FMP) & CACHING
// (Your existing logic is untouched here)
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
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("Gagal terhubung ke Backend Proxy:", err);
    return null;
  }
};

const CACHE_KEY_PREFIX = "bgy_analysis_";
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; 
const MAX_CACHE_SIZE = 5 * 1024 * 1024; 
const DAILY_RESET_KEY = "bgy_last_reset_date";

const checkAndResetDailyCache = (): void => {
  const today = new Date().toDateString();
  const lastResetDate = localStorage.getItem(DAILY_RESET_KEY);
  if (lastResetDate !== today) {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) localStorage.removeItem(key);
    });
    localStorage.setItem(DAILY_RESET_KEY, today);
  }
};
checkAndResetDailyCache();

const calculateCacheSize = (): number => {
  let size = 0;
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(CACHE_KEY_PREFIX)) {
      const item = localStorage.getItem(key);
      if (item) size += item.length * 2; 
    }
  });
  return size;
};

const pruneOldestCache = (): void => {
  const entries = Object.keys(localStorage)
    .filter(key => key.startsWith(CACHE_KEY_PREFIX))
    .map(key => ({ key, timestamp: JSON.parse(localStorage.getItem(key) || '{}').timestamp || 0 }))
    .sort((a, b) => a.timestamp - b.timestamp);
  if (entries.length > 0) localStorage.removeItem(entries[0].key);
};

interface CachedAnalysis {
  data: AnalysisResult;
  timestamp: number;
  lastAnalyzedTime?: number;
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
    return {
      ...parsed.data,
      analysis: parsed.data.analysis, 
      lastAnalyzedTime: parsed.lastAnalyzedTime || parsed.timestamp
    };
  } catch (e) {
    return null;
  }
};

const cacheAnalysis = (ticker: string, data: AnalysisResult) => {
  try {
    const now = Date.now();
    const cached: CachedAnalysis = {
      data: { ...data, lastAnalyzedTime: now },
      timestamp: now,
      lastAnalyzedTime: now
    };
    let currentSize = calculateCacheSize();
    const itemSize = JSON.stringify(cached).length * 2;
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
    if (ticker) localStorage.removeItem(getCacheKey(ticker));
    else Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) localStorage.removeItem(key);
    });
  } catch (e) {}
};

// ============================================
// ERROR HANDLING UTILITIES (Unchanged)
// ============================================
interface ErrorDetail { message: string; suggestion: string; icon: string; retryable: boolean; }
const parseGeminiError = (error: any): ErrorDetail => {
  const errorStr = JSON.stringify(error);
  if (error?.status === 429 || errorStr.includes("RESOURCE_EXHAUSTED")) {
    return { message: "API Quota Habis", suggestion: "Solusi:\n- Tunggu reset di jam 00:00 UTC\n- Data cache tersimpan & bisa diakses ulang tanpa quota.", icon: "LIMIT", retryable: false };
  }
  if (errorStr.includes("429") || errorStr.includes("TOO_MANY_REQUESTS")) {
    return { message: "Request Terlalu Banyak", suggestion: "Coba lagi dalam 30-60 detik.", icon: "RATE_LIMIT", retryable: true };
  }
  if (error?.message?.includes("NetworkError") || error?.message?.includes("fetch")) {
    return { message: "Koneksi Internet Gagal", suggestion: "Cek koneksi internet Anda.", icon: "NETWORK", retryable: true };
  }
  if (error?.message?.includes("timeout") || error?.message?.includes("Timeout")) {
    return { message: "Request Timeout", suggestion: "Coba lagi. Server AI lambat.", icon: "TIMEOUT", retryable: true };
  }
  if (error?.message?.includes("tidak ditemukan")) {
    return { message: error.message, suggestion: "Cek di idx.co.id untuk ticker yang benar.", icon: "NOT_FOUND", retryable: false };
  }
  return { message: `Terjadi Kesalahan\n\n${error?.message || "Error tidak diketahui"}`, suggestion: "Silakan coba lagi.", icon: "ERROR", retryable: true };
};

const TOP_STOCKS = [
  { ticker: 'BBCA', name: 'PT Bank Central Asia Tbk' }, { ticker: 'BBRI', name: 'PT Bank Rakyat Indonesia (Persero) Tbk' },
  { ticker: 'BMRI', name: 'PT Bank Mandiri (Persero) Tbk' }, { ticker: 'BBNI', name: 'PT Bank Negara Indonesia (Persero) Tbk' },
  { ticker: 'TLKM', name: 'PT Telkom Indonesia (Persero) Tbk' }, { ticker: 'ASII', name: 'PT Astra International Tbk' },
  { ticker: 'GOTO', name: 'PT GoTo Gojek Tokopedia Tbk' }, { ticker: 'ICBP', name: 'PT Indofood CBP Sukses Makmur Tbk' },
  { ticker: 'UNVR', name: 'PT Unilever Indonesia Tbk' }, { ticker: 'AMMN', name: 'PT Amman Mineral Internasional Tbk' },
  { ticker: 'BRPT', name: 'PT Barito Pacific Tbk' }, { ticker: 'SIDO', name: 'PT Industri Jamu dan Farmasi Sido Muncul Tbk' },
  { ticker: 'ADRO', name: 'PT Adaro Energy Indonesia Tbk' }, { ticker: 'PGAS', name: 'PT Perusahaan Gas Negara Tbk' },
  { ticker: 'ANTM', name: 'PT Aneka Tambang Tbk' }
];

const formatLastAnalyzedTime = (timestamp?: number): string => {
  if (!timestamp) return 'N/A';
  const diffMins = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return new Date(timestamp).toLocaleDateString('id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export interface AnalysisData {
  interpretasi?: string; perbandingan_sektor?: string; faktor_positif?: string[]; risiko?: string[]; kesimpulan?: string;
}
interface AnalysisResult {
  ticker: string; companyName: string; price: number; bvps: number; pbv: number; sector: string; analysis: AnalysisData; lastAnalyzedTime?: number;
}
interface SentimentResult { label: string; score: number; }

export default function App() {
  const [ticker, setTicker] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<ErrorDetail | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [sentimentState, setSentimentState] = useState<'idle' | 'loading' | 'warming_up' | 'success' | 'error'>('idle');
  const [sentimentData, setSentimentData] = useState<SentimentResult | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [showDelayedMessages, setShowDelayedMessages] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const suggestionRef = useRef<HTMLDivElement>(null);
  const elapsedTimeRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function handleClickOutside(event: any) {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (loading) {
      setElapsedTime(0);
      setLoadingMessage('');
      setShowDelayedMessages(false);
      elapsedTimeRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
      return () => { if (elapsedTimeRef.current) clearInterval(elapsedTimeRef.current); };
    }
  }, [loading]);

  useEffect(() => {
    if (loading && elapsedTime === 5 && !showDelayedMessages) setShowDelayedMessages(true);
  }, [loading, elapsedTime, showDelayedMessages]);

  useEffect(() => {
    if (showDelayedMessages) {
      const messages = ['Querying financial data...', 'Synthesizing market context...', 'Running sentiment analysis...', 'Finalizing report...'];
      setLoadingMessage(messages[0]);
      let idx = 0;
      const interval = setInterval(() => { idx = (idx + 1) % messages.length; setLoadingMessage(messages[idx]); }, 4000);
      return () => clearInterval(interval);
    }
  }, [showDelayedMessages]);

  const filteredStocks = TOP_STOCKS.filter(stock => stock.ticker.toLowerCase().includes(ticker.toLowerCase()) || stock.name.toLowerCase().includes(ticker.toLowerCase()));

  const handleSelectSuggestion = (selectedTicker: string) => {
    setTicker(selectedTicker);
    setShowSuggestions(false);
  };

  const fetchSentiment = async (textToAnalyze: string) => {
    setSentimentState('loading');
    try {
      let isSuccess = false, attempts = 0, finalResult = null, errorReason = '';
      const cleanedInput = textToAnalyze.replace(/[*#]/g, '').substring(0, 480);
      while (attempts < 3 && !isSuccess) {
        attempts++;
        const response = await fetch("/api/sentiment", { headers: { "Content-Type": "application/json" }, method: "POST", body: JSON.stringify({ text: cleanedInput }) });
        if (response.status === 503) {
           setSentimentState('warming_up');
           await new Promise(resolve => setTimeout(resolve, 5000));
        } else if (response.ok) {
           finalResult = await response.json();
           isSuccess = true;
        } else {
           if (response.status === 401) errorReason = 'missing_token';
           break; 
        }
      }
      if (isSuccess && finalResult && Array.isArray(finalResult) && finalResult[0] && Array.isArray(finalResult[0])) {
         const highest = finalResult[0].reduce((prev: any, current: any) => (prev.score > current.score) ? prev : current);
         setSentimentData(highest);
         setSentimentState('success');
      } else {
        setSentimentState(errorReason === 'missing_token' ? 'missing_token' as any : 'error');
      }
    } catch (e) {
      setSentimentState('error');
    }
  };

  const analyzeStock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedTicker = ticker.trim().toUpperCase();
    if (!trimmedTicker) { setError('Please enter a stock ticker (e.g., BBCA, TLKM)'); return; }
    if (trimmedTicker.length > 5 || !/^[A-Z0-9.]+$/.test(trimmedTicker)) { setError('Invalid format. Use max 5 letters/numbers (e.g., BBCA).'); return; }
    
    setShowSuggestions(false); setLoading(true); setError(null); setErrorDetail(null); setResult(null); setSentimentState('idle'); setSentimentData(null);

    try {
      const searchTicker = trimmedTicker.includes(".") ? trimmedTicker : `${trimmedTicker}.JK`;
      const cachedData = getCachedAnalysis(trimmedTicker);
      
      if (cachedData) {
        setResult(cachedData); setIsCached(true); fetchSentiment(cachedData.analysis?.kesimpulan || cachedData.companyName); setLoading(false); return;
      }

      const stockData = await fetchStockData(searchTicker);
      if (!stockData || !stockData.price) {
        setLoading(false); setError(`Ticker "${trimmedTicker}" not found on IDX.\nPlease verify the symbol at www.idx.co.id.`); return;
      }

      let calculatedPbv = stockData.bookValuePerShare && stockData.bookValuePerShare > 0 ? stockData.price / stockData.bookValuePerShare : 0;

      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: trimmedTicker, sector: stockData.sector, price: stockData.price, bvps: stockData.bookValuePerShare, pbv: calculatedPbv })
      });

      if (!analyzeResponse.ok) throw new Error(`API failed with status ${analyzeResponse.status}`);
      
      const aiData = await analyzeResponse.json();
      const finalResult: AnalysisResult = {
        ticker: trimmedTicker, companyName: stockData.name || trimmedTicker, price: stockData.price || 0,
        bvps: stockData.bookValuePerShare || 0, pbv: calculatedPbv || 0, sector: stockData.sector || "Umum",
        analysis: aiData, lastAnalyzedTime: Date.now()
      };

      cacheAnalysis(trimmedTicker, finalResult);
      setResult(finalResult); setIsCached(false);
      fetchSentiment(finalResult.analysis?.kesimpulan || finalResult.companyName);
    } catch (err: any) {
      const detail = parseGeminiError(err); setErrorDetail(detail); setError(detail.message);
    } finally { setLoading(false); }
  };

  const getPbvStatus = (pbv: number) => {
    if (pbv === 0) return { label: 'N/A', color: 'text-text-dim border-border-subtle bg-surface' };
    if (pbv < 1.0) return { label: 'Undervalued', color: 'text-emerald-400 border-emerald-900/50 bg-emerald-950/20' };
    if (pbv <= 3.0) return { label: 'Fair Value', color: 'text-blue-400 border-blue-900/50 bg-blue-950/20' };
    return { label: 'Overvalued', color: 'text-rose-400 border-rose-900/50 bg-rose-950/20' };
  };

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-accent/20 selection:text-accent">
      
      {/* Sleek Minimal Header */}
      <header className="h-20 px-6 md:px-12 flex items-center justify-between sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-white/5">
        <button 
          onClick={() => { setResult(null); setTicker(''); setError(null); setErrorDetail(null); setSentimentState('idle'); setSentimentData(null); }}
          className="group flex items-center gap-2 focus:outline-none"
        >
          <span className="font-serif text-2xl italic font-bold text-white group-hover:text-accent transition-colors duration-300">BGY</span>
          <span className="text-text-dim text-sm tracking-wide hidden sm:block">/ Beli Ga Ya?</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-text-dim">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            System Operational
          </div>
        </div>
      </header>

      <main className={cn(
        "flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-16 flex flex-col",
        !result ? "" : "py-12 gap-10"
      )}>
        
        {/* Elegant Search / Hero */}
        <div className={cn(
          "transition-all duration-700 ease-out w-full", 
          // mt-[15vh] visually centers it without flexbox jumping
          // pb-[320px] physically reserves empty space for the absolute dropdown so it PUSHES the footer down
          !result ? "max-w-2xl mx-auto text-center mt-[12vh] md:mt-[15vh] pb-[320px]" : ""
        )}>
          {!result && (
            <div className="animate-fade-in mb-10">
              <h1 className="font-serif text-4xl md:text-5xl text-white mb-4 tracking-tight">Financial Clarity,<br/>Powered by AI.</h1>
              <p className="text-text-dim text-base md:text-lg">Parse fundamental P/BV data and synthesize market context instantly.</p>
            </div>
          )}
          
          <form onSubmit={analyzeStock} className={cn("relative w-full z-20", !result ? "animate-fade-in" : "")}>
            <div className="relative group shadow-2xl shadow-black/50" ref={suggestionRef}>
              <div className="absolute inset-y-0 left-5 md:left-6 flex items-center pointer-events-none">
                {loading ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 text-accent animate-spin" /> : <Search className="w-4 h-4 md:w-5 md:h-5 text-text-dim group-focus-within:text-white transition-colors" />}
              </div>
              <input
                type="text"
                value={ticker}
                onChange={(e) => { setTicker(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                placeholder={isMobile ? "e.g. BBCA" : "Enter ticker symbol (e.g. BBCA)"}
                // Text base on mobile, text-lg on desktop. Adjusted padding to prevent squishing.
                className="w-full bg-surface border border-border-subtle rounded-full py-4 md:py-5 pl-12 md:pl-14 pr-[110px] md:pr-32 text-white placeholder:text-text-dim/50 focus:outline-none focus:border-accent/50 focus:bg-white/5 transition-all uppercase tracking-widest text-base md:text-lg shadow-inner"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !ticker.trim()}
                // Tighter padding and smaller text/icon on mobile
                className="absolute right-1.5 md:right-2 top-1.5 md:top-2 bottom-1.5 md:bottom-2 bg-accent text-black hover:bg-accent/90 disabled:bg-accent/20 disabled:text-accent/50 px-5 md:px-6 rounded-full font-bold text-xs md:text-sm tracking-wide transition-all flex items-center gap-1.5 md:gap-2 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
              >
                Analyze {<ArrowRight className="w-3 h-3 md:w-4 md:h-4" />}
              </button>

              {/* Suggestions Flyout */}
              {showSuggestions && ticker.length > 0 && filteredStocks.length > 0 && (
                 <div className="absolute top-full mt-3 left-0 right-0 glass-panel overflow-hidden z-50">
                    {filteredStocks.slice(0, 5).map((stock) => (
                       <button 
                         key={stock.ticker} type="button"
                         className="w-full text-left px-5 md:px-6 py-3 md:py-4 hover:bg-white/5 border-b border-border-subtle last:border-0 transition-colors flex items-center justify-between group/item"
                         onClick={() => handleSelectSuggestion(stock.ticker)}
                       >
                          <div className="flex flex-col pr-4">
                            <span className="font-bold text-white tracking-widest text-sm">{stock.ticker}</span>
                            <span className="text-xs text-text-dim mt-0.5 truncate">{stock.name}</span>
                          </div>
                          <ArrowRight className="w-4 h-4 text-white/0 group-hover/item:text-accent shrink-0 transition-all -translate-x-4 group-hover/item:translate-x-0" />
                       </button>
                    ))}
                    <div className="px-5 md:px-6 py-3 bg-white/2.5 border-t border-border-subtle text-xs text-text-dim italic">
                      Results shown are top stocks only — if u can find it in IDX you can find it here.
                    </div>
                 </div>
              )}
            </div>

            {/* Dynamic Loading Message */}
            {loading && showDelayedMessages && (
              <div className="absolute -bottom-8 left-0 right-0 text-center text-xs text-text-dim animate-fade-in">
                {loadingMessage}
              </div>
            )}
          </form>

          {/* Error State */}
          {error && (
            <div className="mt-8 animate-fade-in glass-panel p-6 border-rose-500/20 bg-rose-500/5">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-rose-500/10 rounded-full text-rose-400 shrink-0"><AlertTriangle className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-white font-medium mb-1 whitespace-pre-wrap">{error}</h3>
                  {errorDetail?.suggestion && <p className="text-text-dim text-sm whitespace-pre-wrap">{errorDetail.suggestion}</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ================= RESULTS DASHBOARD ================= */}
        {result && (
          <div className="flex flex-col gap-8 animate-fade-in pb-12">
            
            {/* Header / Identity Strip */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-white/10">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold tracking-widest">{result.ticker}</span>
                  <span className="text-xs text-text-dim uppercase tracking-wider">{result.sector}</span>
                </div>
                <h2 className="font-serif text-4xl md:text-5xl text-white leading-tight">{result.companyName}</h2>
              </div>
              
              {/* Added w-full on mobile to allow the inner elements to stretch */}
              <div className="w-full md:w-auto text-left md:text-right flex flex-col md:items-end">
                
                {/* WIDER, JUSTIFY-BETWEEN CONTAINER FOR MOBILE */}
                <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-3 mb-5 md:mb-6 text-xs text-text-dim bg-white/5 px-4 md:px-3 py-2 md:py-1.5 rounded-lg border border-white/5">
                  <div className="flex items-center gap-2">
                    <span>Updated {formatLastAnalyzedTime(result.lastAnalyzedTime)}</span>
                    {isCached && <span className="px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 text-[10px] font-bold tracking-wider">CACHED</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/20 hidden md:inline">•</span>
                    <button
                      onClick={() => { clearCache(result.ticker); analyzeStock(); }}
                      disabled={loading}
                      className="text-white hover:text-accent transition-colors underline underline-offset-4 font-medium"
                    >
                      {loading ? 'Updating...' : 'Refresh'}
                    </button>
                  </div>
                </div>

                <p className="text-text-dim text-xs uppercase tracking-widest mb-1 md:mb-2">Market Price</p>
                <div className="font-serif text-3xl md:text-4xl text-white">
                  <span className="text-2xl md:text-3xl text-accent mr-2 font-serif">Rp</span>
                  {result.price.toLocaleString('id-ID')}
                </div>
              </div>
            </div>

            {/* Core Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* BVPS */}
              <div className="glass-panel p-6 flex flex-col justify-between">
                <div className="flex items-center gap-2 text-text-dim text-xs uppercase tracking-widest mb-4">
                  <Banknote className="w-4 h-4" /> Book Value Per Share
                </div>
                <div className="text-3xl md:text-4xl font-serif text-white">
                  {/* Rp is bigger */}
                  <span className="text-2xl md:text-3xl text-accent mr-2 font-serif">Rp</span>
                  {result.bvps > 0 && result.bvps < 1 ? result.bvps.toFixed(3) : Math.round(result.bvps).toLocaleString('id-ID')}
                </div>
              </div>

              {/* P/BV */}
              {(() => {
                const status = getPbvStatus(result.pbv);
                return (
                  <div className="glass-panel p-6 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 text-text-dim text-xs uppercase tracking-widest">
                        <Calculator className="w-4 h-4" /> P/BV Ratio
                      </div>
                      <span className={cn("text-[10px] uppercase tracking-widest px-3 py-1 rounded-full border", status.color)}>
                        {status.label}
                      </span>
                    </div>
                    <div className="text-4xl md:text-5xl font-serif text-white">
                      {/* x is bigger */}
                      {result.pbv.toFixed(2)}<span className="text-4xl text-accent ml-2 font-serif">x</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* AI Analysis Section */}
            <div className="glass-panel overflow-hidden mt-4">
              {/* Analysis Header & Sentiment */}
              <div className="bg-white/5 p-6 border-b border-border-subtle flex flex-col gap-5">
                
                {/* TOP ROW: Title (Left) & Sentiment Pill (Right) */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* AI Synthesis (Very Left) */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="p-2 bg-white/10 rounded-lg text-white"><TrendingUp className="w-5 h-5" /></div>
                    <div>
                      <h3 className="text-white font-medium">AI Synthesis</h3>
                      <p className="text-xs text-text-dim mt-1">Generated by Gemini & HuggingFace Models</p>
                    </div>
                  </div>

                  {/* Market Sentiment Pill (Right of AI Synthesis) */}
                  <div>
                    {sentimentState === 'success' && sentimentData ? (
                      <div className={cn(
                        "flex items-center gap-3 px-4 py-2 rounded-xl border backdrop-blur-md w-fit",
                        sentimentData.label?.includes('POSITIVE') || sentimentData.label === 'LABEL_2' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                        sentimentData.label?.includes('NEGATIVE') || sentimentData.label === 'LABEL_0' ? "bg-rose-500/10 border-rose-500/20 text-rose-400" :
                        "bg-blue-500/10 border-blue-500/20 text-blue-400"
                      )}>
                        <BrainCircuit className="w-4 h-4" />
                        <div className="flex flex-col text-left">
                          <span className="text-[10px] uppercase tracking-widest opacity-80">Market Sentiment</span>
                          <span className="text-sm font-bold">
                            {sentimentData.label?.includes('POSITIVE') || sentimentData.label === 'LABEL_2' ? 'Bullish' : 
                             sentimentData.label?.includes('NEGATIVE') || sentimentData.label === 'LABEL_0' ? 'Bearish' : 'Neutral'} 
                            {' '}({Math.round(sentimentData.score * 100)}%)
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-text-dim">
                        {sentimentState === 'loading' && <><Loader2 className="w-3 h-3 animate-spin" /> Processing NLP...</>}
                        {sentimentState === 'warming_up' && <span className="text-amber-500">Warming up Model...</span>}
                        {sentimentState === 'error' && <span>Sentiment Unavailable</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* BOTTOM ROW: Full-width explanation text */}
                {sentimentState === 'success' && sentimentData && (
                  <div className="pt-4 border-t border-white/10 flex flex-col gap-2">
                    <div className="text-sm text-white/80 leading-relaxed font-sans">
                      {sentimentData.label?.includes('POSITIVE') || sentimentData.label === 'LABEL_2' ? (
                        <p>Indicates a favorable outlook, growth potential, or dominant positive catalysts. Research further before investing.</p>
                      ) : sentimentData.label?.includes('NEGATIVE') || sentimentData.label === 'LABEL_0' ? (
                        <p>Indicates elevated risks, potential downturns, or dominant negative catalysts. Exercise caution.</p>
                      ) : (
                        <p>Indicates a balanced outlook with offsetting positive and negative factors. Await clearer signals.</p>
                      )}
                    </div>
                    {/* Small explainer text at the very bottom */}
                    <p className="text-xs text-text-dim/60 font-sans">
                      Percentage score indicates the AI's level of confidence in the sentiment classification.
                    </p>
                  </div>
                )}
              </div>

              {/* Analysis Content */}
              <div className="p-6 md:p-8 flex flex-col gap-8">
                
                {/* Context */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-xs text-text-dim uppercase tracking-widest mb-3">Metric Interpretation</h4>
                    <p className="text-white/80 leading-relaxed text-sm">{result.analysis?.interpretasi}</p>
                  </div>
                  <div>
                    <h4 className="text-xs text-text-dim uppercase tracking-widest mb-3">Sector Comparison</h4>
                    <p className="text-white/80 leading-relaxed text-sm">{result.analysis?.perbandingan_sektor}</p>
                  </div>
                </div>

                <hr className="border-white/5" />

                {/* Pros/Cons Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-xs text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" /> Growth Catalysts
                    </h4>
                    <ul className="space-y-3">
                      {result.analysis?.faktor_positif?.map((poin: string, i: number) => (
                        <li key={i} className="text-sm text-white/80 leading-relaxed flex items-start gap-3">
                          <span className="text-emerald-500 mt-1">•</span> {poin}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs text-rose-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Risk Factors
                    </h4>
                    <ul className="space-y-3">
                      {result.analysis?.risiko?.map((poin: string, i: number) => (
                        <li key={i} className="text-sm text-white/80 leading-relaxed flex items-start gap-3">
                          <span className="text-rose-500 mt-1">•</span> {poin}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Conclusion */}
                <div className="mt-4 p-6 rounded-xl bg-white/[0.03] border border-white/5 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent"></div>
                  <h4 className="text-xs text-text-dim uppercase tracking-widest mb-3">Pragmatic Conclusion</h4>
                  <p className="text-white leading-relaxed font-medium">{result.analysis?.kesimpulan}</p>
                </div>
                
              </div>
            </div>
          </div>
        )}
      </main>
      
      {/* Footer */}
      <footer className="mt-auto py-8 border-t border-white/5 text-center">
        <p className="text-xs text-text-dim tracking-wider">
          NOT FINANCIAL ADVICE • AI VALUATIONS MAY CONTAIN INACCURACIES
        </p>
      </footer>
    </div>
  );
}