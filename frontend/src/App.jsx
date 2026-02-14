import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Symptoms from './pages/Symptoms';
import Diagnosis from './pages/Diagnosis';
import Ranked from './pages/Ranked';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <main className="app">
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Symptoms />} />
            <Route path="/diagnosis" element={<Diagnosis />} />
            <Route path="/ranked" element={<Ranked />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </main>
    </BrowserRouter>
  );
}
