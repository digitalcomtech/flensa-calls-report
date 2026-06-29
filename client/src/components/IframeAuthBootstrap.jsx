import { useEffect, useState } from 'react';
import { bootstrapIframeAuth } from '../auth/iframeAuth.js';
import { createDevSession } from '../api/authClient.js';

export default function IframeAuthBootstrap({ children }) {
  const [authState, setAuthState] = useState({ phase: 'loading', user: null, error: null });
  const [manualToken, setManualToken] = useState('');
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    let cleanup = null;
    let cancelled = false;

    async function start() {
      try {
        const result = await bootstrapIframeAuth();

        if (cancelled) {
          return;
        }

        if (result.status === 'authenticated') {
          setAuthState({ phase: 'ready', user: result.user, error: null });
          return;
        }

        cleanup = result.listenForToken(async (token) => {
          try {
            const next = await bootstrapIframeAuth({ manualToken: token });
            if (!cancelled && next.status === 'authenticated') {
              setAuthState({ phase: 'ready', user: next.user, error: null });
            }
          } catch (err) {
            if (!cancelled) {
              setAuthState({ phase: 'error', user: null, error: err.message });
            }
          }
        });

        setAuthState({
          phase: isDev ? 'dev_prompt' : 'awaiting_parent',
          user: null,
          error: null,
        });
      } catch (err) {
        if (!cancelled) {
          setAuthState({ phase: 'error', user: null, error: err.message });
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [isDev]);

  async function submitManualToken(e) {
    e.preventDefault();
    setAuthState({ phase: 'loading', user: null, error: null });
    try {
      const result = await bootstrapIframeAuth({ manualToken });
      setAuthState({ phase: 'ready', user: result.user, error: null });
    } catch (err) {
      setAuthState({ phase: 'error', user: null, error: err.message });
    }
  }

  async function useDevSession() {
    setAuthState({ phase: 'loading', user: null, error: null });
    try {
      const result = await createDevSession();
      setAuthState({ phase: 'ready', user: result.user, error: null });
    } catch (err) {
      setAuthState({ phase: 'error', user: null, error: err.message });
    }
  }

  if (authState.phase === 'loading') {
    return <p className="loading">Connecting to Pegasus…</p>;
  }

  if (authState.phase === 'ready') {
    return children();
  }

  if (authState.phase === 'dev_prompt') {
    return (
      <section className="panel auth-panel">
        <p>
          This app expects a Pegasus iframe token via <code>#token=</code>, <code>?auth=</code>,
          <code>?access_token=</code>, or parent <code>postMessage</code>.
        </p>
        {isDev && (
          <>
            <form className="dev-token-form" onSubmit={submitManualToken}>
              <label>
                Dev Pegasus token
                <input
                  type="password"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Paste Pegasus Authenticate token"
                  autoComplete="off"
                />
              </label>
              <button type="submit" disabled={!manualToken.trim()}>
                Use token
              </button>
            </form>
            <button type="button" className="button secondary" onClick={useDevSession}>
              Use dev session
            </button>
          </>
        )}
        {authState.error && <p className="error">{authState.error}</p>}
      </section>
    );
  }

  if (authState.phase === 'awaiting_parent') {
    return (
      <section className="panel auth-panel">
        <p>Waiting for Pegasus parent context…</p>
        {authState.error && <p className="error">{authState.error}</p>}
      </section>
    );
  }

  return (
    <section className="panel auth-panel">
      <p>Authentication failed.</p>
      {authState.error && <p className="error">{authState.error}</p>}
    </section>
  );
}
