# -*- coding: utf-8 -*-
from odoo import models, fields, api, _

class MakeVisitSale(models.TransientModel):
    _name = 'visit.make.sale'
    _description = 'Create Sales Order from Visit'

    visit_id = fields.Many2one('visit.visit', string='Visit', readonly=True)
    customer_id = fields.Many2one('res.partner', string='Customer', readonly=True)
    salesperson_id = fields.Many2one('res.users', string='Salesperson', readonly=True)
    payment_term_id = fields.Many2one('account.payment.term', string='Payment Terms', readonly=True)
    company_id = fields.Many2one('res.company', string='Company', related='visit_id.company_id', readonly=True)

    @api.model
    def default_get(self, fields_list):
        """Override default_get to ensure we get the correct values from the context"""
        res = super(MakeVisitSale, self).default_get(fields_list)
        
        # If visit_id is in context, use it to populate other fields
        active_id = self.env.context.get('active_id')
        if active_id and 'visit_id' not in res:
            visit = self.env['visit.visit'].browse(active_id)
            if visit.exists():
                res.update({
                    'visit_id': visit.id,
                    'customer_id': visit.customer.id,
                    'salesperson_id': visit.salesperson.id,
                })
                self._logger.info(
                    f"Default visit data loaded: visit_id={visit.id}, customer={visit.customer.id}"
                )
        
        return res
    
    def action_create_sale_order(self):
        """Create a sales order from the visit information"""
        self.ensure_one()
        
        # Create the sales order in the correct company
        sale_order = self.with_company(self.company_id).env['sale.order'].create({
            'partner_id': self.customer_id.id,
            'user_id': self.salesperson_id.id,
            'payment_term_id': self.payment_term_id.id if self.payment_term_id else False,
            'origin': self.visit_id.number,
            'visit_id': self.visit_id.id,
            'company_id': self.company_id.id,
        })
        
        # Update the visit with the sales order
        self.visit_id.write({
            'sale_order_id': sale_order.id,
            'total_status': 'converted'
        })
        
        # Return an action to view the created sales order
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'sale.order',
            'view_mode': 'form',
            'res_id': sale_order.id,
            'target': 'current',
            'context': {'default_company_id': self.company_id.id},
        }
    
    def action_cancel(self):
        """Cancel the wizard and return to visit form"""
        self.ensure_one()
        
        # Just set the visit as submitted
        self.visit_id.write({'total_status': 'submitted'})
        
        # Return to an empty draft visit form
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'visit.visit',
            'view_mode': 'form',
            'target': 'current',
            'context': {'default_total_status': 'draft', 'default_company_id': self.company_id.id},
        }