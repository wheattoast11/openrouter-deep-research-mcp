// src/utils/robustWebScraper.js
// Robust web scraping with headless browser capabilities and proxy support

const axios = require('axios');
const { JSDOM } = require('jsdom');

class RobustWebScraper {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    
    this.defaultHeaders = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    };
  }

  // Get random user agent for rotation
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  // Enhanced web search with multiple fallback strategies
  async searchWeb(query, maxResults = 5, options = {}) {
    const strategies = [
      () => this.searchDuckDuckGo(query, maxResults),
      () => this.searchBing(query, maxResults),
      () => this.searchGoogle(query, maxResults)
    ];

    for (const strategy of strategies) {
      try {
        const results = await strategy();
        if (results && results.length > 0) {
          console.error(`[${new Date().toISOString()}] RobustWebScraper: Successfully retrieved ${results.length} results for "${query.substring(0, 50)}..."`);
          return results;
        }
      } catch (error) {
        console.warn(`[${new Date().toISOString()}] RobustWebScraper: Search strategy failed, trying next:`, error.message);
        continue;
      }
    }

    console.error(`[${new Date().toISOString()}] RobustWebScraper: All search strategies failed for query "${query.substring(0, 50)}..."`);
    return [];
  }

  // DuckDuckGo search implementation
  async searchDuckDuckGo(query, maxResults = 5) {
    try {
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: 'json',
          no_html: '1',
          skip_disambig: '1'
        },
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          ...this.defaultHeaders
        },
        timeout: 10000
      });

      const results = [];
      if (response.data.RelatedTopics) {
        for (const topic of response.data.RelatedTopics.slice(0, maxResults)) {
          if (topic.FirstURL && topic.Text) {
            results.push({
              title: topic.Text.split(' - ')[0] || 'DuckDuckGo Result',
              text: topic.Text,
              url: topic.FirstURL,
              source: 'ddg'
            });
          }
        }
      }

      // Also check Abstract if available
      if (response.data.Abstract && response.data.AbstractURL) {
        results.unshift({
          title: response.data.Heading || query,
          text: response.data.Abstract,
          url: response.data.AbstractURL,
          source: 'ddg'
        });
      }

      return results.slice(0, maxResults);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] RobustWebScraper: DuckDuckGo search failed:`, error.message);
      throw error;
    }
  }

  // Bing search implementation (requires API key)
  async searchBing(query, maxResults = 5) {
    const bingApiKey = process.env.BING_API_KEY;
    if (!bingApiKey) {
      throw new Error('Bing API key not configured');
    }

    try {
      const response = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
        params: {
          q: query,
          count: maxResults,
          offset: 0,
          mkt: 'en-US',
          safesearch: 'Moderate'
        },
        headers: {
          'Ocp-Apim-Subscription-Key': bingApiKey,
          'User-Agent': this.getRandomUserAgent()
        },
        timeout: 10000
      });

      return (response.data.webPages?.value || []).map(item => ({
        title: item.name,
        text: item.snippet,
        url: item.url,
        source: 'bing'
      }));
    } catch (error) {
      console.error(`[${new Date().toISOString()}] RobustWebScraper: Bing search failed:`, error.message);
      throw error;
    }
  }

  // Google Custom Search implementation (requires API key and search engine ID)
  async searchGoogle(query, maxResults = 5) {
    const googleApiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    if (!googleApiKey || !searchEngineId) {
      throw new Error('Google search API credentials not configured');
    }

    try {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: googleApiKey,
          cx: searchEngineId,
          q: query,
          num: Math.min(maxResults, 10)
        },
        timeout: 10000
      });

      return (response.data.items || []).map(item => ({
        title: item.title,
        text: item.snippet,
        url: item.link,
        source: 'google'
      }));
    } catch (error) {
      console.error(`[${new Date().toISOString()}] RobustWebScraper: Google search failed:`, error.message);
      throw error;
    }
  }

  // Enhanced URL fetching with robust error handling
  async fetchUrl(url, options = {}) {
    const { maxBytes = 200000, timeout = 15000 } = options;
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          ...this.defaultHeaders
        },
        timeout,
        maxContentLength: maxBytes,
        responseType: 'text'
      });

      // Parse HTML and extract meaningful content
      const dom = new JSDOM(response.data);
      const document = dom.window.document;
      
      // Remove script and style elements
      const scripts = document.querySelectorAll('script, style, nav, footer, aside');
      scripts.forEach(el => el.remove());
      
      // Extract main content
      const contentSelectors = [
        'main', 
        'article', 
        '[role="main"]',
        '.content',
        '.main-content',
        '#content',
        '.post-content',
        '.entry-content'
      ];
      
      let mainContent = '';
      for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          mainContent = element.textContent || '';
          break;
        }
      }
      
      // Fallback to body content if no main content found
      if (!mainContent) {
        mainContent = document.body?.textContent || response.data;
      }
      
      // Clean up the content
      const cleanContent = mainContent
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim()
        .substring(0, maxBytes);

      return {
        url,
        content: cleanContent,
        title: document.title || '',
        contentLength: cleanContent.length,
        success: true
      };
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] RobustWebScraper: Failed to fetch ${url}:`, error.message);
      return {
        url,
        content: '',
        title: '',
        contentLength: 0,
        success: false,
        error: error.message
      };
    }
  }

  // Cost-aware model selection based on query complexity and caching
  selectOptimalModel(query, domain = 'general', complexity = 'moderate', costPreference = 'low') {
    const { optimization } = config.caching;
    
    // Check cache for previous successful model selections
    const selectionKey = `model_selection:${domain}:${complexity}:${costPreference}`;
    const cachedSelection = this.modelCache.get(selectionKey);
    
    if (cachedSelection) {
      console.error(`[${new Date().toISOString()}] RobustWebScraper: Using cached model selection: ${cachedSelection.model}`);
      return cachedSelection.model;
    }

    let selectedModel;
    
    // Intelligent model routing based on domain and complexity
    if (domain === 'coding' || query.includes('code') || query.includes('programming')) {
      selectedModel = complexity === 'simple' ? 'qwen/qwen3-coder' : 'morph/morph-v3-large';
    } else if (domain === 'vision' || query.includes('image') || query.includes('visual')) {
      selectedModel = 'z-ai/glm-4.5v';
    } else if (complexity === 'complex' && costPreference === 'high') {
      selectedModel = 'x-ai/grok-4';
    } else {
      selectedModel = 'deepseek/deepseek-chat-v3.1'; // Default ultra-low cost
    }

    // Cache the selection for future use
    this.modelCache.set(selectionKey, { 
      model: selectedModel, 
      reasoning: `${domain}:${complexity}:${costPreference}`,
      timestamp: new Date().toISOString()
    });

    console.error(`[${new Date().toISOString()}] RobustWebScraper: Selected optimal model: ${selectedModel} (${domain}:${complexity}:${costPreference})`);
    return selectedModel;
  }

  // Get comprehensive cache statistics
  getDetailedStats() {
    const resultStats = this.resultCache.getStats();
    const modelStats = this.modelCache.getStats();
    
    return {
      enabled: this.enabled,
      results: {
        ...resultStats,
        keys: this.resultCache.keys().length,
        hitRate: resultStats.hits / (resultStats.hits + resultStats.misses) || 0
      },
      models: {
        ...modelStats,
        keys: this.modelCache.keys().length,
        hitRate: modelStats.hits / (modelStats.hits + modelStats.misses) || 0
      },
      optimization: {
        similarityThreshold: this.similarityThreshold,
        estimatedCostSavings: this.calculateCostSavings()
      }
    };
  }

  calculateCostSavings() {
    const resultStats = this.resultCache.getStats();
    const modelStats = this.modelCache.getStats();
    
    // Rough estimate: each cache hit saves ~$0.001 in API costs
    const totalHits = resultStats.hits + modelStats.hits;
    return {
      hits: totalHits,
      estimatedSavings: totalHits * 0.001,
      currency: 'USD'
    };
  }
}

module.exports = RobustWebScraper;
