const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();
const chatHistory = new Map();

io.on('connection', (socket) => {
    let username = '';
    let currentRoom = '';
    let recipient = '';

    socket.on('login', (user) => {
        if (users.has(user)) {
            socket.emit('loginError', 'Username is already taken. Please choose another one');
        } else {
            username = user;
            users.set(username, socket.id);
            io.emit('userJoined', `${username} has joined the chat.`);
            io.emit('userCount', users.size);
        }
    });

    socket.on('typing', (isTyping) => {
        if (currentRoom) {
            socket.to(currentRoom).emit('typing', { username, isTyping });
        } else if (recipient) {
            const recipientSocketId = users.get(recipient);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('typing', { username, isTyping });
            }
        }
    });

    socket.on('privateChat', (rec) => {
        recipient = rec.trim();
        if (users.has(recipient)) {
            const recipientSocketId = users.get(recipient);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('privateMessage', { message: `You are now chatting privately with ${username}`, sender: 'System' });
            }
        } else {
            socket.emit('privateChatError', `User ${recipient} not found.`);
        }
    });

    socket.on('joinRoom', (roomName) => {
        if (currentRoom) {
            socket.leave(currentRoom);
        }
        socket.join(roomName);
        currentRoom = roomName;

        if (chatHistory.has(currentRoom)) {
            const messageHistory = chatHistory.get(currentRoom);
            socket.emit('messageHistory', messageHistory);
        }
    });

    socket.on('chatMessage', ({ message, isImage = false, fileType = '', fileUrl = '' }) => {
        if (currentRoom) {
            const uniqueMessage = { user: username, message, isImage, fileType, fileUrl };
            if (!chatHistory.has(currentRoom)) {
                chatHistory.set(currentRoom, []);
            }
            const roomHistory = chatHistory.get(currentRoom);

            // Prevent adding the same message twice
            if (!roomHistory.some(msg => msg.message === uniqueMessage.message)) {
                roomHistory.push(uniqueMessage);
                io.to(currentRoom).emit('chatMessage', uniqueMessage);
            }
        }
    });

    socket.on('privateMessage', ({ message, recipient, isImage = false, fileType = '', fileUrl = '' }) => {
        const recipientSocketId = users.get(recipient);
        const senderSocketId = users.get(username);
        const uniqueMessage = { message, sender: username, isImage, fileType, fileUrl };

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('privateMessage', uniqueMessage);
            io.to(senderSocketId).emit('privateMessage', uniqueMessage);
        } else {
            socket.emit('privateChatError', `User ${recipient} not found.`);
        }
    });

    socket.on('disconnect', () => {
        users.delete(username);
        io.emit('userLeft', `${username} has left the chat.`);
        io.emit('userCount', users.size);
    });
});

server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
