import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { DataProvider } from '@/context/DataContext'
import { AuthProvider } from '@/context/AuthContext'
import { Toaster } from '@/components/ui/sonner'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <App />
          <Toaster position="bottom-right" />
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
