{
    'name': 'WhatsApp Live Chat',
    'version': '1.0',
    'category': 'Discuss',
    'summary': 'Integrate WhatsApp messaging into Odoo',
    'description': """
WhatsApp Live Chat Integration
==============================
This module integrates WhatsApp messaging into Odoo, allowing users to
chat with customers through WhatsApp directly from the Odoo interface.
    """,
    'author': 'Your Name',
    'website': 'https://www.yourwebsite.com',
    'depends': ['base', 'mail', 'web'],
    'data': [   
        'security/ir.model.access.csv',
        'views/whatsapp_chat_views.xml',
        'views/assets.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'live_chat/static/src/js/whatsapp_chat.js',
            'live_chat/static/src/scss/whatsapp_chat.scss',
             'live_chat/static/src/xml/test_template.xml',
        ],
        'web.assets_backend_prod_only': [
        'live_chat/static/src/xml/whatsapp_chat_templates.xml',
    ],
    'web.assets_qweb': [
        'live_chat/static/src/xml/whatsapp_chat_templates.xml',
    ],
    'web.qweb': [
        'live_chat/static/src/xml/whatsapp_chat_templates.xml',
    ],
    },
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}