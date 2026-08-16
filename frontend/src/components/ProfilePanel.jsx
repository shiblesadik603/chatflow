import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { updateMe } from '../api/users.js';
import { uploadAvatar } from '../api/uploads.js';
import { Avatar } from './Avatar.jsx';

const BIO_MAX = 160;

export const ProfilePanel = ({ onClose }) => {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef(null);

  const hasChanges = name.trim() !== user.name || bio !== (user.bio || '');

  const handleSave = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setIsSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await updateMe({ name: trimmedName, bio });
      setUser(updated);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploadingAvatar(true);
    setError('');
    try {
      const updated = await uploadAvatar(file);
      setUser(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload avatar.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="group-info-overlay" onClick={onClose}>
      <div className="group-info-panel" onClick={(e) => e.stopPropagation()}>
        <div className="group-info-header">
          <h3>Your Profile</h3>
          <button type="button" className="link-button" onClick={onClose}>Close</button>
        </div>

        <div className="profile-avatar-section">
          <Avatar name={user.name} avatarUrl={user.avatar} />
          <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" hidden />
          <button
            type="button"
            className="link-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAvatar}
          >
            {isUploadingAvatar ? 'Uploading...' : 'Change avatar'}
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form className="profile-form" onSubmit={handleSave}>
          <label>
            Name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
          </label>

          <label>
            Email
            <input type="text" value={user.email} disabled />
          </label>

          <label>
            Bio
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              rows={3}
              placeholder="Tell people a bit about yourself..."
            />
            <span className="bio-counter">{bio.length}/{BIO_MAX}</span>
          </label>

          {saved && !hasChanges && <div className="profile-saved-hint">Saved</div>}

          <button type="submit" className="create-group-button" disabled={!hasChanges || !name.trim() || isSaving}>
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
};
