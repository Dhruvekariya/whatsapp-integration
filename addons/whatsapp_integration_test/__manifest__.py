# -*- coding: utf-8 -*-
{
    'name': 'WhatsApp Integration Test',
    'version': '1.0',
    'category': 'Discuss',
    'summary': 'Test environment for WhatsApp Web integration with Odoo Discuss',
    'description': """
        Test module for WhatsApp Web integration into Odoo Discuss.
        This module allows testing of new UI and logic without affecting the production module.
    """,
    'author': 'Your Company',
    'website': 'https://www.yourcompany.com',
    'depends': ['mail', 'web', 'whatsapp_integration'],  # Depend on the original module
    'data': [
        'views/whatsapp_views_test.xml',
        'views/whatsapp_chat_dashboard.xml',
    ],
    'qweb': [
        'static/src/xml/whatsapp_chat_test.xml',
        'static/src/xml/whatsapp_chat_templates.xml',
    ],
    'assets': {
        'web.assets_backend': [
            #'whatsapp_integration_test/static/src/js/whatsapp_chat_test.js',
            'whatsapp_integration_test/static/src/scss/whatsapp_chat_test.scss',
            'whatsapp_integration_test/static/src/scss/whatsapp_chat_templates.scss',
        ],
    },
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}