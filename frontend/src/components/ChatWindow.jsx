import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { listMessages } from '../api/messages.js';
import { MessageBubble } from './MessageBubble.jsx';
import { MessageInput } from './MessageInput.jsx';

const conversationTitle = (conversation, currentUserId) => {
  if (conversation.type === 'group') return conversation.group?.name || 'Group';
  return conversation.participants.find((p) => p._id !== currentUserId)?.name || 'Unknown user';
};

export const ChatWindow = ({ conversation }) => {
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const [messages, setMessages] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [sendError, setSendError] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // History (REST) + room membership (socket) both reset whenever the
  // active conversation changes - and the previous room is explicitly left,
  // or this socket would keep receiving new_message for every conversation
  // it ever opened, not just the current one.
  useEffect(() => {
    if (!conversation || !socket) return;

    let cancelled = false;
    setIsLoadingHistory(true);
    setMessages([]);

    listMessages(conversation._id).then((data) => {
      if (!cancelled) {
        setMessages(data.messages);
        setIsLoadingHistory(false);
      }
    });

    socket.emit('join_conversation', { conversationId: conversation._id });

    return () => {
      cancelled = true;
      socket.emit('leave_conversation', { conversationId: conversation._id });
    };
  }, [conversation, socket]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      if (message.conversation !== conversation._id) return;
      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) return prev; // idempotent retry - already have it
        return [...prev, message];
      });
    };

    const handleEdited = (message) => {
      setMessages((prev) => prev.map((m) => (m._id === message._id ? message : m)));
    };

    const handleDeleted = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, isDeleted: true, content: '' } : m))
      );
    };

    socket.on('new_message', handleNewMessage);
    socket.on('message_edited', handleEdited);
    socket.on('message_deleted', handleDeleted);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_edited', handleEdited);
      socket.off('message_deleted', handleDeleted);
    };
  }, [socket, conversation]);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const handleSend = (content) => {
    setSendError('');
    socket.emit('send_message', { conversationId: conversation._id, content }, (ack) => {
      if (!ack.success) {
        setSendError(ack.message || 'Message failed to send.');
      }
    });
  };

  if (!conversation) {
    return <div className="chat-window empty-state">Select a conversation to start chatting.</div>;
  }

  return (
    <div className="chat-window">
      <header className="chat-header">
        <h2>{conversationTitle(conversation, user._id)}</h2>
        {!isConnected && <span className="connection-warning">Reconnecting...</span>}
      </header>

      <div className="message-list">
        {isLoadingHistory && <div className="centered-message">Loading messages...</div>}
        {!isLoadingHistory && messages.length === 0 && (
          <div className="centered-message">No messages yet - say hello!</div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message._id} message={message} isOwnMessage={message.sender?._id === user._id} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {sendError && <div className="error-banner">{sendError}</div>}
      <MessageInput onSend={handleSend} disabled={!isConnected} />
    </div>
  );
};
