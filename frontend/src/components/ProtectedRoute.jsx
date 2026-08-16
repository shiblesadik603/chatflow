import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export const ProtectedRoute = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="centered-message">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return children;
};
