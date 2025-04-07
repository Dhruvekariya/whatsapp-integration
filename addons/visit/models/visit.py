# models/visit.py
from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError

class Visit(models.Model):
    _name = 'visit.visit'
    _description = 'Customer Visit'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'creation_date desc'

    @api.model
    def _default_salesperson(self):
        return self.env.user.id

    number = fields.Char(string='Visit Number', readonly=True, copy=False, index=True)
    creation_date = fields.Datetime(string='Creation Date', default=fields.Datetime.now, readonly=True)
    option_date = fields.Datetime(string='Visit Date', required=True)
    customer = fields.Many2one('res.partner', string='Customer', required=True, domain=[('customer_rank', '>', 0)])
    salesperson = fields.Many2one('res.users', string='Salesperson', default=_default_salesperson, required=True)
    payment_term_id = fields.Many2one('account.payment.term', string='Payment Terms')
  
    total_status = fields.Selection([
        ('draft', 'Draft'),
        ('submitted', 'Submitted')
    ], string='Status', readonly=True, copy=False, index=True, default='draft', tracking=True)
    company_id = fields.Many2one('res.company', string='Company', default=lambda self: self.env.company)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('number', _('New')) == _('New'):
                vals['number'] = self.env['ir.sequence'].next_by_code('visit.visit') or _('New')
        return super().create(vals_list)

    def action_submit(self):
        self.write({'total_status': 'submitted'})
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'visit.visit',
            'view_mode': 'form',
            'target': 'current',
            'context': {'default_total_status': 'draft'},
        }

    def action_draft(self):
        self.write({'total_status': 'draft'})
        return True