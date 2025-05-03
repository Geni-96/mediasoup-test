const request = require('supertest')
const server = require('../server/server')
const ioc = require("socket.io-client");


beforeAll(async()=>{
    await server.startServer()
})
let clientSocket;
describe('check socket connection of server', () =>{
    it('should connect to client socket',async()=>{
        clientSocket = ioc()

        server.io.on("connection", (socket) => {
            serverSocket = socket;
          });
        clientSocket.on("connect", ()=>{
            done();
        });
    })
})

describe('check redis connection', ()=>{
    it('should set key', async()=>{
        expect(server.client.set('foo','bar')).toBeTruthy();
        await expect(server.client.get('foo')).resolves.toBe('bar')
        expect(server.client.del('foo')).toBeTruthy()
    })
})
afterAll(async () => {
    server.io.close();
    clientSocket.disconnect();
    await server.stopServer();
});