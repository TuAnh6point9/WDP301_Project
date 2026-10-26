import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext';
import { router } from './app/router';
import { AreaPreferenceProvider } from './components/map/AreaPreference';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(<StrictMode><AreaPreferenceProvider><AuthProvider><RouterProvider router={router}/></AuthProvider></AreaPreferenceProvider></StrictMode>);
