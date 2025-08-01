const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// In-memory storage
const users = new Map();
const messages = [];
const privateChats = new Map();

// Generate random username
function generateUsername() {
  const adjectives = ['Swift', 'Bright', 'Cool', 'Wild', 'Smart', 'Quick', 'Bold', 'Calm', 'Wise', 'Pure'];
  const nouns = ['Fox', 'Eagle', 'Tiger', 'Wolf', 'Bear', 'Lion', 'Hawk', 'Owl', 'Deer', 'Cat'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${noun}${num}`;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Assign random username
  const username = generateUsername();
  users.set(socket.id, {
    id: socket.id,
    username: username,
    joinedAt: new Date()
  });

  // Send user their info and existing messages
  socket.emit('user-assigned', {
    id: socket.id,
    username: username
  });

  // Send existing messages
  socket.emit('message-history', messages);

  // Send current users list
  socket.emit('users-list', Array.from(users.values()));

  // Notify others about new user
  socket.broadcast.emit('user-joined', {
    username: username,
    timestamp: new Date()
  });

  // Update users list for everyone
  io.emit('users-list', Array.from(users.values()));

  // Handle global messages
  socket.on('send-message', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = {
      id: Date.now(),
      username: user.username,
      text: data.text,
      timestamp: new Date(),
      type: 'global'
    };

    messages.push(message);
    
    // Keep only last 100 messages
    if (messages.length > 100) {
      messages.shift();
    }

    io.emit('new-message', message);
  });

  // Handle private message initiation
  socket.on('start-private-chat', (data) => {
    const currentUser = users.get(socket.id);
    const targetUser = users.get(data.targetUserId);
    
    if (!currentUser || !targetUser) return;

    const chatId = [socket.id, data.targetUserId].sort().join('-');
    
    if (!privateChats.has(chatId)) {
      privateChats.set(chatId, []);
    }

    // Join both users to private room
    socket.join(chatId);
    io.sockets.sockets.get(data.targetUserId)?.join(chatId);

    // Notify both users
    io.to(chatId).emit('private-chat-started', {
      chatId: chatId,
      participants: [currentUser, targetUser],
      messages: privateChats.get(chatId)
    });
  });

  // Handle private messages
  socket.on('send-private-message', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = {
      id: Date.now(),
      username: user.username,
      text: data.text,
      timestamp: new Date(),
      type: 'private',
      chatId: data.chatId
    };

    const chatMessages = privateChats.get(data.chatId) || [];
    chatMessages.push(message);
    privateChats.set(data.chatId, chatMessages);

    io.to(data.chatId).emit('new-private-message', message);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      
      // Notify others about user leaving
      socket.broadcast.emit('user-left', {
        username: user.username,
        timestamp: new Date()
      });

      // Update users list
      io.emit('users-list', Array.from(users.values()));
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});