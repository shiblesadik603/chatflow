import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      await register({ name, email, password });
      navigate('/chat');
    } catch (err) {
      const body = err.response?.data;
      if (body?.errorCode === 'VALIDATION_ERROR') {
        setFieldErrors(body.details || {});
      } else {
        setError(body?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>ChatFlow</h1>
        <p className="auth-subtitle">Create your account</p>

        {error && <div className="error-banner">{error}</div>}

        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          {fieldErrors.name && <span className="field-error">{fieldErrors.name[0]}</span>}
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {fieldErrors.email && <span className="field-error">{fieldErrors.email[0]}</span>}
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {fieldErrors.password && <span className="field-error">{fieldErrors.password[0]}</span>}
        </label>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Sign Up'}
        </button>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
};
