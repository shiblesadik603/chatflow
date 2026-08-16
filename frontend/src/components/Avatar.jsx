export const Avatar = ({ name, avatarUrl, children }) => {
  if (avatarUrl) {
    return (
      <span className="avatar-circle avatar-image-wrap">
        <img src={avatarUrl} alt={name} className="avatar-image" />
        {children}
      </span>
    );
  }
  return (
    <span className="avatar-circle">
      {name?.[0]?.toUpperCase() || '?'}
      {children}
    </span>
  );
};
