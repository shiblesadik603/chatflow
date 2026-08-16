import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { searchUsers } from '../api/users.js';
import { createConversation } from '../api/conversations.js';

const otherParticipant = (conversation, currentUserId) =>
  conversation.participants.find((p) => p._id !== currentUserId);

const conversationLabel = (conversation, currentUserId) => {
  if (conversation.type === 'group') return conversation.group?.name || 'Group';
  return otherParticipant(conversation, currentUserId)?.name || 'Unknown user';
};

export const Sidebar = ({ conversations, activeConversationId, onSelectConversation, onConversationCreated }) => {
  const { user, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef(null);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const found = await searchUsers(query.trim());
        setResults(found);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [query]);

  const handleStartConversation = async (participantId) => {
    const conversation = await createConversation(participantId);
    setQuery('');
    setResults([]);
    onConversationCreated(conversation);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="current-user">
          <span className="avatar-circle">{user.name[0].toUpperCase()}</span>
          <span>{user.name}</span>
        </div>
        <button className="link-button" onClick={logout}>
          Log out
        </button>
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search people to chat with..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <div className="search-results">
            {isSearching && <div className="search-hint">Searching...</div>}
            {!isSearching && results.length === 0 && <div className="search-hint">No users found</div>}
            {results.map((result) => (
              <button key={result._id} className="search-result" onClick={() => handleStartConversation(result._id)}>
                <span className="avatar-circle">{result.name[0].toUpperCase()}</span>
                <span>{result.name}</span>
                {result.isOnline && <span className="online-dot" title="Online" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="conversation-list">
        {conversations.length === 0 && <p className="sidebar-empty">No conversations yet - search for someone above.</p>}
        {conversations.map((conversation) => {
          const other = conversation.type === 'private' ? otherParticipant(conversation, user._id) : null;
          return (
            <button
              key={conversation._id}
              className={`conversation-item ${conversation._id === activeConversationId ? 'active' : ''}`}
              onClick={() => onSelectConversation(conversation)}
            >
              <span className="avatar-circle">
                {conversationLabel(conversation, user._id)[0]?.toUpperCase()}
                {other?.isOnline && <span className="online-dot" />}
              </span>
              <span className="conversation-info">
                <span className="conversation-name">{conversationLabel(conversation, user._id)}</span>
                <span className="conversation-preview">
                  {conversation.lastMessage?.isDeleted
                    ? 'Message deleted'
                    : conversation.lastMessage?.content || 'No messages yet'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
