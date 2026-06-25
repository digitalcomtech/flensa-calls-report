import { BrowserRouter, Route, Routes } from 'react-router-dom';
import ReportPage from './pages/ReportPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<ReportPage />} />
      </Routes>
    </BrowserRouter>
  );
}
