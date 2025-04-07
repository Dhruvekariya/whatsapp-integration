const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const qrcodeData = require('qrcode');
const cors = require('cors');
const http = require("http");
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = 3000;
app.use(express.static('public'));
app.use(cors());
app.use(express.json());

let qrCodeData = "";
let clientReady = false;
let clientInitializing = false;

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

// Function to initialize WhatsApp client
function initializeWhatsAppClient() {
    if (clientInitializing) {
        console.log("Client initialization already in progress...");
        return;
    }

    clientInitializing = true;
    clientReady = false;
    console.log("Initializing WhatsApp client...");

    // Configure WhatsApp Client
    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            executablePath: require('puppeteer').executablePath()
        }
    });

    // Emit QR Code via WebSocket
    client.on('qr', async (qr) => {
        console.log('QR Code received, scan to authenticate!');
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
        clientReady = true;
        clientInitializing = false;
        
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'whatsappReady', status: true }));
            }
        });
    });

    // Authentication events
    client.on('authenticated', () => {
        console.log('WhatsApp client authenticated successfully!');
    });

    client.on('auth_failure', (msg) => {
        console.error('Authentication failure:', msg);
        clientInitializing = false;
        qrCodeData = "";
        
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'authFailure', message: msg }));
            }
        });
    });

    client.on('disconnected', (reason) => {
        console.log('WhatsApp client disconnected:', reason);
        clientReady = false;
        clientInitializing = false;
        qrCodeData = "";
        
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'disconnected', reason }));
            }
        });
        
        // Attempt to reinitialize after a short delay
        setTimeout(() => {
            console.log("Attempting to reinitialize WhatsApp client...");
            initializeWhatsAppClient();
        }, 5000);
    });

    // Emit new messages
    client.on('message', async (message) => {
        console.log('New message received:', message.type || 'text');

        const messageData = {
            type: 'newMessage',
            id: message.id._serialized,
            from: message.from,
            body: message.body && message.body.trim() !== "" ? message.body : null,
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
    client.initialize().catch(err => {
        console.error("Failed to initialize WhatsApp client:", err);
        clientInitializing = false;
        
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'initError', message: err.message }));
            }
        });
        
        // Try to reinitialize after a delay
        setTimeout(() => {
            console.log("Retrying WhatsApp client initialization...");
            initializeWhatsAppClient();
        }, 10000);
    });

    return client;
}

// Initialize the WhatsApp client
const client = initializeWhatsAppClient();

// Middleware to check if client is authenticated
function requireAuthentication(req, res, next) {
    if (!client || !client.info) {
        return errorResponse(
            res, 
            new Error("WhatsApp client is not initialized or authenticated. Please scan the QR code first."), 
            403
        );
    }
    next();
}

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
app.post("/send-media", requireAuthentication, async (req, res) => {
    try {
        const { chatId, message, mediaUrl, fileName } = req.body;

        if (!chatId || !mediaUrl) {
            return errorResponse(res, new Error("Chat ID and media URL are required"), 400);
        }

        console.log(`Sending media to ${chatId} from URL: ${mediaUrl}`);

        // Create a MessageMedia object using the URL
        const { MessageMedia } = require('whatsapp-web.js');
        let media;

        // If it's a local URL from our uploads directory
        if (mediaUrl.includes('/uploads/')) {
            const filePath = path.join(uploadDir, path.basename(mediaUrl));
            if (!fs.existsSync(filePath)) {
                return errorResponse(res, new Error("File not found"), 404);
            }
            media = MessageMedia.fromFilePath(filePath);
            // Set filename if provided
            if (fileName) {
                media.filename = fileName;
            }
        } else {
            // External URL
            try {
                media = await MessageMedia.fromUrl(mediaUrl);
            } catch (err) {
                return errorResponse(res, new Error(`Failed to fetch media from URL: ${err.message}`), 400);
            }
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

// === API Endpoints ===

// Test endpoint
app.get("/", (_req, res) => {
    return successResponse(res, {
        serverTime: new Date().toISOString(),
        clientInitializing: clientInitializing,
        clientAuthenticated: client && !!client.info,
        clientReady: clientReady,
        version: "1.0.0"
    }, "Server is running");
});

// Status check endpoint
app.get('/status', (_req, res) => {
    try {
        const status = {
            authenticated: client && client.info ? true : false,
            state: client && client.info ? 'connected' : qrCodeData ? 'connecting' : 'disconnected',
            info: client && client.info ? client.info : null,
            initializing: clientInitializing
        };
        return successResponse(res, status);
    } catch (error) {
        return errorResponse(res, error);
    }
});

// Get QR code endpoint
app.get('/qr-code', (_req, res) => {
    if (qrCodeData) {
        return successResponse(res, { qrCode: qrCodeData });
    } else {
        return errorResponse(res, new Error("QR code not available"), 404);
    }
});

// Enhanced chat retrieval endpoint with better performance
app.get("/get-chats", requireAuthentication, async (_req, res) => {
    try {
        console.log("Attempting to get chats...");

        // Increased timeout for fetching chats
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Operation timed out")), 600000) 
        );

        console.time("Fetching Chats");
        const chatsPromise = client.getChats();
        let chats = await Promise.race([chatsPromise, timeoutPromise]);
        console.timeEnd("Fetching Chats");

        console.log(`Retrieved ${chats.length} chats`);

        // Format chat data
        let formattedChats = chats.map((chat) => ({
            ...chat,
            id: chat.id._serialized,
            chat_id: chat.id._serialized,
            phone_number: chat.id.user,
            name: chat.name || chat.id._serialized,
            isGroup: chat.isGroup || false,
            unreadCount: chat.unreadCount || 0,
            profilePicUrl: ""
        }));

        // Fetch profile pictures efficiently
        const fetchProfilePic = async (chat) => {
            if (chat.isGroup) return chat; // Skip fetching for groups
            
            try {
                chat.profilePicUrl = await Promise.race([
                    client.getProfilePicUrl(chat.id),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Profile pic fetch timeout")), 2000))
                ]);
            } catch (error) {
                chat.profilePicUrl = ""; // Default if fetching fails
            }
            return chat;
        };

        // Batch process profile picture fetching
        const CHUNK_SIZE = 50; // Process chats in chunks of 50
        const results = [];

        for (let i = 0; i < formattedChats.length; i += CHUNK_SIZE) {
            const batch = formattedChats.slice(i, i + CHUNK_SIZE);
            const batchResults = await Promise.allSettled(batch.map(fetchProfilePic));

            batchResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    console.error(`Failed to process chat at index ${i + index}:`, result.reason);
                    results.push(batch[index]); // Add chat even if profile fetch failed
                }
            });
            console.log(`Processed batch ${Math.floor(i/CHUNK_SIZE) + 1}, Total processed: ${results.length}`);
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
app.post('/send-message', requireAuthentication, async (req, res) => {
    try {
        const { chatId, message } = req.body;

        if (!chatId || !message) {
            return errorResponse(res, new Error("Chat ID and message are required"), 400);
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
app.get("/get-messages/:chatId", requireAuthentication, async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = req.query.limit ? parseInt(req.query.limit) : 50;

        console.log(`Retrieving messages for chat: ${chatId}`);
        
        try {
            const chat = await client.getChatById(chatId);
            const messages = await chat.fetchMessages({ limit, type: "chat" });

            console.log(`Retrieved ${messages.length} messages`);

            const formattedMessages = await Promise.all(
                messages.map(async (msg) => {
                    let mediaBase64 = null;
                    let mediaDetails = null;
                    let senderName = "";

                    // Determine sender name
                    if (msg.fromMe) {
                        senderName = "Me"; // Your own messages
                    } else {
                        // For incoming messages, use the contact's name
                        try {
                            const contact = await msg.getContact();
                            senderName = contact.name || contact.pushname || contact.id.user;
                        } catch (err) {
                            console.error("Error getting contact:", err);
                            senderName = "Unknown";
                        }
                    }
                    
                    if (msg.hasMedia) {
                        try {
                            const media = await msg.downloadMedia();
                            if (media) {
                                mediaBase64 = `data:${media.mimetype};base64,${media.data}`;
                                mediaDetails = {
                                    mimeType: media.mimetype,
                                    fileName: media.filename || null,
                                    fileSize: media.filesize || null,
                                    isDocument: media.mimetype.startsWith('application/')
                                };
                            }
                        } catch (err) {
                            console.error("Error downloading media:", err);
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
                        mediaDetails: mediaDetails,
                        author: msg.author || null,
                        senderName: senderName,
                    };
                })
            );

            return successResponse(res, {
                messages: formattedMessages,
                count: formattedMessages.length
            }, "Messages retrieved successfully");
        } catch (error) {
            if (error.message.includes("not found")) {
                return errorResponse(res, new Error(`Chat with ID ${chatId} not found`), 404);
            }
            throw error;
        }
    } catch (error) {
        console.error("Error retrieving messages:", error);
        return errorResponse(res, error);
    }
});

// Logout endpoint
app.post('/logout', async (_req, res) => {
    try {
        if (!client || !client.info) {
            return errorResponse(res, new Error("Client not authenticated"), 400);
        }

        // Properly destroy the client instance
        await client.destroy();
        client.removeAllListeners(); // Remove all event listeners
        
        qrCodeData = "";
        clientReady = false;
        clientInitializing = false;

        // Create a new client instance
        initializeWhatsAppClient();

        return successResponse(res, null, "Logged out successfully");
    } catch (error) {
        return errorResponse(res, error);
    }
});

// Restart client endpoint
app.post('/restart-client', async (_req, res) => {
    try {
        console.log("Restarting WhatsApp client...");
        
        // If client exists and is authenticated, try to logout first
        if (client && client.info) {
            try {
                await client.logout();
            } catch (err) {
                console.error("Error during logout:", err);
                // Continue with restart even if logout fails
            }
        }
        
        qrCodeData = "";
        clientReady = false;
        clientInitializing = false;
        
        // Re-initialize the client
        initializeWhatsAppClient();
        
        return successResponse(res, null, "WhatsApp client restart initiated");
    } catch (error) {
        return errorResponse(res, error);
    }
});

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log("New WebSocket client connected");

    // Send current status immediately on connection
    const currentStatus = {
        type: 'status',
        authenticated: client && client.info ? true : false,
        state: client && client.info ? 'connected' : qrCodeData ? 'connecting' : 'disconnected',
        initializing: clientInitializing
    };
    
    ws.send(JSON.stringify(currentStatus));
    
    // If we have a QR code, send it
    if (qrCodeData) {
        ws.send(JSON.stringify({ type: 'qrCode', qrCode: qrCodeData }));
    }

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            // Handle send message request
            if (data.type === 'sendMessage') {
                if (!client || !client.info) {
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        code: 'not_authenticated',
                        message: 'WhatsApp client is not authenticated' 
                    }));
                    return;
                }
                
                const sentMessage = await client.sendMessage(data.chatId, data.message);
                ws.send(JSON.stringify({ 
                    type: 'messageSent', 
                    messageId: sentMessage.id._serialized, 
                    timestamp: sentMessage.timestamp 
                }));
            }
            
            // Handle file sending
            else if (data.type === 'sendFile') {
                if (!client || !client.info) {
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        code: 'not_authenticated',
                        message: 'WhatsApp client is not authenticated' 
                    }));
                    return;
                }
                
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
                } else {
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        code: 'missing_file',
                        message: 'File data or URL is required' 
                    }));
                    return;
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
            
            // Handle status request
            else if (data.type === 'getStatus') {
                ws.send(JSON.stringify({
                    type: 'status',
                    authenticated: client && client.info ? true : false,
                    state: client && client.info ? 'connected' : qrCodeData ? 'connecting' : 'disconnected',
                    initializing: clientInitializing
                }));
            }
            
            // Handle restart request
            else if (data.type === 'restartClient') {
                if (client && client.info) {
                    try {
                        await client.logout();
                    } catch (err) {
                        console.error("Error during logout:", err);
                    }
                }
                
                qrCodeData = "";
                clientReady = false;
                clientInitializing = false;
                
                initializeWhatsAppClient();
                
                ws.send(JSON.stringify({
                    type: 'clientRestarting',
                    message: 'WhatsApp client restart initiated'
                }));
            }
        } catch (error) {
            console.error("Error processing WebSocket message:", error);
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Failed to process request: ' + error.message 
            }));
        }
    });

    ws.on('close', () => {
        console.log("WebSocket client disconnected");
    });
});

// Start server
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});