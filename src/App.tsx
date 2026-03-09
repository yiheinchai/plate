import { Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import RecordPage from "./pages/RecordPage";
import LibraryPage from "./pages/LibraryPage";
import NotesPage from "./pages/NotesPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<RecordPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
