# -*- coding: utf-8 -*-
# from odoo import http


# class Visit(http.Controller):
#     @http.route('/visit/visit', auth='public')
#     def index(self, **kw):
#         return "Hello, world"

#     @http.route('/visit/visit/objects', auth='public')
#     def list(self, **kw):
#         return http.request.render('visit.listing', {
#             'root': '/visit/visit',
#             'objects': http.request.env['visit.visit'].search([]),
#         })

#     @http.route('/visit/visit/objects/<model("visit.visit"):obj>', auth='public')
#     def object(self, obj, **kw):
#         return http.request.render('visit.object', {
#             'object': obj
#         })

