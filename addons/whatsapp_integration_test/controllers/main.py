# -*- coding: utf-8 -*-
# File: whatsapp_integration_test/controllers/main_test.py

from odoo import http, _
from odoo.http import request, Response
import logging
import json
import base64
import time
from datetime import datetime

_logger = logging.getLogger(__name__)

class WhatsAppControllerTest(http.Controller):
    
    @http.route('/whatsapp_test/qr_code/<int:session_id>', type='http', auth='user')
    def get_qr_code_test(self, session_id, **kwargs):
        """Get QR code for WhatsApp session (test route)"""
        session = request.env['whatsapp.session'].sudo().browse(session_id)
        if not session.exists():
            return Response('Session not found', status=404)
            
        # For testing, we can generate a static QR code or use the one from the session
        qr_code_data = session.qr_code_image
        if not qr_code_data:
            # Fallback to a sample QR code if none is set
            qr_code_data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        
        # Return QR code image
        headers = [('Content-Type', 'image/png')]
        return Response(base64.b64decode(qr_code_data), headers=headers)
        
    @http.route('/whatsapp_test/status/<int:session_id>', type='http', auth='user')
    def check_status_test(self, session_id, **kwargs):
        """Check WhatsApp connection status (test route)"""
        session = request.env['whatsapp.session'].sudo().browse(session_id)
        if not session.exists():
            return Response(json.dumps({'error': 'Session not found'}), 
                          content_type='application/json')
            
        # Get updated status
        status = session.refresh_status()
                
        return Response(json.dumps({
            'state': session.state,
            'session_id': session.session_id or str(session_id),
            'last_connected': session.last_connected.isoformat() if session.last_connected else None
        }), content_type='application/json')
        
    @http.route('/whatsapp_test/send', type='json', auth='user')
    def send_message_test(self, **kwargs):
        """Send WhatsApp message (test route)"""
        session_id = kwargs.get('session_id')
        chat_id = kwargs.get('chat_id')
        message = kwargs.get('message')
        
        if not all([session_id, chat_id, message]):
            return {'error': 'Missing parameters'}
            
        session = request.env['whatsapp.session'].sudo().browse(int(session_id))
        if not session.exists():
            return {'error': 'Session not found'}
            
        if session.state != 'connected':
            return {'error': 'WhatsApp not connected'}
            
        # Create message in database
        message_id = request.env['whatsapp.message'].sudo().create({
            'session_id': session.id,
            'chat_id': chat_id,
            'content': message,
            'direction': 'outgoing',
            'state': 'sent'  # Always sent in test mode
        })
        
        # Simulate a reply after 2 seconds (done asynchronously)
        def simulate_reply():
            try:
                time.sleep(2)
                request.env['whatsapp.message'].sudo().create({
                    'session_id': session.id,
                    'chat_id': chat_id,
                    'content': f"Test reply to: {message}",
                    'direction': 'incoming',
                    'state': 'delivered'
                })
            except Exception as e:
                _logger.error("Error simulating reply: %s", e)
                
        # In a real implementation, we would use a proper background job
        # For now, just log that we would create a simulated reply
        _logger.info("Would simulate reply to message: %s", message)
        
        return {
            'success': True,
            'message_id': message_id.id
        }
        
    @http.route('/whatsapp_test/get_messages/<int:chat_id>', type='http', auth='user')
    def get_messages_test(self, chat_id, **kwargs):
        """Get messages for a chat (test route)"""
        session_id = int(kwargs.get('session_id', 0))
        limit = int(kwargs.get('limit', 50))
        
        domain = [('chat_id', '=', chat_id)]
        if session_id:
            domain.append(('session_id', '=', session_id))
            
        messages = request.env['whatsapp.message'].sudo().search(
            domain, order='date desc', limit=limit
        )
        
        result = []
        for msg in messages:
            result.append({
                'id': msg.id,
                'content': msg.content,
                'direction': msg.direction,
                'state': msg.state,
                'date': msg.date.isoformat() if msg.date else None
            })
            
        return Response(json.dumps({'messages': result}), content_type='application/json')
        
    @http.route('/whatsapp_test/get_chat/<int:chat_id>', type='http', auth='user')
    def get_chat_test(self, chat_id, **kwargs):
        """Get chat details (test route)"""
        chat = request.env['whatsapp.chat'].sudo().browse(chat_id)
        if not chat.exists():
            return Response(json.dumps({'error': 'Chat not found'}), 
                          content_type='application/json')
            
        return Response(json.dumps({
            'id': chat.id,
            'name': chat.name,
            'unread_count': chat.unread_count,
            'session_id': chat.session_id.id if chat.session_id else None
        }), content_type='application/json')
        
    @http.route('/whatsapp_test/chat_window/<int:chat_id>', type='http', auth='user')
    def chat_window_test(self, chat_id, **kwargs):
        """Render chat window (test route)"""
        chat = request.env['whatsapp.chat'].sudo().browse(chat_id)
        if not chat.exists():
            return Response('Chat not found', status=404)
            
        # Fetch recent messages
        messages = request.env['whatsapp.message'].sudo().search(
            [('chat_id', '=', chat_id)], order='date desc', limit=50
        )
        
        # Prepare template variables
        template_vals = {
            'chat': chat,
            'messages': messages,
        }
        
        # In a real implementation, this would render a QWeb template
        # For now, return a simple HTML response
        html = f"""
        <div class="o_whatsapp_chat_window">
            <div class="o_whatsapp_chat_header">
                <h3>{chat.name}</h3>
            </div>
            <div class="o_whatsapp_chat_messages">
                {'<p>No messages yet</p>' if not messages else ''}
                {''.join([f'<div class="o_message {"incoming" if m.direction == "incoming" else "outgoing"}">{m.content}</div>' for m in messages])}
            </div>
            <div class="o_whatsapp_chat_input">
                <input type="text" placeholder="Type a message"/>
                <button>Send</button>
            </div>
        </div>
        """
        
        return Response(html, content_type='text/html')