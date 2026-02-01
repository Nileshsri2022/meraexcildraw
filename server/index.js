import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

// Track rooms and their users
const rooms = new Map();

io.on("connection", (socket) => {
    console.log(`[${new Date().toISOString()}] User connected: ${socket.id}`);

    // Join a room
    socket.on("join-room", (roomId) => {
        socket.join(roomId);
        socket.roomId = roomId;

        // Track users in room
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);

        // Notify all users in room about the change
        const userIds = Array.from(rooms.get(roomId));
        io.to(roomId).emit("room-user-change", userIds);

        console.log(`[${new Date().toISOString()}] User ${socket.id} joined room: ${roomId} (${userIds.length} users)`);

        // Request scene from existing users
        socket.to(roomId).emit("new-user", socket.id);
    });

    // Broadcast scene updates (reliable)
    socket.on("server-broadcast", (roomId, encryptedData, iv) => {
        socket.to(roomId).emit("client-broadcast", encryptedData, iv);
    });

    // Broadcast volatile updates (cursor positions - can be dropped)
    socket.on("server-volatile-broadcast", (roomId, encryptedData, iv) => {
        socket.volatile.to(roomId).emit("client-broadcast", encryptedData, iv);
    });

    // Handle user follow changes
    socket.on("user-follow", (payload) => {
        if (socket.roomId) {
            io.to(socket.roomId).emit("user-follow", payload);
        }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
        console.log(`[${new Date().toISOString()}] User disconnected: ${socket.id}`);

        if (socket.roomId && rooms.has(socket.roomId)) {
            rooms.get(socket.roomId).delete(socket.id);

            // Notify remaining users
            const userIds = Array.from(rooms.get(socket.roomId));
            io.to(socket.roomId).emit("room-user-change", userIds);

            // Clean up empty rooms
            if (userIds.length === 0) {
                rooms.delete(socket.roomId);
                console.log(`[${new Date().toISOString()}] Room ${socket.roomId} deleted (empty)`);
            }
        }
    });
});

// Health check
app.get("/", (req, res) => {
    res.json({
        status: "ok",
        rooms: rooms.size,
        connections: io.engine.clientsCount,
    });
});

const PORT = process.env.PORT || 3002;
httpServer.listen(PORT, () => {
    console.log(`\n🚀 Collab server running at http://localhost:${PORT}\n`);
});
