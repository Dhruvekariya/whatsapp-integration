const { Server } = require("socket.io");

module.exports = function setupSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: "*", // Allow all origins (change in production)
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        console.log("New client connected:", socket.id);

        socket.on("disconnect", () => {
            console.log("Client disconnected:", socket.id);
        });
    });

    return io;
};
