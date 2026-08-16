import { useState, useEffect, useRef } from 'react';
import { searchUsers } from '../api/users.js';
import {
  getGroup,
  renameGroup,
  addGroupMembers,
  removeGroupMember,
  promoteGroupAdmin,
  leaveGroup,
} from '../api/groups.js';

export const GroupInfoPanel = ({ groupId, currentUserId, onClose, onChanged, onLeft }) => {
  const [group, setGroup] = useState(null);
  const [error, setError] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedToAdd, setSelectedToAdd] = useState([]);
  const [busy, setBusy] = useState(false);
  const searchTimeout = useRef(null);

  const load = async () => {
    try {
      const fresh = await getGroup(groupId);
      setGroup(fresh);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load group.');
    }
  };

  useEffect(() => {
    load();
  }, [groupId]);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      const found = await searchUsers(query.trim());
      const memberIds = new Set(group?.members.map((m) => m._id));
      setResults(found.filter((u) => !memberIds.has(u._id)));
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [query, group]);

  if (!group) {
    return (
      <div className="group-info-overlay" onClick={onClose}>
        <div className="group-info-panel" onClick={(e) => e.stopPropagation()}>
          <div className="centered-message">{error || 'Loading group...'}</div>
        </div>
      </div>
    );
  }

  const isAdmin = group.admins.some((a) => a._id === currentUserId);

  const runAction = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === group.name) {
      setIsEditingName(false);
      return;
    }
    runAction(() => renameGroup(groupId, trimmed)).then(() => setIsEditingName(false));
  };

  const toggleSelectToAdd = (candidate) => {
    setSelectedToAdd((prev) =>
      prev.some((m) => m._id === candidate._id) ? prev.filter((m) => m._id !== candidate._id) : [...prev, candidate]
    );
  };

  const handleAddMembers = () => {
    if (selectedToAdd.length === 0) return;
    runAction(() => addGroupMembers(groupId, selectedToAdd.map((m) => m._id))).then(() => {
      setIsAddingMembers(false);
      setSelectedToAdd([]);
      setQuery('');
      setResults([]);
    });
  };

  const handleRemove = (memberId) => {
    if (!window.confirm('Remove this member from the group?')) return;
    runAction(() => removeGroupMember(groupId, memberId));
  };

  const handlePromote = (memberId) => {
    runAction(() => promoteGroupAdmin(groupId, memberId));
  };

  const handleLeave = async () => {
    if (!window.confirm('Leave this group?')) return;
    setBusy(true);
    try {
      await leaveGroup(groupId);
      onLeft?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to leave group.');
      setBusy(false);
    }
  };

  return (
    <div className="group-info-overlay" onClick={onClose}>
      <div className="group-info-panel" onClick={(e) => e.stopPropagation()}>
        <div className="group-info-header">
          {isEditingName ? (
            <div className="group-name-edit">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                disabled={busy}
                autoFocus
              />
              <button type="button" onClick={handleSaveName} disabled={busy}>Save</button>
              <button type="button" onClick={() => setIsEditingName(false)} disabled={busy}>Cancel</button>
            </div>
          ) : (
            <h3>
              {group.name}
              {isAdmin && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setNameDraft(group.name);
                    setIsEditingName(true);
                  }}
                >
                  Rename
                </button>
              )}
            </h3>
          )}
          <button type="button" className="link-button" onClick={onClose}>Close</button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="group-members-list">
          <div className="group-section-label">{group.members.length} members</div>
          {group.members.map((member) => {
            const memberIsAdmin = group.admins.some((a) => a._id === member._id);
            return (
              <div key={member._id} className="group-member-row">
                <span className="avatar-circle">
                  {member.name[0].toUpperCase()}
                  {member.isOnline && <span className="online-dot" />}
                </span>
                <span className="group-member-name">
                  {member.name}
                  {member._id === currentUserId && ' (you)'}
                  {memberIsAdmin && <span className="admin-badge">Admin</span>}
                </span>
                {isAdmin && member._id !== currentUserId && (
                  <span className="group-member-actions">
                    {!memberIsAdmin && (
                      <button type="button" onClick={() => handlePromote(member._id)} disabled={busy}>
                        Make admin
                      </button>
                    )}
                    <button type="button" onClick={() => handleRemove(member._id)} disabled={busy}>
                      Remove
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {isAdmin && (
          <div className="group-add-members">
            {!isAddingMembers ? (
              <button type="button" className="link-button" onClick={() => setIsAddingMembers(true)}>
                + Add members
              </button>
            ) : (
              <div className="group-create-form">
                <input
                  type="text"
                  placeholder="Search people to add..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                {selectedToAdd.length > 0 && (
                  <div className="member-chips">
                    {selectedToAdd.map((m) => (
                      <span key={m._id} className="member-chip">
                        {m.name}
                        <button type="button" onClick={() => toggleSelectToAdd(m)} aria-label={`Remove ${m.name}`}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {results.length > 0 && (
                  <div className="search-results group-add-results">
                    {results.map((r) => {
                      const isSelected = selectedToAdd.some((m) => m._id === r._id);
                      return (
                        <button
                          key={r._id}
                          className={`search-result ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleSelectToAdd(r)}
                        >
                          <span className="avatar-circle">{r.name[0].toUpperCase()}</span>
                          <span>{r.name}</span>
                          {isSelected && <span className="member-check">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="group-add-actions">
                  <button
                    type="button"
                    className="create-group-button"
                    disabled={selectedToAdd.length === 0 || busy}
                    onClick={handleAddMembers}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingMembers(false);
                      setSelectedToAdd([]);
                      setQuery('');
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <button type="button" className="leave-group-button" onClick={handleLeave} disabled={busy}>
          Leave group
        </button>
      </div>
    </div>
  );
};
