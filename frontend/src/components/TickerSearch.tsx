import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../hooks/useApi";

interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
}

interface Props {
  market: string;
  value: string;
  selectedName?: string;
  onChange: (ticker: string, name: string) => void;
  onPriceFetched?: (price: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function TickerSearch({ market, value, selectedName, onChange, onPriceFetched, placeholder, autoFocus }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(!!value);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const marketParam = market === "a_stock" ? "a_stock" : market === "crypto" ? "crypto" : "us_stock";

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/securities/search?q=${encodeURIComponent(q)}&market=${marketParam}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
        setOpen(data.results.length > 0);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [marketParam]);

  const handleInput = (val: string) => {
    setQuery(val);
    setConfirmed(false);
    onChange(val, "");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  };

  const handleSelect = (r: SearchResult) => {
    setQuery(r.ticker);
    setConfirmed(true);
    setOpen(false);
    onChange(r.ticker, r.name);

    if (onPriceFetched) {
      fetch(`${API_BASE}/quote?ticker=${encodeURIComponent(r.ticker)}&market=${marketParam}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => { if (data?.price != null) onPriceFetched(data.price); })
        .catch(() => {});
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const displayValue = confirmed && selectedName ? `${query} — ${selectedName}` : query;

  return (
    <div className="ticker-search-wrapper" ref={wrapperRef}>
      <div className="ticker-search-input-row">
        <input
          className="add-form-input"
          value={displayValue}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (confirmed) { setQuery(value); setConfirmed(false); } if (results.length > 0) setOpen(true); }}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
        {loading && <span className="ticker-search-spinner">⟳</span>}
        {confirmed && <span className="ticker-search-check">✓</span>}
      </div>
      {open && (
        <div className="ticker-search-dropdown">
          {results.map((r, i) => (
            <button
              key={`${r.ticker}-${i}`}
              className="ticker-search-option"
              onClick={() => handleSelect(r)}
              type="button"
            >
              <span className="ticker-search-code">{r.ticker}</span>
              <span className="ticker-search-name">{r.name}</span>
              <span className="ticker-search-exchange">{r.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
