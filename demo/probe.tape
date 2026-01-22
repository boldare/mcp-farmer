Output "demo/probe.gif"

Set Theme "Builtin Dark"
Set FontSize 16
Set Width 1000
Set Height 600
Set Framerate 60
Set TypingSpeed 40ms
Set CursorBlink true

Type "npx mcp-farmer probe https://mcp.context7.com/mcp"
Enter
Sleep 5s

# Select tools to probe: both resolve-library-id and query-docs
# First tool is already highlighted, press Space to select it
Space
Sleep 300ms

# Move down to query-docs and select it
Down
Sleep 300ms
Space
Sleep 300ms

# Confirm selection
Enter
Sleep 1s

# Select coding agent: OpenCode (first option is already selected)
Enter
Sleep 3s

# Wait for connection to OpenCode
Sleep 2s

# Select model: type to filter and select GitHub Copilot/Claude Haiku 4.5
Type "haiku"
Sleep 200ms
Enter
Sleep 3s

# Wait for probing to complete
Sleep 10s

# Show the result
Sleep 2s
