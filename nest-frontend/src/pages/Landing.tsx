import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';

const Landing: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  return <Navigate to={user.role === 'developer' ? '/developer' : '/app'} replace />;
};

export default Landing;
