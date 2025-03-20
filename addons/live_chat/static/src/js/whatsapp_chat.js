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
            attachment: null,
            attachmentPreview: null, // For preview before sending
            searchQuery: "",
            filteredChats: [],
            supportedMediaTypes: {
                image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
                video: ['video/mp4', 'video/webm', 'video/ogg'],
                document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            },
            isRecording: false,
            recordingTime: 0,
            audioRecorder: null,
            audioChunks: [],
            recordingInterval: null,
        });

        this.rpc = useService("rpc");
        this.messageListRef = useRef("messageList");
        this.fileInputRef = useRef("fileInput");
        this.mediaPreviewRef = useRef("mediaPreview");

        onMounted(() => {
            this.loadChats();
            this.socket = new WebSocket("ws://localhost:3000");
            
            this.socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.type === "newMessage") {
                    console.log("Received message type:", data.hasAttachment ? data.attachmentType : "text");
            
                    const chatId = data.from;
            
                    if (this.state.activeChat && this.state.activeChat.chat_id === chatId) {
                        // Format timestamp
                        const messageTime = data.timestamp
                            ? new Date(data.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            
                        let newMessage = {
                            text: data.body,
                            sender: "them",
                            time: messageTime,
                            sending: false,
                            failed: false,
                            hasAttachment: data.hasAttachment || false,
                            attachmentType: data.attachmentType || null,
                            attachmentName: data.attachmentName || null,
                            attachmentUrl: data.attachmentUrl || null,
                            attachmentMimeType: data.attachmentMimeType || null
                        };
            
                        // **Handle attachments differently**
                        if (data.hasAttachment) {
                            if (data.attachmentType === "image" && !data.body) {
                                // Only image, no text
                                newMessage.text = null;
                            } else if (data.attachmentType === "image" && data.body) {
                                // Image with text
                                newMessage.text = data.body;
                            } else if (data.attachmentType === "video") {
                                // Video handling
                                newMessage.videoPreview = true; // Custom property to handle UI
                            } else if (data.attachmentType === "document" && data.attachmentMimeType.includes("pdf")) {
                                // PDF handling (show preview like WhatsApp)
                                newMessage.showPdfPreview = true;
                            }
                        }
            
                        // Check if chat messages exist, create array if not
                        if (!this.state.messages[this.state.activeChat.id]) {
                            this.state.messages[this.state.activeChat.id] = [];
                        }
            
                        // Add new message
                        this.state.messages[this.state.activeChat.id].push(newMessage);
            
                        // Force update state
                        this.state.messages = { ...this.state.messages };
            
                        // Scroll to bottom
                        setTimeout(() => this.scrollToBottom(), 100);
                    }
            
                    this.loadChats(false);
                }
            };            
            
        });

        onWillUnmount(() => {
            if (this.state.socket) {
                this.state.socket.close();
            }
        });
    }
    
    startAudioRecording() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    this.state.isRecording = true;
                    this.state.recordingTime = 0;
                    this.state.audioChunks = [];
                    this.state.audioStream = stream; // Save stream for cleanup
    
                    // Create media recorder
                    this.state.audioRecorder = new MediaRecorder(stream);
    
                    // Capture audio data
                    this.state.audioRecorder.ondataavailable = (event) => {
                        console.log("Data available:", event.data.size);
                        if (event.data.size > 0) {
                            this.state.audioChunks.push(event.data);
                        }
                    };
    
                    // Ensure recording stops only when there’s data
                    this.state.audioRecorder.onstop = () => {
                        if (this.state.audioChunks.length === 0) {
                            console.error("No audio recorded.");
                            return;
                        }
    
                        // Create a Blob from recorded chunks
                        const audioBlob = new Blob(this.state.audioChunks, { type: 'audio/webm' });
    
                        // Create a file from the Blob
                        const audioFile = new File([audioBlob], "voice_message.webm", {
                            type: 'audio/webm',
                            lastModified: new Date().getTime()
                        });
    
                        // Attach audio file
                        this.state.attachment = {
                            file: audioFile,
                            name: "Voice message",
                            type: audioFile.type,
                            size: audioFile.size,
                            mediaType: 'audio'
                        };
    
                        console.log("Audio recorded successfully:", audioFile);
    
                        // Clean up
                        this.cleanupAudioStream();
                        this.state.isRecording = false;
                        this.state.audioRecorder = null;
                        this.state.audioChunks = [];
                    };
    
                    // Start recording
                    this.state.audioRecorder.start();
    
                    // Timer for recording duration
                    this.state.recordingInterval = setInterval(() => {
                        this.state.recordingTime += 1;
                    }, 1000);
                })
                .catch(error => {
                    console.error("Error accessing microphone:", error);
                    alert("Could not access microphone. Please check your permissions.");
                });
        } else {
            alert("Audio recording is not supported in this browser.");
        }
    }
    
    stopAudioRecording() {
        return new Promise(resolve => {
            if (!this.state.audioRecorder) {
                console.error("No active recorder found.");
                return resolve(null);
            }
    
            // Ensure `ondataavailable` gets a chance to fire before stopping
            this.state.audioRecorder.onstop = () => {
                if (this.state.audioChunks.length === 0) {
                    console.error("No audio recorded.");
                    return resolve(null);
                }
    
                // Clear timer interval
                clearInterval(this.state.recordingInterval);
    
                // Create a Blob from recorded chunks
                const audioBlob = new Blob(this.state.audioChunks, { type: 'audio/webm' });
    
                // Create a file from the Blob
                const audioFile = new File([audioBlob], "voice_message.webm", {
                    type: 'audio/webm',
                    lastModified: new Date().getTime()
                });
    
                console.log("Audio file created:", audioFile);
    
                // Set as attachment
                this.state.attachment = {
                    file: audioFile,
                    name: "Voice message",
                    type: audioFile.type,
                    size: audioFile.size,
                    mediaType: 'audio'
                };
    
                // Clean up
                this.cleanupAudioStream();
                this.state.isRecording = false;
                this.state.audioRecorder = null;
                this.state.audioChunks = [];
    
                resolve(audioFile);
            };
    
            // Stop the recorder only if it's active
            if (this.state.audioRecorder.state !== "inactive") {
                this.state.audioRecorder.stop();
            }
        });
    }
    
    cancelAudioRecording() {
        if (!this.state.audioRecorder) return;
    
        // Clear timer
        clearInterval(this.state.recordingInterval);
    
        // Stop recording without processing data
        if (this.state.audioRecorder.state !== "inactive") {
            this.state.audioRecorder.stop();
        }
    
        // Clean up
        this.cleanupAudioStream();
        this.state.isRecording = false;
        this.state.audioRecorder = null;
        this.state.audioChunks = [];
        this.state.recordingTime = 0;
    }
    
    cleanupAudioStream() {
        if (this.state.audioStream) {
            this.state.audioStream.getTracks().forEach(track => track.stop());
            this.state.audioStream = null;
        }
    }
    
    async sendAudioMessage() {
        const audioFile = await this.stopAudioRecording();
        
        if (!audioFile) {
            console.error("No audio file to send.");
            return;
        }
    
        console.log("Sending audio file:", audioFile);
    
        // Simulate sending a message (replace with actual API call)
        this.sendMessage();
    }
    
    // Format time MM:SS
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    

    // Method to handle search input changes
    handleSearchInput(event) {
        const query = event.target.value.toLowerCase();
        this.state.searchQuery = query;
        
        if (query.trim() === "") {
            // If search is empty, show all chats
            this.state.filteredChats = [...this.state.chats];
        } else {
            // Filter chats based on search query
            this.state.filteredChats = this.state.chats.filter(chat => 
                chat.name.toLowerCase().includes(query) || 
                (chat.last_message && chat.last_message.toLowerCase().includes(query))
            );
        }
    }

    async loadChats(isLoading = true) {
        if (isLoading) this.state.loading = true;
        try {
            const newChats = await this.rpc("/live_chat/whatsapp/chats");
    
            console.log("chats-=-=-=-=-", newChats);
    
            // Ensure each chat has a valid profile picture URL or placeholder
            for (let chat of newChats) {
                if (!chat.imageUrl) {
                    chat.imageUrl = `/web/image/res.partner/${chat.id}/avatar_128`;
                }
            }
    
            // Preserve sequence while updating data
            const updatedChats = [];
            for (let i = 0; i < newChats.length; i++) {
                const newChat = newChats[i];
    
                // Find existing chat in the current state
                const existingChat = this.state.chats.find(chat => chat.id === newChat.id);

                if (existingChat) {
                    // Update existing chat data
                    Object.assign(existingChat, {...newChat, unread: newChat.unreadCount});
                    updatedChats.push(existingChat);
                } else {
                    // Add new chat
                    updatedChats.push({ ...newChat });
                }
            }
    
            // Update state while maintaining the original sequence
            this.state.chats = updatedChats;
            
            // Initialize filtered chats with all chats
            if (this.state.searchQuery.trim() === "") {
                this.state.filteredChats = [...this.state.chats];
            } else {
                // Apply current search filter
                this.handleSearchInput({ target: { value: this.state.searchQuery } });
            }
    
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
        this.state.attachmentPreview = null;

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

                    console.log("msg----",msg);
                    
                    return {
                        text: msg?.body,
                        sender: msg?.fromMe ? "me" : "them",
                        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
                        sending: msg?.status === 'sending',
                        failed: msg?.status === 'failed',
                        hasAttachment: msg?.hasMedia || false,
                        attachmentName: msg?.mediaFilename || null,
                        attachmentUrl: msg?.mediaBase64 || null,
                        attachmentType: msg?.type || null,
                        attachmentMimeType: msg?.mimetype || null
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

    // Enhanced file attachment methods
    openFileManager() {
        // Trigger click on the hidden file input
        if (this.fileInputRef.el) {
            this.fileInputRef.el.click();
        }
    }

    // Identify media type based on file MIME type
    getMediaType(mimeType) {
        if (!mimeType) return 'unknown';
        
        for (const [type, mimeTypes] of Object.entries(this.state.supportedMediaTypes)) {
            if (mimeTypes.some(mime => mimeType.startsWith(mime))) {
                return type;
            }
        }
        
        return 'document'; // Default to document for any other type
    }

    async handleFileChange(event) {
        const files = event.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            const mediaType = this.getMediaType(file.type);
            
            // Store the file in state
            this.state.attachment = {
                file: file,
                name: file.name,
                type: file.type,
                size: file.size,
                mediaType: mediaType
            };
            
            // Create preview for image files
            if (mediaType === 'image') {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.state.attachmentPreview = e.target.result;
                };
                reader.readAsDataURL(file);
            } else if (mediaType === 'video') {
                // For video, create a preview thumbnail
                try {
                    const videoPreview = await this.generateVideoThumbnail(file);
                    this.state.attachmentPreview = videoPreview;
                } catch (error) {
                    console.error("Failed to generate video thumbnail:", error);
                    this.state.attachmentPreview = null;
                }
            } else if (mediaType === 'document' && file.type === 'application/pdf') {
                // For PDF, we could use a PDF icon or the first page as thumbnail
                this.state.attachmentPreview = '/web/static/img/pdf_icon.png'; // Placeholder path
            }
        }
    }

    // Generate a thumbnail for video files
    generateVideoThumbnail(file) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                video.currentTime = 1; // Set to 1 second to get a frame
            };
            video.onloadeddata = () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const thumbnail = canvas.toDataURL('image/jpeg');
                resolve(thumbnail);
            };
            video.onerror = () => reject(new Error("Video load error"));
            video.src = URL.createObjectURL(file);
        });
    }

    removeAttachment() {
        this.state.attachment = null;
        this.state.attachmentPreview = null;
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
            formData.append('mediaType', this.state.attachment.mediaType);
            
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

// Modified sendMessage method to fix PDF document sending issues
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
        attachmentUrl: this.state.attachmentPreview, // Use preview for temporary display
        attachmentType: hasAttachment ? this.state.attachment.mediaType : null,
        attachmentMimeType: hasAttachment ? this.state.attachment.type : null
    };

    // Add to messages
    if (!this.state.messages[this.state.activeChat.id]) {
        this.state.messages[this.state.activeChat.id] = [];
    }
    this.state.messages[this.state.activeChat.id].push(tempMessage);

    // Force update messages to trigger UI refresh
    this.state.messages = { ...this.state.messages };

    // Scroll to bottom
    setTimeout(() => this.scrollToBottom(), 100);

    try {
        let result;
        
        // Handle file upload if attachment exists
        if (hasAttachment) {
            // Upload file first using existing endpoint
            const formData = new FormData();
            formData.append('file', this.state.attachment.file);
            formData.append('chatId', this.state.activeChat.chat_id);
            formData.append('mediaType', this.state.attachment.mediaType);
            
            const uploadResponse = await fetch('http://localhost:3000/upload-file', {
                method: 'POST',
                body: formData
            });
            
            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                throw new Error(`Server responded with ${uploadResponse.status}: ${errorText}`);
            }
            
            const uploadResult = await uploadResponse.json();
            
            if (!uploadResult.success || !uploadResult.data || !uploadResult.data.url) {
                throw new Error("File upload failed: " + (uploadResult.error || "Unknown error"));
            }
            
            // Now send the media message with the uploaded file URL
            let endpoint = "http://localhost:3000/send-media";
            let payload;

            if (this.state.attachment.mediaType === 'audio') {
                // Special handling for audio/voice messages
                payload = {
                    chatId: this.state.activeChat.chat_id,
                    message: messageText || " ", // WhatsApp requires at least a space for caption
                    mediaUrl: uploadResult.data.url,
                    fileName: this.state.attachment.name,
                    mediaType: 'audio',
                    mimeType: this.state.attachment.type,
                    isPtt: true // Set to true for voice messages (Push-to-Talk)
                };
            } else if (this.state.attachment.mediaType === 'document' || 
                this.state.attachment.type.includes('pdf') ||
                this.state.attachment.type.includes('msword') ||
                this.state.attachment.type.includes('openxmlformats')) {
                
                payload = {
                    chatId: this.state.activeChat.chat_id,
                    message: messageText || " ", // WhatsApp requires at least a space for caption
                    mediaUrl: uploadResult.data.url,
                    fileName: this.state.attachment.name,
                    mimeType: this.state.attachment.type
                };
            } else {
                payload = {
                    chatId: this.state.activeChat.chat_id,
                    message: messageText || " ",
                    mediaUrl: uploadResult.data.url,
                    fileName: this.state.attachment.name,
                    mediaType: this.state.attachment.mediaType,
                    mimeType: this.state.attachment.type
                };
            }
            
            console.log(`Sending ${this.state.attachment.mediaType} to ${endpoint}:`, payload);
            
            // Set request timeout to ensure real-time behavior
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const response = await fetch(endpoint, {
                method: "POST",
                body: JSON.stringify(payload),
                headers: {
                    "Content-Type": "application/json"
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server responded with ${response.status}: ${errorText}`);
            }
            
            result = await response.json();
            
            // Update attachment URL in the temp message
            const messageIndex = this.state.messages[this.state.activeChat.id]
                .findIndex(m => m.id === tempMessage.id);
                
            if (messageIndex >= 0) {
                this.state.messages[this.state.activeChat.id][messageIndex].attachmentUrl = uploadResult.data.url;
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
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server responded with ${response.status}: ${errorText}`);
            }
            
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
                    id: result.data?.id || tempMessage.id,
                    text: messageText,
                    time: messageTime,
                    sending: false,
                    failed: false,
                    attachmentUrl: result.data?.mediaUrl || tempMessage.attachmentUrl
                };
                
                // Force update messages to trigger UI refresh
                this.state.messages = { ...this.state.messages };
            }

            // Clear attachment state
            this.state.attachment = null;
            this.state.attachmentPreview = null;
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
                
                // Force update messages to trigger UI refresh
                this.state.messages = { ...this.state.messages };
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
            
            // Force update messages to trigger UI refresh
            this.state.messages = { ...this.state.messages };
        }
    }
}
}
WhatsAppChat.template = "live_chat.WhatsAppChat";
registry.category("actions").add("live_chat.dashboard", WhatsAppChat);