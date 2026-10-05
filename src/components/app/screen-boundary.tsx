'use client';

import { Component, type ReactNode } from 'react';

/**
 * One screen throwing must not take down the app.
 *
 * The dock, the header and the other 23 screens keep working; the failed screen is
 * replaced in place with something the owner can act on. Reset re-mounts the screen
 * rather than reloading, so nothing in engine state is lost.
 */
interface Props {
  screen: string;
  children: ReactNode;
  onError?: (error: Error, screen: string) => void;
}

interface State {
  error: Error | null;
}

export class ScreenBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error, this.props.screen);
    // Wire a reporter here (docs/PROMPTS.md, group 9).
    console.error('[' + this.props.screen + ']', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          margin: '16px',
          padding: '18px',
          borderRadius: '18px',
          border: '1px solid #F2CFCB',
          background: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          alignItems: 'flex-start'
        }}
      >
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#3A1F14' }}>
          This screen stopped working
        </span>
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            lineHeight: 1.55,
            color: '#6E574B',
            maxWidth: '38ch'
          }}
        >
          Nothing was lost — your orders and takings are still saved. Try opening it again, or move
          on and come back to it.
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          style={{
            height: '44px',
            padding: '0 16px',
            borderRadius: '12px',
            border: 'none',
            background: '#3A1F14',
            color: '#FFF5E5',
            fontSize: '13px',
            fontWeight: 600
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
