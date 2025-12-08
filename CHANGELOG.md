# Changelog

## [1.9.0](https://github.com/wheattoast11/openrouter-deep-research-mcp/compare/v1.8.0...v1.9.0) (2025-12-07)


### Features

* **v1.8.1:** Core abstractions, handler integration, and error visibility ([c686386](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/c686386b6669cb485f009193c7b80498a3c65962))

## [1.8.0](https://github.com/wheattoast11/openrouter-deep-research-mcp/compare/v1.7.0...v1.8.0) (2025-12-04)


### Features

* **v1.8.0:** MCP Apps, Knowledge Graph, and Session Time-Travel ([488bfed](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/488bfed4caaba3a82302176fe58f67a68b2531ec))

## [1.6.0](https://github.com/wheattoast11/openrouter-deep-research-mcp/compare/v1.5.0...v1.6.0) (2025-11-12)


### Features

* add server discovery, health endpoint, and Nov 2025 MCP spec readiness ([702da6a](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/702da6a41d4118d24af3f76d012d6ae638bfbd9d))

## [1.5.0](https://github.com/wheattoast11/openrouter-deep-research-mcp/compare/v1.4.0...v1.5.0) (2025-08-26)


### Features

* 2025 upgrades — model catalog 2025 prefs, kurtosis-style ensembles + multimodal fallbacks; PGlite adaptive thresholds + keyword fallback + HNSW params; MCP HTTP auth OAuth2/JWT scaffolding + CORS; planning AIMD; OpenRouter hybrid batching; gen-docs script and CHANGELOG/README hooks ([a8a18aa](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/a8a18aa489236c01d14b0e5c5b5e6ad71e52a56c))
* compact prompts/resources, hybrid index tools, planning fallbacks, strict citation prompts, compact tool params, README v1.2 with architecture & journeys ([0e81d33](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/0e81d3387c0d82eca647a23b2869dbe31db6ee18))
* **docs:** update README to include new AGENT and MANUAL modes, enhance tool descriptions, and add npm/GitHub Packages publishing details ([8fdad28](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/8fdad28712ce403dad7f71372f660e4e3519894e))
* enhance configuration and functionality of MCP server tools; introduce unified retrieve schema for hybrid search and SQL execution; improve job status reporting with concise summaries; update research history listing for better readability and filtering; refine DB initialization logic for improved retry handling ([f34f997](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/f34f9979a87c76b25f640e3f0a9f910e8a64998b))
* enhance model configuration with new high and low-cost models; implement advanced caching and cost optimization strategies; update README with model details and caching configurations ([100f818](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/100f818b07f567e84aa84c5cfdd156b49d74c196))
* implement async job processing with submit, status, and cancel functionalities; enhance configuration for HTTPS and reranking; update README with new demo scripts and MCP client JSON configuration examples ([70e66a2](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/70e66a274a5a99cb6cf7834a8b1c58cad6538e75))
* lightweight web tools (search_web, fetch_url) and docs; register tools ([1cdb005](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/1cdb0059f653bb7d6e62da9d4d124bd06c18de11))
* **mode:** AGENT/MANUAL/ALL w/ always-on tools; add agent+ping; async submit UI/SSE links; docs/CI; v1.3.2 ([17b456e](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/17b456ef014b2d649a4bac88e6b3e7999c5d1188))
* **models:** switch defaults to anthropic/claude-sonnet-4 and openai/gpt-5 family ([3348bd8](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/3348bd846a38b7864ce619518f0f8cb30eb206dc))
* streaming robustness, dynamic catalog tools, DB QoL tools, README updates (Aug 09, 2025) ([65cf942](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/65cf942c8db3756f6df5a52308b5a02b46f73b3d))
* tarball backups, refreshed default model IDs, extended tests, docs update; npm audit fix ([8918fcc](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/8918fcc1194511f8d55c3ed19aa6ee4b1c80ecdc))
* update model configurations to include new planning defaults and enhance research agent capabilities; add client context handling and hyper mode for optimized model selection; improve web scraping with additional search strategies and usage tracking ([2850f59](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/2850f59033106a4ecd8fb5c683f92920ff33ff96))


### Bug Fixes

* define search_web implementation ([5eef4a4](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/5eef4a41da07d239bab54b4f809cc6a50991a92f))
* increase classifier max_tokens to satisfy provider minimums; docs: changelog v1.2.0 ([d469cea](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/d469ceac67462fbf39a75f472b5c6b8ca8ccdead))


### Performance Improvements

* bounded parallelism for research; dynamic vision capability via catalog; add PARALLELISM config ([248046d](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/248046d8b11aa2112eb5f9ef2848b94581562fe2))

## [1.4.0](https://github.com/wheattoast11/openrouter-deep-research-mcp/compare/v1.3.1...v1.4.0) (2025-08-26)


### Features

* **mode:** AGENT/MANUAL/ALL w/ always-on tools; add agent+ping; async submit UI/SSE links; docs/CI; v1.3.2 ([17b456e](https://github.com/wheattoast11/openrouter-deep-research-mcp/commit/17b456ef014b2d649a4bac88e6b3e7999c5d1188))
