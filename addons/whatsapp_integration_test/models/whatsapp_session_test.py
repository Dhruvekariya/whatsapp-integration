from odoo import fields, models, api, _
from odoo.exceptions import UserError
import logging
import time

_logger = logging.getLogger(__name__)

class WhatsAppChatTest(models.Model):
    _inherit = "whatsapp.chat"
    
    # Add any new fields or methods for testing
    is_favorite = fields.Boolean(string="Favorite", default=False)
    
    def open_chat(self):
        """Open the selected chat"""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': f'Chat: {self.name}',
            'res_model': 'whatsapp.message',
            'domain': [('session_id', '=', self.session_id.id), ('chat_id', '=', self.id)],
            'view_mode': 'tree,form',
            'target': 'current',
        }

class WhatsAppSessionTest(models.Model):
    _inherit = "whatsapp.session"
    
    # Override field definitions to fix duplicate label warnings
    qr_code = fields.Binary(string="QR Code Data")
    qr_code_image = fields.Binary(string="QR Code Image")
    
    # Add any new fields or methods for testing
    test_mode = fields.Boolean(string="Test Mode", default=True)
    
    def generate_qr_code(self):
        """Override for testing"""
        self.ensure_one()
        
        if self.test_mode:
            _logger.info("Generating QR code in TEST MODE")
            
            # In test mode, use a sample QR code
            sample_qr = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
            
            self.write({
                'qr_code_image': sample_qr,
                'state': 'connecting'
            })
            
            return {"type": "ir.actions.client", "tag": "reload"}
        else:
            # Call the original method for real implementation
            return super(WhatsAppSessionTest, self).generate_qr_code()
    
    def simulate_connection(self):
        """Simulate a successful connection for testing"""
        self.ensure_one()
        
        if not self.test_mode:
            raise UserError(_("This function can only be used in test mode"))
            
        _logger.info("Simulating WhatsApp connection in TEST MODE")
        
        # Update the state to connected
        self.write({
            'state': 'connected',
            'last_connected': fields.Datetime.now(),
        })
        
        # Generate some test chats automatically
        self.get_chat_list()
        
        return {"type": "ir.actions.client", "tag": "reload"}
    
    def refresh_status(self):
        """Check and update connection status"""
        self.ensure_one()
        
        if self.test_mode:
            # In test mode, we'll simulate a status check
            # For demo purposes, we'll transition from connecting to connected
            # after a short delay (10 seconds)
            if self.state == 'connecting':
                last_write = self.write_date
                now = fields.Datetime.now()
                
                # Check if it's been more than 10 seconds since QR generation
                if (now - last_write).total_seconds() > 10:
                    self.write({
                        'state': 'connected',
                        'last_connected': now
                    })
                    _logger.info("Automatically transitioned to connected state in TEST MODE")
            
            return {'state': self.state}
        else:
            # In real mode, would call WhatsApp API to check status
            # For now, just return current state
            return {'state': self.state}
        
    def check_connection(self):
        """Check WhatsApp connection status - Client action method"""
        self.ensure_one()
        
        status = self.refresh_status()
        
        if status.get('state') == 'connected' and self.state == 'connected':
            # If we're connected, redirect to chat list view
            return {
                'type': 'ir.actions.act_window',
                'name': 'WhatsApp Chats',
                'res_model': 'whatsapp.chat',
                'domain': [('session_id', '=', self.id)],
                'view_mode': 'tree,form',
                'target': 'current',
            }
        
        # # Update the state to connected
        self.write({
            'state': 'connected',
            'last_connected': fields.Datetime.now(),
        })

        return {"type": "ir.actions.client", "tag": "reload"}

            
    def get_chat_list(self):
        """Override for testing to generate chat list"""
        self.ensure_one()
        
        if self.test_mode:
            _logger.info("Getting chat list in TEST MODE")
            
            # Clear existing chat records for this session
            old_chats = self.env["whatsapp.chat"].search([("session_id", "=", self.id)])
            old_chats.unlink()
            
            # Create sample test chats
            test_chats = [
                {"name": "Test Contact 1", "unread_count": 3},
                {"name": "Test Contact 2", "unread_count": 0},
                {"name": "Test Group", "unread_count": 5},
                {"name": "Support Team", "unread_count": 1},
                {"name": "Family Group", "unread_count": 12},
            ]
            
            for chat in test_chats:
                self.env["whatsapp.chat"].create({
                    "session_id": self.id,
                    "name": chat["name"],
                    "unread_count": chat["unread_count"],
                })
            
            return {"type": "ir.actions.client", "tag": "reload"}
        else:
            # Call the original method for real implementation
            return super(WhatsAppSessionTest, self).get_chat_list()
    
    def refresh_status(self):
        """Check and update connection status"""
        self.ensure_one()
        
        if self.test_mode:
            # In test mode, we'll simulate a status check
            # For demo purposes, we'll transition from connecting to connected
            # after a short delay (10 seconds)
            if self.state == 'connecting':
                last_write = self.write_date
                now = fields.Datetime.now()
                
                # Check if it's been more than 10 seconds since QR generation
                if (now - last_write).total_seconds() > 10:
                    self.write({
                        'state': 'connected',
                        'last_connected': now
                    })
                    _logger.info("Automatically transitioned to connected state in TEST MODE")
            
            return {'state': self.state}
        else:
            # In real mode, would call WhatsApp API to check status
            # For now, just return current state
            return {'state': self.state}
            