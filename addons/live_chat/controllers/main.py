from odoo import http
from odoo.http import request
import json
import logging
import requests # type: ignore
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)
 # Chat = request.env['live_chat.whatsapp.chat'].sudo()
        # chats = Chat.search([])
        # return chats.read(['id', 'name', 'phone', 'last_message', 'unread', 'active'])
class WhatsAppController(http.Controller):

    def get_whatsapp_chats(self):
        """Fetch all WhatsApp chats from the Node.js server and store in Odoo"""
        try:
            # Get WhatsApp server URL from Odoo settings
            whatsapp_server_url = request.env['ir.config_parameter'].sudo().get_param('whatsapp_integration.server_url', 'http://localhost:3000')
            _logger.info("Connecting to WhatsApp server at: %s", whatsapp_server_url)

            # Request chats from the Node.js server
            try:
                response = requests.get(f"{whatsapp_server_url}/get-chats", timeout=120)
                _logger.info("Response received with status: %s", response.status_code)
                _logger.debug("Response content: %s", response.text[:1000])  # Log first 1000 characters
            except requests.RequestException as req_error:
                _logger.error("Request failed: %s", str(req_error))
                raise UserError(f"Could not connect to WhatsApp server: {str(req_error)}")

            # Ensure the response is valid JSON
            if response.status_code == 200:
                try:
                    result = response.json()
                except ValueError as json_error:
                    _logger.error("JSON parsing failed: %s", str(json_error))
                    raise UserError("Failed to parse JSON response from WhatsApp server")

                # Validate the response format
                chats_data = result.get('data', {}).get('chats', [])
                if not chats_data:
                    _logger.error("Invalid response format - Missing 'chats' field")
                    raise UserError("Invalid response from WhatsApp server")

                _logger.info("Retrieved %s chats from server", len(chats_data))

                # Get the current session's chats and remove them
                
                old_chats = request.env["live_chat.whatsapp.chat"].sudo().search([])
                old_count = len(old_chats)
                old_chats.unlink()
                _logger.info("Deleted %s existing chats for session: %s", old_count, request.session.session_id)

                # Create new chat records
                chat_records = []
                for chat in chats_data:
                    chat_name = chat.get("name", "Unknown Chat")
                    unread_count = chat.get("unreadCount", 0)

                    _logger.info("Last message structure: %s", chat.get("name", {}))

                    last_message = chat.get("lastMessage", {}).get("_data", {}).get("body", "No message")
                    phone_number = chat.get("phone_number", "No number")
                    chat_id = chat.get("chat_id", "No id")

                    # Create new chat record
                    chat_record = request.env["live_chat.whatsapp.chat"].sudo().create({
                        "name": chat_name,
                        "unread": unread_count,
                        "last_message": last_message,
                        "phone" : phone_number,
                        "chat_id" : chat_id
                    })
                    chat_records.append(chat_record)

                _logger.info("Successfully created %s chat records", len(chat_records))

            else:
                error_msg = f"Failed to fetch chats. Status: {response.status_code}"
                _logger.error(error_msg)
                raise UserError(error_msg)

        except Exception as e:
            _logger.exception("Error fetching WhatsApp chats")
            raise UserError(f"Error fetching WhatsApp chats: {str(e)}")
    
    @http.route('/whatsapp/dashboard', type='http', auth='user', website=True)
    def whatsapp_dashboard(self):
        """Render WhatsApp Dashboard"""
        self.get_whatsapp_chats()
        return request.render('live_chat.whatsapp_dashboard', {})
    @http.route('/live_chat/whatsapp/chats', type='json', auth='user')
    def get_whatsapp_chats1(self):
        """Get all WhatsApp chats"""
        self.get_whatsapp_chats()
        Chat = request.env['live_chat.whatsapp.chat'].sudo()
        chats = Chat.search([])
        _logger.info("Id of first chat %s",chats[0].chat_id)
        return chats.read(['id', 'name', 'phone', 'last_message', 'unread', 'active', "chat_id"])
  
    @http.route('/live_chat/whatsapp/messages/<int:chat_id>', type='json', auth='user')
    def get_whatsapp_messages(self, chat_id):
        """Get messages for a specific chat"""
        Message = request.env['live_chat.whatsapp.message'].sudo()
        messages = Message.search([('chat_id', '=', chat_id)], order='create_date asc')
        return messages.read(['id', 'text', 'sender', 'time', 'status'])
    
    @http.route('/live_chat/whatsapp/send', type='json', auth='user')
    def send_whatsapp_message(self, chat_id, message):
        """Send a WhatsApp message"""
        try:
            Chat = request.env['live_chat.whatsapp.chat'].sudo()
            chat = Chat.browse(chat_id)
            if not chat.exists():
                return {'success': False, 'error': 'Chat not found'}
            
            Message = request.env['live_chat.whatsapp.message'].sudo()
            msg_vals = {
                'chat_id': chat_id,
                'text': message,
                'sender': 'me',
                'time': fields.Datetime.now(),
                'status': 'sent'
            }
            
            # Here you would integrate with the WhatsApp API
            # This is a placeholder for the actual API integration
            
            new_message = Message.create(msg_vals)
            
            # Update the chat's last message
            chat.write({
                'last_message': message,
                'last_message_date': fields.Datetime.now()
            })
            
            return {
                'success': True,
                'message': new_message.read(['id', 'text', 'sender', 'time', 'status'])[0]
            }
            
        except Exception as e:
            _logger.error("Error sending WhatsApp message: %s", str(e))
            return {'success': False, 'error': str(e)}