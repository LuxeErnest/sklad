import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initDb } from './lib/db'

// Initialize database
initDb().then(() => {
  console.log('🎯 Database initialization completed');
}).catch((error) => {
  console.error('❌ Database initialization failed:', error);
});

createRoot(document.getElementById("root")!).render(<App />);
