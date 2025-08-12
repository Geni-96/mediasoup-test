const request = require('supertest');
const { startServer, stopServer, io, client } = require('../server/server');

describe('MCP Agent Integration', () => {
  let server;
  let agentId;
  const testRoomId = 'test-room-' + Date.now();
  const testAgentName = 'TestAgent';

  beforeAll(async () => {
    // Start the server
    server = await startServer();
    // Wait a bit for server to fully start
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Clean up
    if (agentId) {
      await request('http://localhost:5001')
        .post('/api/agent/leave')
        .send({ agentId, roomId: testRoomId });
    }
    await stopServer();
  });

  describe('Room Creation and Agent Joining', () => {
    test('should create a room first', async () => {
      // Simulate room creation by adding to Redis
      const roomData = {
        peers: []
      };
      await client.set(`room:${testRoomId}`, JSON.stringify(roomData));
      
      const exists = await client.exists(`room:${testRoomId}`);
      expect(exists).toBe(1);
    });

    test('should allow agent to join existing room', async () => {
      const response = await request('http://localhost:5001')
        .post('/api/agent/join')
        .send({
          username: testAgentName,
          roomId: testRoomId,
          agentType: 'assistant'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.agentId).toBeDefined();
      expect(response.body.username).toBe(testAgentName);
      expect(response.body.roomId).toBe(testRoomId);
      
      agentId = response.body.agentId;
    });

    test('should reject joining non-existent room', async () => {
      const response = await request('http://localhost:5001')
        .post('/api/agent/join')
        .send({
          username: 'AnotherAgent',
          roomId: 'non-existent-room',
          agentType: 'assistant'
        })
        .expect(404);

      expect(response.body.error).toContain('does not exist');
    });

    test('should handle duplicate usernames', async () => {
      const response = await request('http://localhost:5001')
        .post('/api/agent/join')
        .send({
          username: testAgentName, // Same name as before
          roomId: testRoomId,
          agentType: 'moderator'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.username).not.toBe(testAgentName); // Should be modified
      expect(response.body.username).toMatch(/^TestAgent-\d+$/);
      
      // Clean up the duplicate agent
      await request('http://localhost:5001')
        .post('/api/agent/leave')
        .send({
          agentId: response.body.agentId,
          roomId: testRoomId
        });
    });
  });

  describe('Agent Messaging', () => {
    test('should allow agent to send messages', async () => {
      const response = await request('http://localhost:5001')
        .post('/api/agent/message')
        .send({
          agentId,
          roomId: testRoomId,
          message: 'Hello from test agent!',
          messageType: 'chat'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.messageId).toBeDefined();
    });

    test('should reject messages from invalid agent', async () => {
      const response = await request('http://localhost:5001')
        .post('/api/agent/message')
        .send({
          agentId: 'invalid-agent-id',
          roomId: testRoomId,
          message: 'This should fail',
          messageType: 'chat'
        })
        .expect(404);

      expect(response.body.error).toContain('Agent not found');
    });

    test('should reject messages to wrong room', async () => {
      const response = await request('http://localhost:5001')
        .post('/api/agent/message')
        .send({
          agentId,
          roomId: 'wrong-room',
          message: 'This should fail',
          messageType: 'chat'
        })
        .expect(400);

      expect(response.body.error).toContain('not in the specified room');
    });
  });

  describe('Room Information', () => {
    test('should get room information', async () => {
      const response = await request('http://localhost:5001')
        .get(`/api/room/${testRoomId}`)
        .expect(200);

      expect(response.body.roomId).toBe(testRoomId);
      expect(response.body.participants).toContain(testAgentName);
      expect(response.body.agents).toHaveLength(1);
      expect(response.body.agents[0].agentId).toBe(agentId);
    });

    test('should list participants', async () => {
      const response = await request('http://localhost:5001')
        .get(`/api/room/${testRoomId}/participants`)
        .expect(200);

      expect(response.body.participants).toBeDefined();
      expect(response.body.count).toBeGreaterThan(0);
      expect(response.body.agentCount).toBe(1);
      
      const agent = response.body.participants.find(p => p.isAgent);
      expect(agent).toBeDefined();
      expect(agent.username).toBe(testAgentName);
    });

    test('should handle non-existent room queries', async () => {
      const response = await request('http://localhost:5001')
        .get('/api/room/non-existent-room')
        .expect(404);

      expect(response.body.error).toContain('Room not found');
    });
  });

  describe('Agent Leaving', () => {
    test('should allow agent to leave room', async () => {
      const response = await request('http://localhost:5001')
        .post('/api/agent/leave')
        .send({
          agentId,
          roomId: testRoomId
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Verify agent is removed from room
      const roomResponse = await request('http://localhost:5001')
        .get(`/api/room/${testRoomId}`)
        .expect(200);
      
      expect(roomResponse.body.agents).toHaveLength(0);
      
      agentId = null; // Prevent cleanup in afterAll
    });

    test('should reject leaving with invalid agent ID', async () => {
      const response = await request('http://localhost:5001')
        .post('/api/agent/leave')
        .send({
          agentId: 'invalid-agent-id',
          roomId: testRoomId
        })
        .expect(404);

      expect(response.body.error).toContain('Agent not found');
    });
  });

  describe('Input Validation', () => {
    test('should reject join requests without username', async () => {
      const response = await request('http://localhost:5001')
        .post('/api/agent/join')
        .send({
          roomId: testRoomId,
          agentType: 'assistant'
        })
        .expect(400);

      expect(response.body.error).toContain('Username and roomId are required');
    });

    test('should reject join requests without roomId', async () => {
      const response = await request('http://localhost:5001')
        .post('/api/agent/join')
        .send({
          username: 'TestAgent',
          agentType: 'assistant'
        })
        .expect(400);

      expect(response.body.error).toContain('Username and roomId are required');
    });

    test('should reject message requests without required fields', async () => {
      const response = await request('http://localhost:5001')
        .post('/api/agent/message')
        .send({
          agentId: 'some-id',
          roomId: testRoomId
          // missing message
        })
        .expect(400);

      expect(response.body.error).toContain('AgentId, roomId, and message are required');
    });
  });
});
