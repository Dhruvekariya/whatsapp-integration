import socketio
import logging
import threading
from odoo import models, fields, api

_logger = logging.getLogger(__name__)

class WhatsAppListener(models.Model):
    _name = 'whatsapp.listener'
    _description = 'WhatsApp Listener'

    def start_listener(self):
        """ Start the WhatsApp Web socket listener """

        sio = socketio.Client()

        @sio.event
        def connect():
            _logger.info("Connected to WhatsApp Web API")

        @sio.event
        def whatsappReady(data):
            _logger.info("WhatsApp is ready: %s", data)  # Log received data
             # Update the state to connected from the whatsapp session
            self.write({
                'state': 'connected',
                'last_connected': fields.Datetime.now(),
            })
            
            return {"type": "ir.actions.client", "tag": "reload"}


        @sio.event
        def disconnect():
            _logger.info("Disconnected from WhatsApp Web API")
            self.write({'state': 'disconnected'})

        @sio.event
        def whatsapp_status(data):
            """ Handle status updates from WhatsApp """
            _logger.info(f"WhatsApp Status: {data['state']}")
            self.write({
                'state': data['state'],
                'last_connected': fields.Datetime.now(),
            })

        @sio.event
        def chats(data):
            """ Handle the received chat list from Node.js """
            session = self.env['whatsapp.session'].search([], limit=1)  # Get the latest session
            if not session:
                _logger.error("No active WhatsApp session found")
                return

            _logger.info(f"Received {len(data['chats'])} chats, updating session {session.id}")

            session.write({
                'state': 'connected',
                'last_connected': fields.Datetime.now(),
            })

            # Clear existing chat records
            old_chats = self.env["whatsapp.chat"].search([("session_id", "=", session.id)])
            old_chats.unlink()

            # Create new chat records from received data
            for chat in data["chats"]:
                self.env["whatsapp.chat"].create({
                    "session_id": session.id,
                    "name": chat["name"],
                    "unread_count": chat.get("unreadCount", 0),
                })

            _logger.info("Successfully updated chat list in Odoo")

        try:
            _logger.info("Connecting to WhatsApp Web API...")
            sio.connect("http://localhost:3000/")
            sio.wait()
        except Exception as e:
            _logger.error(f"Failed to: {e}")

    
    @api.model
    def init(self):
        """ Automatically start the listener when Odoo starts """
        _logger.info("Initializing WhatsApp Listener...")
        thread = threading.Thread(target=self.start_listener, daemon=True)
        thread.start()
