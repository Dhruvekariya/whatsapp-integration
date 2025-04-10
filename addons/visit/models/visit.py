# -*- coding: utf-8 -*-
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
        
    @api.model
    def _default_company_id(self):
        """Get the default company from user context"""
        return self.env.company

    number = fields.Char(string='Visit Number', readonly=True, copy=False, index=True)
    creation_date = fields.Datetime(string='Creation Date', default=fields.Datetime.now, readonly=True)
    option_date = fields.Datetime(string='Visit Date', required=True)
    # Important: Removed check_company=True and use a direct domain instead
    customer = fields.Many2one('res.partner', string='Customer', required=True, 
                             domain="[('customer_rank', '>', 0)]")
    salesperson = fields.Many2one('res.users', string='Salesperson', 
                                default=_default_salesperson, required=True)
    notes = fields.Html(string='Visit Notes', help="Enter visit details, points discussed, etc.")
    
    # Added relation to sales order - no check_company here
    sale_order_id = fields.Many2one('sale.order', string='Related Sales Order', 
                                  readonly=True, copy=False)
    sale_order_count = fields.Integer(string='Sales Orders', compute='_compute_sale_order_count')
  
    total_status = fields.Selection([
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('converted', 'Converted to Sale'),
        ('cancelled', 'Cancelled')
    ], string='Status', readonly=True, copy=False, index=True, default='draft', tracking=True)
    
    company_id = fields.Many2one('res.company', string='Company', 
                               default=_default_company_id, required=True,
                               index=True)
    
     # GPS location fields
    submit_latitude = fields.Float(string="Latitude", digits=(10, 7), readonly=True)
    submit_longitude = fields.Float(string="Longitude", digits=(10, 7), readonly=True)
    submit_country_name = fields.Char(string="Country", help="Based on IP Address", readonly=True)
    submit_city = fields.Char(string="City", readonly=True)
    submit_ip_address = fields.Char(string="IP Address", readonly=True)
    submit_browser = fields.Char(string="Browser", readonly=True)
    location_acquired = fields.Boolean(string="Location Acquired", default=False, readonly=True)

    @api.onchange('customer', 'company_id')
    def _onchange_customer_company(self):
        """Check if customer belongs to the company"""
        if self.customer and self.company_id and self.customer.company_id and self.customer.company_id != self.company_id:
            return {'warning': {
                'title': _("Warning"),
                'message': _("This customer belongs to another company. Make sure this is intentional.")
            }}

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            # If company not specified, use current company
            if not vals.get('company_id'):
                vals['company_id'] = self.env.company.id
                
            # Get sequence from the right company
            company_id = vals.get('company_id', self.env.company.id)
            if vals.get('number', _('New')) == _('New'):
                seq_date = None
                if 'creation_date' in vals:
                    seq_date = fields.Datetime.context_timestamp(
                        self, fields.Datetime.to_datetime(vals['creation_date'])
                    )
                vals['number'] = self.with_company(company_id).env['ir.sequence'].next_by_code(
                    'visit.visit', sequence_date=seq_date) or _('New')
                    
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

                # Check if location is already acquired
        if not self.location_acquired:
            # Return client action to get location first
            return {
                'type': 'ir.actions.client',
                'tag': 'action_visit_get_location_and_submit',
                'params': {
                    'visit_id': self.id,
                    'submit_after': True
                }
            }
        
        # Create wizard with current company context
        wizard = self.with_company(self.company_id).env['visit.make.sale'].create({
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
            'context': {'active_id': self.id, 'default_company_id': self.company_id.id},
        }

    def action_draft(self):
        # Check if locked
        if not self._check_edit_rights():
            raise UserError(_('You cannot modify a submitted visit because visits are locked. Please contact your administrator.'))
            
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
            'context': {'default_company_id': self.company_id.id},
        }
        
    def action_cancel(self):
        """Cancel the visit"""
        # Check if locked
        if not self._check_edit_rights():
            raise UserError(_('You cannot cancel a submitted visit because visits are locked. Please contact your administrator.'))
            
        return self.write({'total_status': 'cancelled'})
        
    def write(self, vals):
        """Override write to check lock setting"""
        # If we're trying to modify a non-draft visit and the visits are locked
        if (self.total_status not in ['draft'] and 
            self.env.user.has_group('visit.group_auto_done_visit') and
            not self._check_edit_rights()):
            
            # If vals only contains fields that are allowed to be modified, continue
            allowed_fields = ['total_status', 'sale_order_id', 'message_ids', 'message_follower_ids', 'activity_ids', 
                            'submit_latitude','submit_longitude', 'submit_country_name', 'submit_city', 
                            'submit_ip_address', 'submit_browser', 'location_acquired']
            if not any(field for field in vals.keys() if field not in allowed_fields):
                return super().write(vals)
                
            raise UserError(_('You cannot modify a submitted visit because visits are locked. Please contact your administrator.'))
            
        return super().write(vals)
        
    def _check_edit_rights(self):
        """Check if the user has the right to edit a locked visit"""
        # Manager can always edit
        if self.env.user.has_group('visit.group_visit_manager'):
            return True
            
        # If visits are not locked or it's a draft visit, can edit
        if not self.env.user.has_group('visit.group_auto_done_visit') or self.total_status == 'draft':
            return True
            
        return False
    
    def js_get_location(self):
        """Execute client-side JS code to get location"""
        self.ensure_one()
        return {
            'type': 'ir.actions.client',
            'tag': 'action_visit_get_location',
            'params': {
                'visit_id': self.id
            }
        }
    
    def action_view_maps(self):
        """View the visit location on Google Maps"""
        self.ensure_one()
        if not self.submit_latitude or not self.submit_longitude:
            return {'type': 'ir.actions.act_window_close'}
            
        return {
            'type': 'ir.actions.act_url',
            'url': "https://maps.google.com?q=%s,%s" % (self.submit_latitude, self.submit_longitude),
            'target': 'new'
        }