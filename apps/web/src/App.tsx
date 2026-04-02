import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Bills from './pages/Bills';
import BillDetail from './pages/BillDetail';
import Politicians from './pages/Politicians';
import PoliticianDetail from './pages/PoliticianDetail';
import Questionnaire from './pages/Questionnaire';
import Matches from './pages/Matches';
import ScoringMethodology from './pages/ScoringMethodology';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="bills" element={<Bills />} />
        <Route path="bills/:id" element={<BillDetail />} />
        <Route path="politicians" element={<Politicians />} />
        <Route path="politicians/:id" element={<PoliticianDetail />} />
        <Route path="questionnaire" element={<Questionnaire />} />
        <Route path="matches" element={<Matches />} />
        <Route path="methodology" element={<ScoringMethodology />} />
      </Route>
    </Routes>
  );
}
