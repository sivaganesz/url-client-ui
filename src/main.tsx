import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { SessionProvider } from './lib/session'
import './index.css'

// The element is in index.html; a missing root is a broken build, not a
// runtime case worth branching on.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Last resort. A failure above the router takes the navigation with it,
        so this one offers a reload rather than a retry. */}
    <ErrorBoundary
      level="app"
      title="The console couldn't start"
      note="Something failed before the page could load. Reloading usually clears it."
    >
      <BrowserRouter>
        {/* Inside the router, because signing out navigates. */}
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
