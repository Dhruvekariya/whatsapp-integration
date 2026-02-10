# WhatsApp Integration for Odoo

Integrate WhatsApp Web into the Odoo Discuss module. Users can connect via QR code and send or receive messages directly from Odoo.

## Structure

- **addons/whatsapp_integration** – Odoo module (views, models, controllers, security).
- **nodejs/** – Node.js server that bridges WhatsApp Web and Odoo using `whatsapp-web.js`, Express, and Socket.IO.

## Quick Start

### Node.js Server

```bash
cd nodejs
npm install
node server.js
```

The server starts on `http://localhost:3000`. A QR code is generated for WhatsApp Web authentication.

### Odoo Module

1. Copy `addons/whatsapp_integration` into your Odoo addons path.
2. Update the app list and install **WhatsApp Integration**.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/get_qr_code` | Retrieve the current QR code |
| GET | `/status` | Connection status |
| GET | `/get-chats` | List WhatsApp chats |
| POST | `/send-message` | Send a text message |
| POST | `/send-media` | Send a media message |
| GET | `/get-messages/:chatId` | Fetch messages for a chat |
| POST | `/logout` | Disconnect WhatsApp session |

## License

LGPL-3
