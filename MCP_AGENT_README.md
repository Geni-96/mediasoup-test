# MediaSoup MCP Agent Integration

This integration allows LLM agents to participate in MediaSoup video conferencing rooms through the Model Context Protocol (MCP).

## Features

- **Agent Room Participation**: LLM agents can join and leave rooms
- **Message Broadcasting**: Agents can send messages to room participants
- **Room Information**: Agents can query room status and participant lists
- **Real-time Updates**: Frontend displays agent presence and messages
- **Unique Naming**: Automatic username conflict resolution

## Setup

### 1. Install Dependencies

```bash
cd server
npm install @modelcontextprotocol/sdk
```

### 2. Start the MediaSoup Server

```bash
npm start
```

### 3. Configure MCP Client

Add the MCP server configuration to your MCP client (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "mediasoup-agent": {
      "command": "node",
      "args": ["./server/mcp-server.js"],
      "env": {
        "MEDIASOUP_SERVER_URL": "http://localhost:5001"
      }
    }
  }
}
```

## Available MCP Tools

### `join_room`
Join a room as an agent participant.

**Parameters:**
- `username` (string): Agent's display name
- `roomId` (string): Room ID to join
- `agentType` (string, optional): Type of agent (default: "assistant")

**Returns:**
- `agentId`: Unique identifier for the agent session
- `actualUsername`: Final username (may be modified for uniqueness)
- `roomId`: Confirmed room ID

### `leave_room`
Leave the current room.

**Parameters:**
- `agentId` (string): Agent ID from join_room
- `roomId` (string): Room ID to leave

### `send_message`
Send a message to room participants.

**Parameters:**
- `agentId` (string): Agent ID
- `roomId` (string): Room ID
- `message` (string): Message content
- `messageType` (string, optional): Message type (default: "chat")

### `get_room_info`
Get room information including participants and agents.

**Parameters:**
- `roomId` (string): Room ID to query

### `list_participants`
List all participants in a room.

**Parameters:**
- `roomId` (string): Room ID

## Testing

### Test with the Sample Client

```bash
cd server
node test-mcp-client.js [roomId] [agentName]
```

Example:
```bash
node test-mcp-client.js "my-test-room" "AssistantBot"
```

### Manual Testing with curl

Join a room:
```bash
curl -X POST http://localhost:5001/api/agent/join \
  -H "Content-Type: application/json" \
  -d '{"username": "TestAgent", "roomId": "test-room", "agentType": "assistant"}'
```

Send a message:
```bash
curl -X POST http://localhost:5001/api/agent/message \
  -H "Content-Type: application/json" \
  -d '{"agentId": "agent_xxxxx", "roomId": "test-room", "message": "Hello from agent!"}'
```

## Frontend Changes

The frontend now includes:

1. **Agent Panel**: Shows active agents and their recent messages
2. **Real-time Updates**: Displays when agents join/leave rooms
3. **Message Display**: Shows agent messages with timestamps
4. **Agent Indicators**: Visual distinction between human and agent participants

## Error Handling

- **Room Validation**: Checks if room exists before joining
- **Username Conflicts**: Automatically resolves duplicate usernames
- **Agent Authentication**: Validates agent ID for all operations
- **Connection Errors**: Graceful handling of network issues

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Client    │───▶│   MCP Server    │───▶│ MediaSoup HTTP  │
│   (LLM Agent)   │    │                 │    │   API Endpoints │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                               ┌─────────────────┐
                                               │  Socket.IO      │
                                               │  Broadcasting   │
                                               └─────────────────┘
                                                        │
                                               ┌─────────────────┐
                                               │   React         │
                                               │   Frontend      │
                                               └─────────────────┘
```

## Security Considerations

- **Agent Identification**: Each agent gets a unique session ID
- **Room Access Control**: Agents can only join existing rooms
- **Message Validation**: All messages are validated before broadcasting
- **Rate Limiting**: Consider implementing rate limits for agent actions

## Future Enhancements

- **Agent Permissions**: Role-based access control for agents
- **Audio/Video Streams**: Support for agent-generated media
- **Persistent Storage**: Store agent interactions in database
- **Advanced AI Features**: Integration with transcription and analysis services
