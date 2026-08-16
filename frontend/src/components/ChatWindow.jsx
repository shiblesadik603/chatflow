import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { listMessages } from '../api/messages.js';
import { MessageBubble } from './MessageBubble.jsx';
import { MessageInput } from './MessageInput.jsx';
import { GroupInfoPanel } from './GroupInfoPanel.jsx';

const conversationTitle = (conversation, currentUserId) => {
  if (conversation.type === 'group') return conversation.group?.name || 'Group';
  return conversation.participants.find((p) => p._id !== currentUserId)?.name || 'Unknown user';
};

const TYPING_STOP_DELAY = 2000;

export const ChatWindow = ({ conversation, onConversationsChanged, onLeftConversation }) => {
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const [messages, setMessages] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [sendError, setSendError] = useState('');
  const [typingUserIds, setTypingUserIds] = useState([]);
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const messagesEndRef = useRef(null);
  // Tracks whether *this* client has already told the room it's typing, so
  // typing_start only fires once per burst of keystrokes instead of on
  // every single one - typing_stop fires after a pause or on send.
  const isTypingRef = useRef(false);
  const typingStopTimerRef = useRef(null);

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
    setTypingUserIds([]);
    isTypingRef.current = false;
    clearTimeout(typingStopTimerRef.current);

    listMessages(conversation._id).then((data) => {
      if (!cancelled) {
        setMessages(data.messages);
        setIsLoadingHistory(false);
        // The conversation is open right now, so anything unread as of this
        // history fetch counts as read immediately - matches "opening a
        // chat" rather than per-message scroll tracking (messageService's
        // markConversationRead does the same batch-by-open semantics).
        socket.emit('message_read', { conversationId: conversation._id });
      }
    });

    socket.emit('join_conversation', { conversationId: conversation._id });

    return () => {
      cancelled = true;
      socket.emit('leave_conversation', { conversationId: conversation._id });
      // A leftover typing_start with no matching stop would leave the other
      // participant staring at "typing..." forever if the sender switches
      // conversations mid-keystroke.
      if (isTypingRef.current) {
        socket.emit('typing_stop', { conversationId: conversation._id });
      }
    };
  }, [conversation, socket]);

  useEffect(() => {
    if (!socket || !conversation) return;

    const handleNewMessage = (message) => {
      if (message.conversation !== conversation._id) return;
      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) return prev; // idempotent retry - already have it
        return [...prev, message];
      });
      if (message.sender?._id !== user._id) {
        // Two separate signals, both real: "delivered" fires once per
        // message the instant it arrives, "read" fires because this
        // conversation is the one currently open (same reasoning as the
        // history-load emit above).
        socket.emit('message_delivered', { messageId: message._id });
        socket.emit('message_read', { conversationId: conversation._id });
      }
    };

    const handleEdited = (message) => {
      setMessages((prev) => prev.map((m) => (m._id === message._id ? message : m)));
    };

    const handleDeleted = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, isDeleted: true, content: '' } : m))
      );
    };

    // These two only ever describe messages *this* user sent - the server
    // scopes them to the sender's personal room (readReceiptHandlers.js) -
    // so there's no need to check message ownership here, only that the
    // conversation matches what's currently rendered.
    const handleDelivered = ({ conversationId, messageId }) => {
      if (conversationId !== conversation._id) return;
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId && m.status === 'sent' ? { ...m, status: 'delivered' } : m))
      );
    };

    const handleRead = ({ conversationId, messageIds }) => {
      if (conversationId !== conversation._id) return;
      const readIds = new Set(messageIds);
      setMessages((prev) => prev.map((m) => (readIds.has(m._id) ? { ...m, status: 'read' } : m)));
    };

    const handleTypingStart = ({ conversationId, userId }) => {
      if (conversationId !== conversation._id) return;
      setTypingUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    };

    const handleTypingStop = ({ conversationId, userId }) => {
      if (conversationId !== conversation._id) return;
      setTypingUserIds((prev) => prev.filter((id) => id !== userId));
    };

    socket.on('new_message', handleNewMessage);
    socket.on('message_edited', handleEdited);
    socket.on('message_deleted', handleDeleted);
    socket.on('message_delivered', handleDelivered);
    socket.on('message_read', handleRead);
    socket.on('typing_start', handleTypingStart);
    socket.on('typing_stop', handleTypingStop);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_edited', handleEdited);
      socket.off('message_deleted', handleDeleted);
      socket.off('message_delivered', handleDelivered);
      socket.off('message_read', handleRead);
      socket.off('typing_start', handleTypingStart);
      socket.off('typing_stop', handleTypingStop);
    };
  }, [socket, conversation, user._id]);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  // Also stop cleanly on unmount (e.g. logout) so no dangling timer fires
  // after the socket it'd emit through is gone.
  useEffect(() => () => clearTimeout(typingStopTimerRef.current), []);

  const handleSend = (content) => {
    setSendError('');
    clearTimeout(typingStopTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      socket.emit('typing_stop', { conversationId: conversation._id });
    }
    socket.emit('send_message', { conversationId: conversation._id, content }, (ack) => {
      if (!ack.success) {
        setSendError(ack.message || 'Message failed to send.');
      }
    });
  };

  const handleTyping = () => {
    if (!socket || !conversation) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('typing_start', { conversationId: conversation._id });
    }
    clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit('typing_stop', { conversationId: conversation._id });
    }, TYPING_STOP_DELAY);
  };

  const typingNames = typingUserIds
    .map((id) => conversation.participants.find((p) => p._id === id)?.name)
    .filter(Boolean);

  if (!conversation) {
    return <div className="chat-window empty-state">Select a conversation to start chatting.</div>;
  }

  return (
    <div className="chat-window">
      <header className="chat-header">
        <h2>{conversationTitle(conversation, user._id)}</h2>
        {conversation.type === 'group' && (
          <button type="button" className="link-button" onClick={() => setIsGroupInfoOpen(true)}>
            Group Info
          </button>
        )}
        {!isConnected && <span className="connection-warning">Reconnecting...</span>}
      </header>

      {isGroupInfoOpen && conversation.group && (
        <GroupInfoPanel
          groupId={conversation.group._id}
          currentUserId={user._id}
          onClose={() => setIsGroupInfoOpen(false)}
          onChanged={onConversationsChanged}
          onLeft={() => {
            setIsGroupInfoOpen(false);
            onLeftConversation?.();
          }}
        />
      )}

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

      {typingNames.length > 0 && (
        <div className="typing-indicator">{typingNames.join(', ')} {typingNames.length > 1 ? 'are' : 'is'} typing...</div>
      )}

      {sendError && <div className="error-banner">{sendError}</div>}
      <MessageInput onSend={handleSend} onTyping={handleTyping} disabled={!isConnected} />
    </div>
  );
};
