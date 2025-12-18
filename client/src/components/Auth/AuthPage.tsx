import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './Auth.css';

export function AuthPage() {
    const { login, register, isConnected } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!username || !password) {
            setError('Please fill in all fields');
            return;
        }

        if (!isLogin && password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setIsSubmitting(true);

        try {
            const result = isLogin
                ? await login(username, password)
                : await register(username, password);

            if (!result.success) {
                setError(result.message || 'An error occurred');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-background">
                <div className="auth-glow auth-glow-1"></div>
                <div className="auth-glow auth-glow-2"></div>
            </div>

            <div className="auth-card animate-slide-up">
                <div className="auth-header">
                    <div className="auth-logo">
                        <span className="logo-icon">🎴</span>
                        <h1>Card Games</h1>
                    </div>
                    <p className="auth-subtitle">Play Phom, Poker & Durak Online</p>
                </div>

                <div className="auth-tabs">
                    <button
                        className={`auth-tab ${isLogin ? 'active' : ''}`}
                        onClick={() => setIsLogin(true)}
                    >
                        Login
                    </button>
                    <button
                        className={`auth-tab ${!isLogin ? 'active' : ''}`}
                        onClick={() => setIsLogin(false)}
                    >
                        Register
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            className="input"
                            placeholder="Enter username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={isSubmitting}
                            autoComplete="username"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            className="input"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={isSubmitting}
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
                        />
                    </div>

                    {!isLogin && (
                        <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm Password</label>
                            <input
                                id="confirmPassword"
                                type="password"
                                className="input"
                                placeholder="Confirm password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={isSubmitting}
                                autoComplete="new-password"
                            />
                        </div>
                    )}

                    {error && <div className="auth-error">{error}</div>}

                    <button
                        type="submit"
                        className="btn btn-primary auth-submit"
                        disabled={isSubmitting || !isConnected}
                    >
                        {isSubmitting ? (
                            <>
                                <span className="spinner"></span>
                                Processing...
                            </>
                        ) : (
                            isLogin ? 'Login' : 'Create Account'
                        )}
                    </button>

                    {!isConnected && (
                        <div className="connection-status">
                            <span className="status-dot disconnected"></span>
                            Connecting to server...
                        </div>
                    )}
                </form>

                <div className="auth-footer">
                    <p>Play classic card games with friends from anywhere!</p>
                </div>
            </div>
        </div>
    );
}
