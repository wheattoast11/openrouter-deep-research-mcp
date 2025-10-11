# OpenRouter Research Agents - Documentation Hub

**Version**: 2.2.0-beta  
**Last Updated**: October 11, 2025  
**Status**: Production-Ready

This is the **single source of truth** for all documentation. All other docs reference this hub.

---

## 📚 **Documentation Structure** (MECE)

### 🚀 **Getting Started** (5min → Production)
1. **[QUICKSTART](QUICKSTART-v2.2.md)** - Zero to running in 5 minutes
2. **[WINDOWS-SETUP](WINDOWS-SETUP.md)** - Windows-specific configuration
3. **[DOCKER-DEPLOYMENT](DOCKER-DEPLOYMENT.md)** - Containerized production deployment

### 🔧 **Core Documentation** (Deep Understanding)
4. **[ARCHITECTURE](v2.2-ARCHITECTURE.md)** - System design, transports, async operations
5. **[MCP-PROTOCOL](MCP-PROTOCOL-v2.2.md)** - Protocol compliance, version negotiation, capabilities
6. **[OAUTH-SECURITY](OAUTH-SECURITY.md)** - JWT validation, scope enforcement, discovery endpoints
7. **[ASYNC-OPERATIONS](ASYNC-OPERATIONS.md)** - Job lifecycle, event streaming, SEP-1391 compliance

### 📖 **API Reference** (Implementation)
8. **[TOOL-CATALOG](TOOL-CATALOG.md)** - All 42 tools with schemas and examples
9. **[PROMPT-CATALOG](PROMPT-CATALOG.md)** - All 6 prompts with usage patterns
10. **[RESOURCE-CATALOG](RESOURCE-CATALOG.md)** - All 9 dynamic resources with URIs
11. **[PROMPT-TEMPLATES](../PROMPT-TEMPLATES.md)** - Parameterized templates for all use cases

### 🔄 **Migration & Upgrades** (Version Transitions)
12. **[MIGRATION-v2.2](MIGRATION-v2.2.md)** - Upgrade from v2.1 → v2.2
13. **[MIGRATION-v2.1](MIGRATION-v2.1.md)** - Upgrade from v2.0 → v2.1
14. **[MIGRATION-v2.0](MIGRATION-v2.0.md)** - Upgrade from v1.6 → v2.0

### 🧪 **Testing & Quality** (Validation)
15. **[TESTING-GUIDE](TESTING-GUIDE.md)** - Comprehensive test suite execution
16. **[MANUAL-QA-PROTOCOL](MANUAL-QA-PROTOCOL.md)** - Human QA checklist
17. **[QC-CERTIFICATION](QC-CERTIFICATION.md)** - Production readiness certification

### 📊 **Operations** (Production)
18. **[PLATFORM-INTEGRATION](PLATFORM-INTEGRATION.md)** - Cursor, Claude Desktop, custom clients
19. **[USE-CASES](USE_CASES.md)** - Domain-specific research patterns
20. **[TROUBLESHOOTING](TROUBLESHOOTING.md)** - Common issues and solutions

### 📝 **Changelog & Release Notes**
21. **[CHANGELOG](CHANGELOG.md)** - All versions, changes, breaking changes
22. **[RELEASE-NOTES-v2.2](RELEASE-NOTES-v2.2.md)** - Latest release details

---

## 🗂️ **Documentation Map** (Quick Navigation)

```
docs/
├── README.md (THIS FILE - Documentation Hub)
│
├── 🚀 Getting Started
│   ├── QUICKSTART-v2.2.md
│   ├── WINDOWS-SETUP.md
│   └── DOCKER-DEPLOYMENT.md
│
├── 🔧 Core Documentation
│   ├── v2.2-ARCHITECTURE.md
│   ├── MCP-PROTOCOL-v2.2.md
│   ├── OAUTH-SECURITY.md
│   └── ASYNC-OPERATIONS.md
│
├── 📖 API Reference
│   ├── TOOL-CATALOG.md
│   ├── PROMPT-CATALOG.md
│   ├── RESOURCE-CATALOG.md
│   └── ../PROMPT-TEMPLATES.md
│
├── 🔄 Migration & Upgrades
│   ├── MIGRATION-v2.2.md
│   ├── MIGRATION-v2.1.md
│   └── MIGRATION-v2.0.md
│
├── 🧪 Testing & Quality
│   ├── TESTING-GUIDE.md
│   ├── MANUAL-QA-PROTOCOL.md
│   └── QC-CERTIFICATION.md
│
├── 📊 Operations
│   ├── PLATFORM-INTEGRATION.md
│   ├── USE_CASES.md
│   └── TROUBLESHOOTING.md
│
└── 📝 Changelog
    ├── CHANGELOG.md
    └── RELEASE-NOTES-v2.2.md
```

---

## 🎯 **Documentation Principles**

### MECE (Mutually Exclusive, Collectively Exhaustive)
- Each document has a **single, clear purpose**
- **No overlap** between documents
- **Complete coverage** of all topics
- **Cross-references** instead of duplication

### Single Source of Truth
- This README is the **master index**
- All other docs **reference this hub**
- **No duplicate content** across files
- **Version-specific** docs for migrations

### Accessibility
- **Progressive disclosure**: Quickstart → Deep Dive
- **Role-based**: Operators, Developers, Architects
- **Task-oriented**: "How do I..." style headings

---

## 📖 **Quick Reference by Role**

### For **Operators** (Running the Server)
1. Start here: [QUICKSTART-v2.2](QUICKSTART-v2.2.md)
2. Deploy: [DOCKER-DEPLOYMENT](DOCKER-DEPLOYMENT.md)
3. Integrate: [PLATFORM-INTEGRATION](PLATFORM-INTEGRATION.md)
4. Troubleshoot: [TROUBLESHOOTING](TROUBLESHOOTING.md)

### For **Developers** (Integrating the API)
1. Understand: [v2.2-ARCHITECTURE](v2.2-ARCHITECTURE.md)
2. Explore: [TOOL-CATALOG](TOOL-CATALOG.md), [PROMPT-CATALOG](PROMPT-CATALOG.md)
3. Implement: [../PROMPT-TEMPLATES.md](../PROMPT-TEMPLATES.md)
4. Test: [TESTING-GUIDE](TESTING-GUIDE.md)

### For **Architects** (System Design)
1. Architecture: [v2.2-ARCHITECTURE](v2.2-ARCHITECTURE.md)
2. Protocol: [MCP-PROTOCOL-v2.2](MCP-PROTOCOL-v2.2.md)
3. Security: [OAUTH-SECURITY](OAUTH-SECURITY.md)
4. Async Patterns: [ASYNC-OPERATIONS](ASYNC-OPERATIONS.md)

---

## 🔗 **External Resources**

- **MCP Specification**: https://github.com/modelcontextprotocol/specification
- **MCP Documentation**: https://modelcontextprotocol.io/
- **OpenRouter API**: https://openrouter.ai/docs
- **Project Repository**: https://github.com/wheattoast11/openrouter-deep-research-mcp

---

## 📋 **Deprecated Documentation** (Archived)

The following files are **deprecated** and kept only for historical reference:

- `docs/research/` - Old research notes (use `research_outputs/` instead)
- `docs/qa/` - Old QA reports (superseded by MANUAL-QA-PROTOCOL.md)
- `docs/v2.0-*.md` - Version 2.0 specific docs (use v2.2 docs)
- `docs/implementation-plan*.md` - Old planning docs (see CHANGELOG.md)
- `docs/mece-analysis*.md` - Old analysis docs (see v2.2-ARCHITECTURE.md)

---

## ✨ **What's New in v2.2**

1. **MCP Prompts & Resources**: 6 prompts + 9 dynamic resources now exposed
2. **Structured Outputs**: All tools return structured content + human-readable text
3. **OAuth 2.1 Resource Server**: Full JWT validation with scope enforcement
4. **Discovery Endpoints**: `.well-known/mcp-server` and `.well-known/oauth-protected-resource`
5. **Async Job Lifecycle**: SEP-1391 compliant with event streaming
6. **Protocol Version 2025-06-18**: Latest draft spec compliance
7. **Browser LLM Integration**: Client-side inference with WebAssembly models
8. **Documentation Consolidation**: Single source of truth (this file!)

---

## 🤝 **Contributing**

Documentation improvements follow these rules:

1. **Update this README first** when adding new docs
2. **One topic = one doc** (MECE principle)
3. **Cross-reference** instead of duplicating content
4. **Version-tag** migration guides (e.g., `MIGRATION-v2.X.md`)
5. **Test all examples** before committing

---

**Questions?** See [TROUBLESHOOTING](TROUBLESHOOTING.md) or file an issue.

