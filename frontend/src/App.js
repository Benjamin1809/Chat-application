import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:3001');

function App() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [privateChats, setPrivateChats] = useState(new Map());
  const [activeChat, setActiveChat] = useState('global');
  const [notifications, setNotifications] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, privateChats]);

  useEffect(() => {
    // Socket event listeners
    socket.on('user-assigned', (userData) => {
      setUser(userData);
    });

    socket.on('message-history', (history) => {
      setMessages(history);
    });

    socket.on('users-list', (usersList) => {
      setUsers(usersList);
    });

    socket.on('user-joined', (data) => {
      addNotification(`${data.username} joined the chat`, 'info');
    });

    socket.on('user-left', (data) => {
      addNotification(`${data.username} left the chat`, 'info');
    });

    socket.on('new-message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    socket.on('private-chat-started', (data) => {
      setPrivateChats(prev => {
        const newChats = new Map(prev);
        newChats.set(data.chatId, {
          participants: data.participants,
          messages: data.messages
        });
        return newChats;
      });
      
      const otherParticipant = data.participants.find(p => p.id !== user?.id);
      addNotification(`Private chat started with ${otherParticipant?.username}`, 'success');
      setActiveChat(data.chatId);
    });

    socket.on('new-private-message', (message) => {
      setPrivateChats(prev => {
        const newChats = new Map(prev);
        const chat = newChats.get(message.chatId);
        if (chat) {
          chat.messages = [...chat.messages, message];
          newChats.set(message.chatId, chat);
        }
        return newChats;
      });
    });

    return () => {
      socket.off('user-assigned');
      socket.off('message-history');
      socket.off('users-list');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('new-message');
      socket.off('private-chat-started');
      socket.off('new-private-message');
    };
  }, [user]);

  const addNotification = (text, type) => {
    const notification = {
      id: Date.now(),
      text,
      type,
      timestamp: new Date()
    };
    
    setNotifications(prev => [...prev, notification]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 5000);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    if (activeChat === 'global') {
      socket.emit('send-message', { text: newMessage });
    } else {
      socket.emit('send-private-message', { 
        text: newMessage, 
        chatId: activeChat 
      });
    }
    
    setNewMessage('');
  };

  const startPrivateChat = (targetUser) => {
    socket.emit('start-private-chat', { targetUserId: targetUser.id });
  };

  const getCurrentMessages = () => {
    if (activeChat === 'global') {
      return messages;
    }
    return privateChats.get(activeChat)?.messages || [];
  };

  const getCurrentChatTitle = () => {
    if (activeChat === 'global') {
      return 'Global Chat';
    }
    const chat = privateChats.get(activeChat);
    if (chat) {
      const otherParticipant = chat.participants.find(p => p.id !== user?.id);
      return `Private chat with ${otherParticipant?.username}`;
    }
    return 'Chat';
  };

  if (!user) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Connecting...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Notifications */}
      <div className="notifications">
        {notifications.map(notification => (
          <div key={notification.id} className={`notification notification-${notification.type}`}>
            {notification.text}
          </div>
        ))}
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        <div className="user-info">
          <div className="avatar">{user.username.charAt(0)}</div>
          <span className="username">{user.username}</span>
        </div>

        <div className="chat-tabs">
          <button 
            className={`tab ${activeChat === 'global' ? 'active' : ''}`}
            onClick={() => setActiveChat('global')}
          >
            Global Chat
          </button>
          {Array.from(privateChats.entries()).map(([chatId, chat]) => {
            const otherParticipant = chat.participants.find(p => p.id !== user.id);
            return (
              <button 
                key={chatId}
                className={`tab ${activeChat === chatId ? 'active' : ''}`}
                onClick={() => setActiveChat(chatId)}
              >
                {otherParticipant?.username}
              </button>
            );
          })}
        </div>

        <div className="users-section">
          <h3>Active Users ({users.length})</h3>
          <div className="users-list">
            {users.map(u => (
              <div key={u.id} className="user-item">
                <div className="avatar small">{u.username.charAt(0)}</div>
                <span className="username">{u.username}</span>
                {u.id !== user.id && (
                  <button 
                    className="chat-btn"
                    onClick={() => startPrivateChat(u)}
                    title="Start private chat"
                  >
                    💬
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat */}
      <div className="main-chat">
        <div className="chat-header">
          <h2>{getCurrentChatTitle()}</h2>
        </div>

        <div className="messages-container">
          {getCurrentMessages().map(message => (
            <div key={message.id} className={`message ${message.username === user.username ? 'own' : ''}`}>
              <div className="message-header">
                <span className="message-username">{message.username}</span>
                <span className="message-time">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="message-text">{message.text}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form className="message-form" onSubmit={sendMessage}>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="message-input"
            maxLength={500}
          />
          <button type="submit" className="send-btn" disabled={!newMessage.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
