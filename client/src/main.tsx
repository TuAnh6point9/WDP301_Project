import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext';
import { router } from './app/router';
import { AreaPreferenceProvider } from './components/map/AreaPreference';
import './styles/index.css';
import { http } from './lib/http';

if (import.meta.env.VITE_API_BASE_URL) http.defaults.baseURL = import.meta.env.VITE_API_BASE_URL;

createRoot(document.getElementById('root')!).render(<StrictMode><AreaPreferenceProvider><AuthProvider><RouterProvider router={router}/></AuthProvider></AreaPreferenceProvider></StrictMode>);
