/** @odoo-module **/

import { registry } from "@web/core/registry";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";

/**
 * Get location and optionally submit visit afterward
 */
async function getVisitLocationAndSubmit(env, action) {
    // Get services we need
    const notification = env.services.notification;
    const rpc = env.services.rpc;
    const actionService = env.services.action;

    console.log("Action received:", action);

    // Extract visit_id from action params
    const visit_id = action?.params?.visit_id;
    const submit_after = action?.params?.submit_after || false;
    console.log("Visit ID extracted:", visit_id);
    console.log("Submit after:", submit_after);

    if (!visit_id) {
        notification.add(_t("No visit ID provided"), { type: "danger" });
        return;
    }

    // Show notification that we're requesting location
    notification.add(_t("Requesting your location..."), { type: "info" });

    // Request location from browser
    try {
        if (!navigator.geolocation) {
            notification.add(_t("Geolocation is not supported by your browser"), { type: "warning" });
            return;
        }

        // Promisify the geolocation API
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });

        // Got position, send to backend
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        console.log("Position acquired:", latitude, longitude);

        // Send to server
        try {
            console.log("Sending to server:", { visit_id, latitude, longitude });
            const result = await rpc("/visit/update_location", {
                visit_id: visit_id,
                latitude,
                longitude
            });

            console.log("RPC result:", result);

            if (result) {
                notification.add(_t("Location successfully acquired."), {
                    type: "success",
                });

                if (submit_after) {
                    // Continue with the submit process by calling the visit's action_submit method
                    // This ensures proper context is maintained
                    await rpc("/web/action/load", {
                        action_id: "visit.action_visit",
                    }).then(async (action) => {
                        // Call the method on the specific record
                        await actionService.doAction({
                            type: 'ir.actions.act_window',
                            res_model: 'visit.visit',
                            res_id: parseInt(visit_id),
                            views: [[false, 'form']],
                            view_mode: 'form',
                            target: 'current',
                            flags: {
                                mode: 'edit',
                                // This will trigger the action_submit method after the form is loaded
                                on_close: async () => {
                                    await rpc("/web/dataset/call_button", {
                                        model: "visit.visit",
                                        method: "action_submit",
                                        args: [parseInt(visit_id)],
                                        kwargs: {},
                                    }).then((result) => {
                                        if (result && result.type) {
                                            actionService.doAction(result);
                                        }
                                    });
                                }
                            }
                        });
                    });
                } else {
                    // Just reload the form
                    await actionService.doAction({
                        type: 'ir.actions.act_window',
                        res_model: 'visit.visit',
                        res_id: visit_id,
                        views: [[false, 'form']],
                        target: 'current',
                        flags: { mode: 'edit' }
                    });
                }
            } else {
                notification.add(_t("Failed to update visit with location data"), {
                    type: "danger",
                });
            }
        } catch (rpcError) {
            console.error("RPC error:", rpcError);
            notification.add(_t("Error saving location: ") + (rpcError.message || "Unknown error"), {
                type: "danger",
            });
        }
    } catch (error) {
        console.error("Geolocation error:", error);

        // Handle geolocation errors
        let message = _t("Unknown error occurred while getting your location.");

        if (error.code === 1) {
            message = _t("You denied permission to use your location. Location access is required to submit a visit. Please try again and allow location access.");
        } else if (error.code === 2) {
            message = _t("Location information is unavailable.");
        } else if (error.code === 3) {
            message = _t("The request to get your location timed out.");
        }

        notification.add(message, { type: "danger" });

        // Return to visit form without submitting
        await actionService.doAction({
            type: 'ir.actions.act_window',
            res_model: 'visit.visit',
            res_id: visit_id,
            views: [[false, 'form']],
            target: 'current',
            flags: { mode: 'edit' }
        });
    }
}

// Register the client actions
registry.category("actions").add("action_visit_get_location", getVisitLocationAndSubmit);
registry.category("actions").add("action_visit_get_location_and_submit", getVisitLocationAndSubmit);