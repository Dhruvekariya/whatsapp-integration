const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const qrcodeData = require('qrcode');
const cors = require('cors');
const http = require("http");
const socketIo = require('socket.io');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
// const io = socketIo(server);
const wss = new WebSocket.Server({ server });



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
// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}


// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Create unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    }
});

// Serve static files from uploads directory
app.use('/uploads', express.static(uploadDir));

// File upload endpoint
app.post('/upload-file', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return errorResponse(res, new Error("No file uploaded"), 400);
        }

        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

        return successResponse(res, {
            filename: req.file.filename,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            url: fileUrl
        }, "File uploaded successfully");
    } catch (error) {
        return errorResponse(res, error);
    }
});

// Enhanced media sending endpoint
app.post("/send-media", async (req, res) => {
    try {
        const { chatId, message, mediaUrl, fileName } = req.body;

        if (!chatId || !mediaUrl) {
            return errorResponse(res, new Error("Chat ID and media URL are required"), 400);
        }

        if (!client.info) {
            return errorResponse(res, new Error("WhatsApp client not authenticated"), 403);
        }

        console.log(`Sending media to ${chatId} from URL: ${mediaUrl}`);

        // Create a MessageMedia object using the URL
        const { MessageMedia } = require('whatsapp-web.js');
        let media;

        // If it's a local URL from our uploads directory
        if (mediaUrl.includes('/uploads/')) {
            const filePath = path.join(uploadDir, path.basename(mediaUrl));
            media = MessageMedia.fromFilePath(filePath);
            // Set filename if provided
            if (fileName) {
                media.filename = fileName;
            }
        } else {
            // External URL
            media = await MessageMedia.fromUrl(mediaUrl);
        }

        // Send the media
        const sentMessage = await client.sendMessage(chatId, media, {
            caption: message,
            sendMediaAsDocument: media.mimetype.startsWith('application/')
        });

        return successResponse(res, {
            messageId: sentMessage.id._serialized,
            timestamp: sentMessage.timestamp
        }, "Media sent successfully");
    } catch (error) {
        console.error("Error sending media:", error);
        return errorResponse(res, error);
    }
});

// Add new WebSocket message handler for file attachments
wss.on('connection', (ws) => {
    console.log("New WebSocket client connected");

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'sendMessage') {
                const sentMessage = await client.sendMessage(data.chatId, data.message);
                ws.send(JSON.stringify({ type: 'messageSent', messageId: sentMessage.id._serialized, timestamp: sentMessage.timestamp }));
            }
            // Add handling for file attachments
            else if (data.type === 'sendFile') {
                const { MessageMedia } = require('whatsapp-web.js');
                let media;

                if (data.fileData) {
                    // Base64 encoded file data
                    media = new MessageMedia(data.mimeType, data.fileData, data.fileName);
                } else if (data.fileUrl) {
                    // File URL
                    if (data.fileUrl.startsWith('http')) {
                        media = await MessageMedia.fromUrl(data.fileUrl);
                    } else {
                        // Local file path
                        media = MessageMedia.fromFilePath(data.fileUrl);
                    }
                    if (data.fileName) {
                        media.filename = data.fileName;
                    }
                }

                const sentMessage = await client.sendMessage(
                    data.chatId,
                    media,
                    {
                        caption: data.caption || '',
                        sendMediaAsDocument: media.mimetype.startsWith('application/')
                    }
                );

                ws.send(JSON.stringify({
                    type: 'fileSent',
                    messageId: sentMessage.id._serialized,
                    timestamp: sentMessage.timestamp
                }));
            }
        } catch (error) {
            console.error("Error processing WebSocket message:", error);
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to process request' }));
        }
    });

    ws.on('close', () => {
        console.log("WebSocket client disconnected");
    });
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
    const qrCodeUrl = await qrcodeData.toDataURL(qr);
    qrcode.generate(qr, { small: true });
    qrCodeData = qrCodeUrl;

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'qrCode', qrCode: qrCodeUrl }));
        }
    });
});

// Emit when WhatsApp is ready
client.on('ready', () => {
    console.log('WhatsApp Client is Ready!');
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'whatsappReady', status: true }));
        }
    });
});



// Emit new messages
// Server-side (server.js) - Modified WebSocket message handler
client.on('message', async (message) => {
    console.log('New message received:', message.type || 'text');

    const messageData = {
        type: 'newMessage',
        id: message.id._serialized,
        from: message.from,
        body: message.body && message.body.trim() !== "" ? message.body : null, // Ensure empty messages are NULL
        timestamp: message.timestamp,
        hasAttachment: false
    };

    if (message.hasMedia) {
        try {
            const media = await message.downloadMedia();
            let attachmentType = 'document';

            if (media.mimetype.startsWith('image/')) {
                attachmentType = 'image';
            } else if (media.mimetype.startsWith('video/')) {
                attachmentType = 'video';
            } else if (media.mimetype.startsWith('audio/')) {
                attachmentType = 'audio';
            } else if (message.type === 'ptt') {
                attachmentType = 'ptt';
            }

            messageData.hasAttachment = true;
            messageData.attachmentType = attachmentType;
            messageData.last_message_type = attachmentType;
            messageData.attachmentMimeType = media.mimetype;
            messageData.attachmentUrl = `data:${media.mimetype};base64,${media.data}`;

            // Only assign filename if it's a document type
            if (attachmentType === "document") {
                messageData.attachmentName = media.filename || `${attachmentType}-${Date.now()}`;
            }
        } catch (err) {
            console.error('Error downloading media:', err);
            messageData.hasAttachment = false;
        }
    }

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(messageData));
        }
    });
});


// Track message acknowledgments
client.on('message_ack', (message, ack) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'messageAck', id: message.id._serialized, ack }));
        }
    });
});

// Start WhatsApp Client
client.initialize();

// === API Endpoints ===

app.get("/", (_req, res) => {
    return res.json({ success: true, message: "Server is running", clientInitialized: !!client });
});


// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log("New WebSocket client connected");

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'sendMessage') {
                const sentMessage = await client.sendMessage(data.chatId, data.message);
                ws.send(JSON.stringify({ type: 'messageSent', messageId: sentMessage.id._serialized, timestamp: sentMessage.timestamp }));
            }
        } catch (error) {
            console.error("Error processing WebSocket message:", error);
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to process request' }));
        }
    });

    ws.on('close', () => {
        console.log("WebSocket client disconnected");
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

        // Increased timeout for more complex operations
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Operation timed out")), 15000) // 15 seconds
        );

        // Get chats with a timeout
        const chatsPromise = client.getChats();
        let chats = await Promise.race([chatsPromise, timeoutPromise]);

        console.log(`Retrieved ${chats.length} chats`);

        // Simplify the response to reduce processing time
        let formattedChats = await Promise.all(chats.map(async (chat) => ({
            ...chat,
            id: chat.id._serialized,
            chat_id: chat.id._serialized,
            phone_number: chat.id.user,
            name: chat.name || chat.id._serialized,
            isGroup: chat.isGroup || false,
            unreadCount: chat.unreadCount || 0,
            profilePicUrl: ""
        })));

        // Fetch profile pictures with improved efficiency
        const fetchProfilePic = async (chat) => {
            try {
                // Use Promise.race with a shorter timeout for each profile pic fetch
                const profilePicPromise = client.getProfilePicUrl(chat.id);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Profile pic fetch timeout")), 3000) // Slightly longer timeout
                );

                chat.profilePicUrl = await Promise.race([
                    profilePicPromise,
                    timeoutPromise
                ]);
            } catch (error) {
                chat.profilePicUrl = "";
                console.warn(`Failed to fetch profile pic for chat ${chat.id}:`, error.message);
            }
            return chat;
        };

        // Concurrency set to 10 with more robust error handling
        const CONCURRENCY_LIMIT = 10;
        const results = [];

        for (let i = 0; i < formattedChats.length; i += CONCURRENCY_LIMIT) {
            const batch = formattedChats.slice(i, i + CONCURRENCY_LIMIT);
            
            // Process batch with all-settle to continue even if some promises fail
            const batchResults = await Promise.allSettled(batch.map(fetchProfilePic));
            
            // Add successfully processed chats to results
            batchResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    // Log failed chats but continue processing
                    console.error(`Failed to process chat at index ${i + index}:`, result.reason);
                    results.push(batch[index]); // Add original chat even if pic fetch failed
                }
            });

            console.log(`Processed batch ${Math.floor(i/CONCURRENCY_LIMIT) + 1}, Total processed: ${results.length}`);
        }

        return successResponse(res, {
            chats: results,
            totalCount: results.length
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
        const messages = await chat.fetchMessages({ limit, type: "chat" });

        console.log(`Retrieved ${messages.length} messages`);

        const formattedMessages = await Promise.all(
            messages.map(async (msg) => {
                let mediaBase64 = null;
                let senderName = "";

                 // Determine sender name
                if (msg.fromMe) {
                    senderName = "Me"; // Your own messages
                } else {
                    // For incoming messages, use the contact's name
                    const contact = await msg.getContact();
                    senderName = contact.name || contact.pushname || contact.id.user;
                }
                if (msg.hasMedia) {
                    const media = await msg.downloadMedia();
                    if (media) {
                        mediaBase64 = `data:${media.mimetype};base64,${media.data}`;

                    }
                }

                return {
                    id: msg.id._serialized || msg.id,
                    body: msg.body || "",
                    fromMe: msg.fromMe,
                    timestamp: msg.timestamp,
                    type: msg.type,
                    hasMedia: msg.hasMedia,
                    mediaBase64: mediaBase64,
                    author: msg.author || null,
                    senderName: senderName, // Add sender name to the response
                };
            })
        );

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
