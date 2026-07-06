# @make-sfx/mcp

MCP server for AI agents — describe game sounds in natural language, get WAV files and pasteable code.

## Install

```bash
npm install -g @make-sfx/mcp
# or use npx (no install)
```

## Cursor / Claude MCP config

```json
{
  "mcpServers": {
    "make-sfx": {
      "command": "npx",
      "args": ["-y", "@make-sfx/mcp"]
    }
  }
}
```

Or with global install:

```json
{
  "mcpServers": {
    "make-sfx": {
      "command": "make-sfx-mcp",
      "args": []
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `sfx_from_description` | **Start here** — natural language → WAV + code |
| `sfx_describe` | Parse description to configs (no files) |
| `sfx_game_pack` | Standard jump/blink/coin/hit/powerup pack |
| `sfx_design` | Full manual control (70+ params) |
| `sfx_get_parameters` | Parameter schema with aiHint |

## Example prompt

> Oyunum için zıplama ve daha tiz blink sesi

Agent calls:

```json
{
  "tool": "sfx_from_description",
  "arguments": {
    "description": "zıplama ve tiz blink",
    "outputDir": "./assets/sfx"
  }
}
```

## License

MIT