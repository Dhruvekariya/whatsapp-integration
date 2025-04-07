# __manifest__.py
{
    'name': 'Visit Management',
    'version': '1.0',
    'summary': 'Manage customer visits and orders',
    'description': """
        This module allows you to manage customer visits and related orders.
        Track visits, create quotations, and manage the sales process.
    """,
    'author': 'Your Name',
    'website': 'https://www.yourwebsite.com',
    'category': 'Sales',
    'depends': ['base', 'sale', 'account', 'mail'],
    'data': [
        'data/visit_sequence.xml',
        'security/visit_security.xml',
        'security/ir.model.access.csv',
        'views/visit_views.xml',
        'views/visit_menus.xml',
    ],
    'demo': [],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}