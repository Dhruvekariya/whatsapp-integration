odoo.define('whatsapp_integration_test.chat', function (require) {
    'use strict';
    
    const core = require('web.core');
    const AbstractAction = require('web.AbstractAction');
    const FormView = require('web.FormView');
    const FormController = require('web.FormController');
    const FormRenderer = require('web.FormRenderer');
    const KanbanView = require('web.KanbanView');
    const KanbanRenderer = require('web.KanbanRenderer');
    const KanbanRecord = require('web.KanbanRecord');
    const session = require('web.session');
    const QWeb = core.qweb;
    const _t = core._t;
    
    // Extend Form Controller for WhatsApp Chat
    const WhatsAppChatFormController = FormController.extend({
        /**
         * @override
         */
        init: function (parent, model, renderer, params) {
            this._super.apply(this, arguments);
            this.chatId = null;
            this.sessionId = null;
            this.messages = [];
        },
        
        /**
         * @override
         */
        start: function () {
            this._super.apply(this, arguments);
            this.$messageInput = this.$('.o_whatsapp_message_input input');
            this.$messagesContainer = this.$('.o_whatsapp_messages_container');
            
            // Add event listeners
            this.$('.o_whatsapp_message_input button').on('click', this._onSendMessage.bind(this));
            this.$messageInput.on('keypress', this._onInputKeypress.bind(this));
            
            return this._loadMessages();
        },
        
        /**
         * Load messages for the current chat
         *
         * @private
         * @returns {Promise}
         */
        _loadMessages: function () {
            const record = this.model.get(this.handle);
            this.chatId = record.data.id;
            this.sessionId = record.data.session_id && record.data.session_id.res_id;
            
            if (!this.chatId) {
                return Promise.resolve();
            }
            
            return this._rpc({
                route: `/whatsapp_test/get_messages/${this.chatId}`,
                params: {
                    session_id: this.sessionId,
                    limit: 50
                },
            }).then(response => {
                if (response && response.messages) {
                    this.messages = response.messages;
                    this._renderMessages();
                }
            });
        },
        
        /**
         * Render messages in the chat container
         *
         * @private
         */
        _renderMessages: function () {
            this.$messagesContainer.empty();
            
            if (!this.messages.length) {
                this.$messagesContainer.html(
                    $('<div>', {
                        class: 'text-center py-5',
                    }).append(
                        $('<i>', {class: 'fa fa-comments fa-3x text-muted mb-2'}),
                        $('<p>', {class: 'text-muted'}).text('No messages yet')
                    )
                );
                return;
            }
            
            const $messagesContainer = $('<div>', {class: 'o_whatsapp_messages'});
            
            this.messages.forEach(message => {
                const $message = $('<div>', {
                    class: `o_whatsapp_message ${message.direction === 'incoming' ? 'o_whatsapp_incoming' : 'o_whatsapp_outgoing'}`,
                });
                
                $message.append(
                    $('<div>', {class: 'o_whatsapp_message_content'}).text(message.content),
                    $('<div>', {class: 'o_whatsapp_message_meta'}).text(
                        moment(message.date).format('HH:mm')
                    )
                );
                
                $messagesContainer.append($message);
            });
            
            this.$messagesContainer.html($messagesContainer);
            this._scrollToBottom();
        },
        
        /**
         * Scroll to the bottom of the messages container
         *
         * @private
         */
        _scrollToBottom: function () {
            this.$messagesContainer.scrollTop(this.$messagesContainer[0].scrollHeight);
        },
        
        /**
         * Send a message
         *
         * @private
         */
        _sendMessage: function () {
            const content = this.$messageInput.val().trim();
            
            if (!content) {
                return;
            }
            
            // Clear input
            this.$messageInput.val('');
            
            // Optimistically add message to UI
            this.messages.push({
                id: 'temp_' + Date.now(),
                content: content,
                direction: 'outgoing',
                state: 'sending',
                date: new Date().toISOString(),
            });
            
            this._renderMessages();
            
            // Send message to server
            return this._rpc({
                route: '/whatsapp_test/send',
                params: {
                    session_id: this.sessionId,
                    chat_id: this.chatId,
                    message: content,
                },
            }).then(result => {
                if (result && result.success) {
                    // Update message status
                    const tempMessage = this.messages.find(m => m.id === 'temp_' + Date.now());
                    if (tempMessage) {
                        tempMessage.id = result.message_id;
                        tempMessage.state = 'sent';
                    }
                    
                    // Reload messages to get any auto-replies
                    setTimeout(() => this._loadMessages(), 2000);
                } else {
                    console.error('Failed to send message:', result);
                }
            }).catch(error => {
                console.error('Error sending message:', error);
            });
        },
        
        /**
         * Handle send button click
         *
         * @private
         * @param {Event} event
         */
        _onSendMessage: function (event) {
            event.preventDefault();
            this._sendMessage();
        },
        
        /**
         * Handle keypress in message input
         *
         * @private
         * @param {Event} event
         */
        _onInputKeypress: function (event) {
            if (event.which === 13) { // Enter key
                event.preventDefault();
                this._sendMessage();
            }
        },
    });
    
    // Extend Form Renderer for WhatsApp Chat
    const WhatsAppChatFormRenderer = FormRenderer.extend({
        /**
         * @override
         */
        _renderTagForm: function (node) {
            const $form = this._super.apply(this, arguments);
            
            // You can add custom rendering here if needed
            
            return $form;
        },
    });
    
    // Register WhatsApp Chat Form View
    const WhatsAppChatFormView = FormView.extend({
        config: _.extend({}, FormView.prototype.config, {
            Controller: WhatsAppChatFormController,
            Renderer: WhatsAppChatFormRenderer,
        }),
    });
    
    // Register view in the view registry
    core.view_registry.add('whatsapp_chat_form', WhatsAppChatFormView);
    
    // Create a custom client action to display a WhatsApp dashboard
    const WhatsAppDashboard = AbstractAction.extend({
        template: 'WhatsAppDashboard',
        events: {
            'click .o_whatsapp_chat_item': '_onChatClick',
            'click .o_whatsapp_refresh': '_onRefreshClick',
        },
        
        /**
         * @override
         */
        start: function () {
            this._super.apply(this, arguments);
            return this._loadChats();
        },
        
        /**
         * Load WhatsApp chats from the server
         *
         * @private
         * @returns {Promise}
         */
        _loadChats: function () {
            return this._rpc({
                model: 'whatsapp.chat',
                method: 'search_read',
                domain: [],
                fields: ['name', 'unread_count', 'session_id'],
                limit: 100,
            }).then(chats => {
                this.chats = chats;
                this._renderChats();
            });
        },
        
        /**
         * Render the chats in the dashboard
         *
         * @private
         */
        _renderChats: function () {
            const $chatList = this.$('.o_whatsapp_chat_list');
            $chatList.empty();
            
            if (!this.chats.length) {
                $chatList.html(
                    $('<div>', {
                        class: 'alert alert-info',
                        text: _t('No WhatsApp chats found. Connect WhatsApp first.'),
                    })
                );
                return;
            }
            
            this.chats.forEach(chat => {
                const $chat = $('<div>', {
                    class: 'o_whatsapp_chat_item',
                    'data-id': chat.id,
                }).append(
                    $('<div>', {class: 'o_whatsapp_chat_name'}).text(chat.name),
                    chat.unread_count > 0 ? 
                        $('<div>', {class: 'o_whatsapp_chat_unread badge badge-pill badge-success'}).text(chat.unread_count) : 
                        $()
                );
                
                $chatList.append($chat);
            });
        },
        
        /**
         * Handle chat click
         *
         * @private
         * @param {Event} event
         */
        _onChatClick: function (event) {
            const chatId = $(event.currentTarget).data('id');
            this.do_action({
                type: 'ir.actions.act_window',
                res_model: 'whatsapp.chat',
                res_id: chatId,
                views: [[false, 'form']],
                target: 'current',
                context: {
                    form_view_ref: 'whatsapp_integration_test.view_whatsapp_chat_conversation',
                },
            });
        },
        
        /**
         * Handle refresh click
         *
         * @private
         */
        _onRefreshClick: function () {
            return this._loadChats();
        },
    });
    
    // Register the client action
    core.action_registry.add('whatsapp_dashboard', WhatsAppDashboard);
    
    return {
        WhatsAppChatFormController: WhatsAppChatFormController,
        WhatsAppChatFormView: WhatsAppChatFormView,
        WhatsAppDashboard: WhatsAppDashboard,
    };
});