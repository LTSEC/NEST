import React from 'react';
import AppNav from '../components/AppNav';

const Home: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav />
      <main className="mx-auto max-w-6xl px-6 py-10" aria-label="Main content" />
    </div>
  );
};

export default Home;
