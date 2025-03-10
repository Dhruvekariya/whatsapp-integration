from odoo import api, fields, models, _
from odoo.exceptions import UserError
from datetime import datetime
import logging

_logger = logging.getLogger(__name__)

class WhatsAppMessageTest(models.Model):
    _inherit = 'whatsapp.message'
    
    # Add any new fields or methods for testing
    is_test = fields.Boolean(string='Test Message', default=True, help="Indicates this message was created in test mode")
    chat_id = fields.Many2one('whatsapp.chat', string='Chat', ondelete='cascade', index=True)

    
    @api.model
    def create_test_message(self, session_id, chat_id, content, direction='outgoing'):
        """Create a test message"""
        return self.create({
            'session_id': session_id,
            'chat_id': chat_id,
            'content': content,
            'direction': direction,
            'state': 'sent' if direction == 'outgoing' else 'delivered',
            'is_test': True
        })
    
    def mark_as_read(self):
        """Mark message as read"""
        self.ensure_one()
        if self.state != 'read':
            self.write({'state': 'read'})
        return True
    
    def send_reply(self, content):
        """Send a reply to this message"""
        self.ensure_one()
        
        if self.direction == 'outgoing':
            raise UserError(_("Cannot reply to an outgoing message"))
            
        reply = self.create({
            'session_id': self.session_id.id,
            'chat_id': self.chat_id,
            'content': content,
            'direction': 'outgoing',
            'state': 'sent',
            'is_test': self.is_test
        })
        
        # In a test environment, automatically create a response
        if self.is_test:
            self.env['whatsapp.message'].sudo().create({
                'session_id': self.session_id.id,
                'chat_id': self.chat_id,
                'content': f"Automated test reply to: {content}",
                'direction': 'incoming',
                'state': 'delivered',
                'is_test': True
            })
            
        return reply