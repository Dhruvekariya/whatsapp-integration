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
    notes = fields.Text(string='Visit Notes', help="Enter any details about the visit")
    
    # Added relation to sales order
    sale_order_id = fields.Many2one('sale.order', string='Related Sales Order', readonly=True, copy=False)
    sale_order_count = fields.Integer(string='Sales Orders', compute='_compute_sale_order_count')
  
    total_status = fields.Selection([
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('converted', 'Converted to Sale'),
        ('cancelled', 'Cancelled')
    ], string='Status', readonly=True, copy=False, index=True, default='draft', tracking=True)
    
    company_id = fields.Many2one('res.company', string='Company', default=lambda self: self.env.company)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('number', _('New')) == _('New'):
                vals['number'] = self.env['ir.sequence'].next_by_code('visit.visit') or _('New')
        return super().create(vals_list)

    def _compute_sale_order_count(self):
        """Compute the number of sales orders created from this visit"""
        for visit in self:
            if visit.sale_order_id:
                visit.sale_order_count = 1
            else:
                visit.sale_order_count = 0

    def action_submit(self):
        """Open wizard to ask about creating sales order"""
        self.ensure_one()
        
        # Create wizard
        wizard = self.env['visit.make.sale'].create({
            'visit_id': self.id,
            'customer_id': self.customer.id,
            'salesperson_id': self.salesperson.id,
        })
        
        # Return action to open wizard
        return {
            'name': _('Create Sales Order?'),
            'type': 'ir.actions.act_window',
            'res_model': 'visit.make.sale',
            'view_mode': 'form',
            'res_id': wizard.id,
            'target': 'new',
            'context': {'active_id': self.id}
        }

    def action_draft(self):
        self.write({'total_status': 'draft'})
        return True
        
    def action_view_sale_order(self):
        """View the related sales order"""
        self.ensure_one()
        if not self.sale_order_id:
            return {'type': 'ir.actions.act_window_close'}
            
        return {
            'type': 'ir.actions.act_window',
            'name': _('Sales Order'),
            'res_model': 'sale.order',
            'res_id': self.sale_order_id.id,
            'view_mode': 'form',
            'target': 'current',
        }
        
    def action_cancel(self):
        """Cancel the visit"""
        return self.write({'total_status': 'cancelled'})