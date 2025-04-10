# -*- coding: utf-8 -*-
import logging
from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)

class VisitController(http.Controller):
    
    @staticmethod
    def get_geoip_response(latitude=False, longitude=False):
        """Get geolocation data from request or provided coordinates"""
        return {
            'city': request.geoip.city.name if hasattr(request.geoip, 'city') and request.geoip.city else 'Unknown',
            'countryname': request.geoip.country.name if hasattr(request.geoip, 'country') and request.geoip.country else 
                          (request.geoip.continent.name if hasattr(request.geoip, 'continent') and request.geoip.continent else 'Unknown'),
            'latitude': latitude or (request.geoip.location.latitude if hasattr(request.geoip, 'location') else False),
            'longitude': longitude or (request.geoip.location.longitude if hasattr(request.geoip, 'location') else False),
            'ip_address': request.geoip.ip if hasattr(request.geoip, 'ip') else request.httprequest.remote_addr,
            'browser': request.httprequest.user_agent.browser if hasattr(request.httprequest, 'user_agent') else 'Unknown',
        }
    
    @http.route('/visit/update_location', type="json", auth="user")
    def update_visit_location(self, visit_id, latitude=False, longitude=False):
        """Update visit record with geolocation data"""
        _logger.info(f"Received location update request: visit_id={visit_id}, lat={latitude}, long={longitude}")
        
        if not visit_id:
            _logger.error("No visit_id provided")
            return False
            
        try:
            visit_id = int(visit_id)
        except (ValueError, TypeError):
            _logger.error(f"Invalid visit_id: {visit_id}")
            return False
            
        if not latitude or not longitude:
            _logger.error("Missing latitude or longitude")
            return False
            
        try:
            latitude = float(latitude)
            longitude = float(longitude)
        except (ValueError, TypeError):
            _logger.error(f"Invalid coordinates: lat={latitude}, long={longitude}")
            return False
            
        visit = request.env['visit.visit'].browse(visit_id)
        if not visit.exists():
            _logger.error(f"Visit not found: {visit_id}")
            return False
            
        geo_ip_response = self.get_geoip_response(latitude=latitude, longitude=longitude)
        _logger.info(f"Geo IP response: {geo_ip_response}")
        
        # Update visit with location data
        try:
            visit.write({
                'submit_latitude': latitude,
                'submit_longitude': longitude,
                'submit_country_name': geo_ip_response['countryname'],
                'submit_city': geo_ip_response['city'],
                'submit_ip_address': geo_ip_response['ip_address'],
                'submit_browser': geo_ip_response['browser'],
                'location_acquired': True,
            })
            _logger.info(f"Visit {visit_id} updated successfully with location data")
            return True
        except Exception as e:
            _logger.exception(f"Error updating visit: {e}")
            return False