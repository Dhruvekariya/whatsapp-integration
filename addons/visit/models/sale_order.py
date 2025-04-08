from odoo import models, fields, api

class SaleOrder(models.Model):
    _inherit = 'sale.order'
    
    visit_id = fields.Many2one('visit.visit', string='Related Visit', readonly=True, copy=False)
    
    @api.model_create_multi
    def create(self, vals_list):
        """Update visit status when creating a sales order from it"""
        records = super().create(vals_list)
        for record in records:
            if record.visit_id:
                record.visit_id.write({'total_status': 'converted'})
        return records