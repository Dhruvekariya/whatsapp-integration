import base64
import json
import os
import tempfile
import requests
from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)

class WhatsAppChat(models.Model):
    _name = 'live_chat.whatsapp.chat'
    _description = 'WhatsApp Chat'
    _order = 'last_message_date desc'
    
    name = fields.Char('Contact Name', required=True)
    chat_id = fields.Text('Chat Id')
    phone = fields.Char('Phone Number', required=True)
    last_message = fields.Text('Last Message')
    last_message_type = fields.Text('Last Message Type')
    last_message_date = fields.Datetime('Last Message Date')
    unread = fields.Integer('Unread Messages', default=0)
    active = fields.Boolean('Active', default=True)
    partner_id = fields.Many2one('res.partner', string='Related Partner')
    message_ids = fields.One2many('live_chat.whatsapp.message', 'chat_id', string='Messages')
    profilePicUrl = fields.Char('Profile Picture URL')
    
    @api.model
    def refresh_chats(self):
        """Refresh chats from WhatsApp API"""
        # This is where you would implement WhatsApp API integration
        # For demo purposes, we'll just return existing chats
        return self.search([]).read(['id', 'name', 'phone', 'last_message',"last_message_type", 'unread', 'active', "profilePicUrl"])
    
    def mark_as_read(self):
        """Mark all messages in the chat as read"""
        self.ensure_one()
        self.message_ids.filtered(lambda m: not m.is_read).write({'is_read': True})
        self.unread = 0
        return True
    
    def send_message(self, text, attachment=None, attachment_name=None, attachment_type=None):
        """Send a message to this chat"""
        self.ensure_one()
        
        message_vals = {
            'chat_id': self.id,
            'text': text,
            'sender': 'me',
            'status': 'sending',
        }
        
        # Handle attachment if provided
        if attachment:
            message_vals.update({
                'has_attachment': True,
                'attachment': attachment,
                'attachment_name': attachment_name,
                'attachment_type': attachment_type,
            })
            
            # Upload attachment to WhatsApp server
            try:
                attachment_url = self.env['live_chat.whatsapp.message'].upload_attachment_to_server(
                    attachment, attachment_name, attachment_type
                )
                message_vals['attachment_url'] = attachment_url
            except Exception as e:
                _logger.error(f"Failed to upload attachment: {str(e)}")
                raise UserError(_("Failed to upload attachment: %s") % str(e))
        
        # Create the message
        message = self.env['live_chat.whatsapp.message'].create(message_vals)
        
        # Send the message via WhatsApp API
        try:
            self._send_message_via_api(message)
            message.write({'status': 'sent'})
        except Exception as e:
            _logger.error(f"Failed to send message: {str(e)}")
            message.write({'status': 'failed'})
            raise UserError(_("Failed to send message: %s") % str(e))
        
        return message
    
    def _send_message_via_api(self, message):
        """Send a message via WhatsApp API"""
        api_url = 'http://localhost:3000/send-message'
        
        data = {
            'chatId': self.chat_id,
            'phone': self.phone,
            'message': message.text,
        }
        
        if message.has_attachment and message.attachment_url:
            data['attachment'] = message.attachment_url
            data['attachmentType'] = message.attachment_type
        
        headers = {'Content-Type': 'application/json'}
        response = requests.post(api_url, headers=headers, data=json.dumps(data))
        
        if response.status_code != 200:
            raise UserError(_("API Error: %s") % response.text)
        
        return response.json()
    
    @api.model
    def create_or_update_chat(self, phone, name=None, message=None):
        """Create or update a chat with the given phone number"""
        # Check if the chat already exists
        chat = self.search([('phone', '=', phone)], limit=1)
        
        if not chat:
            # Create a new chat
            chat_vals = {
                'phone': phone,
                'name': name or phone,
            }
            chat = self.create(chat_vals)
            
            # Try to find a partner with this phone number
            partner = self.env['res.partner'].search([
                '|', ('phone', '=', phone), ('mobile', '=', phone)
            ], limit=1)
            if partner:
                chat.partner_id = partner.id
        
        # Update the chat with the new message if provided
        if message:
            chat.message_ids.create({
                'chat_id': chat.id,
                'text': message,
                'sender': 'them',
                'is_read': False,
            })
            chat.write({
                'last_message': message,
                'last_message_date': fields.Datetime.now(),
            })
        
        return chat


class WhatsAppMessage(models.Model):
    _name = 'live_chat.whatsapp.message'
    _description = 'WhatsApp Message'
    _order = 'create_date asc'
    
    chat_id = fields.Many2one('live_chat.whatsapp.chat', string='Chat', required=True, ondelete='cascade')
    text = fields.Text('Message Text', required=True)
    sender = fields.Selection([
        ('me', 'Me'),
        ('them', 'Contact')
    ], string='Sender', required=True)
    time = fields.Datetime('Time', default=fields.Datetime.now)
    is_read = fields.Boolean('Read', default=False)
    status = fields.Selection([
        ('sending', 'Sending'),
        ('sent', 'Sent'),
        ('delivered', 'Delivered'),
        ('read', 'Read'),
        ('failed', 'Failed')
    ], string='Status', default='sending')
    # New fields for attachments
    has_attachment = fields.Boolean('Has Attachment', default=False)
    attachment = fields.Binary('Attachment', attachment=True)
    attachment_name = fields.Char('Attachment Name')
    attachment_type = fields.Char('Attachment Type')
    attachment_url = fields.Char('Attachment URL')
     # Add a new field for sender name
    sender_name = fields.Char('Sender Name', help='Name of the message sender')

    
    @api.model
    def create(self, vals):
        """Update sender name when creating a message"""
        # If sender is 'them', try to get the sender name from the chat
        if vals.get('sender') == 'them':
            chat = self.env['live_chat.whatsapp.chat'].browse(vals.get('chat_id'))
            vals['sender_name'] = chat.name
        elif vals.get('sender') == 'me':
            vals['sender_name'] = 'Me'
        
        return super(WhatsAppMessage, self).create(vals)
    
    @api.model
    def upload_attachment_to_server(self, attachment_data, filename, mimetype):
        """Upload attachment to WhatsApp server through Node.js API"""
        try:
            api_url = 'http://localhost:3000/upload-file'
            
            # Create a temporary file
            temp_file = tempfile.NamedTemporaryFile(delete=False)
            temp_file.write(base64.b64decode(attachment_data))
            temp_file.close()
            
            # Send the file to the server
            files = {'file': (filename, open(temp_file.name, 'rb'), mimetype)}
            response = requests.post(api_url, files=files)
            
            # Remove the temporary file
            os.unlink(temp_file.name)
            
            if response.status_code != 200:
                raise UserError(_("Failed to upload file: %s") % response.text)
            
            result = response.json()
            return result.get('url')
        except Exception as e:
            _logger.error(f"Error uploading attachment: {str(e)}")
            raise UserError(_("Failed to upload attachment: %s") % str(e))
    
    def update_status(self, status):
        """Update the status of the message"""
        self.ensure_one()
        self.write({'status': status})
        return True


class WhatsAppConfiguration(models.Model):
    _name = 'live_chat.whatsapp.config'
    _description = 'WhatsApp Configuration'
    
    name = fields.Char('Name', required=True)
    api_url = fields.Char('API URL', default='http://localhost:3000', required=True)
    api_key = fields.Char('API Key')
    is_active = fields.Boolean('Active', default=True)
    
    @api.model
    def get_config(self):
        """Get the active configuration"""
        config = self.search([('is_active', '=', True)], limit=1)
        if not config:
            raise UserError(_("No active WhatsApp configuration found."))
        return config