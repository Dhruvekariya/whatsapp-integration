/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, onMounted, onWillUnmount, useState, useRef } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

class WhatsAppChat extends Component {
    setup() {
        this.state = useState({
            chats: [],
            messages: {},
            activeChat: null,
            newMessage: "",
            loading: true,
            socket : null
        });

        this.rpc = useService("rpc");
        this.messageListRef = useRef("messageList");

        onMounted(() => {
            this.loadChats();
            this.socket = new WebSocket("ws://localhost:3000");

            this.socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "newMessage") {
                    console.log("data-=-=-=-=-", data.from);
                    console.log("this.state.activeChat-=-=-=-=-", this.state.activeChat);
                    const chatId = data.from;
                    const message = data;
                    if (this.state.activeChat && this.state.activeChat.chat_id === chatId) {

                        let messagesData = this.state.messages

                        
                        // this.state.messages[this.state.activeChat.id].push({
                        //     text: message.body,
                        //     sender: "them",
                        //     time: new Date(message.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
                        //     sending: false,
                        //     failed: false
                        // });
                        messagesData?.[this.state.activeChat.id]?.push({
                            text: message.body,
                            sender: "them",
                            time: new Date(message.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
                            sending: false,
                            failed: false
                        })

                        console.log(".messages-=-=-=-=-", messagesData);
                        
                        this.state.messages = messagesData;
                        
                        setTimeout(() => this.scrollToBottom(), 100);
                    }
                    this.loadChats(false);
                }
            }
        });
    }

    async loadChats(isLoading = true) {
        if (isLoading) this.state.loading = true;
        try {
            const newChats = await this.rpc("/live_chat/whatsapp/chats");
    
            console.log("chats-=-=-=-=-", newChats);
    
            // Preserve sequence while updating data
            const updatedChats = [];
            for (let i = 0; i < newChats.length; i++) {
                const newChat = newChats[i];
    
                // Find existing chat in the current state
                const existingChat = this.state.chats.find(chat => chat.id === newChat.id);

                if (existingChat) {
                    // Update existing chat data
                    Object.assign(existingChat, {...newChat, unread: newChat.unreadCount, });
                    updatedChats.push(existingChat);
                } else {
                    // Add new chat
                    updatedChats.push({ ...newChat });
                }
            }
    
            // Update state while maintaining the original sequence
            this.state.chats = updatedChats;
    
            // Update active chat status
            for (let i = 0; i < this.state.chats.length; i++) {
                this.state.chats[i].isActive = this.state.activeChat && this.state.activeChat.id === this.state.chats[i].id;
            }
    
        } catch (error) {
            console.error("Error loading chats:", error);
        } finally {
            this.state.loading = false;
        }
    }
    

    async refreshChats() {

        await this.loadChats();
    }

    async selectChat(chat) {
        // Update active state in chats
        this.state.chats = this.state.chats.map(c => ({
            ...c,
            isActive: c.id === chat.id
        }));

        this.state.activeChat = chat;

        // Load messages if not already loaded
        if (!this.state.messages[chat.id]) {
            try {
                const messages = await fetch(`http://localhost:3000/get-messages/${chat.chat_id}`, {
                    method: 'GET'
                });

                let messagesData = await messages.json()

                this.state.messages[chat.id] = messagesData?.data?.messages.map(msg => {
                    // Format date for display
                    const date = new Date(msg.timestamp * 1000);
                    return {
                        text: msg?.body,
                        sender: msg?.fromMe ? "me" : "them",
                        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' ,hour12: false }),
                        sending: msg?.status === 'sending',
                        failed: msg?.status === 'failed'
                    };
                });

                // Scroll to the bottom after messages are loaded
                setTimeout(() => this.scrollToBottom(), 100);
            } catch (error) {
                console.error("Error loading messages:", error);
            }
        } else {
            // If messages are already loaded, just scroll to bottom
            setTimeout(() => this.scrollToBottom(), 100);
        }
    }

    scrollToBottom() {
        if (this.messageListRef.el) {
            this.messageListRef.el.scrollTop = this.messageListRef.el.scrollHeight;
        }
    }

    handleKeyDown(event) {
        // Send message on Enter (but not with Shift+Enter for new line)
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    async sendMessage() {
        if (!this.state.newMessage.trim() || !this.state.activeChat) {
            return;
        }

        const messageText = this.state.newMessage;
        this.state.newMessage = "";

        // Create temporary message object
        const tempMessage = {
            id: `temp-${Date.now()}`,
            text: messageText,
            sender: 'me',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            sending: true,
            failed: false
        };

        // Add to messages
        if (!this.state.messages[this.state.activeChat.id]) {
            this.state.messages[this.state.activeChat.id] = [];
        }
        this.state.messages[this.state.activeChat.id].push(tempMessage);

        // Scroll to bottom
        setTimeout(() => this.scrollToBottom(), 100);

        try {
            // Send message via RPC

            const data = await fetch("http://localhost:3000/send-message", {
                method: "POST",
                body: JSON.stringify({
                    "chatId": this.state.activeChat.chat_id,
                    "message": messageText
                }),
                headers: {
                    "Content-Type": "application/json"
                }
            })



            const result = data.json()

            if (result.success) {
                // Update temporary message with real message data
                const messageIndex = this.state.messages[this.state.activeChat.id]
                    .findIndex(m => m.id === tempMessage.id);

                if (messageIndex >= 0) {
                    this.state.messages[this.state.activeChat.id][messageIndex] = {
                        ...result.message,
                        text: messageText,
                        time: new Date(result.data?.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                        }),
                        sending: false,
                        failed: false
                    };
                }

                // Refresh chat list to update last messages
                this.refreshChats();
            } else {
                // Mark as failed
                const messageIndex = this.state.messages[this.state.activeChat.id]
                    .findIndex(m => m.id === tempMessage.id);

                if (messageIndex >= 0) {
                    this.state.messages[this.state.activeChat.id][messageIndex].sending = false;
                    this.state.messages[this.state.activeChat.id][messageIndex].failed = false;
                }

                console.error("Failed to send message:", result.error);
            }
        } catch (error) {
            console.error("Error sending message:", error);

            // Mark as failed
            const messageIndex = this.state.messages[this.state.activeChat.id]
                .findIndex(m => m.id === tempMessage.id);

            if (messageIndex >= 0) {
                this.state.messages[this.state.activeChat.id][messageIndex].sending = false;
                this.state.messages[this.state.activeChat.id][messageIndex].failed = true;
            }
        }
    }
}

WhatsAppChat.template = "live_chat.WhatsAppChat";
registry.category("actions").add("live_chat.dashboard", WhatsAppChat);