// src/utils/robustWebScraper.js
// UnifiedSearchMesh: 1P-first autonomous perceptual agent
// Optimized for zero-dependency, signal-native research.
// v2.0 - Enhanced with multi-backend fallbacks, retry logic, and never-hang guarantees

const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Signal } = require('../core/signal');

// Timeout wrapper - NEVER hang
const withTimeout = (promise, ms, fallback = null) => {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

// Retry with exponential backoff
const retryWithBackoff = async (fn, maxRetries = 2, baseDelay = 500) => {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const result = await fn();
      if (result && (Array.isArray(result) ? result.length > 0 : true)) {
        return result;
      }
    } catch (e) {
      if (i === maxRetries) throw e;
    }
    if (i < maxRetries) {
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i)));
    }
  }
  return null;
};

class UnifiedSearchMesh {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
    ];

    this.defaultHeaders = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache'
    };

    // Multiple SearxNG instances for fallback
    this.searxngInstances = [
      process.env.SEARXNG_URL,
      'https://searx.tiekoetter.com',
      'https://search.sapti.me',
      'https://searx.work',
      'https://search.ononoki.org',
      'https://searx.be'
    ].filter(Boolean);

    // Strategy execution stats for adaptive ordering
    this.strategyStats = new Map();
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  log(level, message, meta = {}) {
    const ts = new Date().toISOString();
    process.stderr.write(`[${ts}] [${level.toUpperCase()}] [UnifiedSearchMesh] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}\n`);
  }

  /**
   * Perceptual Search: Gathers signals from the web fabric.
   * Priority: Free APIs -> HTML scraping -> 3P APIs
   * NEVER hangs - all operations have timeouts and fallbacks
   */
  async perception(query, maxResults = 5) {
    const startTime = Date.now();
    const GLOBAL_TIMEOUT = 90000; // 90s max - Perplexity needs ~30s

    // Build strategy list - ordered by reliability and cost
    const strategies = [
      // Tier 1: Free APIs (most reliable)
      { name: 'brave', fn: () => this.searchBrave(query, maxResults), timeout: 8000 },
      { name: 'tavily', fn: () => this.searchTavily(query, maxResults), timeout: 8000 },
      { name: 'serper', fn: () => this.searchSerper(query, maxResults), timeout: 8000 },

      // Tier 2: SearxNG instances (free, variable reliability)
      ...this.searxngInstances.map((url, i) => ({
        name: `searxng_${i}`,
        fn: () => this.searchSearxInstance(url, query, maxResults),
        timeout: 5000 // Reduced - SearxNG is fast when it works
      })),

      // Tier 3: HTML scraping (fragile but no API key needed)
      { name: 'ddg_lite', fn: () => this.searchDuckDuckGoLite(query, maxResults), timeout: 6000 },
      { name: 'ddg_html', fn: () => this.searchDuckDuckGoHtml(query, maxResults), timeout: 6000 },
      { name: 'google_scrape', fn: () => this.searchGoogleScrape(query, maxResults), timeout: 6000 },

      // Tier 4: Official 3P APIs (if configured)
      { name: 'bing_api', fn: () => this.searchBing(query, maxResults), timeout: 8000, requiresKey: 'BING_API_KEY' },
      { name: 'google_api', fn: () => this.searchGoogle(query, maxResults), timeout: 8000, requiresKey: 'GOOGLE_API_KEY' },

      // Tier 5: Model-assisted search (always available as ultimate fallback)
      // Uses search-capable LLMs through OpenRouter - these need longer timeouts
      { name: 'perplexity_sonar', fn: () => this.searchViaModel(query, maxResults, 'perplexity/sonar-pro-search'), timeout: 35000 },
      { name: 'perplexity_deep', fn: () => this.searchViaModel(query, maxResults, 'perplexity/sonar-deep-research'), timeout: 45000 }
    ].filter(s => !s.requiresKey || process.env[s.requiresKey]);

    // Sort by historical success rate (adaptive ordering)
    strategies.sort((a, b) => {
      const aStats = this.strategyStats.get(a.name) || { success: 0, fail: 0 };
      const bStats = this.strategyStats.get(b.name) || { success: 0, fail: 0 };
      const aRate = aStats.success / (aStats.success + aStats.fail + 1);
      const bRate = bStats.success / (bStats.success + bStats.fail + 1);
      return bRate - aRate;
    });

    // Execute strategies with global timeout
    const executeAllStrategies = async () => {
      for (const strategy of strategies) {
        const elapsed = Date.now() - startTime;
        const remaining = GLOBAL_TIMEOUT - elapsed;

        // For perplexity strategies (last resort), always try if we have at least their timeout remaining
        const isPerplexity = strategy.name.startsWith('perplexity');
        const minRequired = isPerplexity ? strategy.timeout : strategy.timeout + 2000;

        if (remaining < minRequired) {
          this.log('warn', `Skipping ${strategy.name}: only ${remaining}ms remaining, need ${minRequired}ms`);
          continue; // Try next strategy, might be faster
        }

        try {
          this.log('debug', `Trying strategy: ${strategy.name}`, { query: query.substring(0, 50), remaining });

          const rawResults = await withTimeout(
            retryWithBackoff(() => strategy.fn(), 1, 300),
            strategy.timeout,
            null
          );

          if (rawResults && rawResults.length > 0) {
            // Update success stats
            const stats = this.strategyStats.get(strategy.name) || { success: 0, fail: 0 };
            stats.success++;
            this.strategyStats.set(strategy.name, stats);

            this.log('info', `Strategy succeeded: ${strategy.name}`, {
              resultCount: rawResults.length,
              durationMs: Date.now() - startTime
            });

            // Transform raw results into isomorphic Signals
            return rawResults.map(r => Signal.response(
              {
                title: r.title || 'Untitled',
                snippet: r.text || r.snippet || '',
                url: r.url
              },
              r.source || strategy.name,
              r.confidence || 0.85,
              { tags: ['web-perception', strategy.name] }
            ));
          }
        } catch (error) {
          // Update failure stats
          const stats = this.strategyStats.get(strategy.name) || { success: 0, fail: 0 };
          stats.fail++;
          this.strategyStats.set(strategy.name, stats);

          this.log('debug', `Strategy failed: ${strategy.name}`, { error: error.message });
        }
      }
      return [];
    };

    // Global timeout wrapper
    const results = await withTimeout(executeAllStrategies(), GLOBAL_TIMEOUT, []);

    if (!results || results.length === 0) {
      this.log('warn', 'All search strategies exhausted', {
        query: query.substring(0, 50),
        strategiesTried: strategies.length,
        durationMs: Date.now() - startTime
      });
    }

    return results || [];
  }

  /**
   * Brave Search API (free tier: 2000 queries/month)
   */
  async searchBrave(query, maxResults = 5) {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) return [];

    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { q: query, count: maxResults },
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey
      },
      timeout: 7000
    });

    return (response.data.web?.results || []).slice(0, maxResults).map(r => ({
      title: r.title,
      text: r.description || '',
      url: r.url,
      source: 'brave',
      confidence: 0.9
    }));
  }

  /**
   * Tavily Search API (free tier: 1000 searches/month)
   */
  async searchTavily(query, maxResults = 5) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return [];

    const response = await axios.post('https://api.tavily.com/search', {
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_raw_content: false
    }, { timeout: 7000 });

    return (response.data.results || []).slice(0, maxResults).map(r => ({
      title: r.title,
      text: r.content || '',
      url: r.url,
      source: 'tavily',
      confidence: r.score || 0.85
    }));
  }

  /**
   * Serper.dev API (free tier: 2500 queries/month)
   */
  async searchSerper(query, maxResults = 5) {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) return [];

    const response = await axios.post('https://google.serper.dev/search', {
      q: query,
      num: maxResults
    }, {
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 7000
    });

    return (response.data.organic || []).slice(0, maxResults).map(r => ({
      title: r.title,
      text: r.snippet || '',
      url: r.link,
      source: 'serper',
      confidence: 0.9
    }));
  }

  /**
   * SearxNG instance search
   */
  async searchSearxInstance(baseUrl, query, maxResults = 5) {
    if (!baseUrl) return [];

    const response = await axios.get(`${baseUrl.replace(/\/$/, '')}/search`, {
      params: { q: query, format: 'json', language: 'en', safesearch: 0 },
      timeout: 5000,
      headers: {
        'User-Agent': this.getRandomUserAgent(),
        'Accept': 'application/json'
      }
    });

    return (response.data.results || []).slice(0, maxResults).map(r => ({
      title: r.title,
      text: r.content || r.snippet || '',
      url: r.url,
      source: 'searxng',
      confidence: 0.8
    }));
  }

  // Legacy method for backwards compatibility
  async searchSearx(query, maxResults = 5) {
    for (const instance of this.searxngInstances) {
      try {
        const results = await this.searchSearxInstance(instance, query, maxResults);
        if (results && results.length > 0) return results;
      } catch (e) {
        continue;
      }
    }
    return [];
  }

  /**
   * DuckDuckGo Lite (simpler HTML, less blocking)
   */
  async searchDuckDuckGoLite(query, maxResults = 5) {
    const response = await axios.get('https://lite.duckduckgo.com/lite/', {
      params: { q: query, kl: 'us-en' },
      headers: {
        'User-Agent': this.getRandomUserAgent(),
        ...this.defaultHeaders
      },
      timeout: 7000
    });

    const dom = new JSDOM(response.data);
    const doc = dom.window.document;

    const results = [];
    const rows = doc.querySelectorAll('table tr');

    for (const row of rows) {
      if (results.length >= maxResults) break;

      const link = row.querySelector('a.result-link');
      const snippet = row.querySelector('.result-snippet');

      if (link && link.href) {
        results.push({
          title: link.textContent?.trim() || 'Untitled',
          text: snippet?.textContent?.trim() || '',
          url: link.href,
          source: 'ddg_lite'
        });
      }
    }

    return results;
  }

  async searchDuckDuckGoHtml(query, maxResults = 5) {
    const response = await axios.get('https://duckduckgo.com/html/', {
      params: { q: query, kl: 'us-en' },
      headers: {
        'User-Agent': this.getRandomUserAgent(),
        ...this.defaultHeaders
      },
      timeout: 7000
    });

    const dom = new JSDOM(response.data);
    const doc = dom.window.document;
    const links = Array.from(doc.querySelectorAll('.result__a'));
    const snippets = Array.from(doc.querySelectorAll('.result__snippet'));

    return links.slice(0, maxResults).map((a, i) => ({
      title: a.textContent?.trim() || 'Untitled',
      text: snippets[i]?.textContent?.trim() || '',
      url: a.href,
      source: 'ddg_html'
    }));
  }

  /**
   * Google scraping fallback (very fragile, use as last resort)
   */
  async searchGoogleScrape(query, maxResults = 5) {
    const response = await axios.get('https://www.google.com/search', {
      params: { q: query, num: maxResults, hl: 'en' },
      headers: {
        'User-Agent': this.getRandomUserAgent(),
        ...this.defaultHeaders
      },
      timeout: 7000
    });

    const dom = new JSDOM(response.data);
    const doc = dom.window.document;
    const results = [];

    // Google's HTML structure varies, try multiple selectors
    const containers = doc.querySelectorAll('div.g, div[data-hveid]');

    for (const container of containers) {
      if (results.length >= maxResults) break;

      const link = container.querySelector('a[href^="http"]');
      const title = container.querySelector('h3');
      const snippet = container.querySelector('div[data-sncf], span.st, div.VwiC3b');

      if (link && title) {
        results.push({
          title: title.textContent?.trim() || 'Untitled',
          text: snippet?.textContent?.trim() || '',
          url: link.href,
          source: 'google_scrape'
        });
      }
    }

    return results;
  }

  /**
   * Model-assisted search via OpenRouter (Perplexity, etc.)
   * Ultimate fallback when all other strategies fail
   */
  async searchViaModel(query, maxResults = 5, model = 'perplexity/sonar-pro-search') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      this.log('debug', `searchViaModel: No OPENROUTER_API_KEY, skipping ${model}`);
      return [];
    }

    this.log('debug', `searchViaModel: Starting ${model} request`, { query: query.substring(0, 50) });

    const systemPrompt = `You are a web search assistant. Search for information and return results as a VALID JSON ARRAY.

CRITICAL: Your entire response must be ONLY a valid JSON array with NO other text before or after.
Do NOT include markdown formatting, citations like [1], or any explanatory text.

Format each result EXACTLY like this:
[
  {"title": "Page Title Here", "url": "https://full-url-here.com/path", "snippet": "Brief description of the page content"},
  {"title": "Another Page", "url": "https://another-url.com", "snippet": "Another description"}
]

Requirements:
- Return ${maxResults} results maximum
- Each url must be a complete HTTPS URL
- Each title must be the actual page title
- Each snippet must be 1-2 sentences describing the content
- Do NOT use citation numbers like [1] or [source]
- Do NOT include any text before [ or after ]`;

    try {
      const reqStart = Date.now();
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Search for: ${query}` }
        ],
        temperature: 0.1,
        max_tokens: 2000
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/anthropics/claude-code',
          'X-Title': 'OpenRouter-Agents-MCP'
        },
        timeout: 32000 // Allow 32s for Perplexity models
      });

      this.log('debug', `searchViaModel: ${model} responded in ${Date.now() - reqStart}ms`);

      const content = response.data.choices?.[0]?.message?.content || '';

      this.log('debug', `searchViaModel: Raw content length=${content.length}, preview: ${content.substring(0, 200).replace(/\n/g, '\\n')}`);

      // Extract JSON from response - try multiple extraction methods
      let jsonStr = content.trim();
      let extractionMethod = 'none';

      // Method 1: Check if entire response is JSON array (must start with [ and contain {)
      if (jsonStr.startsWith('[') && jsonStr.includes('{')) {
        extractionMethod = 'direct-array';
      }
      // Method 2: Extract from markdown code blocks
      else {
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1].trim();
          extractionMethod = 'code-block';
        }
        // Method 3: Find JSON array with objects in the text (not just [text] markdown links)
        else {
          // Match array containing at least one object: [{ ... }]
          const arrayMatch = content.match(/\[\s*\{[\s\S]*?\}\s*(?:,\s*\{[\s\S]*?\}\s*)*\]/);
          if (arrayMatch) {
            jsonStr = arrayMatch[0];
            extractionMethod = 'embedded-array';
          }
        }
      }

      this.log('debug', `searchViaModel: Extraction method=${extractionMethod}`);

      // Try to parse as JSON array
      let results;
      try {
        results = JSON.parse(jsonStr);
        this.log('debug', `searchViaModel: JSON parsed successfully, got ${Array.isArray(results) ? results.length : 'non-array'} items`);
      } catch (parseError) {
        this.log('debug', `searchViaModel: JSON parse failed (${parseError.message}), trying markdown extraction`);

        // Fallback: Extract URLs and titles from markdown-style response
        results = this._extractFromMarkdown(content, maxResults);
        this.log('debug', `searchViaModel: Markdown extraction got ${results.length} results`);
        if (results.length === 0) {
          this.log('debug', `searchViaModel: No results extracted, returning empty`);
          return [];
        }
      }

      if (Array.isArray(results) && results.length > 0) {
        const mapped = results.slice(0, maxResults).map(r => ({
          title: r.title || 'Untitled',
          text: r.snippet || r.description || '',
          url: r.url || r.link || '',
          source: model.split('/')[0], // 'perplexity'
          confidence: 0.85
        })).filter(r => r.url); // Filter out results without URLs

        this.log('debug', `searchViaModel: Final results after filtering=${mapped.length}`);
        return mapped;
      }

      this.log('debug', `searchViaModel: Results empty or not array`);
      return [];
    } catch (e) {
      this.log('debug', `searchViaModel: Failed with error: ${e.message}`);
      return [];
    }
  }

  /**
   * Extract URLs and titles from markdown-style responses
   * Handles formats like:
   * - [Title](https://url.com)
   * - [domain.com](url) **Bold Title**
   * - **Title** - https://url.com
   * - 1. [url.com] - Description
   */
  _extractFromMarkdown(content, maxResults = 5) {
    const results = [];
    const seenUrls = new Set();

    // Pattern 1: Perplexity format - [domain](url) **Title** text
    // e.g., [github.com](https://github.com/repo) **Actual Title** is a description
    const perplexityPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*\*\*([^*]+)\*\*/g;
    let match;
    while ((match = perplexityPattern.exec(content)) !== null && results.length < maxResults) {
      const url = match[2].trim();
      const title = match[3].trim(); // Use the bold text as title
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        results.push({ title, url, snippet: '' });
      }
    }

    // Pattern 2: Standard markdown links [Title](URL) - skip domain-only titles
    const mdLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    while ((match = mdLinkPattern.exec(content)) !== null && results.length < maxResults) {
      const title = match[1].trim();
      const url = match[2].trim();
      // Skip if title is just a domain, citation number, or we already have this URL
      if (url && !seenUrls.has(url) && !title.match(/^(\d+|[\w.-]+\.(com|org|io|net|dev))$/)) {
        seenUrls.add(url);
        results.push({ title, url, snippet: '' });
      }
    }

    // Pattern 3: Bold title with URL: **Title** - https://url.com
    const boldUrlPattern = /\*\*([^*]+)\*\*[:\s\-–]*(https?:\/\/[^\s\n\])]+)/g;
    while ((match = boldUrlPattern.exec(content)) !== null && results.length < maxResults) {
      const title = match[1].trim();
      const url = match[2].trim();
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        results.push({ title, url, snippet: '' });
      }
    }

    // Pattern 4: Numbered list with URL: 1. Title - https://url.com
    const numberedPattern = /\d+\.\s+([^-\n]+?)\s*[-–]\s*(https?:\/\/[^\s\n\])]+)/g;
    while ((match = numberedPattern.exec(content)) !== null && results.length < maxResults) {
      const title = match[1].trim();
      const url = match[2].trim();
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        results.push({ title, url, snippet: '' });
      }
    }

    // Pattern 5: Section headers followed by markdown links
    // e.g., ## Topic\n[domain](url) Description
    const sectionPattern = /#{1,3}\s+([^\n]+)\n+\[[\w.-]+\]\((https?:\/\/[^\s)]+)\)/g;
    while ((match = sectionPattern.exec(content)) !== null && results.length < maxResults) {
      const title = match[1].trim().replace(/\*\*/g, ''); // Clean asterisks from title
      const url = match[2].trim();
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        // Check if we have a better title from existing results
        const existing = results.find(r => r.url === url);
        if (!existing) {
          results.push({ title, url, snippet: '' });
        }
      }
    }

    // Extract snippets from surrounding text where possible
    results.forEach(r => {
      if (!r.snippet) {
        // Try to find description near the URL
        const urlIndex = content.indexOf(r.url);
        if (urlIndex > -1) {
          // Look for text after URL
          const afterUrl = content.substring(urlIndex + r.url.length, urlIndex + r.url.length + 300);
          // Clean up and extract meaningful text
          const cleaned = afterUrl
            .replace(/^\s*\)*\s*/, '') // Remove trailing parens
            .replace(/\*\*[^*]+\*\*/g, '') // Remove bold text (already captured)
            .replace(/\[[^\]]+\]\([^)]+\)/g, '') // Remove other markdown links
            .trim();

          // Get first meaningful sentence
          const sentenceMatch = cleaned.match(/^([^.!?]{15,200}[.!?])/);
          if (sentenceMatch) {
            r.snippet = sentenceMatch[1].trim();
          } else if (cleaned.length > 20) {
            r.snippet = cleaned.substring(0, 150).trim() + '...';
          }
        }
      }
    });

    this.log('debug', `Markdown extraction found ${results.length} results`);
    return results;
  }

  /**
   * Bing Web Search API
   */
  async searchBing(query, maxResults = 5) {
    const apiKey = process.env.BING_API_KEY;
    if (!apiKey) return [];

    const response = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
      params: { q: query, count: maxResults, mkt: 'en-US' },
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey
      },
      timeout: 7000
    });

    return (response.data.webPages?.value || []).slice(0, maxResults).map(r => ({
      title: r.name,
      text: r.snippet || '',
      url: r.url,
      source: 'bing_api',
      confidence: 0.9
    }));
  }

  /**
   * Google Custom Search API
   */
  async searchGoogle(query, maxResults = 5) {
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;
    if (!apiKey || !cx) return [];

    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: { key: apiKey, cx, q: query, num: Math.min(maxResults, 10) },
      timeout: 7000
    });

    return (response.data.items || []).slice(0, maxResults).map(r => ({
      title: r.title,
      text: r.snippet || '',
      url: r.link,
      source: 'google_api',
      confidence: 0.9
    }));
  }

  /**
   * Fetch and extract content from a URL with timeout protection
   */
  async fetchSignal(url) {
    try {
      const response = await withTimeout(
        axios.get(url, {
          headers: { 'User-Agent': this.getRandomUserAgent() },
          timeout: 12000,
          maxContentLength: 500000,
          responseType: 'text'
        }),
        15000,
        null
      );

      if (!response) {
        return Signal.error(`Timeout fetching ${url}`, 'web-fetch');
      }

      const dom = new JSDOM(response.data);
      const doc = dom.window.document;

      // Clean DOM
      doc.querySelectorAll('script, style, nav, footer, aside, .sidebar, .comments, .advertisement').forEach(el => el.remove());
      const content = (doc.querySelector('main, article, .content, .post-content, .entry-content') || doc.body).textContent
        .replace(/\s+/g, ' ')
        .trim();

      return Signal.response(
        { url, content: content.substring(0, 5000), title: doc.title },
        'web-fetch',
        0.9,
        { tags: ['source-material'] }
      );
    } catch (e) {
      return Signal.error(`Failed to fetch ${url}: ${e.message}`, 'web-fetch');
    }
  }

  /**
   * Batch fetch multiple URLs in parallel with timeout
   */
  async fetchMultiple(urls, maxConcurrent = 3) {
    const results = [];
    for (let i = 0; i < urls.length; i += maxConcurrent) {
      const batch = urls.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(url => withTimeout(this.fetchSignal(url), 10000, Signal.error(`Timeout: ${url}`, 'web-fetch')))
      );
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * Get strategy statistics for monitoring
   */
  getStrategyStats() {
    const stats = {};
    for (const [name, data] of this.strategyStats.entries()) {
      const total = data.success + data.fail;
      stats[name] = {
        ...data,
        total,
        successRate: total > 0 ? (data.success / total * 100).toFixed(1) + '%' : 'N/A'
      };
    }
    return stats;
  }

  /**
   * Reset strategy statistics
   */
  resetStrategyStats() {
    this.strategyStats.clear();
  }
}

module.exports = UnifiedSearchMesh;
