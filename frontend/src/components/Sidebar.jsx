import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { searchUsers } from '../api/users.js';
import { createConversation } from '../api/conversations.js';
import { createGroup } from '../api/groups.js';
import { Avatar } from './Avatar.jsx';
import { ProfilePanel } from './ProfilePanel.jsx';

const otherParticipant = (conversation, currentUserId) =>
  conversation.participants.find((p) => p._id !== currentUserId);

const conversationLabel = (conversation, currentUserId) => {
  if (conversation.type === 'group') return conversation.group?.name || 'Group';
  return otherParticipant(conversation, currentUserId)?.name || 'Unknown user';
};

const ATTACHMENT_LABELS = { image: '📷 Photo', file: '📄 File', voice: '🎤 Voice message' };

// Attachment messages often have no caption at all, so falling back to
// lastMessage.content the way a text message preview does would just show
// blank space - a type-based label is the useful fallback here.
const previewText = (lastMessage) => {
  if (!lastMessage) return 'No messages yet';
  if (lastMessage.isDeleted) return 'Message deleted';
  if (lastMessage.content) return lastMessage.content;
  return ATTACHMENT_LABELS[lastMessage.messageType] || 'No messages yet';
};

export const Sidebar = ({ conversations, activeConversationId, onSelectConversation, onConversationCreated }) => {
  const { user, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef(null);

  // Group creation reuses the same search box/results, just with a
  // different click behavior (toggle selection instead of starting a
  // chat immediately) - isGroupMode is the only thing that switches it.
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);

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

  const resetGroupMode = () => {
    setIsGroupMode(false);
    setGroupName('');
    setSelectedMembers([]);
    setGroupError('');
    setQuery('');
    setResults([]);
  };

  const toggleMember = (candidate) => {
    setSelectedMembers((prev) =>
      prev.some((m) => m._id === candidate._id)
        ? prev.filter((m) => m._id !== candidate._id)
        : [...prev, candidate]
    );
  };

  const handleCreateGroup = async () => {
    const name = groupName.trim();
    if (!name || selectedMembers.length === 0) return;
    setIsCreatingGroup(true);
    setGroupError('');
    try {
      const group = await createGroup({ name, memberIds: selectedMembers.map((m) => m._id) });
      resetGroupMode();
      onConversationCreated({ _id: group.conversation });
    } catch (err) {
      setGroupError(err.response?.data?.message || 'Failed to create group.');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button type="button" className="current-user" onClick={() => setIsProfileOpen(true)}>
          <Avatar name={user.name} avatarUrl={user.avatar} />
          <span>{user.name}</span>
        </button>
        <button className="link-button" onClick={logout}>
          Log out
        </button>
      </div>

      {isProfileOpen && <ProfilePanel onClose={() => setIsProfileOpen(false)} />}

      <div className="sidebar-search">
        <div className="search-row">
          <input
            type="text"
            placeholder={isGroupMode ? 'Add people to the group...' : 'Search people to chat with...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="link-button new-group-toggle"
            onClick={() => (isGroupMode ? resetGroupMode() : setIsGroupMode(true))}
          >
            {isGroupMode ? 'Cancel' : 'New Group'}
          </button>
        </div>

        {isGroupMode && (
          <div className="group-create-form">
            <input
              type="text"
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            {selectedMembers.length > 0 && (
              <div className="member-chips">
                {selectedMembers.map((m) => (
                  <span key={m._id} className="member-chip">
                    {m.name}
                    <button type="button" onClick={() => toggleMember(m)} aria-label={`Remove ${m.name}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {groupError && <div className="error-banner">{groupError}</div>}
            <button
              type="button"
              className="create-group-button"
              disabled={!groupName.trim() || selectedMembers.length === 0 || isCreatingGroup}
              onClick={handleCreateGroup}
            >
              {isCreatingGroup ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        )}

        {query && (
          <div className="search-results">
            {isSearching && <div className="search-hint">Searching...</div>}
            {!isSearching && results.length === 0 && <div className="search-hint">No users found</div>}
            {results.map((result) => {
              const isSelected = isGroupMode && selectedMembers.some((m) => m._id === result._id);
              return (
                <button
                  key={result._id}
                  className={`search-result ${isSelected ? 'selected' : ''}`}
                  onClick={() => (isGroupMode ? toggleMember(result) : handleStartConversation(result._id))}
                >
                  <Avatar name={result.name} avatarUrl={result.avatar}>
                    {result.isOnline && <span className="online-dot" title="Online" />}
                  </Avatar>
                  <span>{result.name}</span>
                  {isSelected && <span className="member-check">✓</span>}
                </button>
              );
            })}
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
              <Avatar
                name={conversationLabel(conversation, user._id)}
                avatarUrl={conversation.type === 'group' ? conversation.group?.avatar : other?.avatar}
              >
                {other?.isOnline && <span className="online-dot" />}
              </Avatar>
              <span className="conversation-info">
                <span className="conversation-name">{conversationLabel(conversation, user._id)}</span>
                <span className="conversation-preview">{previewText(conversation.lastMessage)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
