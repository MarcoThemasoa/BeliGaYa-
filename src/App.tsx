import { useState, useRef, useEffect } from 'react';
import { Search, Info, TrendingUp, AlertTriangle, CheckCircle, Calculator, Building, Banknote, BrainCircuit, Loader2, BarChart3, Sparkles, RefreshCw } from 'lucide-react';
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
const DAILY_RESET_KEY = "bgy_last_reset_date";

// Check if it's a new day and reset cache if needed
const checkAndResetDailyCache = (): void => {
  const today = new Date().toDateString();
  const lastResetDate = localStorage.getItem(DAILY_RESET_KEY);
  
  if (lastResetDate !== today) {
    // It's a new day, clear all cache
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
    localStorage.setItem(DAILY_RESET_KEY, today);
    console.log("Daily cache reset executed");
  }
};

// Execute on app startup
checkAndResetDailyCache();

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
    console.error("Cache read error:", e);
    return null;
  }
};

const cacheAnalysis = (ticker: string, data: AnalysisResult) => {
  try {
    const now = Date.now();
    const cached: CachedAnalysis = {
      data: {
        ...data,
        lastAnalyzedTime: now
      },
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
    if (ticker) {
      localStorage.removeItem(getCacheKey(ticker));
    } else {
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
  
  if (error.error === 'API Quota Habis' || error.message?.includes('20 request')) {
    return {
      message: 'Daily Quota Reached',
      suggestion: 'Gemini free tier limit: 20 requests/day. Try again tomorrow.',
      icon: 'AlertTriangle',
      retryable: false
    };
  }
  
  if (error.message?.includes('RESOURCE_EXHAUSTED') || error.error === 'Resource Exhausted') {
    return {
      message: 'API Quota Exhausted',
      suggestion: 'Daily limit reached. Try again in 24 hours.',
      icon: 'AlertTriangle',
      retryable: false
    };
  }
  
  if (errorStr.includes('503') || errorStr.includes('UNAVAILABLE')) {
    return {
      message: 'Service Temporarily Unavailable',
      suggestion: 'Gemini API is experiencing issues. Retry in a few minutes.',
      icon: 'Info',
      retryable: true
    };
  }
  
  if (errorStr.includes('429') || errorStr.includes('RATE_LIMIT')) {
    return {
      message: 'Rate Limited',
      suggestion: 'Too many requests. Wait 1 minute before retrying.',
      icon: 'AlertTriangle',
      retryable: true
    };
  }
  
  if (errorStr.includes('401') || errorStr.includes('UNAUTHENTICATED')) {
    return {
      message: 'Authentication Error',
      suggestion: 'API key missing or invalid. Check backend configuration.',
      icon: 'AlertTriangle',
      retryable: false
    };
  }
  
  return {
    message: 'Unknown Error',
    suggestion: 'Something went wrong. Try again later.',
    icon: 'Info',
    retryable: true
  };
};

// ============================================
// ANALYSIS TYPES
// ============================================
interface AnalysisResult {
  ticker: string;
  name: string;
  price: number;
  bvps: number;
  pbv: number;
  sector: string;
  analysis?: {
    interpretasi: string;
    perbandingan_sektor: string;
    faktor_positif: string[];
    risiko: string[];
    kesimpulan: string;
  };
  lastAnalyzedTime?: number;
}

interface SentimentResult {
  label: string;
  score: number;
}

export default function App() {
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<ErrorDetail | null>(null);
  const [sentimentState, setSentimentState] = useState<'idle' | 'loading' | 'success' | 'error' | 'warming_up' | 'missing_token'>('idle');
  const [sentimentData, setSentimentData] = useState<SentimentResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const analyzeSentiment = async (analysisText: string) => {
    if (!analysisText) return;
    
    setSentimentState('loading');
    try {
      const response = await fetch('/api/sentiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: analysisText })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 503 && errorData.error === 'Model is warming up') {
          setSentimentState('warming_up');
          setTimeout(() => analyzeSentiment(analysisText), 15000);
          return;
        }
        
        if (response.status === 401 && errorData.error === 'HF_TOKEN missing') {
          setSentimentState('missing_token' as any);
          return;
        }
        
        setSentimentState('error');
        return;
      }

      const data = await response.json();
      
      if (data && data[0] && data[0][0]) {
        setSentimentData(data[0][0]);
        setSentimentState('success');
      } else {
        setSentimentState('error');
      }
    } catch (err) {
      console.error('Sentiment analysis failed:', err);
      setSentimentState('error');
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) return;

    const searchTicker = ticker.toUpperCase().trim();
    
    setLoading(true);
    setError(null);
    setResult(null);
    setSentimentState('idle');
    setSentimentData(null);

    try {
      const cached = getCachedAnalysis(searchTicker);
      if (cached) {
        setResult(cached);
        setLoading(false);
        
        const fullAnalysisText = Object.values(cached.analysis || {}).join(' ');
        if (fullAnalysisText) {
          analyzeSentiment(fullAnalysisText);
        }
        return;
      }

      const stockData = await fetchStockData(searchTicker);
      if (!stockData) {
        setError({
          message: 'Stock Not Found',
          suggestion: 'Check ticker symbol or try another stock.',
          icon: 'Info',
          retryable: false
        });
        setLoading(false);
        return;
      }

      const { price, bookValuePerShare: bvps, sector, name } = stockData;
      const pbv = bvps > 0 ? price / bvps : 0;

      const analysisRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: searchTicker, sector, price, bvps, pbv })
      });

      if (!analysisRes.ok) {
        const errorData = await analysisRes.json();
        setError(parseGeminiError(errorData));
        setLoading(false);
        return;
      }

      const analysisData = await analysisRes.json();

      const finalResult: AnalysisResult = {
        ticker: searchTicker,
        name,
        price,
        bvps,
        pbv,
        sector,
        analysis: analysisData,
        lastAnalyzedTime: Date.now()
      };

      cacheAnalysis(searchTicker, finalResult);
      setResult(finalResult);

      const fullAnalysisText = Object.values(analysisData).join(' ');
      if (fullAnalysisText) {
        analyzeSentiment(fullAnalysisText);
      }

    } catch (err: any) {
      console.error('Analysis error:', err);
      setError({
        message: 'Network Error',
        suggestion: 'Check your connection and try again.',
        icon: 'AlertTriangle',
        retryable: true
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (result?.ticker) {
      clearCache(result.ticker);
      setTicker(result.ticker);
      setTimeout(() => {
        const form = document.querySelector('form');
        form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }, 100);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#0a0a0f] via-[#0f0f18] to-[#1a1a28]">
      {/* Animated background grid */}
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(90deg, #10b981 1px, transparent 1px),
            linear-gradient(0deg, #10b981 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          animation: 'gridPulse 4s ease-in-out infinite'
        }}></div>
      </div>

      {/* Header */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white" style={{ fontFamily: "'Cinzel', serif" }}>
                  BAGEUR <span className="text-emerald-400">CAPITAL</span>
                </h1>
                <p className="text-xs text-gray-400 tracking-widest uppercase mt-0.5">Fundamental Analytics Terminal</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-6 text-xs text-gray-400 tracking-wider">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <span>LIVE DATA</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>AI POWERED</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12">
        {/* Search Section */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent leading-tight" style={{ fontFamily: "'Cinzel', serif" }}>
              Intelligent Stock Analysis
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed">
              Advanced fundamental metrics powered by AI-driven insights for Indonesian equities
            </p>
          </div>

          <form onSubmit={handleAnalyze} className="max-w-2xl mx-auto">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl opacity-20 blur group-hover:opacity-30 transition duration-300"></div>
              <div className="relative bg-gradient-to-br from-gray-900/90 to-black/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="pl-4">
                    <Search className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    placeholder="Enter ticker symbol (e.g., BBCA.JK, TLKM.JK)"
                    className="flex-1 bg-transparent text-white placeholder-gray-500 text-lg py-4 outline-none tracking-wide"
                    disabled={loading}
                  />
                  <button
                    type="submit"
                    disabled={loading || !ticker.trim()}
                    className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-gray-700 disabled:to-gray-800 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-emerald-500/20 disabled:shadow-none tracking-wide disabled:text-gray-400"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Analyzing</span>
                      </div>
                    ) : (
                      'Analyze'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Info Pills */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6 text-xs">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-sm">
              <Calculator className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-gray-300">PBV Analysis</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-sm">
              <BrainCircuit className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-gray-300">AI Insights</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-sm">
              <Info className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-gray-300">Real-time Data</span>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="max-w-2xl mx-auto mb-8 animate-fade-in">
            <div className="bg-gradient-to-br from-red-950/50 to-red-900/30 border border-red-500/30 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-red-300 mb-1">{error.message}</h3>
                  <p className="text-red-200/80 leading-relaxed">{error.suggestion}</p>
                  {error.retryable && (
                    <button
                      onClick={() => handleAnalyze({ preventDefault: () => {} } as any)}
                      className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors text-sm font-medium"
                    >
                      Try Again
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6 animate-fade-in">
            {/* Stock Header Card */}
            <div className="bg-gradient-to-br from-gray-900/90 to-black/90 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
              {/* Decorative gradient overlay */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-full blur-3xl"></div>
              
              <div className="relative">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-4xl font-bold text-white tracking-tight" style={{ fontFamily: "'Cinzel', serif" }}>
                        {result.ticker}
                      </h2>
                      {result.lastAnalyzedTime && (
                        <button
                          onClick={handleRefresh}
                          className="p-2 hover:bg-white/5 rounded-lg transition-colors group"
                          title="Refresh analysis"
                        >
                          <RefreshCw className="w-4 h-4 text-gray-400 group-hover:text-emerald-400 transition-colors" />
                        </button>
                      )}
                    </div>
                    <p className="text-xl text-gray-300 mb-1">{result.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-emerald-400 text-xs font-medium tracking-wide">
                        {result.sector}
                      </span>
                      {result.lastAnalyzedTime && (
                        <span className="text-xs text-gray-500">
                          Cached • {new Date(result.lastAnalyzedTime).toLocaleString('id-ID')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Price Card */}
                  <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-6 backdrop-blur-sm hover:border-emerald-500/30 transition-colors group">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                      </div>
                      <span className="text-xs text-gray-400 uppercase tracking-widest">Market Price</span>
                    </div>
                    <div className="text-3xl font-bold text-white mb-1" style={{ fontFamily: "'Cinzel', serif" }}>
                      Rp {Math.round(result.price).toLocaleString('id-ID')}
                    </div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">IDR</div>
                  </div>

                  {/* BVPS Card */}
                  <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-6 backdrop-blur-sm hover:border-blue-500/30 transition-colors group">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                        <Banknote className="w-4 h-4 text-blue-400" />
                      </div>
                      <span className="text-xs text-gray-400 uppercase tracking-widest">Book Value</span>
                    </div>
                    <div className="text-3xl font-bold text-white mb-1" style={{ fontFamily: "'Cinzel', serif" }}>
                      Rp {result.bvps > 0 && result.bvps < 1 
                          ? result.bvps.toFixed(3) 
                          : Math.round(result.bvps).toLocaleString('id-ID')}
                    </div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Per Share</div>
                  </div>

                  {/* PBV Card */}
                  <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-6 backdrop-blur-sm hover:border-purple-500/30 transition-colors group">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                        <Calculator className="w-4 h-4 text-purple-400" />
                      </div>
                      <span className="text-xs text-gray-400 uppercase tracking-widest">Price to Book</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <div className="text-3xl font-bold text-white" style={{ fontFamily: "'Cinzel', serif" }}>
                        {result.pbv.toFixed(2)}x
                      </div>
                      <div className={cn(
                        "px-2 py-0.5 rounded text-xs font-semibold",
                        result.pbv < 1 ? "bg-emerald-500/20 text-emerald-300" :
                        result.pbv < 1.5 ? "bg-blue-500/20 text-blue-300" :
                        result.pbv < 3 ? "bg-yellow-500/20 text-yellow-300" :
                        "bg-red-500/20 text-red-300"
                      )}>
                        {result.pbv < 1 ? "Undervalued" :
                         result.pbv < 1.5 ? "Fair" :
                         result.pbv < 3 ? "Premium" :
                         "Expensive"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Analysis Section */}
            {result.analysis && (
              <div className="bg-gradient-to-br from-gray-900/90 to-black/90 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl overflow-hidden">
                {/* Analysis Header */}
                <div className="border-b border-white/5 bg-gradient-to-r from-emerald-950/30 to-transparent p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                        <BrainCircuit className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: "'Cinzel', serif" }}>
                          AI Analysis
                        </h3>
                        <p className="text-xs text-gray-400 tracking-wider uppercase">Powered by Gemini</p>
                      </div>
                    </div>

                    {/* Sentiment Badge */}
                    <div className="flex items-center gap-3">
                      {sentimentState === 'loading' && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                          <span className="text-xs text-gray-400">Analyzing sentiment...</span>
                        </div>
                      )}
                      {sentimentState === 'warming_up' && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-full">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span className="text-xs text-amber-400">Model warming up...</span>
                        </div>
                      )}
                      {sentimentState === 'success' && sentimentData && (
                        <div className={cn(
                          "px-4 py-2 rounded-full border font-semibold text-xs tracking-wider flex items-center gap-2",
                          sentimentData.label?.includes('POSITIVE') || sentimentData.label === 'LABEL_2' 
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" :
                          sentimentData.label?.includes('NEGATIVE') || sentimentData.label === 'LABEL_0' 
                            ? "bg-red-500/10 border-red-500/30 text-red-300" :
                            "bg-blue-500/10 border-blue-500/30 text-blue-300"
                        )}>
                          <Sparkles className="w-3.5 h-3.5" />
                          {sentimentData.label?.includes('POSITIVE') || sentimentData.label === 'LABEL_2' ? 'BULLISH' : 
                           sentimentData.label?.includes('NEGATIVE') || sentimentData.label === 'LABEL_0' ? 'BEARISH' : 
                           'NEUTRAL'}
                          <span className="opacity-70">•</span>
                          <span>{Math.round(sentimentData.score * 100)}%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sentiment Explanation */}
                  {sentimentState === 'success' && sentimentData && (
                    <div className={cn(
                      "mt-4 p-4 rounded-xl border text-sm leading-relaxed",
                      sentimentData.label?.includes('POSITIVE') || sentimentData.label === 'LABEL_2' 
                        ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-200/90" :
                      sentimentData.label?.includes('NEGATIVE') || sentimentData.label === 'LABEL_0' 
                        ? "bg-red-500/5 border-red-500/20 text-red-200/90" :
                        "bg-blue-500/5 border-blue-500/20 text-blue-200/90"
                    )}>
                      {sentimentData.label?.includes('POSITIVE') || sentimentData.label === 'LABEL_2' ? (
                        <p><strong className="font-semibold">Positive Outlook:</strong> Analysis indicates favorable prospects with dominant positive factors. However, conduct thorough research before investing.</p>
                      ) : sentimentData.label?.includes('NEGATIVE') || sentimentData.label === 'LABEL_0' ? (
                        <p><strong className="font-semibold">Negative Outlook:</strong> Analysis shows elevated risks with dominant negative factors. Consider carefully before purchasing.</p>
                      ) : (
                        <p><strong className="font-semibold">Neutral Outlook:</strong> Analysis shows balanced prospects with equal positive and negative factors. Wait for clearer signals or seek additional information.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Analysis Content */}
                <div className="p-8 space-y-6">
                  {/* Interpretation & Sector Comparison */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5 rounded-xl p-6 hover:border-emerald-500/20 transition-colors">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-6 bg-emerald-500 rounded-full"></div>
                        <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Metric Interpretation</h4>
                      </div>
                      <p className="text-gray-300 leading-relaxed">{result.analysis.interpretasi}</p>
                    </div>

                    <div className="bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5 rounded-xl p-6 hover:border-blue-500/20 transition-colors">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-6 bg-blue-500 rounded-full"></div>
                        <h4 className="text-sm font-bold text-blue-400 uppercase tracking-widest">Sector Comparison</h4>
                      </div>
                      <p className="text-gray-300 leading-relaxed">{result.analysis.perbandingan_sektor}</p>
                    </div>
                  </div>

                  {/* Positive Factors & Risks */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-gradient-to-br from-emerald-950/20 to-transparent border border-emerald-500/20 rounded-xl p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                        <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Positive Factors</h4>
                      </div>
                      <ul className="space-y-3">
                        {result.analysis.faktor_positif?.map((poin: string, index: number) => (
                          <li key={index} className="flex items-start gap-3 text-gray-300 leading-relaxed">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0"></div>
                            <span>{poin}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-gradient-to-br from-red-950/20 to-transparent border border-red-500/20 rounded-xl p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                        <h4 className="text-sm font-bold text-red-400 uppercase tracking-widest">Risk Factors</h4>
                      </div>
                      <ul className="space-y-3">
                        {result.analysis.risiko?.map((poin: string, index: number) => (
                          <li key={index} className="flex items-start gap-3 text-gray-300 leading-relaxed">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0"></div>
                            <span>{poin}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Conclusion */}
                  <div className="bg-gradient-to-br from-purple-950/20 to-transparent border border-purple-500/20 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-purple-400" />
                      </div>
                      <h4 className="text-sm font-bold text-purple-400 uppercase tracking-widest">Pragmatic Conclusion</h4>
                    </div>
                    <p className="text-white font-medium text-lg leading-relaxed">{result.analysis.kesimpulan}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-black/20 backdrop-blur-xl mt-auto py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-500">
            <p className="tracking-wide">
              <strong className="text-gray-300 font-semibold">Disclaimer:</strong> Educational analysis only. Not financial advice. Data may experience latency.
            </p>
            <p className="tracking-widest uppercase">© 2026 Bageur Capital Analytics</p>
          </div>
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap');
        
        @keyframes gridPulse {
          0%, 100% { opacity: 0.02; }
          50% { opacity: 0.04; }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fade-in {
          animation: fadeIn 0.6s ease-out;
        }
      `}</style>
    </div>
  );
}