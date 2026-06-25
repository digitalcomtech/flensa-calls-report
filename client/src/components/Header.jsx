import { loginUrl, logout } from '../api/client.js';

export default function Header({ user }) {
  return (
    <header className="header">
      <div className="header-inner">
        <h1>Flensa Calls Report</h1>
        <div className="header-actions">
          {user ? (
            <>
              <span className="user-name">{user.name || user.email}</span>
              <button type="button" onClick={() => logout().then(() => window.location.reload())}>
                Log out
              </button>
            </>
          ) : (
            <a className="button" href={loginUrl()}>
              Log in with Pegasus
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
