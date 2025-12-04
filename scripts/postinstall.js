#!/usr/bin/env node
/**
 * Postinstall script for @terminals-tech/openrouter-agents
 * Minimal output - just show the one-liner setup command
 */

// Only show during actual npm install (not during pack, etc.)
if (process.env.npm_lifecycle_event === 'postinstall') {
  const cyan = '\x1b[36m';
  const reset = '\x1b[0m';
  const bright = '\x1b[1m';

  console.log(`
${cyan}┌────────────────────────────────────────────────────────────┐${reset}
${cyan}│${reset} ${bright}OpenRouter Agents MCP Server${reset}                               ${cyan}│${reset}
${cyan}├────────────────────────────────────────────────────────────┤${reset}
${cyan}│${reset}                                                            ${cyan}│${reset}
${cyan}│${reset}  ${bright}Quick setup:${reset}                                              ${cyan}│${reset}
${cyan}│${reset}  claude mcp add openrouter-agents -- \\                    ${cyan}│${reset}
${cyan}│${reset}    npx @terminals-tech/openrouter-agents --stdio           ${cyan}│${reset}
${cyan}│${reset}                                                            ${cyan}│${reset}
${cyan}│${reset}  ${bright}Or interactive setup:${reset}                                     ${cyan}│${reset}
${cyan}│${reset}  npx @terminals-tech/openrouter-agents --setup-claude      ${cyan}│${reset}
${cyan}│${reset}                                                            ${cyan}│${reset}
${cyan}└────────────────────────────────────────────────────────────┘${reset}
`);
}
