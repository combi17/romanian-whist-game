import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Menu from './pages/Menu';
import Room from './pages/Room';
import RoomTable from './pages/RoomTable';
import Demo from './pages/Demo';
import Rules from './pages/Rules';
import ProtectedRoute from './components/ProtectedRoute';

import './App.css';

/** Routes are lowercase. The old capitalised paths still work. */
const App = () => (
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<Login />} />
    <Route path="/signup" element={<Signup />} />

    <Route path="/rules" element={<Rules />} />

    {/* practice table: a full game against bots, no account and no database */}
    <Route path="/demo" element={<Demo />} />

    {/* everything past here needs an account */}
    <Route
      path="/menu"
      element={
        <ProtectedRoute>
          <Menu />
        </ProtectedRoute>
      }
    />
    <Route
      path="/room/:roomId"
      element={
        <ProtectedRoute>
          <Room />
        </ProtectedRoute>
      }
    />
    <Route
      path="/room/:roomId/table"
      element={
        <ProtectedRoute>
          <RoomTable />
        </ProtectedRoute>
      }
    />

    {/* legacy paths */}
    <Route path="/Login" element={<Navigate to="/login" replace />} />
    <Route path="/Signup" element={<Navigate to="/signup" replace />} />
    <Route path="/Menu" element={<Navigate to="/menu" replace />} />
    <Route path="/GameRoom" element={<Navigate to="/menu" replace />} />

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
