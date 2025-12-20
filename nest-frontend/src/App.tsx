import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SignIn from './pages/SignIn';
import PrivateRoute from './providers/PrivateRoute';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/dev-signin" element={<SignIn />} />
      <Route element={<PrivateRoute />}>
        <Route path="/" element={<HomePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
