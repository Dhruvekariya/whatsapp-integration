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
        ('draft', 'Quotation'),
        ('sent', 'Quotation Sent'),
        ('sale', 'Confirmed'),
        ('cancel', 'Cancelled')
    ], string='Status', readonly=True, copy=False, index=True, default='draft', tracking=True)
    company_id = fields.Many2one('res.company', string='Company', default=lambda self: self.env.company)

   

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('number', _('New')) == _('New'):
                vals['number'] = self.env['ir.sequence'].next_by_code('visit.visit') or _('New')
        return super().create(vals_list)

    def action_quotation_sent(self):
        self.write({'total_status': 'sent'})
        # Return a completely blank form view
        return {
            'type': 'ir.actions.act_window',
            'name': 'New Visit',
            'res_model': 'visit.visit',
            'view_mode': 'form',
            'target': 'current',  # Use 'new' if you prefer it in a popup
            'context': {}  # No defaults, keeps the form blank
        }



    def action_confirm(self):
        self.write({'total_status': 'sale'})
        return True

    def action_cancel(self):
        self.write({'total_status': 'cancel'})
        return True

    def action_draft(self):
        self.write({'total_status': 'draft'})
        return True