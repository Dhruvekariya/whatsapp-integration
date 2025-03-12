from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)

class WhatsAppChat(models.Model):
    _name = 'live_chat.whatsapp.chat'
    _description = 'WhatsApp Chat'
    _order = 'last_message_date desc'
    
    name = fields.Char('Contact Name', required=True)
    phone = fields.Char('Phone Number', required=True)
    last_message = fields.Text('Last Message')
    last_message_date = fields.Datetime('Last Message Date')
    unread = fields.Integer('Unread Messages', default=0)
    active = fields.Boolean('Active', default=True)
    partner_id = fields.Many2one('res.partner', string='Related Partner')
    message_ids = fields.One2many('live_chat.whatsapp.message', 'chat_id', string='Messages')
    
    @api.model
    def refresh_chats(self):
        """Refresh chats from WhatsApp API"""
        # This is where you would implement WhatsApp API integration
        # For demo purposes, we'll just return existing chats
        return self.search([]).read(['id', 'name', 'phone', 'last_message', 'unread', 'active'])

    def mark_as_read(self):
        """Mark all messages in the chat as read"""
        self.ensure_one()
        self.message_ids.filtered(lambda m: not m.is_read).write({'is_read': True})
        self.unread = 0
        return True


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
    
    @api.model
    def create(self, vals):
        """Update unread count when a new message is created"""
        res = super(WhatsAppMessage, self).create(vals)
        if res.sender == 'them' and not res.is_read:
            res.chat_id.unread += 1
        return res