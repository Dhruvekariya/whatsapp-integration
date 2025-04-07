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
            showLogoutModal: false,
            isAuthenticated: false,
            qrCode: null,
            connectionStatus: 'disconnected', // 'disconnected', 'connecting', 'connected', 'failed'
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
            showMediaViewer: false,
            viewedMedia: {
                url: null,
                type: null,
                name: null,
                mimeType: null
            },
            showProfilePicViewer: false,
            viewedProfilePic: {
                url: null,
                name: null
            },
            audioRecorder: null,
            audioChunks: [],
            recordingInterval: null,
            emojiPickerOpen: false,
            emojiCategories: [
                {
                    name: "😀",
                    emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "😎", "🤓", "🧐", "😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️"]
                  },
                  {
                    name: "👦",
                    emojis: ["👋", "🤚", "✋", "🖐️", "👌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🦷", "🦴", "👀", "👁️", "👅", "👄", "💋", "👶", "🧒", "👦", "👧", "🧑", "👱", "👨", "🧔", "👨‍🦰", "👨‍🦱", "👨‍🦳", "👨‍🦲", "👩", "👩‍🦰", "🧑‍🦰", "👩‍🦱", "🧑‍🦱", "👩‍🦳", "🧑‍🦳", "👩‍🦲", "🧑‍🦲", "👱‍♀️", "👱‍♂️"]
                  },
                  {
                    name: "🥼",
                    emojis: ["🧳", "🌂", "☂️", "🧵", "🧶", "👓", "🕶️", "🥽", "🥼", "🦺", "👔", "👕", "👖", "🧣", "🧤", "🧥", "🧦", "👗", "👘", "🥻", "🩱", "🩲", "🩳", "👙", "👚", "👛", "👜", "👝", "🎒", "👞", "👟", "🥾", "🥿", "👠", "👡", "🩰", "👢", "👑", "👒", "🎩", "🎓", "🧢", "⛑️", "💄", "💍", "💼"]
                  },
                  {
                    name: "🦁",
                    emojis: ["🐵", "🐒", "🦍", "🦧", "🐶", "🐕", "🦮", "🐕‍🦺", "🐩", "🐺", "🦊", "🦝", "🐱", "🐈", "🐈‍⬛", "🦁", "🐯", "🐅", "🐆", "🐴", "🐎", "🦄", "🦓", "🦌", "🐮", "🐂", "🐃", "🐄", "🐷", "🐖", "🐗", "🐽", "🐏", "🐑", "🐐", "🐪", "🐫", "🦙", "🦒", "🐘", "🦏", "🦛", "🐭", "🐁", "🐀", "🐹", "🐰", "🐇", "🐿️", "🦔", "🦇", "🐻", "🐻‍❄️", "🐨", "🐼", "🦥", "🦦", "🦨", "🦘"]
                  },
                  {
                    name: "🍹",
                    emojis: ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🌽", "🥕", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔", "🍟", "🍕", "🥪", "🥙", "🧆", "🌮", "🌯", "🥗", "🥘", "🥫", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰", "🥜", "🍯", "🥛", "🍼", "☕", "🍵", "🧃", "🥤", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🧉", "🍾", "🧊"]
                  },
                  {
                    name: "🚔",
                    emojis: ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🚚", "🚛", "🚜", "🦯", "🦽", "🦼", "🛴", "🚲", "🛵", "🏍️", "🛺", "🚨", "🚔", "🚍", "🚘", "🚖", "🚡", "🚠", "🚟", "🚃", "🚋", "🚞", "🚝", "🚄", "🚅", "🚈", "🚂", "🚆", "🚇", "🚊", "🚉", "🛫", "🛬", "🛩️", "🛰️", "🚀", "🛸", "🚁", "🛶", "⛵", "🚤", "🛥️", "🛳️", "🚢", "⚓", "🚧", "🚦", "🚥", "🚏", "🗺️", "🗿", "🗽", "🗼", "🏰", "🏯", "🏟️", "🎡", "🎢", "🎠", "⛲", "🏖️", "🏝️", "🏜️", "🌋", "⛰️", "🏔️", "🗻"]
                  },
                  {
                    name: "⚽",
                    emojis: ["⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🥅", "⛳", "🪁", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛼", "🛷", "⛸️", "🥌", "🎿", "⛷️", "🏂", "🪂", "🏋️", "🏋️‍♀️", "🏋️‍♂️", "🤼", "🤼‍♀️", "🤼‍♂️", "🤸", "🤸‍♀️", "🤸‍♂️", "⛹️", "⛹️‍♀️", "⛹️‍♂️", "🤺", "🤾", "🤾‍♀️", "🤾‍♂️", "🏌️", "🏌️‍♀️", "🏌️‍♂️", "🏇", "🧘", "🧘‍♀️", "🧘‍♂️", "🏄", "🏄‍♀️", "🏄‍♂️", "🏊", "🏊‍♀️", "🏊‍♂️", "🤽", "🤽‍♀️", "🤽‍♂️", "🚣", "🚣‍♀️", "🚣‍♂️", "🧗", "🧗‍♀️", "🧗‍♂️", "🚵", "🚵‍♀️", "🚵‍♂️", "🚴", "🚴‍♀️", "🚴‍♂️", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "🏵️", "🎗️", "🎫", "🎟️", "🎪", "🤹", "🤹‍♀️", "🤹‍♂️", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🎷", "🎺", "🎸", "🪕", "🎻", "🎲", "♟️", "🎯", "🎳", "🎮", "🎰", "🧩"]
                  },
                  {
                    name: "🔮",
                    emojis: ["🎭", "🖼️", "🎨", "🧵", "🧶", "🔮", "🧿", "🧸", "🪆", "🖼️", "🧩", "🎮", "🎲", "🎯", "🎪", "🎭", "🎨", "🧵", "🧶", "🔮", "🧿", "🧸", "🪆", "🎬", "🎥", "📷", "📹", "🎦", "📱", "📲", "☎️", "📞", "📟", "📠", "🔋", "🔌", "💻", "🖥️", "🖨️", "⌨️", "🖱️", "🖲️", "💽", "💾", "💿", "📀", "🧮", "🎥", "🎞️", "📽️", "🎬", "📺", "📷", "📸", "📹", "📼", "🔍", "🔎", "🕯️", "💡", "🔦", "🏮", "📔", "📕", "📖", "📗", "📘", "📙", "📚", "📓", "📒", "📃", "📜", "📄", "📰", "🗞️", "📑", "🔖", "🏷️", "💰", "💴", "💵", "💶", "💷", "💸", "💳", "🧾", "✉️", "📧", "📨", "📩", "📤", "📥", "📦", "📫", "📪", "📬", "📭", "📮", "🗳️", "✏️", "✒️", "🖋️", "🖊️", "🖌️", "🖍️", "📝", "💼", "📁", "📂", "🗂️", "📅", "📆", "🗒️", "🗓️", "📇", "📈", "📉", "📊", "📋", "📌", "📍", "📎", "🖇️", "📏", "📐", "✂️", "🗃️", "🗄️", "🗑️"]
                  },
                  {
                    name: "⚠️",
                    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️", "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓", "🆔", "⚛️", "🉑", "☢️", "☣️", "📴", "📳", "🈶", "🈚", "🈸", "🈺", "🈷️", "✴️", "🆚", "💮", "🉐", "㊙️", "㊗️", "🈴", "🈵", "🈹", "🈲", "🅰️", "🅱️", "🆎", "🆑", "🅾️", "🆘", "❌", "⭕", "🛑", "⛔", "📛", "🚫", "💯", "💢", "♨️", "🚷", "🚯", "🚳", "🚱", "🔞", "📵", "🚭", "❗", "❕", "❓", "❔", "‼️", "⁉️", "🔅", "🔆", "〽️", "⚠️", "🚸", "🔱", "⚜️", "🔰", "♻️", "✅", "🈯", "💹", "❇️", "✳️", "❎", "🌐", "💠", "Ⓜ️", "🌀", "💤", "🏧", "🚾", "♿", "🅿️", "🈳", "🈂️", "🛂", "🛃", "🛄", "🛅", "🛗", "🚹", "🚺", "🚼", "⚧", "🚻", "🚮", "🎦", "📶", "🈁", "🔣", "ℹ️", "🔤", "🔡", "🔠", "🆖", "🆗", "🆙", "🆒", "🆕", "🆓", "0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟", "🔢", "#️⃣", "*️⃣", "⏏️", "▶️", "⏸️", "⏯️", "⏹️", "⏺️", "⏭️", "⏮️", "⏩", "⏪", "⏫", "⏬", "◀️", "🔼", "🔽", "➡️", "⬅️", "⬆️", "⬇️", "↗️", "↘️", "↙️", "↖️", "↕️", "↔️", "↪️", "↩️", "⤴️", "⤵️", "🔀", "🔁", "🔂", "🔄", "🔃", "🎵", "🎶", "➕", "➖", "➗", "✖️", "♾️", "💲", "💱", "™️", "©️", "®️", "〰️", "➰", "➿", "🔚", "🔙", "🔛", "🔝", "🔜", "✔️", "☑️", "🔘", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "🔺", "🔻", "🔸", "🔹", "🔶", "🔷", "🔳", "🔲", "▪️", "▫️", "◾", "◽", "◼️", "◻️", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "⬛", "⬜", "🟫", "🔈", "🔇", "🔉", "🔊", "🔔", "🔕", "📣", "📢", "💬", "💭", "🗯️", "♠️", "♣️", "♥️", "♦️", "🃏", "🎴", "🀄"]
                  },
                  {
                    name: "🏴‍☠️",
                    emojis: ["🏳️", "🏴", "🏴‍☠️", "🏁", "🚩", "🏳️‍🌈", "🏳️‍⚧️", "🇦🇫", "🇦🇽", "🇦🇱", "🇩🇿", "🇦🇸", "🇦🇩", "🇦🇴", "🇦🇮", "🇦🇶", "🇦🇬", "🇦🇷", "🇦🇲", "🇦🇼", "🇦🇺", "🇦🇹", "🇦🇿", "🇧🇸", "🇧🇭", "🇧🇩", "🇧🇧", "🇧🇾", "🇧🇪", "🇧🇿", "🇧🇯", "🇧🇲", "🇧🇹", "🇧🇴", "🇧🇦", "🇧🇼", "🇧🇷", "🇮🇴", "🇻🇬", "🇧🇳", "🇧🇬", "🇧🇫", "🇧🇮", "🇰🇭", "🇨🇲", "🇨🇦", "🇮🇨", "🇨🇻", "🇧🇶", "🇰🇾", "🇨🇫", "🇹🇩", "🇨🇱", "🇨🇳", "🇨🇽", "🇨🇨", "🇨🇴", "🇰🇲", "🇨🇬", "🇨🇩", "🇨🇰", "🇨🇷", "🇨🇮", "🇭🇷", "🇨🇺", "🇨🇼", "🇨🇾", "🇨🇿", "🇩🇰", "🇩🇯", "🇩🇲", "🇩🇴", "🇪🇨", "🇪🇬", "🇸🇻", "🇬🇶", "🇪🇷", "🇪🇪", "🇪🇹", "🇪🇺", "🇫🇰", "🇫🇴", "🇫🇯", "🇫🇮", "🇫🇷", "🇬🇫", "🇵🇫", "🇹🇫", "🇬🇦", "🇬🇲", "🇬🇪", "🇩🇪", "🇬🇭", "🇬🇮", "🇬🇷", "🇬🇱", "🇬🇩", "🇬🇵", "🇬🇺", "🇬🇹", "🇬🇬", "🇬🇳", "🇬🇼", "🇬🇾"]
                  }
            ],
            currentEmojiCategory: 0
        });

        this.rpc = useService("rpc");
        this.messageListRef = useRef("messageList");
        this.fileInputRef = useRef("fileInput");
        this.mediaPreviewRef = useRef("mediaPreview");
        this.messageInputRef = useRef("messageInput");

        onMounted(async () => {
            await this.checkConnectionStatus();
            this.setupWebSocket();
            this.loadChats();
        });

        onWillUnmount(() => {
            if (this.ws) {
                this.ws.close();
            }
        });
    }
// Add these methods to your component
showLogoutConfirmation() {
    this.state.showLogoutModal = true;
}
// Add this method to your component
viewMedia(media) {
    this.state.viewedMedia = {
        url: media.url,
        type: media.type,
        name: media.name || 'Media',
        mimeType: media.mimeType
    };
    this.state.showMediaViewer = true;
}

viewProfilePicture(profilePicUrl, name) {
    this.state.viewedProfilePic = {
        url: profilePicUrl,
        name: name
    };
    this.state.showProfilePicViewer = true;
}

closeProfilePicViewer() {
    this.state.showProfilePicViewer = false;
}

async logout() {
    try {
        this.state.showLogoutModal = false;
        this.state.loading = true;
        
        const response = await fetch('http://localhost:3000/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Reset all chat state
            this.state.isAuthenticated = false;
            this.state.chats = [];
            this.state.messages = {};
            this.state.activeChat = null;
            this.state.qrCode = null;
            this.state.connectionStatus = 'disconnected';
            
            // Force a new QR code generation
            await fetch('http://localhost:3000/restart-client', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            // Reconnect WebSocket to get new QR code
            if (this.ws) {
                this.ws.close();
            }
            this.setupWebSocket();
        } else {
            console.error("Logout failed:", result.message);
        }
    } catch (error) {
        console.error("Error during logout:", error);
    } finally {
        this.state.loading = false;
    }
}

async regenerateQR() {
    try {
        this.state.loading = true;
        this.state.isAuthenticated = false;
        this.state.qrCode = null;
        this.state.connectionStatus = 'connecting';
        
        // Force a new QR code generation
        const response = await fetch('http://localhost:3000/restart-client', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Reconnect WebSocket to get new QR code
            if (this.ws) {
                this.ws.close();
            }
            this.setupWebSocket();
        }
    } catch (error) {
        console.error("Error regenerating QR:", error);
    } finally {
        this.state.loading = false;
    }
}

    async checkConnectionStatus() {
        try {
            const response = await fetch('http://localhost:3000/status');
            const data = await response.json();
            
            if (data.success && data.data.authenticated) {
                this.state.isAuthenticated = true;
                this.state.connectionStatus = 'connected';
            } else if (data.success && data.data.state === 'connecting') {
                this.state.connectionStatus = 'connecting';
                // If we have a QR code, show it
                if (data.data.qrCode) {
                    this.state.qrCode = data.data.qrCode;
                }
            } else {
                this.state.connectionStatus = 'disconnected';
            }
        } catch (error) {
            console.error("Error checking connection status:", error);
            this.state.connectionStatus = 'failed';
        }
    }

    setupWebSocket() {
        this.ws = new WebSocket("ws://localhost:3000");
        
        this.ws.onopen = () => {
            console.log("WebSocket connection established");
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'qrCode') {
                this.state.qrCode = data.qrCode;
                this.state.connectionStatus = 'connecting';
            } 
            else if (data.type === 'whatsappReady') {
                setTimeout(() => {
                    this.state.isAuthenticated = true;
                    this.state.connectionStatus = 'connected';
                    this.loadChats();
                    
                    // Clear any existing QR code
                    this.state.qrCode = null;
                }, 5000);
            }
            else if (data.type === 'disconnected') {
                this.state.isAuthenticated = false;
                this.state.connectionStatus = 'disconnected';
                this.state.qrCode = null;
            }
            else if (data.type === 'authFailure') {
                this.state.isAuthenticated = false;
                this.state.connectionStatus = 'failed';
                this.state.qrCode = null;
            }
            else if (data.type === "newMessage") {
                console.log("Received message type:", data);
        
                const chatId = data.from;
        
                // Update the chat list with the new message
                this.updateChatOnNewMessage(chatId, data );
                if (this.state.activeChat && this.state.activeChat.chat_id === chatId) {
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
                        last_message_type: data.attachmentType || null,
                        attachmentName: data.attachmentName || null,
                        attachmentUrl: data.attachmentUrl || null,
                        attachmentMimeType: data.attachmentMimeType || null
                    };

                    if (data.hasAttachment) {
                        if (data.attachmentType === "image" && !data.body) {
                            newMessage.text = null;
                        } else if (data.attachmentType === "image" && data.body) {
                            newMessage.text = data.body;
                        } else if (data.attachmentType === "video") {
                            newMessage.videoPreview = true;
                        } else if (data.attachmentType === "document" && data.attachmentMimeType.includes("pdf")) {
                            newMessage.showPdfPreview = true;
                        }
                    }

                    if (!this.state.messages[this.state.activeChat.id]) {
                        this.state.messages[this.state.activeChat.id] = [];
                    }

                    this.state.messages[this.state.activeChat.id].push(newMessage);
                    this.state.messages = { ...this.state.messages };
                    setTimeout(() => this.scrollToBottom(), 100);
                }
            }
        };
        
        this.ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            this.state.connectionStatus = 'failed';
        };
        
        this.ws.onclose = () => {
            console.log("WebSocket connection closed");
        };
    }
        // Add this method to toggle emoji picker
        toggleEmojiPicker() {
            this.state.emojiPickerOpen = !this.state.emojiPickerOpen;
        }
    
        // Add method to change emoji category
        changeEmojiCategory(index) {
            this.state.currentEmojiCategory = index;
        }
    
        // Add method to insert emoji at cursor position
        insertEmoji(emoji) {
            // Get input element and current cursor position
            const input = this.messageInputRef.el;
            const cursorPos = input.selectionStart;
            
            // Get text before and after cursor
            const textBefore = this.state.newMessage.substring(0, cursorPos);
            const textAfter = this.state.newMessage.substring(cursorPos);
            
            // Insert emoji at cursor position
            this.state.newMessage = textBefore + emoji + textAfter;
            
            // Close emoji picker if needed
            // Uncomment next line if you want to close picker after selection
            // this.state.emojiPickerOpen = false;
            
            // Focus back on the input and set cursor after the inserted emoji
            setTimeout(() => {
                input.focus();
                const newCursorPos = cursorPos + emoji.length;
                input.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
        }
    
        // Your existing methods...
    
        handleKeyDown(event) {
            // Send message on Enter (but not with Shift+Enter for new line)
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                this.sendMessage();
            }
            // Close emoji picker on Escape key
            else if (event.key === "Escape" && this.state.emojiPickerOpen) {
                this.state.emojiPickerOpen = false;
            }
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

    updateChatOnNewMessage(chatId, lastMessage) {
        // Find the chat that received the message
        const chatIndex = this.state.chats.findIndex(chat => chat.chat_id === chatId);
        
        if (chatIndex >= 0) {
            // Create new arrays to maintain immutability
            const updatedChats = [...this.state.chats];
            const updatedChat = {...updatedChats[chatIndex]};
            
            // Update the chat's last message and timestamp
            updatedChat.last_message = lastMessage?.body;
            updatedChat.last_message_type = lastMessage?.attachmentType || "chat";
            updatedChat.timestamp = Math.floor(Date.now() / 1000);
            
            // Only increment unread if this isn't the active chat
            if (!this.state.activeChat || this.state.activeChat.chat_id !== chatId) {
                updatedChat.unread = (updatedChat.unread || 0) + 1;
            }
            
            // Move to top if not already first
            if (chatIndex > 0) {
                updatedChats.splice(chatIndex, 1);
                updatedChats.unshift(updatedChat);
            } else {
                updatedChats[0] = updatedChat;
            }
            
            // Update state
            this.state.chats = updatedChats;
            
            // Also update filtered chats if search is active
            if (this.state.searchQuery.trim() !== "") {
                this.handleSearchInput({ target: { value: this.state.searchQuery } });
            } else {
                // Ensure filtered chats are in sync when no search is active
                this.state.filteredChats = [...updatedChats];
            }
        } else {
            // If this is a completely new chat, load it
            this.loadChats(false);
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
        // Mark all messages as read by resetting unread count
        this.state.chats = this.state.chats.map(c => ({
            ...c,
            isActive: c.id === chat.id,
            unread: c.id === chat.id ? 0 : c.unread // Reset unread count for active chat
        }));
    
        // Update filtered chats to reflect unread count changes
        if (this.state.searchQuery.trim() !== "") {
            this.handleSearchInput({ target: { value: this.state.searchQuery } });
        }
    
        // Set the active chat
        this.state.activeChat = chat;
        
        // Clear any existing attachment when switching chats
        this.state.attachment = null;
        this.state.attachmentPreview = null;
    
        // Always refresh messages when selecting a chat
        try {
            const response = await fetch(`http://localhost:3000/get-messages/${chat.chat_id}`, {
                method: 'GET'
            });
    
            let messagesData = await response.json();
            
            if (messagesData?.data?.messages) {
                // Process and format messages
                const formattedMessages = messagesData.data.messages.map(msg => {
                    const timestamp = msg?.timestamp ? msg.timestamp * 1000 : Date.now();
                    const date = new Date(timestamp);
                    
                    return {
                        id: msg?.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        text: msg?.body,
                        sender: msg?.fromMe ? "me" : "them",
                        senderName: msg?.senderName || (msg?.fromMe ? "Me" : "Contact"),
                        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
                        timestamp: timestamp,
                        sending: msg?.status === 'sending',
                        delivered: msg?.status === 'delivered',
                        read: msg?.status === 'read',
                        failed: msg?.status === 'failed',
                        hasAttachment: msg?.hasMedia || false,
                        attachmentName: msg?.mediaFilename || null,
                        attachmentUrl: msg?.mediaBase64 || null,
                        attachmentType: msg?.type || null,
                        attachmentMimeType: msg?.mimetype || null
                    };
                });
    
                // Update messages in state
                this.state.messages = {
                    ...this.state.messages,
                    [chat.id]: formattedMessages
                };
    
                // Update last message in chat list to ensure consistency
                if (formattedMessages.length > 0) {
                    const lastMessage = formattedMessages[formattedMessages.length - 1];
                    this.state.chats = this.state.chats.map(c => {
                        if (c.id === chat.id) {
                            return {
                                ...c,
                                last_message: lastMessage.text || (lastMessage.hasAttachment ? `[${lastMessage.attachmentType}]` : ''),
                                timestamp: lastMessage.timestamp
                            };
                        }
                        return c;
                    });
                }
            }
    
            // Scroll to bottom after messages are loaded
            setTimeout(() => this.scrollToBottom(), 100);
        } catch (error) {
            console.error("Error loading messages:", error);
            // Fallback to existing messages if available
            if (!this.state.messages[chat.id]) {
                this.state.messages[chat.id] = [];
            }
        }
    }

    scrollToBottom() {
        if (this.messageListRef.el) {
            this.messageListRef.el.scrollTop = this.messageListRef.el.scrollHeight;
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
        hasAttachment: hasAttachment,
        attachmentName: hasAttachment ? this.state.attachment.name : null,
        attachmentUrl: this.state.attachmentPreview, // Use preview for temporary display
        attachmentType: hasAttachment ? this.state.attachment.mediaType : null,
        attachmentMimeType: hasAttachment ? this.state.attachment.type : null,
        delivered: false  // Use this for tracking instead of 'sending' 
    };

    // Add to messages

    if (!this.state.messages[this.state.activeChat.id]) {
        this.state.messages[this.state.activeChat.id] = [];
    }
    this.state.messages[this.state.activeChat.id].push(tempMessage);

    // Reactive update 
    this.state.messages = { ...this.state.messages };
     // Clear input
     this.state.newMessage = "";

    // Scroll to bottom smoothly
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
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            result = await response.json();
        }

        
        // Update message status in real-time
        const chatMessages = this.state.messages[this.state.activeChat.id];
        const messageIndex = chatMessages.findIndex(m => m.id === tempMessage.id);
        if (result && result.success) {
            const chatMessages = this.state.messages[this.state.activeChat.id];
            const messageIndex = chatMessages.findIndex(m => m.id === tempMessage.id);

            if (messageIndex >= 0) {
                const updatedMessages = [...chatMessages];
                chatMessages[messageIndex] = {
                    ...chatMessages[messageIndex],
                    id: result.data?.id || tempMessage.id,
                    serverMessageId: result.data?.id,
                };
                
                // Update state with the new messages array
                this.state.messages[this.state.activeChat.id] = updatedMessages;
                this.state.messages = { ...this.state.messages };   

                // Clear attachment state
                this.resetAttachmentState();
            }
          } else {
            this.handleMessageSendFailure(tempMessage);
        }
    } catch (error) {
        console.error("Message send error:", error);
        // Optionally remove the message or mark as failed
        const chatMessages = this.state.messages[this.state.activeChat.id];
        const messageIndex = chatMessages.findIndex(m => m.id === newMessage.id);
        
        if (messageIndex >= 0) {
            chatMessages.splice(messageIndex, 1);
            this.state.messages[this.state.activeChat.id] = chatMessages;
            this.state.messages = { ...this.state.messages };
        }
    }
}
    

// Simplified reset method
resetAttachmentState() {
    this.state.attachment = null;
    this.state.attachmentPreview = null;
    
    // Reset file input if exists
    if (this.fileInputRef && this.fileInputRef.current) {
        this.fileInputRef.current.value = null;
    }
}
}
// Helper method to handle message send failure
// Updated failure handler with more robust error management
// Simplified failure handler

WhatsAppChat.template = "live_chat.WhatsAppChat";
registry.category("actions").add("live_chat.dashboard", WhatsAppChat);