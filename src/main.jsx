import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import { MetrologyProvider } from './MetrologyContext';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MetrologyProvider>
            <App />
        </MetrologyProvider>
    </React.StrictMode>,
)
