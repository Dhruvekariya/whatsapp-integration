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
            socket: null,
            attachment: null, // For storing the selected file
        });

        this.rpc = useService("rpc");
        this.messageListRef = useRef("messageList");
        this.fileInputRef = useRef("fileInput");

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

                        // Format timestamp from server using actual timestamp
                        const messageTime = message.timestamp 
                            ? new Date(message.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

                        messagesData?.[this.state.activeChat.id]?.push({
                            text: message.body,
                            sender: "them",
                            time: messageTime,
                            sending: false,
                            failed: false,
                            hasAttachment: message.hasAttachment || false,
                            attachmentName: message.attachmentName || null,
                            attachmentUrl: message.attachmentUrl || null
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
        
        // Clear any existing attachment when switching chats
        this.state.attachment = null;

        // Load messages if not already loaded
        if (!this.state.messages[chat.id]) {
            try {
                const messages = await fetch(`http://localhost:3000/get-messages/${chat.chat_id}`, {
                    method: 'GET'
                });

                let messagesData = await messages.json()

                this.state.messages[chat.id] = messagesData?.data?.messages.map(msg => {
                    // Format date using the timestamp from server
                    const timestamp = msg?.timestamp ? msg.timestamp * 1000 : Date.now();
                    const date = new Date(timestamp);
                    
                    return {
                        text: msg?.body,
                        sender: msg?.fromMe ? "me" : "them",
                        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
                        sending: msg?.status === 'sending',
                        failed: msg?.status === 'failed',
                        hasAttachment: msg?.hasMedia || false,
                        attachmentName: msg?.mediaFilename || null,
                        attachmentUrl: msg?.mediaUrl || null
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

    // File attachment methods
    openFileManager() {
        // Trigger click on the hidden file input
        if (this.fileInputRef.el) {
            this.fileInputRef.el.click();
        }
    }

    handleFileChange(event) {
        const files = event.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            // Store the file in state
            this.state.attachment = {
                file: file,
                name: file.name,
                type: file.type,
                size: file.size
            };
        }
    }

    removeAttachment() {
        this.state.attachment = null;
        if (this.fileInputRef.el) {
            this.fileInputRef.el.value = null; // Clear the file input
        }
    }

    async uploadFile(file) {
        try {
            // Create form data for file upload
            const formData = new FormData();
            formData.append('file', file);
            formData.append('chatId', this.state.activeChat.chat_id);
            
            // Upload the file
            const response = await fetch('http://localhost:3000/upload-file', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error("Error uploading file:", error);
            throw error;
        }
    }

    async sendMessage() {
        if ((!this.state.newMessage.trim() && !this.state.attachment) || !this.state.activeChat) {
            return;
        }

        const messageText = this.state.newMessage;
        this.state.newMessage = "";
        
        // Get current timestamp
        const currentTimestamp = Date.now();
        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        
        // Prepare attachment data if present
        const hasAttachment = !!this.state.attachment;
        const attachmentData = hasAttachment ? {
            name: this.state.attachment.name,
            type: this.state.attachment.type,
            size: this.state.attachment.size
        } : null;
        
        // Create temporary message object with current real time
        const tempMessage = {
            id: `temp-${currentTimestamp}`,
            text: messageText,
            sender: 'me',
            time: currentTime,
            sending: true,
            failed: false,
            hasAttachment: hasAttachment,
            attachmentName: hasAttachment ? this.state.attachment.name : null,
            attachmentUrl: null // URL will be set after upload
        };

        // Add to messages
        if (!this.state.messages[this.state.activeChat.id]) {
            this.state.messages[this.state.activeChat.id] = [];
        }
        this.state.messages[this.state.activeChat.id].push(tempMessage);

        // Scroll to bottom
        setTimeout(() => this.scrollToBottom(), 100);

        try {
            let result;
            
            // Handle file upload if attachment exists
            if (hasAttachment) {
                // First upload the file
                const uploadResult = await this.uploadFile(this.state.attachment.file);
                
                if (uploadResult.success && uploadResult.data) {
                    // Then send message with attachment info
                    const response = await fetch("http://localhost:3000/send-media", {
                        method: "POST",
                        body: JSON.stringify({
                            chatId: this.state.activeChat.chat_id,
                            message: messageText || " ", // WhatsApp requires at least a space for caption
                            mediaUrl: uploadResult.data.url,
                            fileName: this.state.attachment.name
                        }),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                    
                    result = await response.json();
                    
                    // Update attachment URL in the temp message
                    const messageIndex = this.state.messages[this.state.activeChat.id]
                        .findIndex(m => m.id === tempMessage.id);
                        
                    if (messageIndex >= 0) {
                        this.state.messages[this.state.activeChat.id][messageIndex].attachmentUrl = uploadResult.data.url;
                    }
                } else {
                    throw new Error("File upload failed");
                }
            } else {
                // Send regular text message
                const response = await fetch("http://localhost:3000/send-message", {
                    method: "POST",
                    body: JSON.stringify({
                        "chatId": this.state.activeChat.chat_id,
                        "message": messageText
                    }),
                    headers: {
                        "Content-Type": "application/json"
                    }
                });
                
                result = await response.json();
            }

            if (result.success) {
                // Update temporary message with real message data from server response
                const messageIndex = this.state.messages[this.state.activeChat.id]
                    .findIndex(m => m.id === tempMessage.id);

                if (messageIndex >= 0) {
                    // Use server timestamp if available, otherwise keep the original time
                    const messageTime = result.data?.timestamp 
                        ? new Date(result.data.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                        : tempMessage.time;
                        
                    this.state.messages[this.state.activeChat.id][messageIndex] = {
                        ...tempMessage,
                        text: messageText,
                        time: messageTime,
                        sending: false,
                        failed: false
                    };
                }

                // Clear attachment state
                this.state.attachment = null;
                if (this.fileInputRef.el) {
                    this.fileInputRef.el.value = null;
                }

                // Refresh chat list to update last messages
                this.refreshChats();
            } else {
                // Mark as failed
                const messageIndex = this.state.messages[this.state.activeChat.id]
                    .findIndex(m => m.id === tempMessage.id);

                if (messageIndex >= 0) {
                    this.state.messages[this.state.activeChat.id][messageIndex].sending = false;
                    this.state.messages[this.state.activeChat.id][messageIndex].failed = true;
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