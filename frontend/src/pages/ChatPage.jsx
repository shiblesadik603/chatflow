import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { listConversations } from '../api/conversations.js';
import { Sidebar } from '../components/Sidebar.jsx';
import { ChatWindow } from '../components/ChatWindow.jsx';

export const ChatPage = () => {
  const { socket } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshConversations = useCallback(async () => {
    const list = await listConversations();
    setConversations(list);
    return list;
  }, []);

  useEffect(() => {
    refreshConversations().finally(() => setIsLoading(false));
  }, [refreshConversations]);

  // conversation_activity (not new_message) - it reaches every device a
  // participant has open via their personal userId room, regardless of
  // whether they've joined that specific conversation's room. new_message
  // is room-scoped on purpose (Phase 8), so a socket that's never opened a
  // brand new conversation would never see it and the sidebar would only
  // catch up on the next full page reload without this separate event.
  useEffect(() => {
    if (!socket) return;
    const handleActivity = () => refreshConversations();
    socket.on('conversation_activity', handleActivity);
    return () => socket.off('conversation_activity', handleActivity);
  }, [socket, refreshConversations]);

  // Presence updates patch participants in place across every conversation
  // that includes them, rather than a full refetch - this fires far more
  // often than new messages (every connect/disconnect of every contact).
  useEffect(() => {
    if (!socket) return;

    const setPresence = (userId, isOnline, lastSeen) => {
      setConversations((prev) =>
        prev.map((conversation) => ({
          ...conversation,
          participants: conversation.participants.map((p) =>
            p._id === userId ? { ...p, isOnline, lastSeen: lastSeen ?? p.lastSeen } : p
          ),
        }))
      );
    };

    const handleOnline = ({ userId }) => setPresence(userId, true);
    const handleOffline = ({ userId, lastSeen }) => setPresence(userId, false, lastSeen);

    socket.on('user_online', handleOnline);
    socket.on('user_offline', handleOffline);
    return () => {
      socket.off('user_online', handleOnline);
      socket.off('user_offline', handleOffline);
    };
  }, [socket]);

  const handleConversationCreated = async (conversation) => {
    const list = await refreshConversations();
    const fresh = list.find((c) => c._id === conversation._id) || conversation;
    setActiveConversation(fresh);
  };

  if (isLoading) return <div className="centered-message">Loading conversations...</div>;

  return (
    <div className="chat-page">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversation?._id}
        onSelectConversation={setActiveConversation}
        onConversationCreated={handleConversationCreated}
      />
      <ChatWindow conversation={activeConversation} />
    </div>
  );
};
