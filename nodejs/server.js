const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const qrcodeData = require('qrcode');
const cors = require('cors');
const http = require("http");
const socketIo = require('socket.io');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);


const port = 3000;
app.use(express.static('public'));
app.use(cors());
app.use(express.json());

let qrCodeData = "";

// Configure WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: require('puppeteer').executablePath()
    }
});



// Helper functions for standardized responses
function successResponse(res, data, message = 'Success') {
    return res.json({
        success: true,
        message,
        data
    });
}

function errorResponse(res, error, statusCode = 500) {
    console.error('Error:', error);
    return res.status(statusCode).json({
        success: false,
        message: error.message || 'An unexpected error occurred'
    });
}


// Emit QR Code via WebSocket
client.on('qr', async (qr) => {
    const qrCodeUrl1 = await qrcodeData.toDataURL(qr);
    qrcode.generate(qr, { small: true });
    console.log("QR Code generated");
    qrCodeData = qrCodeUrl1;

    io.emit("qrCode", qrCodeUrl1);  // Emit QR Code to frontend
});

// Emit when WhatsApp is ready
client.on('ready', () => {
    console.log('WhatsApp Client is Ready!');
    console.log('Client info:', client.info);

    io.emit("whatsappReady", true);  // Emit to clients

    // Try to get chats right after client is ready
    client.getChats().then(chats => {
        console.log(`Found ${chats.length} chats`);
        io.emit("chats", chats);
        if (chats.length > 0) {
            console.log('First chat example:', JSON.stringify(chats[0], null, 2));
        }
    }).catch(err => {
        console.error('Error getting chats after client ready:', err);
    });
});


// Emit new messages to clients
client.on('message', async (message) => {
    console.log('New message received:', message.body);

    // Emit received messages
    io.emit("newMessage", {
        id: message.id._serialized,
        from: message.from,
        body: message.body,
        timestamp: message.timestamp
    });
});

// Track message acknowledgments
client.on('message_ack', (message, ack) => {
    console.log(`Message ${message.id._serialized} status updated to: ${ack}`);
    io.emit("messageAck", { id: message.id._serialized, ack });
});

// Start WhatsApp Client
client.initialize();

// === API Endpoints ===

app.get("/", (_req, res) => {
    return res.json({ success: true, message: "Server is running", clientInitialized: !!client });
});

// Send message via WebSocket
io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("sendMessage", async ({ chatId, message }) => {
        try {
            const sentMessage = await client.sendMessage(chatId, message);
            io.emit("messageSent", {
                messageId: sentMessage.id._serialized,
                timestamp: sentMessage.timestamp,
            });
        } catch (error) {
            console.error("Error sending message:", error);
            socket.emit("error", { message: "Failed to send message" });
        }
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});



// === API Endpoints ===

// Test endpoint
app.get("/", (_req, res) => {
    return successResponse(res, {
        serverTime: new Date().toISOString(),
        clientInitialized: !!client,
        clientAuthenticated: client && !!client.info,
        version: "1.0.0"
    }, "Server is running");
});




// Status check endpoint
app.get('/status', (_req, res) => {
    try {
        const status = {
            authenticated: client.info ? true : false,
            state: client.info ? 'connected' : qrCodeData ? 'connecting' : 'disconnected',
            info: client.info
        };
        return successResponse(res, status);
    } catch (error) {
        return errorResponse(res, error);
    }
});

// Get chats endpoint
//workable
// Enhanced chat retrieval endpoint with better performance
app.get("/get-chats", async (_req, res) => {
    try {
        if (!client) {
            return errorResponse(res, new Error("WhatsApp client not initialized"), 500);
        }

        if (!client.info) {
            return errorResponse(res, new Error("WhatsApp client not authenticated yet"), 403);
        }

        console.log("Attempting to get chats...");

        // Use a timeout to avoid hanging the request
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Operation timed out")), 5000)
        );

        // Get chats with a timeout
        const chatsPromise = client.getChats();
        const chats = await Promise.race([chatsPromise, timeoutPromise]);

        console.log(`Retrieved ${chats.length} chats`);

        console.log(`First Chat`, JSON.stringify(chats[0], null, 2));



        // Simplify the response to reduce processing time
        const formattedChats = chats.map(chat => ({
            ...chat,
            id: chat.id._serialized,
            chat_id: chat.id._serialized,
            phone_number: chat.id.user,
            name: chat.name || chat.id._serialized,
            isGroup: chat.isGroup || false,
            unreadCount: chat.unreadCount || 0
        }));

        return successResponse(res, {
            chats: formattedChats,
            totalCount: formattedChats.length
        });
    } catch (error) {
        console.error("Error in get-chats endpoint:", error);
        return errorResponse(res, error);
    }
});

// Send message endpoint
app.post('/send-message', async (req, res) => {
    try {
        const { chatId, message } = req.body;

        if (!chatId || !message) {
            return errorResponse(res, new Error("Chat ID and message are required"), 400);
        }

        if (!client.info) {
            return errorResponse(res, new Error("WhatsApp client not authenticated"), 403);
        }

        const sentMessage = await client.sendMessage(chatId, message);

        return successResponse(res, {
            messageId: sentMessage.id._serialized,
            timestamp: sentMessage.timestamp
        }, "Message sent successfully");
    } catch (error) {
        return errorResponse(res, error);
    }
});

// Get messages endpoint
app.get("/get-messages/:chatId", async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = req.query.limit ? parseInt(req.query.limit) : 50;

        if (!client.info) {
            return errorResponse(res, new Error("WhatsApp client not authenticated"), 403);
        }

        console.log(`Retrieving messages for chat: ${chatId}`);
        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit, type:"chat" });

        console.log(`Retrieved ${messages.length} messages`);

        const formattedMessages = messages.map(msg => ({
            id: msg.id._serialized || msg.id,
            body: msg.body,
            fromMe: msg.fromMe,
            timestamp: msg.timestamp,
            type: msg.type,
            hasMedia: msg.hasMedia,
            author: msg.author || null
        }));

        return successResponse(res, {
            messages: formattedMessages,
            count: formattedMessages.length
        }, "Messages retrieved successfully");
    } catch (error) {
        console.error("Error retrieving messages:", error);
        return errorResponse(res, error);
    }
});

// Send media message endpoint
// Updated media sending function
app.post("/send-media", async (req, res) => {
    try {
        const { chatId, mediaUrl, caption } = req.body;

        if (!chatId || !mediaUrl) {
            return errorResponse(res, new Error("Chat ID and media URL are required"), 400);
        }

        if (!client.info) {
            return errorResponse(res, new Error("WhatsApp client not authenticated"), 403);
        }

        console.log(`Sending media to ${chatId} from URL: ${mediaUrl}`);

        // Create a MessageMedia object using the URL
        const { MessageMedia } = require('whatsapp-web.js');
        const media = await MessageMedia.fromUrl(mediaUrl);

        // Send the media
        const sentMessage = await client.sendMessage(chatId, media, { caption });

        return successResponse(res, {
            messageId: sentMessage.id._serialized,
            timestamp: sentMessage.timestamp
        }, "Media sent successfully");
    } catch (error) {
        console.error("Error sending media:", error);
        return errorResponse(res, error);
    }
});

// Logout endpoint
app.post('/logout', async (_req, res) => {
    try {
        if (!client.info) {
            return errorResponse(res, new Error("Client not authenticated"), 400);
        }

        await client.logout();
        qrCodeData = ""; // Reset QR code

        return successResponse(res, null, "Logged out successfully");
    } catch (error) {
        return errorResponse(res, error);
    }
});



// Start server
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
 