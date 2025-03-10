from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)

class WhatsAppChat(models.Model):
    _inherit = "whatsapp.chat"
    
    # Add fields
    is_favorite = fields.Boolean(string="Favorite", default=False)
    message_ids = fields.One2many('whatsapp.message', 'chat_id', string="Messages")

    last_message = fields.Char(compute='_compute_last_message', string="Last Message")
    
    @api.depends('message_ids')
    def _compute_last_message(self):
        """Compute the last message for this chat"""
        for record in self:
            last_message = self.env['whatsapp.message'].search(
                [('chat_id', '=', record.id)],
                order='date desc', limit=1
            )
            record.last_message = last_message.content if last_message else False
    
    def open_chat(self):
        """Open the chat conversation view"""
        self.ensure_one()
        
        return {
            'type': 'ir.actions.act_window',
            'name': f'Chat: {self.name}',
            'res_model': 'whatsapp.chat',
            'res_id': self.id,
            'view_mode': 'form',
            'view_id': self.env.ref('whatsapp_integration_test.view_whatsapp_chat_conversation').id,
            'target': 'current',
        }
        
    # def load_messages(self):
    #     """Load messages for this chat, generating test messages if needed"""
    #     self.ensure_one()
        
    #     # Check if there are already messages
    #     messages = self.env['whatsapp.message'].search([('chat_id', '=', self.id)])
        
    #     if not messages:
    #         # Create some test messages
    #         test_messages = [
    #             {
    #                 'content': 'Hello! This is a test message.',
    #                 'direction': 'incoming',
    #                 'state': 'delivered'
    #             },
    #             {
    #                 'content': 'Hi there! How can I help you?',
    #                 'direction': 'outgoing',
    #                 'state': 'sent'
    #             },
    #             {
    #                 'content': 'I have a question about your product.',
    #                 'direction': 'incoming',
    #                 'state': 'delivered'
    #             },
    #             {
    #                 'content': 'Sure, I can help. What would you like to know?',
    #                 'direction': 'outgoing',
    #                 'state': 'sent'
    #             }
    #         ]
            
    #         # Add a delay between messages for realism
    #         import time
    #         from datetime import datetime, timedelta
            
    #         base_time = datetime.now() - timedelta(hours=1)
            
    #         for i, msg in enumerate(test_messages):
    #             self.env['whatsapp.message'].create({
    #                 'session_id': self.session_id.id,
    #                 'chat_id': self.id,
    #                 'content': msg['content'],
    #                 'direction': msg['direction'],
    #                 'state': msg['state'],
    #                 'date': base_time + timedelta(minutes=i*5),
    #                 'is_test': True
    #             })
        
    #     return {'type': 'ir.actions.act_window_close'}
        
    # def send_message(self):
    #     """Send a message from the conversation view"""
    #     self.ensure_one()
        
    #     # In a real implementation, this would get the message content from the view
    #     # For testing, we'll just create a sample message
    #     message = self.env['whatsapp.message'].create({
    #         'session_id': self.session_id.id,
    #         'chat_id': self.id,
    #         'content': 'This is a test message from the conversation view.',
    #         'direction': 'outgoing',
    #         'state': 'sent',
    #         'is_test': True
    #     })
        
    #     # Create an automated response
    #     self.env['whatsapp.message'].create({
    #         'session_id': self.session_id.id,
    #         'chat_id': self.id,
    #         'content': 'This is an automated response to your message.',
    #         'direction': 'incoming',
    #         'state': 'delivered',
    #         'is_test': True
    #     })
        
    #     return {'type': 'ir.actions.act_window_close'}