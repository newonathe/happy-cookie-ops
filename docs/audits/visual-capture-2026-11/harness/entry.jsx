// Mounts the real application tree exactly as src/app/*/page.tsx does: <OpsApp initialScreen=... />.
// Only the Supabase client is replaced (fake-supabase.js). No screen, engine or rule is changed.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OpsApp } from '@/components/app/ops-app';
import { SignInForm } from '@/app/sign-in/sign-in-form';
import { screenForPath } from '@/lib/screens';
import '@/app/globals.css';
import '@/app/fonts/onest.css';
import latinFont from '@/app/fonts/onest-latin.woff2?url';

const font = document.createElement('style');
font.textContent = `@font-face { font-family: QAOnest; src: url(${JSON.stringify(latinFont)}) format('woff2'); font-weight: 400 700; }`;
document.head.appendChild(font);
document.documentElement.style.setProperty('--font-onest-latin', 'QAOnest');

const path = window.location.pathname;
const tree = path.startsWith('/sign-in') ? (
  <SignInForm />
) : (
  <OpsApp initialScreen={screenForPath(path)} />
);
createRoot(document.getElementById('root')).render(tree);
