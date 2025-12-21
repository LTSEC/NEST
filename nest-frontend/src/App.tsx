import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import DevSignIn from './pages/DevSignIn';
import DeveloperHome from './pages/DeveloperHome';
import Landing from './pages/Landing';
import MyGames from './pages/MyGames';
import GameEditor from './pages/GameEditor';
import NetworkEditor from './pages/NetworkEditor';
import Profile from './pages/Profile';
import SignIn from './pages/SignIn';
import ComingSoonPage from './pages/ComingSoonPage';
import GameList from './pages/GameList';
import TeamList from './pages/TeamList';
import GameSessionView from './pages/GameSessionView';
import ArchivedGames from './pages/ArchivedGames';
import ArchivedGameDetails from './pages/ArchivedGameDetails';
import PrivateRoute from './providers/PrivateRoute';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/dev-signin" element={<DevSignIn />} />
      <Route element={<PrivateRoute />}>
        <Route path="/app" element={<Home />} />
        <Route path="/developer" element={<DeveloperHome />} />
        <Route path="/my-games" element={<MyGames />} />
        <Route path="/my-games/new" element={<GameEditor />} />
        <Route path="/my-games/:gameId/edit" element={<GameEditor />} />
        <Route path="/my-games/:gameId/network" element={<NetworkEditor />} />
        <Route path="/games" element={<GameList />} />
        <Route path="/games/:sessionId" element={<GameSessionView />} />
        <Route path="/archives" element={<ArchivedGames />} />
        <Route path="/archives/:archiveId" element={<ArchivedGameDetails />} />
        <Route path="/teams" element={<TeamList />} />
        <Route path="/ctfs" element={<ComingSoonPage title="My CTFs" />} />
        <Route path="/analytics" element={<ComingSoonPage title="Analytics" />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/" element={<Landing />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
