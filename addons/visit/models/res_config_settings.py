# -*- coding: utf-8 -*-
from odoo import api, fields, models

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    group_auto_done_visit = fields.Boolean(
        string="Lock Submitted Visits", 
        implied_group='visit.group_auto_done_visit',
        help="When checked, submitted visits will be locked and cannot be modified")