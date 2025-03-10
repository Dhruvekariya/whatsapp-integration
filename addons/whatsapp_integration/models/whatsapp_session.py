from odoo import fields, models, _
from odoo.exceptions import UserError
from datetime import datetime
import logging
import requests
import json

_logger = logging.getLogger(__name__)

class WhatsAppChat(models.Model):
    _name = "whatsapp.chat"
    _description = "WhatsApp Chat"

    message_ids = fields.One2many("whatsapp.message", "chat_id", string="Messages")
    name = fields.Char(string="Chat Name", required=True)
    unread_count = fields.Integer(string="Unread Messages")
    session_id = fields.Many2one("whatsapp.session", string="WhatsApp Session")




class WhatsAppSession(models.Model):
    _name = "whatsapp.session"
    _description = "WhatsApp Session"
    _rec_name = "user_id"
    _inherit = ['mail.thread', 'mail.activity.mixin']  # new line for test module

    user_id = fields.Many2one(
        "res.users", string="User", required=True, default=lambda self: self.env.user
    )
    session_id = fields.Char(string="Session ID")
    qr_code = fields.Binary(string="QR Code")
    qr_code_data = fields.Char(string="QR Code Data")
    state = fields.Selection(
        [
            ("disconnected", "Disconnected"),
            ("connecting", "Connecting"),
            ("connected", "Connected"),
        ],
        string="Status",
        default="disconnected",
    )
    last_connected = fields.Datetime(string="Last Connected")
    name = fields.Char(string="Session Name", required=True)
    state = fields.Selection(
        [
            ("disconnected", "Disconnected"),
            ("connecting", "Connecting"),
            ("connected", "Connected"),
        ],
        default="disconnected",
        string="Status",
    )
    qr_code_image = fields.Binary(string="QR Code")
    user_id = fields.Many2one(
        "res.users", string="User", required=True, default=lambda self: self.env.user
    )
    qr_code_image = fields.Binary(string="QR Code")
    chat = fields.Text(string="Chat")
    chat_list = fields.Text(string="Chat List")
    # New field to store the list of chats (JSON format)
    chat_list_json = fields.Text(string="Chat List JSON")
    chat_ids = fields.One2many("whatsapp.chat", "session_id", string="Chats") 


    def generate_qr_code(self):
        try:
            # Get the WhatsApp server URL from configuration or use default
            whatsapp_server_url = self.env['ir.config_parameter'].sudo().get_param('whatsapp_integration.server_url', 'http://localhost:3000')
            
            # Make request to get QR code from Node.js server
            response = requests.get(f"{whatsapp_server_url}/get_qr_code")
            
            if response.status_code == 200:
                result = response.json()
                
                if result.get('success') and result.get('data', {}).get('qr_data'):
                    # Store QR code in base64 format
                    qr_data = result['data']['qr_data']
                    # Extract base64 portion if it includes a data URL prefix
                    if ',' in qr_data:
                        qr_base64 = qr_data.split(',')[1]
                    else:
                        qr_base64 = qr_data
                    
                    # Update session with QR code
                    self.write({
                        'qr_code_image': qr_base64,
                        'state': 'connecting'
                    })
                    
                    return {"type": "ir.actions.client", "tag": "reload"}
                
            # If we get here, either the request failed or data was invalid
            raise UserError(_("Failed to get QR code from the WhatsApp server. Please check if the server is running."))
        except Exception as e:
            raise UserError(_(f"Error generating WhatsApp QR code: {str(e)}"))

    # Get Chat List
    def get_chat_list(self):
        try:
            # Get the WhatsApp server URL from configuration or use default
            whatsapp_server_url = self.env['ir.config_parameter'].sudo().get_param('whatsapp_integration.server_url', 'http://localhost:3000')
            
            _logger.info("Attempting to connect to WhatsApp server at: %s", whatsapp_server_url)
            
            # Make request to get chat list from Node.js server
            try:
                response = requests.get(f"{whatsapp_server_url}/get-chats", timeout=120)
                _logger.info("Response received with status code: %s", response.status_code)
                _logger.info("Response content: %s", response.text[:500])  # Log first 500 chars of response
            except Exception as req_error:
                _logger.error("Request to WhatsApp server failed: %s", str(req_error))
                raise UserError(_(f"Connection to WhatsApp server failed: {str(req_error)}"))
            
            if response.status_code == 200:
                try:
                    result = response.json()
                    _logger.info("Successfully parsed JSON response")
                except Exception as json_error:
                    _logger.error("Failed to parse JSON response: %s", str(json_error))
                    raise UserError(_("Failed to parse response from WhatsApp server"))
                
                if result.get('success') and 'data' in result and 'chats' in result.get('data', {}):
                    # Clear existing chat records for this session
                    old_chats = self.env["whatsapp.chat"].search([("session_id", "=", self.id)])
                    old_count = len(old_chats)
                    old_chats.unlink()
                    _logger.info("Cleared %s existing chat records", old_count)
                    
                    # Create new chat records
                    chats = result['data']['chats']
                    _logger.info("Retrieved %s chats from server", len(chats))
                    created_chats = []
                    
                    for chat in chats:
                        chat_name = chat.get("name") or "Unknown Chat"
                        
                        if not chat_name:
                            _logger.warning("Skipping chat entry due to missing name: %s", chat)
                            continue
                        
                        # Create a new chat record
                        chat_record = self.env["whatsapp.chat"].create({
                            "session_id": self.id,
                            "name": chat_name,
                            "unread_count": chat.get("unreadCount", 0),
                        })
                        created_chats.append(chat_record.id)
                    
                    # Log success
                    _logger.info("Successfully created %s chat records", len(created_chats))
                    
                    # Refresh the view
                    return {"type": "ir.actions.client", "tag": "reload"}
                else:
                    error_msg = "Invalid response format from WhatsApp server"
                    if 'data' not in result:
                        error_msg += " - Missing 'data' field"
                    elif 'chats' not in result.get('data', {}):
                        error_msg += " - Missing 'chats' field in data"
                    _logger.error(error_msg)
                    _logger.error("Response content: %s", response.text)
                    raise UserError(_(error_msg))
            
            # If we get here, either the request failed or data was invalid
            error_msg = f"Failed to get chats from the WhatsApp server. Status code: {response.status_code}"
            _logger.error(error_msg)
            _logger.error("Response content: %s", response.text)
            raise UserError(_(error_msg))
        
        except Exception as e:
            # Log the full traceback for debugging
            _logger.exception("Error getting chat list")
            # Clear any existing chats to avoid confusion
            self.env["whatsapp.chat"].search([("session_id", "=", self.id)]).unlink()
            raise UserError(_(f"Error getting chat list: {str(e)}"))
        
    

    def action_connect(self):
        """Initialize WhatsApp connection and generate QR code"""
        self.ensure_one()
        self.state = "connecting"
        # In a real implementation, this would call a server-side service
        # that uses wwebjs to generate a QR code
        return {
            "type": "ir.actions.client",
            "tag": "whatsapp_qr_code",
            "params": {"session_id": self.id},
        }

    def action_disconnect(self):
        """Disconnect from WhatsApp"""
        self.ensure_one()
        self.state = "disconnected"
        self.session_id = False
        return True

    def get_qr_code(self):
        """Generate and get QR code for WhatsApp Web connection"""
        self.ensure_one()

        if not self.session_id:
            # Create a new session ID
            self.session_id = (
                f"session_{self.user_id.id}_{int(datetime.now().timestamp())}"
            )

        try:
            # In a real implementation, this would call a Node.js service that uses whatsapp-web.js
            # For demonstration, we'll use the controller's API
            qr_code_url = f"/whatsapp/qr_code/{self.id}"
            return {"qr_code": self.qr_code, "qr_code_url": qr_code_url}
        except Exception as e:
            _logger.error("Error generating WhatsApp QR code: %s", e)
            raise UserError(_("Failed to generate WhatsApp QR code. Please try again."))

    def check_connection(self):
        """Check WhatsApp connection status"""
        self.ensure_one()

        try:
            # In a real implementation, this would call a Node.js service that uses whatsapp-web.js
            # For demonstration, we'll use the controller's API
            status_url = f"/whatsapp/status/{self.id}"

            # Simulate status check for demonstration
            if self.state == "connecting":
                # Simulate connection after 10 seconds
                last_write = self.write_date
                now = datetime.now()

                if (now - last_write).total_seconds() > 10:
                    self.state = "connected"
                    self.last_connected = now

            return {"state": self.state, "session_id": self.session_id}
        except Exception as e:
            _logger.error("Error checking WhatsApp connection: %s", e)
            return {"state": "disconnected", "error": str(e)}

    def check_active_session(self):
        """Check if user has an active WhatsApp session"""
        self.ensure_one()

        active_session = self.search(
            [("user_id", "=", self.env.user.id), ("state", "=", "connected")], limit=1
        )

        if active_session:
            return {
                "active": True,
                "session_id": active_session.id,
                "state": active_session.state,
            }

        return {"active": False}

    def get_channel(self):
        """Get or create WhatsApp channel for Discuss integration"""

        # Check for active session
        active_session = self.search(
            [("user_id", "=", self.env.user.id), ("state", "=", "connected")], limit=1
        )

        if not active_session:
            return False

        # Create virtual channel ID for WhatsApp
        channel_id = f"whatsapp_{active_session.id}"

        # Get unread message count
        unread_count = self.env["whatsapp.message"].search_count(
            [
                ("session_id", "=", active_session.id),
                ("direction", "=", "incoming"),
                ("state", "not in", ["read"]),
            ]
        )

        return {"channel_id": channel_id, "counter": unread_count}

    def get_chats(self):
        """Get WhatsApp chats"""
        self.ensure_one()

        if self.state != "connected":
            return []

        try:
            # In a real implementation, this would call a Node.js service that uses whatsapp-web.js
            # For demonstration, we'll return sample data
            return [
                {
                    "id": "123456789@c.us",
                    "name": "John Doe",
                    "last_message": "Hello, how are you?",
                    "timestamp": fields.Datetime.now(),
                    "unread": 2,
                },
                {
                    "id": "987654321@c.us",
                    "name": "Jane Smith",
                    "last_message": "Can you send me the document?",
                    "timestamp": fields.Datetime.now(),
                    "unread": 0,
                },
            ]
        except Exception as e:
            _logger.error("Error getting WhatsApp chats: %s", e)
            return []

    def get_chat_messages(self, chat_id, limit=50, before=None):
        """Get messages for a specific chat"""
        self.ensure_one()

        if self.state != "connected":
            return []

        domain = [("session_id", "=", self.id), ("chat_id", "=", chat_id)]

        if before:
            domain.append(("date", "<", before))

        messages = self.env["whatsapp.message"].search(
            domain, order="date desc", limit=limit
        )

        return [
            {
                "id": msg.id,
                "message_id": msg.message_id,
                "content": msg.content,
                "date": msg.date,
                "direction": msg.direction,
                "state": msg.state,
            }
            for msg in messages
        ]

    def send_message(self, chat_id, message):
        """Send WhatsApp message"""
        self.ensure_one()

        if self.state != "connected":
            raise UserError(_("WhatsApp is not connected. Please connect first."))

        try:
            # Create message in database
            msg = self.env["whatsapp.message"].create(
                {
                    "session_id": self.id,
                    "chat_id": chat_id,
                    "content": message,
                    "direction": "outgoing",
                    "state": "pending",
                }
            )

            # In a real implementation, this would call a Node.js service that uses whatsapp-web.js
            # For demonstration, we'll simulate message sending

            # Simulate successful message send
            msg.write(
                {
                    "state": "sent",
                    "message_id": f"msg_{int(datetime.now().timestamp())}",
                }
            )

            return {
                "success": True,
                "message": msg.read(["id", "message_id", "content", "date", "state"])[
                    0
                ],
            }
        except Exception as e:
            _logger.error("Error sending WhatsApp message: %s", e)
            raise UserError(_("Failed to send WhatsApp message: %s") % str(e))

    def mark_messages_read(self, chat_id):
        """Mark all messages in a chat as read"""
        self.ensure_one()

        if self.state != "connected":
            return False

        try:
            # Find all unread incoming messages for this chat
            messages = self.env["whatsapp.message"].search(
                [
                    ("session_id", "=", self.id),
                    ("chat_id", "=", chat_id),
                    ("direction", "=", "incoming"),
                    ("state", "!=", "read"),
                ]
            )

            if messages:
                messages.write({"state": "read"})

            return True
        except Exception as e:
            _logger.error("Error marking WhatsApp messages as read: %s", e)
            return False