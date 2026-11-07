import React from 'react';
import {createRoot} from 'react-dom/client';
import {Pad} from './Pad';
import './style.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><Pad/></React.StrictMode>);
