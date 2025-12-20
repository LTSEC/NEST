import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import DevSignIn from './pages/DevSignIn';
import Profile from './pages/Profile';
import SignIn from './pages/SignIn';
import PrivateRoute from './providers/PrivateRoute';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/dev-signin" element={<DevSignIn />} />
      <Route element={<PrivateRoute />}>
        <Route path="/app" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/" element={<Navigate to="/app" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
