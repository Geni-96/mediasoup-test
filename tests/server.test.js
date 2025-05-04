const request = require('supertest')
const server = require('../server/server')
const ioc = require("socket.io-client");
let clientSocket;
beforeAll(()=>{
    server.startServer()
})
describe('check socket connection of server', () =>{
    
    
    it('should set key', async()=>{
        await expect(server.client.set('foo','bar')).resolves.toBeTruthy();
        await expect(server.client.get('foo')).resolves.toBe('bar')
        await expect(server.client.del('foo')).resolves.toBe(1)

    })
    it('should connect to client socket', (done) => {
        clientSocket = ioc("http://localhost:5001"); // ensure correct port
      
        clientSocket.on("connect",done)
      });
    
})


afterAll(() => {
    clientSocket.disconnect();
    server.stopServer()
    setTimeout(()=>{
        process.exit(0)
    }, 3000)
});