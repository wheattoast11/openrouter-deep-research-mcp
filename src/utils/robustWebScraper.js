// src/utils/robustWebScraper.js
// UnifiedSearchMesh: 1P-first autonomous perceptual agent
// Optimized for zero-dependency, signal-native research.

const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Signal } = require('../core/signal');

class UnifiedSearchMesh {
  constructor({ transport = axios } = {}) {
    this.transport = transport;
    this.userAgents = ['Mozilla/5.0 Maxwell-Zero/1.0'];
    
    this.defaultHeaders = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  /**
   * Perceptual Search: Gathers signals from the web fabric.
   * Priority: 1P/Free (SearxNG, DDG HTML) -> fallback to 3P if keys present.
   */
  async perception(query, maxResults = 5) {
    const strategies = [
      ...(process.env.SEARXNG_URL ? [() => this.searchSearx(query, maxResults)] : []),
      () => this.searchDuckDuckGoHtml(query, maxResults)
    ];

    // Only add 3P as fallback if explicitly configured
    if (process.env.BING_API_KEY) {
      strategies.push(() => this.searchBing(query, maxResults));
    }
    if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID) {
      strategies.push(() => this.searchGoogle(query, maxResults));
    }

    for (const strategy of strategies) {
      try {
        const rawResults = await strategy();
        if (rawResults && rawResults.length > 0) {
          // Transform raw results into isomorphic Signals
          return rawResults.map(r => Signal.response(
            {
              title: r.title,
              snippet: r.text,
              url: r.url
            },
            r.source,
            0.85, // Default confidence for web perception
            { tags: ['web-perception', r.source] }
          ));
        }
      } catch (error) {
        process.stderr.write(`[${new Date().toISOString()}] UnifiedSearchMesh: Strategy failed: ${error.message}\n`);
        continue;
      }
    }

    return [];
  }

  async searchSearx(query, maxResults = 5) {
    const base = process.env.SEARXNG_URL || 'https://searx.be'; // Public instance fallback
    try {
      const response = await this.transport.get(`${base.replace(/\/$/, '')}/search`, {
        params: { q: query, format: 'json', language: 'en' },
        timeout: 10000,
        headers: { 'User-Agent': this.getRandomUserAgent() }
      });
      return (response.data.results || []).slice(0, maxResults).map(r => ({
        title: r.title,
        text: r.content || r.snippet || '',
        url: r.url,
        source: 'searxng'
      }));
    } catch (e) {
      return [];
    }
  }

  async searchDuckDuckGoHtml(query, maxResults = 5) {
    try {
      const response = await this.transport.post('https://html.duckduckgo.com/html/', new URLSearchParams({ q: query }).toString(), {
        headers: { 'User-Agent': this.getRandomUserAgent(), 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });
      const dom = new JSDOM(response.data);
      const doc = dom.window.document;
      const links = Array.from(doc.querySelectorAll('.result__a'));
      const snippets = Array.from(doc.querySelectorAll('.result__snippet'));
      
      const results = links.slice(0, maxResults).map((a, i) => ({
        title: a.textContent?.trim(),
        text: snippets[i]?.textContent?.trim() || '',
        url: (() => { const link = new URL(a.href, 'https://duckduckgo.com'); return link.searchParams.get('uddg') || link.href; })(),
        source: 'ddg_html'
      }));
      dom.window.close();
      return results;
    } catch (e) {
      return [];
    }
  }

  async fetchSignal(url) {
    try {
      const response = await this.transport.get(url, {
        headers: { 'User-Agent': this.getRandomUserAgent() },
        timeout: 15000,
        maxContentLength: 500000,
        responseType: 'text'
      });

      const dom = new JSDOM(response.data);
      const doc = dom.window.document;
      
      // Clean DOM
      doc.querySelectorAll('script, style, nav, footer').forEach(el => el.remove());
      const content = (doc.querySelector('main, article, .content') || doc.body).textContent
        .replace(/\s+/g, ' ')
        .trim();

      const published = doc.querySelector('meta[property="article:published_time"], meta[name="date"]')?.content;
      const publishedAt = published && Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : null;
      const result = Signal.response(
        { url: response.finalUrl || url, content: content.substring(0, 5000), title: doc.title, retrievedAt: new Date().toISOString(), publishedAt },
        'web-fetch',
        0.9,
        { tags: ['source-material'] }
      );
      dom.window.close();
      return result;
    } catch (e) {
      return Signal.error(`Failed to fetch ${url}: ${e.message}`, 'web-fetch');
    }
  }
}

module.exports = UnifiedSearchMesh;
