# Zero CLI Shell Integration

Integrate Agent Zero directly into your shell for seamless AI assistance.

## Quick Setup

Add the following to your `~.zshrc`, `~/.bashrc`, or `~/.config/fish/config.fish`.

### 1. The `z` Alias (Fast Chat)

Use `z` to chat with Zero from anywhere.

```bash
# Chat with Zero
# Usage: z how do I tar a file
function z() {
  zero "$*"
}
```

### 2. Smart Command Injection (`zc`)

Ask Zero for a command and inject it directly into your current shell buffer (Zsh only).
This allows you to edit the command before running it.

```zsh
# ZSH Only
# Usage: Type 'zc list all git files', then press Ctrl+Z (or bound key)
# Or run: zc "list all git files" -> populates buffer

function zc() {
  local query="$*"
  if [ -z "$query" ]; then
    echo "Usage: zc <query>"
    return 1
  fi

  # Get command from Zero (Synapse Layer)
  # -x / --cmd flag ensures only raw command is returned
  local cmd=$(zero --cmd "$query")
  
  if [ -n "$cmd" ]; then
    print -z "$cmd"  # Push to ZSH buffer
  fi
}
```

### 3. Eval Helper (`ze`)

Run the generated command immediately.

```bash
# Bash/Zsh
# Usage: ze "list all git files"
function ze() {
  local query="$*"
  if [ -z "$query" ]; then
    echo "Usage: ze <query>"
    return 1
  fi
  
  local cmd=$(zero --cmd "$query")
  echo "> $cmd"
  eval "$cmd"
}
```

## Advanced: Context-Aware Autocomplete (Concept)

To enable AI-driven autocomplete for `zero`, add this to your zsh config:

```zsh
_zero_completion() {
  local query="$BUFFER"
  # This would call a specialized fast endpoint
  # local suggestion=$(zero complete "$query")
  # COMPREPLY=("$suggestion")
}
# compdef _zero_completion zero
```
*(Note: Full shell autocompletion requires deeper shell integration functionality currently in development)*
