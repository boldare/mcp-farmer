Output "demo/new.gif"

Set Theme "Builtin Dark"
Set FontSize 16
Set Width 1000
Set Height 600
Set Framerate 60
Set TypingSpeed 40ms
Set CursorBlink true

Type "npx mcp-farmer new"
Enter
Sleep 2s

# Enter server name
Type "company-mcp-server"
Enter
Sleep 500ms

# Accept default directory path
Enter
Sleep 1s

# Server type: Remote (HTTP-based) is already selected as default
Enter
Sleep 1s

# HTTP framework: Native Node.js HTTP is default, accept it
Enter
Sleep 1s

# Package manager: select npm (first option, already selected)
Enter
Sleep 1s

# Initialize git repository: Yes (default)
Enter
Sleep 1s

# Deployment option: select Docker (second option, need to go down once)
Down
Sleep 300ms
Enter
Sleep 3s

# Show the result
Sleep 2s
